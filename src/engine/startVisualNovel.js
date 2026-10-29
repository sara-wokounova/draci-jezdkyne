import { createPixiStage } from './pixiStage.js';
import { StoryRepository } from './storyRepository.js';
import { AutoSave } from './autoSave.js';
import { TAP_GUARD_MS, UiController } from './uiController.js';
import { InputController } from './inputController.js';
import { AudioManager } from './audioManager.js';
import { VisualRenderer } from './visualRenderer.js';
import { MinigameManager } from './minigames/minigameManager.js';

// Autoread (Nastavení → Automaticky pokračovat): a scene waits base + per-character time.
// ponytail: one speed for everyone; add a speed slider if kids find it too fast or slow.
const AUTO_READ_BASE_MS = 2000;
const AUTO_READ_MS_PER_CHAR = 70;

export async function startVisualNovel(config) {
  const story = await StoryRepository.load(config.storyUrl);
  const save = new AutoSave(story.id);
  const ui = new UiController(config.ui);
  const stage = await createPixiStage(config.pixiHost);
  const audio = new AudioManager(story.assets?.music ?? {}, save.settings.musicVolume, story.resumeMusic);
  const visuals = new VisualRenderer(stage, story);
  const minigames = new MinigameManager(stage, { root: config.ui.root });

  let minigameActive = false;
  let menuOpen = true;
  let menuFromGame = false; // the menu was opened from the game: Esc on its main page goes back there
  let menuClosedAt = -Infinity;
  let started = false; // Pokračovat or Nová hra pressed in this page visit, until "Zpět na začátek"
  let autoReadTimer = 0;
  let history = save.history.filter((sceneId) => story.hasScene(sceneId));
  const savedSceneId = story.hasScene(save.currentSceneId) ? save.currentSceneId : story.start;
  let currentScene = story.getScene(savedSceneId);

  async function showScene(scene, options = {}) {
    const { addToHistory = false, saveHistory = true } = options;
    clearTimeout(autoReadTimer);

    if (addToHistory && currentScene?.id && currentScene.id !== scene.id) {
      history = [...history, currentScene.id];
    }

    currentScene = scene;
    save.recordScene(scene.id);
    if (saveHistory) save.recordHistory(history);

    ui.showSaveStatus(`Autosaved • ${scene.id}`);
    ui.setBackAvailable(history.length > 0);
    ui.showEnd(null);
    ui.showDialogue(scene, story.characters);
    ui.showChoices(scene.choices ?? [], goToScene);
    // Before the await: a slow render can't start an older scene's track after a newer one.
    audio.playMusic(scene.music);

    if (scene.minigame) {
      // No await before the minigame: its HUD is up before any input can reach the scene, and a slow or
      // failing render of the picture behind it holds nothing up (D27).
      visuals.render(scene).catch((error) => console.error('Scene render failed.', error));
      await runMinigame(scene);
      return;
    }

    await visuals.render(scene);
    preloadAhead(scene);

    // advance() itself ignores choice scenes, an open menu and minigames.
    if (save.settings.autoRead && scene === currentScene) {
      clearTimeout(autoReadTimer);
      autoReadTimer = setTimeout(advance,
        AUTO_READ_BASE_MS + (scene.text?.length ?? 0) * AUTO_READ_MS_PER_CHAR);
    }
  }

  // Warm only the next few reachable scenes so advancing feels instant
  // without loading the whole story up front. Runs in the background.
  function preloadAhead(scene) {
    visuals.preloadFrom(scene, 3).catch((error) => {
      console.warn('Could not preload upcoming scenes.', error);
    });
  }

  /**
   * Runs the scene's minigame and routes to the matching follow-up scene.
   * The minigame scene itself is kept out of the back-history, so pressing
   * "Back" from an outcome scene returns to whatever preceded the minigame.
   */
  async function runMinigame(scene) {
    minigameActive = true;
    ui.setBackAvailable(false);

    const outcome = await minigames.run(scene.minigame);

    minigameActive = false;
    // Back on now, not only by the next scene: a typo in onVictory/onFailure shows none (Menu works too).
    ui.setBackAvailable(history.length > 0);

    const nextId =
      outcome === 'victory' ? scene.minigame.onVictory : scene.minigame.onFailure;

    if (nextId && story.hasScene(nextId)) {
      await showScene(story.getScene(nextId), { addToHistory: false });
    } else if (scene.next && story.hasScene(scene.next)) {
      await showScene(story.getScene(scene.next), { addToHistory: false });
    }
  }

  // Story input waits while a minigame or the menu is up, and just after the menu closes: the rest of a
  // double tap on Pokračovat must not skip a line or pick the choice under the button (D27).
  function inputBlocked() {
    return minigameActive || menuOpen || performance.now() - menuClosedAt < TAP_GUARD_MS;
  }

  function goToScene(sceneId) {
    if (inputBlocked()) return;
    showScene(story.getScene(sceneId), { addToHistory: true });
  }

  function advance() {
    if (inputBlocked()) return;
    if (ui.hasOpenChoices()) return;
    if (currentScene.next) goToScene(currentScene.next);
    else if (currentScene.end) ui.showEnd(currentScene.end);
  }

  function goBack() {
    if (inputBlocked()) return;
    const previousSceneId = history.at(-1);
    if (!previousSceneId) return;

    history = history.slice(0, -1);
    showScene(story.getScene(previousSceneId), { addToHistory: false });
  }

  function resetToStart() {
    audio.forgetPositions(); // a new game starts the resumable tracks from the beginning (D26)
    history = [];
    save.restartAt(story.start);
    currentScene = story.getScene(story.start);
  }

  // Progress a new game would lose (D27): an ending is none, the game is over.
  function hasProgress() {
    return !currentScene.end && (currentScene.id !== story.start || history.length > 0);
  }

  // The scene behind the menu is only drawn; showScene (which may start a minigame) waits for Pokračovat.
  // From the game, the scene is already drawn and its track keeps playing under the menu (D27).
  async function openMenu({ fromGame = false } = {}) {
    menuOpen = true;
    menuFromGame = fromGame;
    ui.setContinueAvailable(started || hasProgress());
    ui.showMenu(true);
    ui.showEnd(null); // "Zpět na začátek" comes here straight from the end card, without a showScene
    if (fromGame) return;
    audio.playMusic(story.menuMusic);
    await visuals.render(currentScene);
    preloadAhead(currentScene);
  }

  // The Menu button and Esc. No menu during a minigame: its skip button is the way out. A pending autoread
  // advance finds the menu open and does nothing; Pokračovat shows the scene again, which reschedules it.
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
    menuClosedAt = performance.now();
    ui.showMenu(false);
    showScene(currentScene, { addToHistory: false });
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
  // No showScene here, so the start scene's track never cuts in between ending and menu.
  function backToStart() {
    started = false;
    resetToStart();
    openMenu();
  }

  ui.bindNavigation({ onBack: goBack, onMenu: openMenuFromGame, onEndHome: backToStart });
  ui.bindSettings(save.settings, (change) => {
    save.saveSettings(change);
    audio.setVolume(save.settings.musicVolume);
  });
  ui.bindMenu({
    // Disabled buttons ignore the player's clicks, not a script's: Pokračovat checks again.
    onContinue: () => { if (started || hasProgress()) startGame(); },
    onNewGame: newGame,
    onConfirmNewGame: confirmNewGame,
    getEndScenes: () =>
      [...story.scenes.values()].filter((scene) => scene.end && save.readSceneIds.includes(scene.id)),
  });

  new InputController({
    root: config.ui.root,
    onAdvance: advance,
    onChoiceNumber: (index) => ui.pickChoice(index),
    onBack: goBack,
    onEscape: escape,
  }).connect();

  // Re-fit the scene (background letterboxing, character positions) whenever
  // the viewport size or aspect ratio changes.
  let resizeFrame = 0;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => {
      if (currentScene) visuals.render(currentScene);
    });
  });

  // Test hook for the check scripts (they run against the live site too, see D11). Not an API: these are
  // the live objects, so a test can drive them (robustness.mjs drives audio.forgetPositions/playMusic).
  window.__vn = { stage, minigames, audio, get sceneId() { return currentScene?.id; } };

  await openMenu(); // preloads the next scenes while the player is on the menu, as the old startup did
}
