import { createPixiStage } from './pixiStage.js';
import { StoryRepository } from './storyRepository.js';
import { AutoSave } from './autoSave.js';
import { TAP_GUARD_MS, UiController } from './uiController.js';
import { InputController } from './inputController.js';
import { AudioManager } from './audioManager.js';
import { loadTestSound, playTestSound, resumeAudio, setEffectsVolume } from './sfx.js';
import { VisualRenderer } from './visualRenderer.js';
import { MinigameManager } from './minigames/minigameManager.js';
import {
  MAX_HISTORY, applyChanges, centresChoices, endScenes, endingId, followUp, isEndingPosition, migrateOldSave, nextLine, nextSceneId,
  giveUpMemory, memoryObject, pickEvent, placeSave, reachableWithin, resolveEntry, sameMemory, samePlace, stageAt, visibleLines,
} from './storyFlow.js';

// Autoread (Nastavení → Automaticky pokračovat): a line waits base + per-character time.
// ponytail: one speed for everyone; add a speed slider if kids find it too fast or slow.
const AUTO_READ_BASE_MS = 2000;
const AUTO_READ_MS_PER_CHAR = 70;

export async function startVisualNovel(config) {
  const story = await StoryRepository.load(config.storyUrl);
  const save = new AutoSave(story.id);
  save.migrateIfNeeded((old) => migrateOldSave(story, old)); // before anything reads the settings (D37)
  const ui = new UiController(config.ui);
  const stage = await createPixiStage(config.pixiHost);
  const audio = new AudioManager(story.assets?.music ?? {}, save.settings.musicVolume, story.resumeMusic);
  setEffectsVolume(save.settings.effectsVolume);
  const visuals = new VisualRenderer(stage, story);
  const minigames = new MinigameManager(stage, { root: config.ui.root });

  let minigameActive = false;
  let menuOpen = true;
  let menuFromGame = false; // the menu was opened from the game: Esc on its main page goes back there
  let storyPausedAt = -Infinity; // the menu closed or a minigame ended
  let started = false; // Pokračovat or Nová hra pressed in this page visit, until "Zpět na začátek"
  let autoReadTimer = 0;
  let endTimer = 0; // an end card waiting to open (a landing with no line to read, D37)
  let shownToken = 0; // every show of a position; a stale render or autoread stops

  // The position: a scene, a line (null: no visible line, its choices or end card shown at once) and the memory as
  // it is there (after the scene's own changes). History entries are positions too; Back restores their memory.
  const freshPosition = () => {
    const { scene, line, memory } = resolveEntry(story, story.start, new Map());
    return { scene, line, memory };
  };
  const placed = placeSave(story, save.data);
  let position = placed?.position ?? freshPosition();
  let history = placed?.history ?? [];

  const currentLine = () => (position.line === null ? null : position.scene.lines[position.line]);

  // The renderer caps a big creature below the top controls, measured on every render (D37).
  function topLimit() {
    const controls = config.ui.root.querySelector('#top-controls').getBoundingClientRect();
    return Math.max(0, controls.bottom - config.pixiHost.getBoundingClientRect().top);
  }

  function render() {
    const { scene, line, memory } = position;
    return visuals.render(scene, stageAt(scene, line, memory), { topLimit: topLimit() });
  }

  function statusText(written) {
    const { scene, line, memory } = position;
    const shown = line === null ? 0 : visibleLines(scene, memory).filter((index) => index <= line).length;
    const where = shown ? `${scene.id} · ${shown}` : scene.id;
    return written ? `Autosaved • ${where}` : where;
  }

  /**
   * Shows the position. `write`: a move or Back, persisted (`landed`: a move into a scene, recorded in
   * readSceneIds); without it a show-again (Pokračovat, a reload) that changes nothing.
   */
  async function showPosition({ write = false, landed = false } = {}) {
    clearTimeout(autoReadTimer);
    cancelEnd();
    const token = (shownToken += 1);
    const { scene, line, memory } = position;
    if (write) save.recordPosition({ sceneId: scene.id, line, memory, history, landed });

    const shownLine = currentLine();
    ui.showSaveStatus(statusText(write));
    ui.setBackAvailable(history.length > 0);
    ui.showEnd(null);
    ui.showDialogue(shownLine, story.characters);
    const after = !scene.minigame && nextLine(scene, line, memory) === null ? followUp(story, scene, memory) : null;
    const choices = after?.kind === 'choices' ? after.choices : [];
    ui.showChoices(choices, pickChoice, {
      center: centresChoices(scene, choices.length),
      line: shownLine && { speakerName: ui.speakerName(shownLine, story.characters), text: shownLine.text },
    });
    // Every show plays the scene's track (the same key keeps it); before the await, so a slow render can't start
    // an older scene's track after a newer one.
    audio.playMusic(scene.music);

    if (after?.kind === 'end') {
      if (write && !endingRecorded(scene)) save.recordEnding(endingId(story, scene.id));
      if (line === null) scheduleEnd(scene, write); // no line to read: the card opens by itself
    }

    if (scene.minigame) {
      // No await before the minigame: its HUD is up before any input can reach the scene, and a slow or
      // failing render of the picture behind it holds nothing up (D27).
      render().catch((error) => console.error('Scene render failed.', error));
      await runMinigame(scene);
      return;
    }

    await render();
    if (token !== shownToken) return;
    preloadAhead();

    // advance() itself ignores choices, an open menu and minigames.
    if (save.settings.autoRead) {
      autoReadTimer = setTimeout(() => {
        if (token === shownToken) advance();
      }, AUTO_READ_BASE_MS + (shownLine?.text?.length ?? 0) * AUTO_READ_MS_PER_CHAR);
    }
  }

  // An end card with no line before it opens TAP_GUARD_MS after the move that reached it, or when the story guard
  // ends, whichever is later: the rest of a double tap can't land on its focused "Zpět na začátek" (D37).
  function scheduleEnd(scene, afterMove) {
    const due = Math.max(performance.now() + (afterMove ? TAP_GUARD_MS : 0), storyPausedAt + TAP_GUARD_MS);
    endTimer = setTimeout(() => {
      endTimer = 0;
      if (!menuOpen && position.scene === scene) openEnd(scene);
    }, Math.max(0, due - performance.now()));
  }

  function cancelEnd() {
    clearTimeout(endTimer);
    endTimer = 0;
  }

  function openEnd(scene) {
    if (!endingRecorded(scene)) save.recordEnding(endingId(story, scene.id));
    ui.showEnd(scene.end);
  }

  // Warm the positions within 3 taps (their backgrounds and stages) so advancing feels instant without loading the
  // whole story up front (D8). Runs in the background.
  function preloadAhead() {
    const items = reachableWithin(story, position, position.memory, 3)
        .map(({ scene, line }) => ({ background: scene.background, characters: stageAt(scene, line, position.memory) }));
    visuals.preload(items).catch((error) => {
      console.warn('Could not preload upcoming scenes.', error);
    });
  }

  /**
   * Runs the scene's minigame and moves to the matching outcome (else the scene's `next`). The minigame scene
   * itself is kept out of the back-history, so Back from an outcome returns to whatever preceded the minigame.
   */
  async function runMinigame(scene) {
    minigameActive = true;
    ui.setBackAvailable(false);
    // A focused top-bar button would stay focused under its visibility: hidden, and Enter would press it (D37).
    if (document.activeElement?.closest?.('#top-controls')) document.activeElement.blur();

    const outcome = await minigames.run(scene.minigame, { difficulty: save.settings.difficulty });

    minigameActive = false;
    storyPausedAt = performance.now();
    input.holdBackUntilQuiet(); // a child still mashing ← from the round never steps Back (D45; `input` is built below,
    // before any position is shown)
    // Back on now, not only by the next scene: a typo in onVictory/onFailure shows none (Menu works too).
    ui.setBackAvailable(history.length > 0);

    const nextId = outcome === 'victory' ? scene.minigame.onVictory : scene.minigame.onFailure;
    const { memory } = position;
    if (!move(nextId, memory, { fromMinigame: true })) {
      const fallback = nextSceneId(scene, memory);
      if (fallback !== null) move(fallback, memory, { fromMinigame: true });
    }
  }

  // Story input waits while a minigame or the menu is up, and just after the menu closes or a minigame ends:
  // the rest of a double tap on Pokračovat must not skip a line or pick the choice under the button (D27, D33).
  function inputBlocked() {
    return minigameActive || menuOpen || performance.now() - storyPausedAt < TAP_GUARD_MS;
  }

  /**
   * A move into a scene: resolved first (a dead end changes nothing), then the position left goes into the history
   * (not a minigame's, D9) and the landing is saved and shown.
   */
  function move(sceneId, memory, { fromMinigame = false } = {}) {
    const landing = resolveEntry(story, sceneId, memory);
    if (landing.dead) return false;
    const next = { scene: landing.scene, line: landing.line, memory: landing.memory };
    // A minigame outcome landing on the scene the history's newest entries are from, with the same memory (a lost retry
    // landing again on the lose scene its retry choice left, whatever line that choice was on) takes that earlier visit
    // back, so Back never shows those screens twice. Only after a minigame: a hub looping back to the scene before it
    // keeps the hub.
    if (fromMinigame) {
      while (history.length > 0 && history.at(-1).scene === next.scene && sameMemory(history.at(-1).memory, next.memory)) {
        history = history.slice(0, -1);
      }
    } else {
      history = [...history, position].slice(-MAX_HISTORY);
    }
    position = next;
    showPosition({ write: true, landed: true });
    return true;
  }

  // A location choice (D37): the engine picks one of the location's available events and marks it played.
  function pickChoice(choice) {
    if (inputBlocked()) return;
    if ('location' in choice) {
      const event = pickEvent(story, choice, position.memory);
      if (event) move(event.sceneId, event.memory);
      return;
    }
    const memory = choice.giveUp === true ? giveUpMemory(story, position.scene, choice, position.memory)
      : applyChanges(position.memory, choice);
    move(choice.next, memory);
  }

  function advance() {
    // The card already open (an autoread after a no-line ending's card opened by itself): a tap there does nothing.
    if (inputBlocked() || endTimer || ui.endOpen()) return;
    if (ui.hasOpenChoices()) return;
    const { scene, line, memory } = position;
    if (scene.minigame) return; // its outcome and `next` were dead ends: Back, Menu, Pokračovat (D27)
    const later = nextLine(scene, line, memory);
    if (later !== null) {
      history = [...history, position].slice(-MAX_HISTORY);
      position = { scene, line: later, memory };
      showPosition({ write: true });
      return;
    }
    const after = followUp(story, scene, memory);
    if (after.kind === 'next') move(after.id, memory);
    else if (after.kind === 'end') openEnd(scene);
  }

  function goBack() {
    if (inputBlocked()) return;
    const previous = history.at(-1);
    if (!previous) return;

    history = history.slice(0, -1);
    position = previous;
    showPosition({ write: true });
  }

  function resetToStart() {
    audio.forgetPositions(); // a new game starts the resumable tracks from the beginning (D26)
    cancelEnd();
    history = [];
    position = freshPosition();
    const { scene, line, memory } = position;
    save.recordPosition({ sceneId: scene.id, line, memory, history, landed: true });
  }

  // Endings are compared under their current ids (a renamed ending scene, through movedScenes, is the same ending).
  const endingRecorded = (scene) => save.endings.some((id) => endingId(story, id) === endingId(story, scene.id));

  // Progress a new game would lose (D27, D37): none on the fresh position with no history, and none on an ending's
  // last line once that ending is recorded (the game is over).
  function hasProgress() {
    if (history.length === 0 && samePlace(position, freshPosition())) return false;
    const { scene, line, memory } = position;
    return !(isEndingPosition(story, scene, line, memory) && endingRecorded(scene));
  }

  // The position behind the menu is only drawn; showPosition (which may start a minigame) waits for Pokračovat.
  // From the game, the scene is already drawn and its track keeps playing under the menu (D27).
  async function openMenu({ fromGame = false } = {}) {
    menuOpen = true;
    menuFromGame = fromGame;
    cancelEnd(); // a pending end card never opens under the menu
    ui.setContinueAvailable(started || hasProgress());
    ui.showMenu(true);
    ui.showEnd(null); // "Zpět na začátek" comes here straight from the end card
    if (fromGame) return;
    audio.playMusic(story.menuMusic);
    await render();
    preloadAhead();
  }

  // The Menu button and Esc. No menu during a minigame: its skip button is the way out. A pending autoread
  // advance finds the menu open and does nothing; Pokračovat shows the position again, which reschedules it.
  function openMenuFromGame() {
    if (minigameActive) return; // the open menu hides the Menu button, and Esc there goes to escape()'s other branches
    openMenu({ fromGame: true });
  }

  // Esc: the menu from the game; inside it, a sub-page back to the main page, the main page back to
  // the game (only when it was opened from there).
  function escape() {
    if (!menuOpen) openMenuFromGame();
    else if (ui.menuPage() !== 'main') ui.showMenuPage('main');
    else if (menuFromGame) startGame();
  }

  function startGame() {
    started = true;
    menuOpen = false;
    storyPausedAt = performance.now();
    ui.showMenu(false);
    showPosition();
  }

  function newGame() {
    if (hasProgress()) ui.showNewGameConfirm();
    else confirmNewGame();
  }

  function confirmNewGame() {
    resetToStart();
    startGame();
  }

  // End card button: progress resets to the story start, the gallery keeps the ending.
  // No showPosition here, so the start scene's track never cuts in between ending and menu.
  function backToStart() {
    started = false;
    resetToStart();
    openMenu();
  }

  ui.bindNavigation({ onBack: goBack, onMenu: openMenuFromGame, onEndHome: backToStart });
  let settingsVisit = 0; // a test sound belongs to the visit to Nastavení whose slider was let go
  ui.bindSettings(save.settings, {
    onChange: (change) => {
      save.saveSettings(change);
      if ('musicVolume' in change) audio.setVolume(save.settings.musicVolume);
      if ('effectsVolume' in change) setEffectsVolume(save.settings.effectsVolume);
    },
    onOpen: () => {
      settingsVisit += 1;
      loadTestSound(); // the effects slider's test sound
    },
    // The test sound, at the new level. Howler suspends the AudioContext 30 s after the last effect: resume it
    // first, and play only if this visit to Nastavení is still open by then (one at a time, for a held arrow key).
    onEffectsSet: () => {
      const visit = settingsVisit;
      resumeAudio().then(() => {
        if (menuOpen && ui.menuPage() === 'settings' && visit === settingsVisit) playTestSound();
      });
    },
  });
  ui.bindMenu({
    // Disabled buttons ignore the player's clicks, not a script's: Pokračovat checks again.
    onContinue: () => { if (started || hasProgress()) startGame(); },
    onNewGame: newGame,
    onConfirmNewGame: confirmNewGame,
    getEndScenes: () => endScenes(story, save.endings),
  });

  const input = new InputController({
    root: config.ui.root,
    onAdvance: advance,
    onChoiceNumber: (index) => ui.pickChoice(index),
    onBack: goBack,
    onEscape: escape,
    choiceGuard: ui.choiceGuard,
  });
  input.connect();

  // Re-fit the scene (background letterboxing, character positions) whenever
  // the viewport size or aspect ratio changes.
  let resizeFrame = 0;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => render());
  });

  // Test hook for the check scripts (they run against the live site too, see D11). Not an API: these are
  // the live objects, so a test can drive them (robustness.mjs drives audio.forgetPositions/playMusic).
  window.__vn = {
    stage, minigames, audio,
    get sceneId() { return position.scene.id; },
    get line() { return position.line; },
    get memory() { return memoryObject(position.memory); },
    get characters() { return stageAt(position.scene, position.line, position.memory).map((entry) => entry.id); },
  };

  await openMenu(); // preloads ahead while the player is on the menu, as the old startup did
}
