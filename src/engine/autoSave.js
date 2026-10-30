// Every setting and its default. A saved value is kept only if it has the default's type
// (see load()); a setting with a range also needs a clamp there, like the volumes'.
const DEFAULT_SETTINGS = { musicVolume: 0.75, effectsVolume: 0.75, autoRead: false };

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

  /** Nastavení: { musicVolume 0–1, effectsVolume 0–1, autoRead }. Kept across restarts. */
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
    // Blocked or full storage: keep playing; progress just isn't saved.
    try {
      localStorage.setItem(this.key, JSON.stringify(this.data));
    } catch (error) {
      console.warn('Could not save progress.', error);
    }
  }

  load() {
    const empty = { currentSceneId: null, history: [], readSceneIds: [], settings: { ...DEFAULT_SETTINGS } };

    try {
      const parsed = JSON.parse(localStorage.getItem(this.key));
      if (!parsed || typeof parsed !== 'object') return empty;
      const saved = parsed.settings && typeof parsed.settings === 'object' ? parsed.settings : {};
      const settings = {};
      for (const [name, fallback] of Object.entries(DEFAULT_SETTINGS)) {
        settings[name] = typeof saved[name] === typeof fallback ? saved[name] : fallback;
      }
      // A hand-edited or corrupt save must not leave the slider showing one volume while
      // another plays (Howler ignores values outside 0–1).
      for (const name of ['musicVolume', 'effectsVolume']) {
        settings[name] = Number.isFinite(settings[name])
          ? Math.min(1, Math.max(0, settings[name]))
          : DEFAULT_SETTINGS[name];
      }
      // Before the effects slider (D29), the music slider was the master: at 0 it silenced everything.
      if (!('effectsVolume' in saved) && saved.musicVolume === 0) settings.effectsVolume = 0;
      return {
        currentSceneId: parsed.currentSceneId ?? null,
        history: Array.isArray(parsed.history) ? parsed.history : [],
        readSceneIds: Array.isArray(parsed.readSceneIds) ? parsed.readSceneIds : [],
        settings,
      };
    } catch {
      return empty;
    }
  }
}
