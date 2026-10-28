export class StoryRepository {
  constructor(data) {
    this.id = data.id ?? 'visual-novel';
    this.start = data.start;
    this.menuMusic = data.menuMusic ?? null;
    this.assets = data.assets ?? {};
    this.characters = data.characters ?? {};
    this.scenes = new Map(data.scenes.map((scene) => [scene.id, scene]));
  }

  static async load(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Could not load story file: ${url}`);

    const data = await response.json();
    validateStory(data);
    return new StoryRepository(data);
  }

  hasScene(sceneId) {
    return this.scenes.has(sceneId);
  }

  getScene(sceneId) {
    const scene = this.scenes.get(sceneId);
    if (!scene) throw new Error(`Unknown scene id: ${sceneId}`);
    return scene;
  }
}

function validateStory(data) {
  if (!data.start) throw new Error('Story JSON is missing "start".');
  if (!Array.isArray(data.scenes)) throw new Error('Story JSON needs a "scenes" array.');
}
