const DEFAULT_SETTINGS = { musicVolume: 0.75, autoRead: false };

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

  /** Every scene ever shown; survives restarts. The gallery reads reached endings from it. */
  get readSceneIds() {
    return this.data.readSceneIds;
  }

  /** Nastavení: { musicVolume 0–1, autoRead }. Kept across restarts. */
  get settings() {
    return this.data.settings;
  }

  saveSettings(change) {
    this.data.settings = { ...this.data.settings, ...change };
    this.persist();
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
    const empty = { currentSceneId: null, history: [], readSceneIds: [], settings: { ...DEFAULT_SETTINGS } };
    const stored = localStorage.getItem(this.key);
    if (!stored) return empty;

    try {
      const parsed = JSON.parse(stored);
      return {
        currentSceneId: parsed.currentSceneId ?? null,
        history: Array.isArray(parsed.history) ? parsed.history : [],
        readSceneIds: Array.isArray(parsed.readSceneIds) ? parsed.readSceneIds : [],
        settings: { ...DEFAULT_SETTINGS, ...(typeof parsed.settings === 'object' ? parsed.settings : {}) },
      };
    } catch {
      return empty;
    }
  }
}
