import { MAX_HISTORY, isObject, memoryFrom, memoryObject } from './storyFlow.js';

// Every setting and its default. A saved value is kept only if it has the default's type
// (see sanitize()); a setting with a range also needs a clamp there, like the volumes'.
const DEFAULT_SETTINGS = { musicVolume: 0.75, effectsVolume: 0.75, autoRead: false, difficulty: 'normal' };
const DIFFICULTIES = ['easy', 'normal', 'hard']; // the keys of the minigame's DEFAULTS.winPercent (D33)

const strings = (value) => (Array.isArray(value) ? value.filter((item) => typeof item === 'string') : []);

// The save (D37): `vn:<story id>:autosave2` = { currentSceneId, currentLine, memory, history: [{ sceneId, line,
// memory }], readSceneIds, endings, settings }. The old key (`…:autosave`, one-line scenes) is only ever read, once,
// by migrateIfNeeded(), and by readSettings(); old code (a cached tab) keeps its own key and never meets this one.
export class AutoSave {
  constructor(storyId) {
    this.key = `vn:${storyId}:autosave2`;
    this.oldKey = `vn:${storyId}:autosave`;
    const parsed = readKey(this.key);
    this.exists = parsed !== null;
    this.data = sanitize(parsed ?? {});
  }

  /** Once, when there is no `autosave2` object yet: the old save converted by `migrate(old)` and written. */
  migrateIfNeeded(migrate) {
    if (this.exists) return;
    const old = readKey(this.oldKey);
    if (!old) return;
    try {
      const converted = migrate(old);
      this.data = sanitize({ ...converted, readSceneIds: old.readSceneIds, settings: old.settings });
    } catch (error) {
      console.warn('Could not convert the old save; starting fresh.', error);
      // The progress is lost, the player's settings and gallery aren't (written with the next save).
      this.data = sanitize({ readSceneIds: old.readSceneIds, settings: old.settings });
      return;
    }
    this.exists = true;
    this.persist();
  }

  /** The play-test page's volumes, read only: `autosave2`'s settings, else the old key's. */
  static readSettings(storyId) {
    const parsed = readKey(`vn:${storyId}:autosave2`) ?? readKey(`vn:${storyId}:autosave`) ?? {};
    return sanitize(parsed).settings;
  }

  /** Every scene landed on; survives new games (reserved for "skip read text", D6). */
  get readSceneIds() { return this.data.readSceneIds; }
  /** The endings reached (their end cards next); survives new games. The gallery lists them. */
  get endings() { return this.data.endings; }
  /** Nastavení: { musicVolume 0–1, effectsVolume 0–1, autoRead, difficulty }. Kept across new games. */
  get settings() { return this.data.settings; }

  saveSettings(change) {
    this.data.settings = { ...this.data.settings, ...change };
    this.persist();
  }

  /** A write: the position (a Map memory), the history (entries with Map memories) and the scene landed on. */
  // ponytail: every history entry holds a full copy of the memory and every tap rewrites the whole save (up to 500
  // entries, ~100–200 KB once Acts 2–3 add counters); store the memory only where it changed if phones get slow.
  recordPosition({ sceneId, line, memory, history, landed }) {
    this.data.currentSceneId = sceneId;
    this.data.currentLine = line ?? 0;
    this.data.memory = memoryObject(memory);
    this.data.history = history.slice(-MAX_HISTORY).map((entry) => ({
      sceneId: entry.scene.id, line: entry.line ?? 0, memory: memoryObject(entry.memory),
    }));
    if (landed) this.data.readSceneIds = [...new Set([...this.data.readSceneIds, sceneId])];
    this.persist();
  }

  recordEnding(sceneId) {
    if (this.data.endings.includes(sceneId)) return;
    this.data.endings = [...this.data.endings, sceneId];
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
}

/** The parsed object under a key, or null (missing, unreadable, not a non-array object). */
function readKey(key) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key));
    return isObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function sanitize(parsed) {
  const saved = isObject(parsed.settings) ? parsed.settings : {};
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
  if (!DIFFICULTIES.includes(settings.difficulty)) settings.difficulty = DEFAULT_SETTINGS.difficulty;
  // Before the effects slider (D29), the music slider was the master: at 0 it silenced everything.
  if (!('effectsVolume' in saved) && saved.musicVolume === 0) settings.effectsVolume = 0;

  const history = (Array.isArray(parsed.history) ? parsed.history : [])
      .filter((entry) => isObject(entry) && typeof entry.sceneId === 'string' && isObject(entry.memory))
      .map((entry) => ({
        sceneId: entry.sceneId,
        line: Number.isInteger(entry.line) && entry.line >= 0 ? entry.line : 0,
        memory: memoryObject(memoryFrom(entry.memory)),
      }))
      .slice(-MAX_HISTORY);
  // A corrupt memory takes the last history entry's (from before the current scene was entered): the flags survive.
  const memory = isObject(parsed.memory) ? memoryObject(memoryFrom(parsed.memory)) : (history.at(-1)?.memory ?? {});
  return {
    currentSceneId: typeof parsed.currentSceneId === 'string' ? parsed.currentSceneId : null,
    currentLine: Number.isInteger(parsed.currentLine) && parsed.currentLine >= 0 ? parsed.currentLine : 0,
    memory,
    history,
    readSceneIds: strings(parsed.readSceneIds),
    endings: strings(parsed.endings),
    settings,
  };
}
