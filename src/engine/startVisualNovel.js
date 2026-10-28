import { createPixiStage } from './pixiStage.js';
import { StoryRepository } from './storyRepository.js';
import { AutoSave } from './autoSave.js';
import { UiController } from './uiController.js';
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
  const audio = new AudioManager(story.assets?.music ?? {}, save.settings.musicVolume);
  const visuals = new VisualRenderer(stage, story);
  const minigames = new MinigameManager(stage, { root: config.ui.root });

  let minigameActive = false;
  let menuOpen = true;
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
    await visuals.render(scene);

    if (scene.minigame) {
      await runMinigame(scene);
      return;
    }

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

    const nextId =
      outcome === 'victory' ? scene.minigame.onVictory : scene.minigame.onFailure;

    if (nextId && story.hasScene(nextId)) {
      await showScene(story.getScene(nextId), { addToHistory: false });
    } else if (scene.next && story.hasScene(scene.next)) {
      await showScene(story.getScene(scene.next), { addToHistory: false });
    }
  }

  function goToScene(sceneId) {
    if (minigameActive || menuOpen) return;
    showScene(story.getScene(sceneId), { addToHistory: true });
  }

  function advance() {
    if (minigameActive || menuOpen) return;
    if (ui.hasOpenChoices()) return;
    if (currentScene.next) goToScene(currentScene.next);
    else if (currentScene.end) ui.showEnd(currentScene.end);
  }

  function goBack() {
    if (minigameActive || menuOpen) return;
    const previousSceneId = history.at(-1);
    if (!previousSceneId) return;

    history = history.slice(0, -1);
    showScene(story.getScene(previousSceneId), { addToHistory: false });
  }

  function resetToStart() {
    history = [];
    save.restartAt(story.start);
    currentScene = story.getScene(story.start);
  }

  function restart() {
    if (minigameActive || menuOpen) return;
    resetToStart();
    showScene(currentScene, { addToHistory: false });
  }

  // The scene behind the menu is only drawn; showScene (which may start a minigame) waits for Start.
  async function openMenu() {
    menuOpen = true;
    ui.showMenu(true);
    ui.showEnd(null); // "Zpět na začátek" comes here straight from the end card, without a showScene
    audio.playMusic(story.menuMusic);
    await visuals.render(currentScene);
    preloadAhead(currentScene);
  }

  function startGame() {
    menuOpen = false;
    ui.showMenu(false);
    showScene(currentScene, { addToHistory: false });
  }

  // End card button: progress resets to the story start, the gallery keeps the ending.
  // No showScene here, so the start scene's track never cuts in between ending and menu.
  function backToStart() {
    resetToStart();
    openMenu();
  }

  ui.bindNavigation({ onBack: goBack, onRestart: restart, onEndHome: backToStart });
  ui.bindSettings(save.settings, (change) => {
    save.saveSettings(change);
    audio.setVolume(save.settings.musicVolume);
  });
  ui.bindMenu({
    onStart: startGame,
    getEndScenes: () =>
      [...story.scenes.values()].filter((scene) => scene.end && save.readSceneIds.includes(scene.id)),
  });

  new InputController({
    root: config.ui.root,
    onAdvance: advance,
    onChoiceNumber: (index) => ui.pickChoice(index),
    onBack: goBack,
    onRestart: restart,
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

  // Read-only hook for tests/mobile.mjs (runs against the live site too, see D11).
  window.__vn = { stage, minigames, get sceneId() { return currentScene?.id; } };

  await openMenu(); // preloads the next scenes while the player is on the menu, as the old startup did
}
