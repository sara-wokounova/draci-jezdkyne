import { createPixiStage } from './pixiStage.js';
import { StoryRepository } from './storyRepository.js';
import { AutoSave } from './autoSave.js';
import { UiController } from './uiController.js';
import { InputController } from './inputController.js';
import { AudioManager } from './audioManager.js';
import { VisualRenderer } from './visualRenderer.js';

export async function startVisualNovel(config) {
  const story = await StoryRepository.load(config.storyUrl);
  const save = new AutoSave(story.id);
  const ui = new UiController(config.ui);
  const stage = await createPixiStage(config.pixiHost);
  const audio = new AudioManager(story.assets?.music ?? {});
  const visuals = new VisualRenderer(stage, story);

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

    // Warm only the next few reachable scenes so advancing feels instant
    // without loading the whole story up front. Runs in the background.
    visuals.preloadFrom(scene, 3).catch((error) => {
      console.warn('Could not preload upcoming scenes.', error);
    });
  }

  function goToScene(sceneId) {
    showScene(story.getScene(sceneId), { addToHistory: true });
  }

  function advance() {
    if (ui.hasOpenChoices()) return;
    if (currentScene.next) goToScene(currentScene.next);
  }

  function goBack() {
    const previousSceneId = history.at(-1);
    if (!previousSceneId) return;

    history = history.slice(0, -1);
    showScene(story.getScene(previousSceneId), { addToHistory: false });
  }

  function restart() {
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
