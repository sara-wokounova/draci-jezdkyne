import { createPixiStage } from './pixiStage.js';
import { StoryRepository } from './storyRepository.js';
import { AutoSave } from './autoSave.js';
import { UiController } from './uiController.js';
import { InputController } from './inputController.js';
import { AudioManager } from './audioManager.js';
import { VisualRenderer } from './visualRenderer.js';
import { MinigameManager } from './minigames/minigameManager.js';

export async function startVisualNovel(config) {
  const story = await StoryRepository.load(config.storyUrl);
  const save = new AutoSave(story.id);
  const ui = new UiController(config.ui);
  const stage = await createPixiStage(config.pixiHost);
  const audio = new AudioManager(story.assets?.music ?? {});
  const visuals = new VisualRenderer(stage, story);
  const minigames = new MinigameManager(stage, { root: config.ui.root });

  let minigameActive = false;
  let history = save.history.filter((sceneId) => story.hasScene(sceneId));
  const savedSceneId = story.hasScene(save.currentSceneId) ? save.currentSceneId : story.start;
  let currentScene = story.getScene(savedSceneId);

  async function showScene(scene, options = {}) {
    const { addToHistory = false, saveHistory = true } = options;

    if (addToHistory && currentScene?.id && currentScene.id !== scene.id) {
      history = [...history, currentScene.id];
    }

    currentScene = scene;
    save.recordScene(scene.id);
    if (saveHistory) save.recordHistory(history);

    ui.showSaveStatus(`Autosaved • ${scene.id}`);
    ui.setBackAvailable(history.length > 0);
    ui.showDialogue(scene, story.characters);
    ui.showChoices(scene.choices ?? [], goToScene);
    await visuals.render(scene);
    audio.playMusic(scene.music);

    if (scene.minigame) {
      await runMinigame(scene);
      return;
    }

    // Warm only the next few reachable scenes so advancing feels instant
    // without loading the whole story up front. Runs in the background.
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
    if (minigameActive) return;
    showScene(story.getScene(sceneId), { addToHistory: true });
  }

  function advance() {
    if (minigameActive) return;
    if (ui.hasOpenChoices()) return;
    if (currentScene.next) goToScene(currentScene.next);
  }

  function goBack() {
    if (minigameActive) return;
    const previousSceneId = history.at(-1);
    if (!previousSceneId) return;

    history = history.slice(0, -1);
    showScene(story.getScene(previousSceneId), { addToHistory: false });
  }

  function restart() {
    if (minigameActive) return;
    history = [];
    save.restartAt(story.start);
    showScene(story.getScene(story.start), { addToHistory: false });
  }

  ui.bindNavigation({ onBack: goBack, onRestart: restart });

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

  await showScene(currentScene, { addToHistory: false, saveHistory: true });
}
