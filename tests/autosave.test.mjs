// AutoSave in node with a fake localStorage (D29, D33, D37): per-setting type check, the volume clamps, an old save
// with music at 0 getting the effects at 0 (through the migration), the difficulty; the autosave2 save's fields,
// the one-time migration of the old key, readSettings, and that the constructor never writes.
//   node tests/autosave.test.mjs [repoOrCopy]
import { fileURLToPath, pathToFileURL } from 'node:url';
const store = new Map();
let writes = 0;
let throwing = false;
globalThis.localStorage = {
  getItem: (k) => { if (throwing) throw new Error('blocked'); return store.get(k) ?? null; },
  setItem: (k, v) => { if (throwing) throw new Error('blocked'); writes += 1; store.set(k, v); },
};
const root = (process.argv[2] ?? fileURLToPath(new URL('..', import.meta.url))).replaceAll('\\', '/').replace(/\/$/, '');
const { AutoSave } = await import(pathToFileURL(`${root}/src/engine/autoSave.js`).href);
const KEY = 'vn:t:autosave2';
const OLD = 'vn:t:autosave';
const warn = console.warn;
console.warn = () => {};
let bad = 0;
const check = (name, ok, detail = '') => {
  if (!ok) bad += 1;
  console.log(ok ? 'ok  ' : 'FAIL', name, ok ? '' : detail);
};
const reset = () => { store.clear(); writes = 0; throwing = false; };

// Settings, as before, now read from autosave2 (and from the old key through the migration).
const D = { musicVolume: 0.75, effectsVolume: 0.75, autoRead: false, difficulty: 'normal' };
const cases = [
  [{ musicVolume: 0.3, autoRead: true }, { ...D, musicVolume: 0.3, autoRead: true }],
  [{ musicVolume: 7, autoRead: 'true' }, { ...D, musicVolume: 1 }],
  [{ musicVolume: -2 }, { ...D, musicVolume: 0 }],
  [{ musicVolume: 'loud', autoRead: 1 }, D],
  [null, D],
  [undefined, D],
  [{ musicVolume: 0.5, effectsVolume: 0.2 }, { ...D, musicVolume: 0.5, effectsVolume: 0.2 }],
  [{ effectsVolume: 9 }, { ...D, effectsVolume: 1 }],
  [{ effectsVolume: -1 }, { ...D, effectsVolume: 0 }],
  [{ effectsVolume: 'quiet' }, D],
  [{ musicVolume: 0, autoRead: false }, { ...D, musicVolume: 0, effectsVolume: 0 }],
  [{ musicVolume: 0, effectsVolume: 0.5 }, { ...D, musicVolume: 0, effectsVolume: 0.5 }],
  [{ difficulty: 'easy' }, { ...D, difficulty: 'easy' }],
  [{ difficulty: 'hard' }, { ...D, difficulty: 'hard' }],
  ...['x', 3, null, {}, 'constructor', 'Normal'].map((difficulty) => [{ difficulty }, D]),
];
for (const [settings, expected] of cases) {
  reset();
  store.set(KEY, JSON.stringify({ currentSceneId: 'x', settings }));
  const got = new AutoSave('t').settings;
  check(`settings ${JSON.stringify(settings)}`, JSON.stringify(got) === JSON.stringify(expected), JSON.stringify(got));
  reset();
  store.set(OLD, JSON.stringify({ currentSceneId: 'x', history: [], readSceneIds: [], settings }));
  const save = new AutoSave('t');
  save.migrateIfNeeded(() => ({}));
  check(`  migrated ${JSON.stringify(settings)}`, JSON.stringify(save.settings) === JSON.stringify(expected), JSON.stringify(save.settings));
}

// The autosave2 fields.
reset();
store.set(KEY, JSON.stringify({
  currentSceneId: 's', currentLine: 2.5, memory: JSON.parse('{"a":1,"__proto__":3,"b":-1,"c":"2","2x":1}'),
  history: ['old', null, { sceneId: 'h', line: -1, memory: { x: 1 } }, { sceneId: 'h2', line: 3 }, { sceneId: 5, memory: {} },
    { sceneId: 'h3', line: 1, memory: { 'bad name': 1, ok: 2 } }],
  readSceneIds: ['a', 3], endings: ['e', null],
}));
let s = new AutoSave('t');
check('currentLine not whole → 0', s.data.currentLine === 0);
check('memory: own valid entries only', JSON.stringify(Object.entries(s.data.memory)) === JSON.stringify([['a', 1], ['__proto__', 3]]),
  JSON.stringify(Object.entries(s.data.memory)));
check('history: objects with memory kept, bad line → 0, names cleaned',
  JSON.stringify(s.data.history) === JSON.stringify([{ sceneId: 'h', line: 0, memory: { x: 1 } }, { sceneId: 'h3', line: 1, memory: { ok: 2 } }]),
  JSON.stringify(s.data.history));
check('readSceneIds and endings: strings', JSON.stringify([s.readSceneIds, s.endings]) === JSON.stringify([['a'], ['e']]));
check('the constructor writes nothing', writes === 0);
reset();
store.set(KEY, JSON.stringify({ currentSceneId: 's', memory: 'x', history: [{ sceneId: 'h', line: 0, memory: { f: 1 } }] }));
check('a memory that is not an object takes the last history entry', JSON.stringify(new AutoSave('t').data.memory) === '{"f":1}');
reset();
store.set(KEY, JSON.stringify({ currentSceneId: 's', memory: [1] }));
check('… with no history: empty', JSON.stringify(new AutoSave('t').data.memory) === '{}');
reset();
store.set(KEY, JSON.stringify({ history: Array.from({ length: 700 }, (_, i) => ({ sceneId: `s${i}`, line: 0, memory: {} })) }));
s = new AutoSave('t');
check('history capped at 500 (the newest)', s.data.history.length === 500 && s.data.history[0].sceneId === 's200');

// A round trip with odd names.
reset();
s = new AutoSave('t');
s.recordPosition({ sceneId: 'x', line: null, memory: new Map([['__proto__', 1], ['constructor', 2]]), history: [], landed: true });
s = new AutoSave('t');
check('round trip: __proto__ and constructor as names', JSON.stringify(Object.entries(s.data.memory)) === '[["__proto__",1],["constructor",2]]'
  && s.data.currentLine === 0 && s.readSceneIds.includes('x'));
s.recordEnding('e');
s.recordEnding('e');
check('recordEnding once', JSON.stringify(new AutoSave('t').endings) === '["e"]');

// migrateIfNeeded.
reset();
let calls = 0;
s = new AutoSave('t');
s.migrateIfNeeded(() => { calls += 1; return {}; });
check('no save under either key: nothing called, nothing written', calls === 0 && writes === 0);
reset();
store.set(OLD, JSON.stringify({ currentSceneId: 'a', history: ['s'], readSceneIds: ['s', 'a'], settings: { musicVolume: 0.3 } }));
const oldText = store.get(OLD);
s = new AutoSave('t');
s.migrateIfNeeded((old) => {
  calls += 1;
  return { currentSceneId: old.currentSceneId, currentLine: 1, memory: { m: 1 }, history: [{ sceneId: 's', line: 0, memory: {} }], endings: ['a'] };
});
const written = JSON.parse(store.get(KEY) ?? 'null');
check('old save → migrated once and written', calls === 1 && written?.currentSceneId === 'a' && written.currentLine === 1
  && written.memory.m === 1 && written.endings[0] === 'a' && written.readSceneIds.length === 2 && written.settings.musicVolume === 0.3,
  JSON.stringify(written));
check('the old key byte-identical', store.get(OLD) === oldText);
const again = new AutoSave('t');
again.migrateIfNeeded(() => { calls += 1; return {}; });
check('autosave2 present → not called again', calls === 1);
reset();
store.set(KEY, '{}');
store.set(OLD, JSON.stringify({ currentSceneId: 'a' }));
calls = 0;
new AutoSave('t').migrateIfNeeded(() => { calls += 1; return {}; });
check('an empty autosave2 object counts as existing', calls === 0);
for (const corrupt of ['[1]', 'null', '"x"', '{broken']) {
  reset();
  store.set(KEY, corrupt);
  store.set(OLD, JSON.stringify({ currentSceneId: 'a' }));
  calls = 0;
  new AutoSave('t').migrateIfNeeded(() => { calls += 1; return { currentSceneId: 'a' }; });
  check(`a corrupt autosave2 (${corrupt}) migrates again`, calls === 1);
}
reset();
store.set(OLD, JSON.stringify({ currentSceneId: 'a' }));
const oldBefore = store.get(OLD);
s = new AutoSave('t');
s.migrateIfNeeded(() => { throw new Error('boom'); });
check('a throwing migrate: fresh, nothing written, old key untouched', writes === 0 && s.data.currentSceneId === null && store.get(OLD) === oldBefore);
reset();
store.set(OLD, JSON.stringify({ currentSceneId: 'a', settings: { musicVolume: 0.2 }, readSceneIds: ['e'] }));
s = new AutoSave('t');
s.migrateIfNeeded(() => { throw new Error('boom'); });
check('… its settings and gallery kept', s.settings.musicVolume === 0.2 && s.readSceneIds.includes('e'));
reset();
store.set(OLD, JSON.stringify({ currentSceneId: 'a' }));
throwing = true;
try {
  s = new AutoSave('t');
  s.migrateIfNeeded(() => ({ currentSceneId: 'a' }));
  check('storage that throws: a fresh start, no throw', s.data.currentSceneId === null);
} catch (error) {
  check('storage that throws: a fresh start, no throw', false, error.message);
}
reset();
store.set(OLD, JSON.stringify({ currentSceneId: 'a' }));
s = new AutoSave('t');
const realSet = localStorage.setItem;
localStorage.setItem = () => { throw new Error('full'); };
s.migrateIfNeeded(() => ({ currentSceneId: 'a', currentLine: 2 }));
localStorage.setItem = realSet;
check('a failed migration write keeps the migrated save in memory', s.data.currentSceneId === 'a' && s.data.currentLine === 2 && !store.has(KEY));

// readSettings: read only.
reset();
store.set(OLD, JSON.stringify({ settings: { effectsVolume: 0.2 } }));
check('readSettings from the old key', AutoSave.readSettings('t').effectsVolume === 0.2 && writes === 0);
store.set(KEY, JSON.stringify({ settings: { effectsVolume: 0.4 } }));
check('readSettings prefers autosave2', AutoSave.readSettings('t').effectsVolume === 0.4 && writes === 0);
reset();
check('readSettings with nothing: defaults', JSON.stringify(AutoSave.readSettings('t')) === JSON.stringify(D));

console.warn = warn;
process.exit(bad ? 1 : 0);
