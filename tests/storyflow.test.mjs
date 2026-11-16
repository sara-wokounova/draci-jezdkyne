// storyFlow.js in node (D37): the parts, normalising, memory and conditions, the order after a scene's lines,
// resolveEntry, placeSave, the old-save migration, preload's walk, the lint and the day pattern.
//   node tests/storyflow.test.mjs [repoOrCopy]
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const root = (process.argv[2] ?? fileURLToPath(new URL('..', import.meta.url))).replaceAll('\\', '/').replace(/\/$/, '');
const F = await import(pathToFileURL(`${root}/src/engine/storyFlow.js`).href);
const { StoryRepository } = await import(pathToFileURL(`${root}/src/engine/storyRepository.js`).href);
const warn = console.warn;
console.warn = () => {}; // runtime warnings (dead ends, malformed conditions) are expected in these cases

let failures = 0;
function t(name, fn) {
  try {
    fn();
    console.log(`ok   ${name}`);
  } catch (error) {
    failures += 1;
    console.log(`FAIL ${name}\n     ${error.message.split('\n').join('\n     ')}`);
  }
}
const M = (object = {}) => new Map(Object.entries(object));
const mem = (map) => Object.fromEntries(map);
function story(scenes, extra = {}) {
  const warnings = [];
  const s = F.normalizeStory({ id: 't', start: scenes[0]?.id, characters: { a: {}, b: {} }, ...extra, scenes }, warnings);
  s.warnings = warnings;
  return s;
}
// A story from parts, through mergeStory (locations live in parts).
function partStory(main, parts) {
  const warnings = [];
  const merged = F.mergeStory({ id: 't', characters: {}, ...main, parts: Object.keys(parts) }, new Map(Object.entries(parts)), warnings);
  const s = F.normalizeStory({ start: merged.scenes[0]?.id, ...merged }, warnings);
  s.warnings = warnings;
  return s;
}
const L = (...texts) => texts.map((text) => (typeof text === 'string' ? { text } : text));

// --- parts -------------------------------------------------------------------------------------------------------
t('mergeStory: main scenes first, then parts in order; no parts key', () => {
  const w = [];
  const merged = F.mergeStory({ id: 'x', start: 'm', scenes: [{ id: 'm' }], parts: ['b.json', 'a.json', 'b.json'] },
    new Map([['a.json', { scenes: [{ id: 'a' }] }], ['b.json', { scenes: [{ id: 'b' }], note: 1 }]]), w);
  assert.deepEqual(merged.scenes.map((s) => s.id), ['m', 'b', 'a']);
  assert.ok(!('parts' in merged));
  assert.equal(w.length, 2, w.join('; ')); // listed twice, extra key
});
t('mergeStory: no parts, a part without scenes, bad names throw', () => {
  assert.deepEqual(F.mergeStory({ scenes: [{ id: 'x' }] }, new Map()).scenes.map((s) => s.id), ['x']);
  assert.throws(() => F.mergeStory({ parts: ['a.json'] }, new Map([['a.json', {}]])));
  assert.throws(() => F.mergeStory({ parts: ['a.json'] }, new Map()));
  for (const name of ['../x.json', 'story.json', 'story-v2.json', 'a/b.json', 'x.txt', 'https://e.com/x.json']) {
    assert.throws(() => F.partNames({ parts: [name] }), name);
  }
  assert.throws(() => F.partNames({ parts: 'a.json' }));
  assert.throws(() => F.partNames({ parts: [3] }));
});
t('mergeStory: characters and movedScenes from parts (D39): merged after main, the first kept, odd ids and values', () => {
  const w = [];
  const parts = new Map([
    ['c.json', JSON.parse('{"characters":{"b":{"n":2},"a":{"n":9},"__proto__":{"n":3},"constructor":{},"toString":{}}}')],
    ['m.json', { scenes: [], movedScenes: { old: { scene: 's', line: 0 } } }],
    ['m2.json', JSON.parse('{"movedScenes":{"old":{"scene":"x","line":1},"__proto__":{"scene":"s","line":0}}}')],
    ['bad.json', { characters: 'x' }],
    ['s.json', { scenes: [{ id: 's' }] }],
  ]);
  const merged = F.mergeStory({ characters: { a: { n: 1 } }, parts: [...parts.keys()] }, parts, w);
  assert.deepEqual(Object.keys(merged.characters), ['a', 'b', '__proto__', 'constructor', 'toString']);
  assert.equal(merged.characters.a.n, 1, "main's entry is the base");
  assert.equal(Object.getPrototypeOf(merged.characters), Object.prototype);
  assert.ok(Object.hasOwn(merged.characters, '__proto__'));
  assert.deepEqual(Object.keys(merged.movedScenes), ['old', '__proto__']);
  assert.equal(merged.movedScenes.old.scene, 's');
  assert.deepEqual(merged.scenes.map((s) => s.id), ['s']);
  assert.deepEqual(w, ['Story part c.json: duplicate characters entry a (the first kept)',
    'Story part m2.json: duplicate movedScenes entry old (the first kept)', 'Story part bad.json: "characters" is not an object (ignored)']);
  const s = F.normalizeStory(merged, []);
  assert.equal(s.movedScenes.get('__proto__').scene, 's');
});
t('mergeStory: a part with only characters loads; odd scenes still throw; main odd values warn; absent no warning', () => {
  const w = [];
  assert.deepEqual(F.mergeStory({ parts: ['c.json'] }, new Map([['c.json', { characters: { a: {} } }]]), w).characters, { a: {} });
  assert.deepEqual(w, []);
  assert.throws(() => F.mergeStory({ parts: ['c.json'] }, new Map([['c.json', { characters: {}, scenes: 'x' }]])));
  assert.throws(() => F.mergeStory({ parts: ['c.json'] }, new Map([['c.json', { note: 1 }]])));
  const w2 = [];
  const m = F.mergeStory({ characters: 'x', movedScenes: [1], parts: ['c.json'] }, new Map([['c.json', { characters: { a: {} } }]]), w2);
  assert.deepEqual(m.characters, { a: {} });
  assert.deepEqual(m.movedScenes, {});
  assert.deepEqual(w2, ['Story file: "characters" is not an object (ignored)', 'Story file: "movedScenes" is not an object (ignored)']);
});

// --- normalising -------------------------------------------------------------------------------------------------
t('normalizeStory: old form, both, none, lines not a list, [] , malformed line, minigame, null scene, duplicate', () => {
  const s = story([
    { id: 'old', speaker: 'a', text: 'hi', characters: [{ id: 'a' }] },
    { id: 'both', lines: L('x'), text: 'ignored' },
    { id: 'none', next: 'old' },
    { id: 'notlist', lines: 'x' },
    { id: 'empty', lines: [], next: 'old' },
    { id: 'bad', lines: ['x', { text: 'ok' }] },
    { id: 'mg', minigame: { type: 'x' }, lines: L('x') },
    null,
    { id: 'old', text: 'dup' },
  ]);
  assert.deepEqual(s.scenes.get('old').lines, [{ speaker: 'a', text: 'hi' }]);
  assert.deepEqual(s.scenes.get('both').lines, [{ text: 'x' }]);
  assert.deepEqual(s.scenes.get('none').lines, [{ text: '' }]);
  assert.deepEqual(s.scenes.get('notlist').lines, [{ text: '' }]);
  assert.deepEqual(s.scenes.get('empty').lines, []);
  assert.deepEqual(s.scenes.get('bad').lines, [{ text: '' }, { text: 'ok' }]);
  assert.deepEqual(s.scenes.get('mg').lines, []);
  assert.equal(s.scenes.get('old').text, 'hi');
  assert.equal(s.scenes.size, 7);
  assert.equal(s.warnings.length, 7, s.warnings.join('; '));
});

// --- conditions and changes --------------------------------------------------------------------------------------
t('conditionMet', () => {
  const m = M({ a: 2, b: 0, žába: 1 });
  const yes = ['a', '!b', '!c', 'a>=2', 'a >= 2', 'a<3', 'a < 3', 'c<1', 'žába', 'a>=02', ['a', '!b'], undefined];
  const no = ['b', '!a', 'c', 'a>=3', 'a<2', ['a', 'b'], [], '', '!', 'a>1', 'a==2', 'a>=1.5', '2den', '! a',
    'bobri pratele', 3, null, {}, 'a=>2', 'a>=-1'];
  for (const c of yes) assert.equal(F.conditionMet(c, m), true, JSON.stringify(c));
  for (const c of no) assert.equal(F.conditionMet(c, m), false, JSON.stringify(c));
  for (const name of ['constructor', '__proto__', 'toString']) {
    assert.equal(F.conditionMet(name, M()), false, name);
    assert.equal(F.conditionMet(`!${name}`, M()), true, name);
  }
});
t('applyChanges', () => {
  assert.deepEqual(mem(F.applyChanges(M({ a: 3 }), { set: ['a', 'b'] })), { a: 3, b: 1 });
  assert.deepEqual(mem(F.applyChanges(M({ a: 1 }), { add: { a: 2, c: -5 } })), { a: 3, c: 0 });
  assert.deepEqual(mem(F.applyChanges(M(), { set: 'a', add: { b: '1', 'x y': 1, c: 1.5, d: 1 } })), { d: 1 });
  assert.deepEqual([...F.applyChanges(M(), { add: JSON.parse('{"__proto__": 1, "constructor": 2}') })],
    [['__proto__', 1], ['constructor', 2]]);
  const m = M({ a: 1 });
  F.applyChanges(m, { set: ['b'] });
  assert.deepEqual(mem(m), { a: 1 }, 'the input memory is not changed');
});
t('memoryFrom keeps only own valid entries', () => {
  const m = F.memoryFrom(JSON.parse('{"a":1,"__proto__":2,"b":-1,"c":1.5,"d":"1","2x":1,"ž":3}'));
  assert.deepEqual([...m], [['a', 1], ['__proto__', 2], ['ž', 3]]);
  assert.deepEqual([...F.memoryFrom(null)], []);
  assert.deepEqual([...F.memoryFrom([1])], []);
});

// --- lines, stage, follow-up -------------------------------------------------------------------------------------
const stageStory = story([{ id: 's', characters: [{ id: 'a' }], lines: [
  { text: '0' }, { text: '1', characters: [{ id: 'b' }] }, { text: '2', if: 'x', characters: [] }, { text: '3' },
  { text: '4', characters: [] }] }]);
t('visibleLines and stageAt', () => {
  const sc = stageStory.scenes.get('s');
  assert.deepEqual(F.visibleLines(sc, M()), [0, 1, 3, 4]);
  assert.deepEqual(F.stageAt(sc, 0, M()).map((e) => e.id), ['a']);
  assert.deepEqual(F.stageAt(sc, 3, M()).map((e) => e.id), ['b'], 'a hidden line does not count');
  assert.deepEqual(F.stageAt(sc, 3, M({ x: 1 })).map((e) => e.id), [], 'a visible empty stage');
  assert.deepEqual(F.stageAt(sc, 4, M()), []);
  assert.deepEqual(F.stageAt(sc, null, M()).map((e) => e.id), ['a'], 'no line: the scene stage');
  assert.deepEqual(F.stageAt(story([{ id: 'n', lines: L('x') }]).scenes.get('n'), 0, M()), []);
});
const flow = story([
  { id: 'c', lines: L('x'), choices: [{ text: 'A', next: 'e', if: 'k' }, { text: 'B', next: 'e' }], next: 'e', end: {} },
  { id: 'n', lines: L('x'), next: [{ if: 'k', next: 'c' }, { if: 'nope' }, { next: 'e' }] },
  { id: 'none', lines: L('x'), next: [{ if: 'k', next: 'c' }], end: { title: 'E' } },
  { id: 'typo', lines: L('x'), next: 'nowhere', end: { title: 'E' } },
  { id: 'dead', lines: L('x') },
  { id: 'e', lines: L('x'), end: { title: 'E' } },
  { id: 'mg', minigame: { onVictory: 'e', onFailure: 'e' } },
]);
t('nextSceneId, visibleChoices, followUp', () => {
  const g = (id) => flow.scenes.get(id);
  assert.equal(F.nextSceneId(g('n'), M()), 'e');
  assert.equal(F.nextSceneId(g('n'), M({ k: 1 })), 'c');
  assert.equal(F.nextSceneId(story([{ id: 'x', lines: [], next: [{ if: 'nope' }] }]).scenes.get('x'), M({ nope: 1 })), null,
    'an entry without next is skipped');
  assert.deepEqual(F.visibleChoices(g('c'), M()).map((c) => c.text), ['B']);
  assert.equal(F.followUp(flow, g('c'), M()).kind, 'choices');
  assert.deepEqual(F.followUp(flow, g('n'), M()), { kind: 'next', id: 'e' });
  assert.equal(F.followUp(flow, g('none'), M()).kind, 'end', 'a list matching nothing falls through to end');
  assert.equal(F.followUp(flow, g('typo'), M()).kind, 'dead', 'a typo is a dead end, not end');
  assert.equal(F.followUp(flow, g('dead'), M()).kind, 'dead');
  assert.equal(F.followUp(flow, g('mg'), M()).kind, 'minigame');
});
t('placeLine and nextLine', () => {
  const sc = stageStory.scenes.get('s');
  assert.equal(F.placeLine(sc, 2, M()), 3);
  assert.equal(F.placeLine(sc, 2, M({ x: 1 })), 2);
  assert.equal(F.placeLine(sc, 99, M()), 4);
  assert.equal(F.placeLine(sc, null, M()), 0);
  assert.equal(F.placeLine(story([{ id: 'e', lines: [] , end: {} }]).scenes.get('e'), 0, M()), null);
  assert.equal(F.nextLine(sc, 1, M()), 3);
  assert.equal(F.nextLine(sc, 4, M()), null);
  assert.equal(F.nextLine(sc, null, M()), null);
});

// --- resolveEntry ------------------------------------------------------------------------------------------------
const entry = story([
  { id: 'plain', add: { n: 1 }, lines: L('x') },
  { id: 'pass', lines: [], add: { n: 1 }, next: 'pass2' },
  { id: 'pass2', lines: [], set: ['p'], next: 'plain' },
  { id: 'hub', lines: [{ text: 'intro', if: 'n<1' }], choices: [{ text: 'A', next: 'plain' }], next: 'plain' },
  { id: 'hidden', lines: [{ text: 'x', if: 'no' }], next: 'plain' },
  { id: 'typo', lines: [], add: { n: 5 }, next: 'pass3' },
  { id: 'pass3', lines: [], next: 'nowhere' },
  { id: 'nothing', lines: [] },
  { id: 'typoEnd', lines: [], next: 'nowhere', end: {} },
  { id: 'loopA', lines: [], next: 'loopB' },
  { id: 'loopB', lines: [], next: 'loopA' },
  { id: 'mgNext', minigame: { onVictory: 'plain' }, next: 'plain' },
  { id: 'mg', minigame: {} },
  { id: 'endNow', lines: [], end: {} },
]);
t('resolveEntry', () => {
  const r = (id, m = M()) => F.resolveEntry(entry, id, m);
  assert.deepEqual([r('plain').scene.id, r('plain').line, mem(r('plain').memory)], ['plain', 0, { n: 1 }]);
  assert.deepEqual([r('pass').scene.id, mem(r('pass').memory)], ['plain', { n: 2, p: 1 }], 'a chain, each applied once');
  const hub = r('hub', M({ n: 1 }));
  assert.deepEqual([hub.scene.id, hub.line], ['hub', null], 'all lines hidden with visible choices: no forward');
  assert.equal(r('hidden').scene.id, 'plain', 'all hidden, no choices: forward');
  const m = M({ n: 1 });
  assert.equal(r('typo', m).dead, true, 'a typo mid-chain');
  assert.deepEqual(mem(m), { n: 1 }, 'memory unchanged');
  assert.equal(r('nothing').dead, true);
  assert.equal(r('typoEnd').dead, true, 'a typo with an end is a dead end');
  assert.equal(r('loopA').dead, true, 'the forward cap');
  assert.deepEqual([r('mgNext').scene.id, r('mgNext').line], ['mgNext', null], 'a minigame is never forwarded');
  assert.equal(r('mg').dead, undefined, 'a minigame with no next is a landing');
  assert.equal(r('endNow').line, null);
  assert.equal(r('unknown').dead, true);
});
t('a forward cap of exactly MAX_FORWARDS passes', () => {
  const scenes = [];
  for (let i = 0; i < F.MAX_FORWARDS; i += 1) scenes.push({ id: `p${i}`, lines: [], next: `p${i + 1}` });
  scenes.push({ id: `p${F.MAX_FORWARDS}`, lines: L('x') });
  assert.equal(F.resolveEntry(story(scenes), 'p0', M()).scene.id, `p${F.MAX_FORWARDS}`);
  scenes.splice(-1, 0, { id: 'extra' });
  scenes[F.MAX_FORWARDS - 1].next = 'q';
  const longer = [...scenes.slice(0, F.MAX_FORWARDS), { id: 'q', lines: [], next: `p${F.MAX_FORWARDS}` },
    { id: `p${F.MAX_FORWARDS}`, lines: L('x') }];
  assert.equal(F.resolveEntry(story(longer), 'p0', M()).dead, true, '21 forwards');
});
t('isEndingPosition', () => {
  assert.equal(F.isEndingPosition(flow, flow.scenes.get('e'), 0, M()), true);
  assert.equal(F.isEndingPosition(flow, flow.scenes.get('c'), 0, M()), false);
  assert.equal(F.isEndingPosition(flow, flow.scenes.get('mg'), null, M()), false);
});

// --- reachableWithin ---------------------------------------------------------------------------------------------
const reach = story([
  { id: 'a', lines: L('1', '2', '3'), next: 'b' },
  { id: 'b', lines: L('x'), choices: [{ text: '1', next: 'c' }, { text: '2', next: 'pass' }, { text: '3', next: 'h', if: 'no' }] },
  { id: 'c', lines: [{ text: 'x' }, { text: 'y', if: 'no' }], next: [{ if: 'no', next: 'h' }, { next: 'a' }] },
  { id: 'pass', lines: [], next: 'd' },
  { id: 'd', lines: L('x'), next: 'mg' },
  { id: 'mg', minigame: { onVictory: 'h', onFailure: 'h' }, background: 'mg' },
  { id: 'h', lines: L('x') },
  { id: 'hub', lines: L('x'), choices: [{ text: '1', next: 'd' }], next: 'h' },
]);
t('reachableWithin', () => {
  const ids = (id, line, n) => F.reachableWithin(reach, { scene: reach.scenes.get(id), line }, M(), n)
      .map((p) => `${p.scene.id}:${p.line}`);
  assert.deepEqual(ids('a', 0, 3), ['a:0', 'a:1', 'a:2', 'b:0']);
  assert.deepEqual(ids('b', 0, 3), ['b:0', 'c:0', 'd:0', 'a:0', 'mg:null', 'a:1'],
    'every visible choice; a pass-through walked free and not returned; a hidden choice, a hidden line and a non-matching entry not walked');
  assert.ok(!ids('d', 0, 5).includes('h:0'), 'minigame outcomes not walked');
  assert.ok(!ids('hub', 0, 3).includes('h:0'), "a hub's next not walked while it has a visible choice");
  assert.deepEqual(ids('c', 0, 50).filter((x) => x === 'a:0').length, 1, 'cycles stop');
});

// --- locations (item 10) ----------------------------------------------------------------------------------------
const realRandom = Math.random;
function withRandom(values, fn) {
  let calls = 0;
  Math.random = () => values[calls++ % values.length];
  try { fn(); } finally { Math.random = realRandom; }
  return calls;
}
const loc = partStory({ scenes: [
  { id: 'hub', lines: L('Kam?'), choices: [{ text: 'Hory', location: 'hory' }, { text: 'Domů', next: 'home', set: ['vedma_doupe'] },
    { text: 'Hory s vědmou', location: 'hory', set: ['vedma_doupe'] }], next: 'home' },
  { id: 'home', add: { pul: 1 }, lines: L('doma') },
] }, {
  'lokace-hory.json': { location: { id: 'hory', events: [
    { scene: 'doupe', if: 'vedma_doupe', first: true }, { scene: 'zubr' }, { scene: 'vily' }, { scene: 'pozde', if: 'pul>=2' }] },
  scenes: [{ id: 'doupe', lines: L('doupě') }, { id: 'zubr', lines: [{ text: 'a' }, { text: 'zubr viděn', if: 'zubr' }] },
    { id: 'vily', lines: L('víly') }, { id: 'pozde', lines: L('pozdě') }] },
});
const hubScene = loc.scenes.get('hub');
t('locations: mergeStory collects a part location; duplicates and the main file warned', () => {
  assert.deepEqual([...loc.locations.keys()], ['hory']);
  assert.deepEqual(loc.warnings, []);
  const w = partStory({ location: { id: 'x', events: [] }, scenes: [{ id: 'a', lines: L('a') }] },
    { 'a.json': { location: { id: 'l', events: [] }, scenes: [] }, 'b.json': { location: { id: 'l', events: [{ scene: 'a' }] }, scenes: [] } });
  assert.equal(w.locations.get('l').events.length, 0, 'the first kept');
  assert.ok(w.warnings.some((x) => x.includes('main file')) && w.warnings.some((x) => x.includes('Duplicate location')), w.warnings.join('; '));
});
t('locations: availability (played, if), the choice hidden once nothing is left', () => {
  assert.deepEqual(F.availableEvents(loc, 'hory', M()).map((e) => e.scene), ['zubr', 'vily']);
  assert.deepEqual(F.availableEvents(loc, 'hory', M({ pul: 2, zubr: 1 })).map((e) => e.scene), ['vily', 'pozde']);
  assert.deepEqual(F.visibleChoices(hubScene, M({ zubr: 1, vily: 1 }), loc).map((c) => c.text), ['Domů', 'Hory s vědmou'],
    'the plain location choice hidden, the other stays; the one whose own set unlocks the lair stays');
  assert.deepEqual(F.visibleChoices(hubScene, M({ zubr: 1, vily: 1, doupe: 1 }), loc).map((c) => c.text), ['Domů']);
  // Judged with the choice's own changes, as the pick is: a choice adding a half-day past an event's window.
  const late = partStory({ scenes: [{ id: 'h', lines: L('x'), choices: [{ text: 'a', location: 'l', add: { pul: 1 } }, { text: 'b', next: 'h' }] }] },
    { 'l.json': { location: { id: 'l', events: [{ scene: 'e', if: 'pul<2' }] }, scenes: [{ id: 'e', lines: L('e') }] } });
  assert.equal(F.visibleChoices(late.scenes.get('h'), M({ pul: 1 }), late).length, 1, 'shown only if its pick finds an event');
  assert.equal(F.visibleChoices(late.scenes.get('h'), M({ pul: 0 }), late).length, 2);
  assert.equal(F.visibleChoices(hubScene, M(), loc).length, 3);
  assert.equal(F.visibleChoices(hubScene, M(), undefined).length, 1, 'without the story: no location');
  assert.deepEqual(F.availableEvents(loc, 'nowhere', M()), []);
});
t('locations: first before the others; the rest by the stub; the name set before entering', () => {
  const [plain, , withVedma] = hubScene.choices;
  let e;
  withRandom([0], () => { e = F.pickEvent(loc, withVedma, M()); });
  assert.equal(e.sceneId, 'doupe', 'a choice set unlocks the first event');
  assert.deepEqual(mem(e.memory), { vedma_doupe: 1, doupe: 1 });
  const calls = withRandom([0.99], () => { e = F.pickEvent(loc, plain, M({ vedma_doupe: 1 })); });
  assert.equal(e.sceneId, 'doupe');
  assert.equal(calls, 0, 'a single candidate needs no random value');
  withRandom([0.1], () => { e = F.pickEvent(loc, plain, M()); });
  assert.equal(e.sceneId, 'zubr');
  withRandom([0.9], () => { e = F.pickEvent(loc, plain, M()); });
  assert.equal(e.sceneId, 'vily');
  withRandom([0.1], () => { e = F.pickEvent(loc, plain, M()); });
  const land = F.resolveEntry(loc, e.sceneId, e.memory);
  assert.deepEqual(F.visibleLines(land.scene, land.memory), [0, 1], "the event's own if sees its name");
  assert.equal(F.pickEvent(loc, plain, M({ zubr: 1, vily: 1 })), null);
});
t('locations: a stable event name; an invalid name never offered; a location part without scenes', () => {
  const s2 = partStory({ scenes: [{ id: 'h', lines: L('x'), choices: [{ text: 'a', location: 'l' }], next: 'h' },
    { id: 'novy_zubr', lines: L('z') }, { id: 'bad-id', lines: L('b') }] },
  { 'l.json': { location: { id: 'l', events: [{ scene: 'novy_zubr', name: 'zubr' }, { scene: 'bad-id' }] } } });
  assert.deepEqual(s2.warnings, [], 'a part with a location and no scenes loads');
  assert.deepEqual(F.availableEvents(s2, 'l', M()).map((e) => e.scene), ['novy_zubr'], 'an invalid name is never offered');
  assert.equal(F.availableEvents(s2, 'l', M({ zubr: 1 })).length, 0, 'played under its stable name');
  assert.deepEqual(mem(F.pickEvent(s2, s2.scenes.get('h').choices[0], M()).memory), { zubr: 1 });
  assert.throws(() => partStory({}, { 'x.json': { other: 1 } }), 'a part with neither scenes nor a location');
});
t('locations: a give-up choice offers a lost event again; lose, retry, win: never again', () => {
  const q = partStory({ scenes: [
    { id: 'hub', lines: L('Kam?'), choices: [{ text: 'Hory', location: 'l' }, { text: 'Jinam', next: 'hub' }], next: 'hub' },
    { id: 'quest', add: { pul: 1 }, lines: L('úkol'), next: 'hra' },
    { id: 'hra', minigame: { onVictory: 'won', onFailure: 'lost' } },
    { id: 'won', set: ['pomocnik'], lines: L('vyhráno'), next: 'hub' },
    { id: 'lost', lines: L('prohráno'), choices: [{ text: 'Znovu', next: 'hra' }, { text: 'Vzdát to', next: 'hub', giveUp: true }] },
  ] }, { 'l.json': { location: { id: 'l', events: [{ scene: 'quest', name: 'zubr' }] } } });
  assert.deepEqual(F.lintStory(q), []);
  const lost = q.scenes.get('lost');
  let m = F.pickEvent(q, q.scenes.get('hub').choices[0], M()).memory;
  assert.deepEqual(mem(m), { zubr: 1 });
  const gaveUp = F.giveUpMemory(q, lost, lost.choices[1], m);
  assert.deepEqual(mem(gaveUp), {}, 'the event\'s own name un-played, whatever its scene id');
  assert.equal(F.availableEvents(q, 'l', gaveUp).length, 1, 'offered again after giving up');
  m = F.resolveEntry(q, 'won', F.applyChanges(m, lost.choices[0])).memory;
  assert.equal(F.availableEvents(q, 'l', m).length, 0, 'never again after a won retry');
  assert.equal(F.owningEvent(q, 'hub'), null, 'the hub belongs to no event');
  assert.equal(F.owningEvent(q, 'lost').scene, 'quest');
});
t('locations: the give-up lint', () => {
  const bad = partStory({ scenes: [
    { id: 'hub', lines: L('x'), choices: [{ text: 'a', location: 'l' }, { text: 'b', next: 'hub', giveUp: true }, { text: 'c', next: 'hub', giveUp: 'yes' }], next: 'hub' },
    { id: 'ev', lines: L('e'), next: 'mg' }, { id: 'mg', minigame: { onVictory: 'hub', onFailure: 'lose' } },
    { id: 'znovu', lines: L('Ještě jednou!'), choices: [{ text: 'S jezevci', if: 'jezevci', next: 'mg' }], next: 'mg' },
    { id: 'pomoc', lines: L('p'), set: ['jezevci'], next: 'hub' },
    { id: 'lose', lines: L('l'), add: { ev: -1 }, choices: [{ text: 'Znovu', next: 'znovu', giveUp: true },
      { text: 'Jinam v horách', location: 'l', giveUp: true }, { text: 'Odletět', next: 'hub', giveUp: true }] }] },
  { 'l.json': { location: { id: 'l', events: [{ scene: 'ev' }] } } });
  const w = F.lintStory(bad).join('\n');
  for (const want of ['hub choice 1: giveUp outside any event', 'hub choice 2: malformed giveUp',
    'lose choice 0: giveUp leads back into its event', 'lose choice 1: giveUp on a location choice', 'lose: lowers the event name "ev"']) {
    assert.ok(w.includes(want), `missing ${want}\n${w}`);
  }
  assert.ok(!w.includes('lose choice 2:'), 'the plain give-up is fine');
  // A "sure?" question inside the event, a give-up after a win, and one before trying: all linted.
  const kinds = partStory({ scenes: [{ id: 'hub', lines: L('x'), choices: [{ text: 'a', location: 'l' }], next: 'hub' },
    { id: 'ev', lines: L('Pomůžeme?'), choices: [{ text: 'Ano', next: 'mg' }, { text: 'Teď ne', next: 'hub', giveUp: true }] },
    { id: 'mg', minigame: { onVictory: 'won', onFailure: 'lose' } },
    { id: 'won', lines: L('w'), choices: [{ text: 'Dál', next: 'hub', giveUp: true }, { text: 'x', next: 'hub' }] },
    { id: 'lose', lines: L('l'), choices: [{ text: 'Vzdát', next: 'sure', giveUp: true }, { text: 'Znovu', next: 'mg' }] },
    { id: 'sure', lines: L('Opravdu?'), choices: [{ text: 'Ještě to zkusím', next: 'mg' }, { text: 'Odletět', next: 'hub' }] }] },
  { 'l.json': { location: { id: 'l', events: [{ scene: 'ev' }] } } });
  const kw = F.lintStory(kinds).join('\n');
  for (const want of ['lose choice 0: giveUp leads back into its event', 'won choice 0: giveUp not only after a loss',
    'ev choice 1: giveUp not only after a loss']) assert.ok(kw.includes(want), `missing ${want}\n${kw}`);
  // The negative-add warning is about active events only.
  const retiredDown = partStory({ scenes: [{ id: 'hub', lines: L('x'), choices: [{ text: 'a', location: 'l' }], next: 'hub', add: { stara: -1 } },
    { id: 'b', lines: L('b'), next: 'hub' }] }, { 'l.json': { location: { id: 'l', events: [{ name: 'stara', retired: true }, { scene: 'b' }] } } });
  assert.ok(!F.lintStory(retiredDown).join().includes('lowers the event name'), F.lintStory(retiredDown).join('; '));
  // The event's scenes: its first scene and what only it leads to (not the shared router or hub).
  const giveUp = partStory({ scenes: [{ id: 'hub', lines: L('x'), choices: [{ text: 'a', location: 'l' }, { text: 'b', next: 'router' }], next: 'router' },
    { id: 'ev', lines: L('e'), next: 'mg' }, { id: 'mg', minigame: { onVictory: 'hub', onFailure: 'lose' } },
    { id: 'router', lines: [], next: [{ if: 'pul>=6', next: 'finale' }, { next: 'hub' }] }, { id: 'pulset', lines: L('p'), add: { pul: 1 }, next: 'hub' },
    { id: 'finale', minigame: { onVictory: 'hub', onFailure: 'hub' } },
    { id: 'lose', lines: L('l'), choices: [{ text: 'znovu', next: 'mg' }, { text: 'vzdát', next: 'router', giveUp: true }] }] },
  { 'l.json': { location: { id: 'l', events: [{ scene: 'ev' }] } } });
  assert.deepEqual(F.lintStory(giveUp), [], 'a give-up through a shared router that could reach the finale is no retry');
  assert.deepEqual([...F.eventSceneIds(giveUp, 'ev')].sort(), ['ev', 'lose', 'mg']);
  // The story's start is entered from outside every event: never one of an event's scenes.
  const startHub = partStory({ start: 'hub', scenes: [{ id: 'hub', lines: L('x'), choices: [{ text: 'a', location: 'l' }], next: 'hub' }] },
    { 'l.json': { location: { id: 'l', events: [{ scene: 'ev' }] }, scenes: [{ id: 'ev', lines: L('e'), next: 'hub' }] } });
  assert.deepEqual([...F.eventSceneIds(startHub, 'ev')], ['ev'], 'the start hub is not the event\'s');
  // A leftover scene nothing reaches doesn't count as a way in.
  const orphan = partStory({ scenes: [{ id: 'hub', lines: L('x'), choices: [{ text: 'a', location: 'l' }], next: 'hub' },
    { id: 'ev0', lines: L('nový úvod'), next: 'ev2' }, { id: 'ev', lines: L('starý úvod'), next: 'ev2' }, { id: 'ev2', lines: L('e'), next: 'hub' }] },
  { 'l.json': { location: { id: 'l', events: [{ scene: 'ev0', name: 'ev' }] } } });
  assert.deepEqual([...F.eventSceneIds(orphan, 'ev0')].sort(), ['ev0', 'ev2']);
  const startEvent = partStory({ scenes: [{ id: 'ev', lines: L('e'), next: 'hub' }, { id: 'hub', lines: L('x'), choices: [{ text: 'a', location: 'l' }], next: 'hub' }] },
    { 'l.json': { location: { id: 'l', events: [{ scene: 'ev' }] } } });
  assert.ok(F.lintStory(startEvent).join().includes('is also reached another way'), 'an event scene that is the start');
});
t('locations: a retired event is never offered, keeps its name, needs one', () => {
  const r = partStory({ scenes: [{ id: 'hub', lines: L('x'), choices: [{ text: 'a', location: 'l' }], next: 'hub' }, { id: 'b', lines: L('b'), next: 'hub' }] },
    { 'l.json': { location: { id: 'l', events: [{ name: 'stara', retired: true }, { scene: 'old', name: 'stara2', retired: true }, { scene: 'b' }] }, scenes: [{ id: 'old', lines: L('o'), next: 'hub' }] } });
  assert.deepEqual(F.lintStory(r), []);
  assert.deepEqual(F.availableEvents(r, 'l', M()).map((e) => e.scene), ['b']);
  const bad = partStory({ scenes: [{ id: 'hub', lines: L('x'), choices: [{ text: 'a', location: 'l' }], next: 'hub' }, { id: 'b', lines: L('b'), next: 'hub' }] },
    { 'l.json': { location: { id: 'l', events: [{ retired: true }, { scene: 'b' }, { name: 'b', retired: true }] } } });
  const bw = F.lintStory(bad).join('\n');
  assert.ok(bw.includes('a retired event needs its "name"') && bw.includes('"b" is listed twice'), bw);
  // A retired name equal to an active event's scene id (whose name differs) is no clash; the story setting a retired
  // name is linted.
  const scenesAndNames = partStory({ scenes: [{ id: 'hub', lines: L('x'), choices: [{ text: 'a', location: 'l' }], next: 'hub' },
    { id: 'b0', lines: L('b0'), next: 'b' }, { id: 'b', lines: L('b'), next: 'hub' }] },
  { 'l.json': { location: { id: 'l', events: [{ scene: 'b0', name: 'b' }, { name: 'b0', retired: true }] } } });
  assert.deepEqual(F.lintStory(scenesAndNames), []);
  const setsRetired = partStory({ scenes: [{ id: 'hub', lines: L('x'), choices: [{ text: 'a', location: 'l' }], next: 'hub', set: ['stara'] },
    { id: 'b', lines: L('b'), next: 'hub' }] }, { 'l.json': { location: { id: 'l', events: [{ name: 'stara', retired: true }, { scene: 'b' }] } } });
  assert.ok(F.lintStory(setsRetired).join().includes('sets the retired "stara"'), F.lintStory(setsRetired).join('; '));
});
t('locations: 1000 real picks land 40–60 % each', () => {
  let z = 0;
  for (let i = 0; i < 1000; i += 1) if (F.pickEvent(loc, hubScene.choices[0], M()).sceneId === 'zubr') z += 1;
  assert.ok(z >= 400 && z <= 600, `${z}`);
});
t('locations: followUp, isEndingPosition and reachableWithin pick nothing; preload walks every candidate', () => {
  let found;
  const calls = withRandom([0.5], () => {
    F.followUp(loc, hubScene, M());
    F.isEndingPosition(loc, hubScene, 0, M());
    found = F.reachableWithin(loc, { scene: hubScene, line: 0 }, M(), 1).map((x) => x.scene.id);
  });
  assert.equal(calls, 0);
  assert.deepEqual(found, ['hub', 'zubr', 'vily', 'home', 'doupe'], "each choice's candidates with its own changes");
  assert.deepEqual(F.reachableWithin(loc, { scene: hubScene, line: 0 }, M({ vedma_doupe: 1 }), 1).map((x) => x.scene.id),
    ['hub', 'doupe', 'home'], 'only the first event while it is due');
});
t('locations: lint', () => {
  const s = partStory({ scenes: [
    { id: 'hub', lines: L('x'), choices: [{ text: 'a', location: 'nope' }, { text: 'b', location: 'l', next: 'hub' }, { text: 'c' }] },
  ] }, { 'l.json': { location: { id: 'l', events: [{ scene: 'missing' }, { scene: 'hub', if: 'x>', first: 'yes' }, { scene: 'hub' }, 3, { scene: 'bad-name' }] },
    scenes: [{ id: 'bad-name', lines: L('x') }] },
  'o.json': { location: { id: 'orphan', events: [] }, scenes: [] }, 'm.json': { location: { id: 'a b' }, scenes: [] } });
  const w = [...s.warnings, ...F.lintStory(s)].join('\n');
  for (const want of ['choice 0: location "nope" is not a location', 'choice 1: both "next" and "location"',
    'choice 2: next "undefined" is not a scene', 'event 0: "missing" is not a scene', 'event 1: malformed condition',
    'event 1: malformed first', 'event 2: "hub" is listed twice', 'event 3: malformed', '"bad-name" is not a valid name',
    'location orphan: no events', 'location orphan: no choice goes there', 'malformed location']) {
    assert.ok(w.includes(want), `missing ${want}\n${w}`);
  }
  assert.deepEqual(F.lintStory(loc), [], 'a location hub with a next, event names read by an if: clean');
  const clash = partStory({ scenes: [{ id: 'hub', lines: L('x'), choices: [{ text: 'a', location: 'l' }, { text: 'b', next: 'shared' }], next: 'hub' },
    { id: 'shared', lines: L('s'), set: ['jezevci'], next: 'hub' }, { id: 'jezevci', lines: L('j'), next: 'hub' },
    { id: 'mg', minigame: { onVictory: 'hub', onFailure: 'lost' } }, { id: 'lost', lines: L('l'), add: { jezevci: -1 }, next: 'hub' }] },
  { 'l.json': { location: { id: 'l', events: [{ scene: 'jezevci' }, { scene: 'shared', name: 'sdilena' }, { scene: 'mg', name: 'hra' }, { scene: 'hub', name: 5 }] } } });
  const cw = F.lintStory(clash).join('\n');
  for (const want of ['event 0: the story also sets "jezevci"', 'event 1: "shared" is also reached another way',
    'event 2: starts on a minigame scene', 'event 3: malformed name']) assert.ok(cw.includes(want), `missing ${want}\n${cw}`);
  assert.ok(!cw.includes('event 1: the story also sets'), 'a negative add is no "sets" clash');
  assert.ok(cw.includes('lost: lowers the event name "jezevci"'), 'a negative add of an event name: use giveUp');
  const noNext = partStory({ scenes: [{ id: 'hub', lines: L('x'), choices: [{ text: 'a', location: 'l' }] }] },
    { 'l.json': { location: { id: 'l', events: [{ scene: 'e' }] }, scenes: [{ id: 'e', lines: L('e') }] } });
  assert.ok(F.lintStory(noNext).join().includes('hub: can end in a dead end'), 'a location choice can vanish');
});

// --- saves -------------------------------------------------------------------------------------------------------
const saves = story([
  { id: 'start', add: { s: 1 }, lines: L('0', '1'), next: 'mid' },
  { id: 'mid', lines: L('0', '1', '2'), choices: [{ text: 'x', next: 'mg' }] },
  { id: 'mg', minigame: { onVictory: 'win', onFailure: 'lose' } },
  { id: 'win', set: ['won'], lines: L('0', '1'), next: 'mid' },
  { id: 'lose', add: { lost: 1 }, lines: L('0'), choices: [{ text: 'r', next: 'mg' }] },
  { id: 'end', lines: L('x'), end: { title: 'E' } },
], { movedScenes: { gone: { scene: 'mid', line: 2 }, gone2: { scene: 'mid', line: 2 }, oldEnd: { scene: 'end', line: 0 } } });
t('placeSave: moved ids, minigame and unknown entries dropped, collapse, trailing, fallback', () => {
  const p = F.placeSave(saves, {
    currentSceneId: 'gone', currentLine: 0, memory: { s: 1 },
    history: [{ sceneId: 'start', line: 0, memory: { s: 1 } }, { sceneId: 'mg', line: 0, memory: {} },
      { sceneId: 'nope', line: 0, memory: {} }, { sceneId: 'mid', line: 1, memory: { s: 1 } },
      { sceneId: 'gone', line: 0, memory: { s: 1 } }, { sceneId: 'gone2', line: 0, memory: { s: 1 } }],
  });
  assert.deepEqual([p.position.scene.id, p.position.line], ['mid', 2], 'moved current at its movedScenes line');
  assert.deepEqual(p.history.map((h) => `${h.scene.id}:${h.line}`), ['start:0', 'mid:1'],
    'collapsed and trailing entries placed like the position dropped');
  assert.equal(p.fellBack, false);
  const f = F.placeSave(saves, { currentSceneId: 'removed', currentLine: 0, memory: {},
    history: [{ sceneId: 'start', line: 1, memory: { s: 1 } }, { sceneId: 'mid', line: 0, memory: { s: 1, k: 2 } }] });
  assert.deepEqual([f.position.scene.id, f.position.line, mem(f.position.memory), f.fellBack], ['mid', 0, { s: 1, k: 2 }, true]);
  assert.equal(f.history.length, 1);
  assert.equal(F.placeSave(saves, { currentSceneId: 'removed', history: [] }), null, 'nothing placeable: fresh');
  assert.equal(F.placeSave(saves, { currentSceneId: null, history: [] }), null);
  assert.equal(F.placeSave(saves, { currentSceneId: 'mg', currentLine: 0, memory: {}, history: [] }).position.line, null,
    'a current minigame position stays');
  assert.equal(F.placeSave(saves, { currentSceneId: 'mid', currentLine: 9, memory: {}, history: [] }).position.line, 2);
});
t('migrateOldSave: replay, lost rounds counted twice, moved ids once, fallback, endings, cap', () => {
  const m = F.migrateOldSave(saves, { currentSceneId: 'lose', history: ['start', 'mid', 'gone', 'lose', 'lose'],
    readSceneIds: ['start', 'oldEnd', 'mid', 'x'] });
  assert.deepEqual([m.currentSceneId, m.currentLine, m.memory], ['lose', 0, { s: 1, lost: 3 }]);
  assert.deepEqual(m.history.map((h) => [h.sceneId, h.line, h.memory]),
    [['start', 0, { s: 1 }], ['mid', 0, { s: 1 }], ['mid', 2, { s: 1 }], ['lose', 0, { s: 1, lost: 1 }],
      ['lose', 0, { s: 1, lost: 2 }]]);
  assert.deepEqual(m.endings, ['end'], 'endings recorded under their current scene ids');
  const w = F.migrateOldSave(saves, { currentSceneId: 'mg', history: ['start', 'mid', 'mg', 'win', 'mid'] });
  assert.equal(w.currentSceneId, 'mg', 'a current minigame id stays');
  assert.deepEqual(w.history.map((h) => h.sceneId), ['start', 'mid', 'win', 'mid'], 'minigames dropped from history');
  assert.deepEqual(w.history[2].memory, { s: 1, won: 1 });
  const f = F.migrateOldSave(saves, { currentSceneId: 'removed', history: ['start', 'mid'] });
  assert.deepEqual([f.currentSceneId, f.history.length], ['mid', 1], 'the newest placeable history entry');
  assert.equal(F.migrateOldSave(saves, { currentSceneId: 'removed', history: [] }).currentSceneId, null);
  const long = F.migrateOldSave(saves, { currentSceneId: 'lose', history: Array(700).fill('lose') });
  assert.equal(long.history.length, F.MAX_HISTORY);
  assert.equal(long.memory.lost, 701, 'the whole path replayed before the cap');
  const e = F.migrateOldSave(saves, { currentSceneId: 'mid', history: [] });
  assert.deepEqual(e.memory, { s: 1 }, 'an empty history: the start scene once');
});
t('migrateOldSave: a start that forwards replays its forwards; a first entry on the start is not applied again', () => {
  const s = story([
    { id: 'go', lines: [], add: { g: 1 }, next: 'first' },
    { id: 'first', add: { f: 1 }, lines: L('x'), next: 'two' },
    { id: 'two', lines: L('x') },
  ]);
  assert.deepEqual(F.migrateOldSave(s, { currentSceneId: 'two', history: ['go'] }).memory, { g: 1, f: 1 });
  assert.deepEqual(F.migrateOldSave(s, { currentSceneId: 'two', history: ['first'] }).memory, { g: 1, f: 1 });
});
t('endScenes in story order, through movedScenes', () => {
  const s = story([{ id: 'x', lines: L('x') }, { id: 'e1', lines: L('x'), end: {} }, { id: 'e2', lines: L('x'), end: {} }],
    { movedScenes: { old: { scene: 'e1', line: 0 } } });
  assert.deepEqual(F.endScenes(s, ['e2', 'old', 'x', 'e2', 'missing']).map((e) => e.id), ['e1', 'e2']);
});

// --- lint --------------------------------------------------------------------------------------------------------
t('lintStory: a clean story has none', () => assert.deepEqual(F.lintStory(saves), []));
t('lintStory: each warning', () => {
  const s = story([
    { id: 'a', lines: [{ text: 'x', if: 'cas=>2' }, { text: 'y', if: 'unwritten' }], set: ['bobri pratele'],
      add: { cas: '1' }, next: [{ if: 'x' }, { if: 'q', next: 'nowhere' }], choices: [{ text: 't', next: 'missing' }],
      choiceLayout: 'left', characters: [{ id: 'toString' }, { id: 'a', position: 0.1, flip: 'yes', alpha: 2 }, { id: 'b', position: 'top' }] },
    { id: 'mg', minigame: { onVictory: 'nope' }, set: ['x'] },
    { id: 'hub', lines: L('x'), choices: [{ text: '1', next: 'a', if: 'x' }] },
    { id: 'okhub', lines: L('x'), choices: [{ text: '1', next: 'a', if: 'x' }], next: 'a' },
    { id: 'plaindead', lines: L('x') },
    { id: 'cond', lines: [{ text: 'x', if: 'x', characters: [{ id: 'a' }] }, { text: 'y' }], next: 'a' },
    { id: 'notlist', lines: [{ text: 'x', characters: 'a' }], next: 'a' },
    { id: 'long', lines: L('x'.repeat(81)), choiceLayout: 'center', choices: [{ text: '1', next: 'a' }] },
    { id: 'many', lines: L('x'), choices: Array.from({ length: 10 }, (_, i) => ({ text: `${i}`, next: 'a' })) },
  ], { characters: { a: { scale: -1, raise: 2 }, b: {} },
    movedScenes: { a: { scene: 'a', line: 0 }, x: { scene: 'nowhere', line: 0 }, y: { scene: 'a', line: 9 }, z: 'bad' } });
  const w = [...s.warnings, ...F.lintStory(s)].join('\n');
  for (const want of ['malformed condition cas=>2', '"unwritten" is read but nothing', 'malformed bobri pratele',
    'malformed add cas', 'next 0: no "next"', 'next 1: "nowhere" is not a scene', 'choice 0: next "missing"',
    'choiceLayout "left"', 'unknown character "toString"', 'position 0.1 is outside', 'malformed flip', 'alpha 2',
    'malformed position top', 'onVictory "nope"', 'set/add on a minigame', 'hub: can end in a dead end',
    'cond line 0: a conditional line sets the stage', 'notlist line 0: "characters" is not a list',
    'long: a centred hub', 'many: more than 9', 'character a: malformed scale', 'character a: raise 2',
    '"a" is also a scene', 'x → "nowhere" is not a scene', 'y → a line 9 is out of range', 'malformed entry for z']) {
    assert.ok(w.includes(want), `missing: ${want}\n${w}`);
  }
  assert.ok(!w.includes('okhub'), 'a hub with all-conditional choices plus a next is fine');
  assert.ok(!w.includes('plaindead'), 'a plain dead end is not linted');
  assert.ok(!w.includes('mg: can end'), 'a minigame scene is not linted as a dead end');
});
t('StoryRepository.fromData throws when the start does not resolve', () => {
  assert.throws(() => StoryRepository.fromData({ start: 'a', scenes: [{ id: 'a', lines: [], next: 'gone' }] }));
  assert.throws(() => StoryRepository.fromData({ start: 'nope', scenes: [{ id: 'a', lines: L('x') }] }));
  assert.throws(() => StoryRepository.fromData({ start: 'a', scenes: [] }));
  assert.throws(() => StoryRepository.fromData({ scenes: [{ id: 'a' }] }));
  assert.equal(StoryRepository.fromData({ start: 'a', scenes: [{ id: 'a', lines: L('x') }] }).scenes.has('a'), true);
});

// --- the day pattern (plan: "Sára's days") --------------------------------------------------------------------------
// Three day hubs, actions with day windows, the night search (+1 half-day), early day ends, one router.
const action = (id, flag, extra = {}) => ({ id, add: { pul: 1, ...(extra.add ?? {}) }, set: [flag], lines: L(id), next: 'router' });
const hub = (d, actions) => ({
  id: `den${d}`, choiceLayout: 'center', lines: L('Kam poletíme?'),
  choices: [...actions.map(([id, flag, days]) => ({ text: id, next: id, if: [`pul<${2 * d}`, `!${flag}`, ...(days.includes(d) ? [] : ['nikdy'])] })),
    { text: 'Odpočinout si', next: 'router', add: { pul: 2 }, if: [`pul>=${2 * d - 2}`, `pul<${2 * d - 1}`] },
    { text: 'Odpočinout si', next: 'router', add: { pul: 1 }, if: [`pul>=${2 * d - 1}`, `pul<${2 * d}`] }],
  next: 'router',
});
const ACTIONS = [['jezevci', 'f_jezevci', [1, 2]], ['srnce', 'f_srnce', [1, 2, 3]], ['zubr', 'f_zubr', [2, 3]], ['vily', 'f_vily', [2, 3]],
];
const days = story([
  { id: 'start', lines: L('Ráno.'), next: 'router' },
  { id: 'router', lines: [], next: [{ if: 'pul>=6', next: 'den3_vecer' }, { if: ['pul>=4', '!rano3'], next: 'den3_rano' },
    { if: 'pul>=4', next: 'den3' }, { if: ['pul>=2', '!rano2'], next: 'den2_rano' }, { if: 'pul>=2', next: 'den2' },
    { next: 'den1' }] },
  { id: 'den2_rano', set: ['rano2', 'nikdy_x'], lines: L('Den 2.'), next: 'den2' },
  { id: 'den3_rano', set: ['rano3'], lines: L('Den 3.'), next: 'den3' },
  { id: 'den3_vecer', lines: L('Večer.'), end: { title: 'konec' } },
  hub(1, ACTIONS), hub(2, ACTIONS), hub(3, ACTIONS),
  ...ACTIONS.map(([id, flag]) => action(id, flag)),
  // Locations (item 10): the forest (Soňa first, telling of the vědma; two more), the mountains (the lair first once
  // the vědma told of it; two more). Each event's first scene adds the half-day.
  { id: 'les_sona', add: { pul: 1 }, set: ['sona_vedma'], lines: L('Soňa'), next: 'router' },
  { id: 'les_srnce', add: { pul: 1 }, lines: L('srnče'), next: 'router' },
  { id: 'les_hejkal', add: { pul: 1 }, lines: L('hejkal'), next: 'router' },
  { id: 'hory_doupe', add: { pul: 1 }, lines: L('doupě'), next: 'router' },
  { id: 'hory_zubr', add: { pul: 1 }, lines: L('zubr'), next: 'router' },
  { id: 'hory_vily', add: { pul: 1 }, lines: L('víly'), next: 'router' },
  { id: 'vedma_01', add: { pul: 1 }, set: ['vedma', 'vedma_doupe'], lines: L('vědma'), next: 'router' },
  // The night search: an action of day 1 with a choice whose night costs one more half-day.
  { id: 'sona', add: { pul: 1 }, set: ['f_sona'], lines: L('Soňa'), choices: [{ text: 'V noci hledat', next: 'noc' }, { text: 'Spát', next: 'router' }] },
  { id: 'noc', add: { pul: 1 }, lines: L('Noc'), next: 'router' },
  { id: 'nikdy_setter', lines: L('x'), set: ['nikdy'], next: 'start' },
]);
days.scenes.get('den1').choices.unshift({ text: 'sona', next: 'sona', if: ['pul<2', '!f_sona'] });
days.locations.set('les', { id: 'les', events: [{ scene: 'les_sona', first: true }, { scene: 'les_srnce' }, { scene: 'les_hejkal' }] });
days.locations.set('hory', { id: 'hory', events: [{ scene: 'hory_doupe', if: 'vedma_doupe', first: true }, { scene: 'hory_zubr' }, { scene: 'hory_vily' }] });
for (const d of [1, 2, 3]) {
  days.scenes.get(`den${d}`).choices.unshift({ text: 'Les', location: 'les', if: `pul<${2 * d}` },
    { text: 'Hory', location: 'hory', if: `pul<${2 * d}` }, { text: 'Vědma', next: 'vedma_01', if: [`pul<${2 * d}`, 'sona_vedma', '!vedma'] });
}
t('day pattern: lint clean', () => assert.deepEqual([...days.warnings, ...F.lintStory(days)], []));
t('day pattern: every choice sequence ends at den3_vecer within 40 taps; no empty hub; mornings once', () => {
  let paths = 0;
  let lairOffers = 0;
  const walk = (pos, taps, mornings) => {
    assert.ok(taps <= 40, `too long at ${pos.scene.id}`);
    const { scene, line, memory } = pos;
    if (scene.id.startsWith('den') && scene.choiceLayout) {
      const shown = F.visibleChoices(scene, memory, days);
      const halfDayLeft = (memory.get('pul') ?? 0) < 2 * Number(scene.id.slice(3));
      if (memory.get('vedma_doupe') && !memory.get('hory_doupe')) {
        assert.equal(shown.some((c) => c.location === 'hory'), halfDayLeft, `the lair offered on ${scene.id}`);
        if (halfDayLeft) lairOffers += 1;
      }
      if (['les_sona', 'les_srnce', 'les_hejkal'].every((e) => memory.get(e))) {
        assert.ok(!shown.some((c) => c.location === 'les'), 'the forest gone once played out');
      }
    }
    if (scene.id === 'den3_vecer') { paths += 1; return; }
    if (scene.id.endsWith('_rano')) {
      assert.ok(!mornings.includes(scene.id), `${scene.id} twice`);
      mornings = [...mornings, scene.id];
    }
    const later = F.nextLine(scene, line, memory);
    if (later !== null) return walk({ scene, line: later, memory }, taps + 1, mornings);
    const after = F.followUp(days, scene, memory);
    if (scene.id.startsWith('den') && scene.choiceLayout) assert.equal(after.kind, 'choices', `empty hub ${scene.id}`);
    // A location choice branches on every event its pick could give (each marked played, as pickEvent does).
    const targets = after.kind === 'choices' ? after.choices.flatMap((c) => {
      if (c.location === undefined) return [[c.next, F.applyChanges(memory, c)]];
      const m = F.applyChanges(memory, c);
      return F.eventCandidates(days, c.location, m).map((e) => [e.scene, F.applyChanges(m, { set: [F.eventName(e)] })]);
    }) : after.kind === 'next' ? [[after.id, memory]] : [];
    assert.ok(targets.length > 0, `stuck at ${scene.id}`);
    for (const [id, m] of targets) {
      for (const e of ['les_sona', 'les_srnce', 'les_hejkal', 'hory_doupe', 'hory_zubr', 'hory_vily']) {
        assert.ok(!(id === e && memory.get(e)), `${e} played twice`);
      }
      const land = F.resolveEntry(days, id, m);
      assert.ok(!land.dead, `dead end into ${id}`);
      walk(land, taps + 1, mornings);
    }
  };
  walk(F.resolveEntry(days, 'start', M()), 0, []);
  console.log(`     ${paths} paths, the lair offered ${lairOffers} times`);
  assert.ok(lairOffers > 0);
  assert.ok(paths > 100);
});

console.warn = warn;
process.exit(failures ? 1 : 0);
