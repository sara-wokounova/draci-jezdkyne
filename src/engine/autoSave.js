export class AutoSave {
  constructor(storyId) {
    this.key = `vn:${storyId}:autosave`;
    this.data = this.load();
  }

  get currentSceneId() {
    return this.data.currentSceneId;
  }

  get history() {
    return this.data.history ?? [];
  }

  recordScene(sceneId) {
    this.data.currentSceneId = sceneId;
    this.data.readSceneIds = [...new Set([...this.data.readSceneIds, sceneId])];
    this.persist();
  }

  recordHistory(history) {
    this.data.history = [...history];
    this.persist();
  }

  restartAt(sceneId) {
    this.data.currentSceneId = sceneId;
    this.data.history = [];
    this.data.readSceneIds = [...new Set([...this.data.readSceneIds, sceneId])];
    this.persist();
  }

  persist() {
    localStorage.setItem(this.key, JSON.stringify(this.data));
  }

  load() {
    const empty = { currentSceneId: null, history: [], readSceneIds: [] };
    const stored = localStorage.getItem(this.key);
    if (!stored) return empty;

    try {
      const parsed = JSON.parse(stored);
      return {
        currentSceneId: parsed.currentSceneId ?? null,
        history: Array.isArray(parsed.history) ? parsed.history : [],
        readSceneIds: Array.isArray(parsed.readSceneIds) ? parsed.readSceneIds : [],
      };
    } catch {
      return empty;
    }
  }
}
