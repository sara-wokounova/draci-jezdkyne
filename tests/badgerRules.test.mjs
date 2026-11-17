// The badger cubs rescue's rules (D42): src/engine/minigames/badgerRules.js, played in node. Balance players run through
// the game's own step(): a masher (taps whenever a dive is allowed) and a careful player (taps when the claws are over
// a cub's branch where it will be at the dive's bottom, with an aim error).
//   node tests/badgerRules.test.mjs [repoOrCopy]      NO_GIT=1 skips the git check of the asset paths
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const root = (process.argv[2] ?? fileURLToPath(new URL('..', import.meta.url))).replaceAll('\\', '/').replace(/\/$/, '');
const R = await import(pathToFileURL(`${root}/src/engine/minigames/badgerRules.js`).href);
let failures = 0;
async function t(name, fn) {
  try {
    await fn();
    console.log(`ok   ${name}`);
  } catch (error) {
    failures += 1;
    console.log(`FAIL ${name}\n     ${error.message.split('\n').join('\n     ')}`);
  }
}
function rng(seed) { // mulberry32
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
// Steps until cond holds, at most 120 s of game time (a broken rule fails here instead of hanging the test).
function stepUntil(state, cond) {
  for (let i = 0; i < 60 * 120; i += 1) {
    if (cond()) return;
    R.step(state, DT, {});
  }
  throw new Error('stepUntil: the condition never held within 120 s of game time');
}
function gauss(r) {
  return Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
}
// The fly strips' bodyWidths, read from dragonAttack.js's DEFAULTS as text (that module needs a DOM), in dragon order.
const DRAGON_SOURCE = fs.readFileSync(`${root}/src/engine/minigames/dragonAttack.js`, 'utf8');
const BODY = [...DRAGON_SOURCE.matchAll(/bodyWidth:\s*([^,\n}]+)/g)].map((m) => Number(m[1].trim()));
if (BODY.length !== 3 || !BODY.every((w) => Number.isFinite(w) && w > 0)) {
  console.log(`FAIL the fly strips' bodyWidths: found ${JSON.stringify(BODY)} in dragonAttack.js, expected three (Róza, Emma, Anna).\n` +
    '     Keep each dragon\'s animation.bodyWidth written as "bodyWidth: <number>", or update the reader in this test.');
  process.exit(1);
}
const DT = R.STEP; // as the game steps the rules

/** One round; `player(state, r)` returns true to tap. Returns the outcome. */
function play(cfg, player, seed) {
  const r = rng(seed);
  const state = R.createState(cfg, { catch: R.catchOffsets(cfg, BODY) }, r);
  for (let i = 0; i < 60 * 300 && !R.finished(state); i += 1) R.step(state, DT, { dive: player(state, r) });
  return state.outcome;
}
const masher = (state) => R.canDive(state);
// A masher with a reaction delay: taps on a random 15 % of the frames a dive is allowed (a plain masher is deterministic).
const jitteryMasher = (state, r) => R.canDive(state) && r() < 0.15;
function careful(sigma) {
  const aims = new Map(); // an aim error per branch, drawn again after every dive (a child re-aims each try)
  return (state, r) => {
    if (!R.canDive(state)) return false;
    const x = R.catchX(state);
    for (const piece of state.pieces) {
      if (piece.kind !== 'branch') continue;
      if (!aims.has(piece.id)) aims.set(piece.id, gauss(r) * sigma);
      const at = Math.min(piece.x + piece.speed * state.cfg.dive.down, state.W - state.cfg.branchLength / 2);
      if (Math.abs(x - (at + aims.get(piece.id))) < 5) {
        aims.clear();
        return true;
      }
    }
    return false;
  };
}
function winRate(cfg, makePlayer, rounds = 500) {
  let wins = 0;
  for (let s = 1; s <= rounds; s += 1) if (play(cfg, makePlayer(), s * 7919) === 'victory') wins += 1;
  return wins / rounds;
}

// --- normalising ---------------------------------------------------------------------------------------------------
await t('normalize: defaults, levels, an unknown difficulty plays as normal', () => {
  const n = R.normalize({}, 'normal');
  assert.equal(n.total, 7);
  assert.equal(n.currentSpeed, 60);
  assert.equal(R.normalize({}, 'easy').currentSpeed, 45);
  assert.equal(R.normalize({}, 'hard').currentSpeed, 80);
  assert.equal(R.normalize({ currentSpeed: 70, motherSaves: 3 }, 'easy').currentSpeed, 70); // one number: every level
  assert.equal(R.normalize({ currentSpeed: 70, motherSaves: 3 }, 'hard').motherSaves, 3);
  assert.equal(n.motherSaves, 1);
  assert.equal(R.normalize({}, 'easy').motherSaves, 2);
  assert.equal(R.normalize({}, 'hard').motherSaves, 0);
  assert.equal(R.normalize({}, 'extreme').currentSpeed, 60); // played as normal
  assert.equal(R.normalize({ holeCubs: [1, 1, 2, 2, 3] }).total, 9);
});
await t('normalize: typos fall back, caps hold, arrays are never written', () => {
  const before = JSON.stringify(R.DEFAULTS);
  for (const holeCubs of [[], [1, 1, 1], [0, 1, 1, 1, 1], [1, 1, 1, 1, 'x'], [5, 5, 5, 5, 5], null, 'x']) {
    assert.equal(R.normalize({ holeCubs }).total, 7, JSON.stringify(holeCubs));
  }
  const n = R.normalize({ floodGap: -3, cubGap: 'x', currentSpeed: { normal: 1e9 }, branchLength: 0, reach: -1, holes: [[2, 2]], dragons: 'x', dive: { down: 0 } });
  assert.equal(n.floodGap, 7);
  assert.equal(n.cubGap, 2.5);
  assert.equal(n.currentSpeed, 400);
  assert.equal(n.branchLength, 90);
  assert.equal(n.reach, 12);
  assert.deepEqual(n.holes, R.DEFAULTS.holes);
  assert.equal(n.dragons.length, 3);
  assert.equal(n.dive.down, 0.35);
  const slow = R.normalize({ dragons: [{ speed: 1e-300, catchPoint: [1e308, 1e308], diveFrame: 0 }] });
  assert.equal(slow.dragons[0].speed, 20);
  assert.deepEqual(slow.dragons[0].catchPoint, R.DEFAULTS.dragons[0].catchPoint);
  // A JSON "__proto__" key in the story config sets nothing (mergeConfig skips it).
  const proto = R.normalize(JSON.parse('{"__proto__": {"floodGap": 2}, "sounds": {"__proto__": {"dive": "x.mp3"}}}'));
  assert.equal(proto.floodGap, 7);
  assert.equal(proto.sounds.dive, null);
  assert.equal(Object.getPrototypeOf(proto.sounds), Object.prototype);
  const state = R.createState(n, null, rng(1));
  for (let i = 0; i < 600; i += 1) R.step(state, DT, { dive: true });
  assert.equal(JSON.stringify(R.DEFAULTS), before);
});
await t('normalize: a hole above the last or out of order: the water never goes down', () => {
  const n = R.normalize({ holes: [[0.4, 0.7], [0.35, 0.8], [0.3, 0.6], [0.2, 0.95], [0.1, 0.5]], waterStart: 0.86 });
  let last = 1;
  for (let s = 0; s <= 60; s += 0.25) {
    const y = R.waterLevel(n, s);
    assert.ok(y <= last + 1e-9, `water went down at ${s}`);
    last = y;
  }
});

// --- the rules -----------------------------------------------------------------------------------------------------
await t('floods every floodGap; the water reaches each hole at its flood time', () => {
  const n = R.normalize({});
  assert.deepEqual(R.floodTimes(n), [6, 13, 20, 27, 34]);
  R.floodTimes(n).forEach((time, i) => assert.ok(Math.abs(R.waterLevel(n, time) - n.holeY[i]) < 1e-9));
  assert.ok(Math.abs(R.waterLevel(n, 0) - n.waterStart) < 1e-9);
});
await t("a hole's cubs climb out one by one, every cubGap, onto branches at the hole", () => {
  const n = R.normalize({ motherSaves: { normal: 10 } }); // the mother saves them all: every release is seen
  const state = R.createState(n, null, rng(2));
  const releases = [];
  for (let i = 0; i < 60 * 60 && !R.finished(state); i += 1) {
    R.step(state, DT, {});
    for (const e of state.events) if (e.type === 'release') releases.push([Math.round(e.t * 10) / 10, e.hole]);
  }
  assert.deepEqual(releases, [[6, 0], [13, 1], [20, 2], [27, 3], [29.5, 3], [34, 4], [36.5, 4]]);
  assert.equal(state.outcome, 'victory');
});
await t('the mother saves motherSaves cubs, then the next one floating away is lost', () => {
  for (const [level, saves] of [['easy', 2], ['normal', 1], ['hard', 0]]) {
    const state = R.createState(R.normalize({}, level), null, rng(3));
    let mothers = 0;
    let lostAt = null;
    for (let i = 0; i < 60 * 120 && !R.finished(state); i += 1) {
      R.step(state, DT, {});
      for (const e of state.events) {
        if (e.type === 'mother') mothers += 1;
        if (e.type === 'lost' && lostAt === null) lostAt = mothers;
      }
    }
    assert.equal(mothers, saves, level);
    assert.equal(lostAt, saves, level);
    assert.equal(state.outcome, 'failure', level);
  }
});
await t('a dive catches a cub in reach, bumps a log, splashes on nothing; cooldowns from the dive end', () => {
  const n = R.normalize({ logs: [] });
  const state = R.createState(n, { catch: n.dragons.map(() => ({ dx: 0, dy: 0 })) }, rng(4));
  // A branch with a cub right under the dragon at the dive's bottom.
  state.t = 10;
  state.cubs[0].status = 'float';
  state.pieces.push({ id: 'x', kind: 'branch', x: 500, speed: 0, cub: 0, held: false });
  state.dragon.x = 500;
  R.step(state, DT, { dive: true });
  assert.equal(state.dragon.phase, 'down');
  for (let i = 0; i < 30; i += 1) R.step(state, DT, {});
  assert.equal(state.cubs[0].status, 'caught');
  assert.equal(state.safe, 1);
  // Splash, then no dive for missCooldown after the dive's end.
  stepUntil(state, () => state.dragon.phase === 'fly');
  R.step(state, DT, { dive: true });
  stepUntil(state, () => state.dragon.phase === 'fly');
  assert.equal(state.dragon.lastResult, 'splash');
  assert.ok(!R.canDive(state));
  // A log in reach: bump.
  const s2 = R.createState(n, { catch: n.dragons.map(() => ({ dx: 0, dy: 0 })) }, rng(5));
  s2.pieces.push({ id: 'l', kind: 'log', x: 500 + 45 + 10, speed: 0, cub: null, held: false });
  s2.dragon.x = 500;
  R.step(s2, DT, { dive: true });
  stepUntil(s2, () => s2.dragon.phase === 'fly');
  assert.equal(s2.dragon.lastResult, 'bump');
  // No dive for bumpCooldown (1.5 s) after the dive's end, then again (the dragon still over the field).
  const end = s2.t;
  s2.dragon.x = 900;
  for (let i = 0; i < 300 && s2.t < end + n.dive.bumpCooldown - 0.05; i += 1) {
    R.step(s2, DT, {});
    s2.dragon.x = 900;
    assert.ok(!R.canDive(s2), `a dive allowed ${(s2.t - end).toFixed(2)} s after a bump`);
  }
  for (let i = 0; i < 12; i += 1) { R.step(s2, DT, {}); s2.dragon.x = 900; }
  assert.ok(R.canDive(s2), 'no dive after the bump cooldown');
});
await t('a log never blocks a cub; the nearest cub wins', () => {
  const n = R.normalize({ logs: [] });
  const state = R.createState(n, { catch: n.dragons.map(() => ({ dx: 0, dy: 0 })) }, rng(6));
  state.cubs[0].status = 'float';
  state.cubs[1].status = 'float';
  state.pieces.push({ id: 'l', kind: 'log', x: 500, speed: 0, cub: null, held: false },
    { id: 'a', kind: 'branch', x: 540, speed: 0, cub: 0, held: false }, { id: 'b', kind: 'branch', x: 520, speed: 0, cub: 1, held: false });
  state.dragon.x = 500;
  R.step(state, DT, { dive: true });
  for (let i = 0; i < 30; i += 1) R.step(state, DT, {});
  assert.equal(state.cubs[1].status, 'caught');
  assert.equal(state.cubs[0].status, 'float');
});
await t('a branch reaching the edge during a dive waits for it; the round is never lost under the claws', () => {
  const n = R.normalize({ logs: [] }, 'hard');
  const state = R.createState(n, { catch: n.dragons.map(() => ({ dx: 0, dy: 0 })) }, rng(7));
  const x = state.W - n.branchLength / 2 - 2;
  state.cubs[0].status = 'float';
  state.pieces.push({ id: 'e', kind: 'branch', x, speed: 60, cub: 0, held: false });
  state.dragon.x = x + 60 * n.dive.down * 0.2;
  R.step(state, DT, { dive: true });
  for (let i = 0; i < 30; i += 1) R.step(state, DT, {});
  assert.equal(state.cubs[0].status, 'caught');
  assert.equal(state.outcome, null);
  // A dive started on the very step the branch reaches the edge holds it too.
  const same = R.createState(n, { catch: n.dragons.map(() => ({ dx: 0, dy: 0 })) }, rng(7));
  const edgeX = same.W - n.branchLength / 2 - 0.5;
  same.cubs[0].status = 'float';
  same.pieces.push({ id: 'e', kind: 'branch', x: edgeX, speed: 60, cub: 0, held: false });
  same.dragon.x = edgeX;
  R.step(same, DT, { dive: true });
  assert.equal(same.outcome, null, 'lost on the step the dive started');
  for (let i = 0; i < 30; i += 1) R.step(same, DT, {});
  assert.equal(same.cubs[0].status, 'caught');
});
await t('after the decision the branches drift on (and stop at the edge); nothing more is decided', () => {
  const n = R.normalize({ logs: [] }, 'hard');
  const state = R.createState(n, { catch: n.dragons.map(() => ({ dx: 0, dy: 0 })) }, rng(11));
  state.cubs[0].status = 'float';
  state.cubs[1].status = 'float';
  state.cubs[2].status = 'float';
  state.pieces.push({ id: 'a', kind: 'branch', x: state.W - n.branchLength / 2 - 0.1, speed: 60, cub: 0, held: false },
    { id: 'b', kind: 'branch', x: 300, speed: 60, cub: 1, held: false },
    { id: 'c', kind: 'branch', x: state.W - n.branchLength / 2 - 5, speed: 60, cub: 2, held: false });
  state.dragon.x = -1000; // nowhere near
  R.step(state, DT, {});
  assert.equal(state.outcome, 'failure');
  assert.ok(state.endAt >= state.t + n.branchLength / 60, 'the result does not wait until the lost branch is out of sight');
  const before = state.pieces.find((p) => p.id === 'b').x;
  for (let i = 0; i < 30; i += 1) R.step(state, DT, {});
  assert.ok(state.pieces.find((p) => p.id === 'b').x > before + 20, 'the other branch stopped');
  assert.ok(state.pieces.find((p) => p.id === 'a').x > state.W - n.branchLength / 2 + 20, 'the lost cub did not float away');
  assert.equal(state.pieces.find((p) => p.id === 'c').x, state.W - n.branchLength / 2, 'a branch reaching the edge after the decision went past it');
  assert.equal(state.cubs[2].status, 'float', 'a branch reaching the edge after the decision was decided');
  assert.equal(state.cubs[1].status, 'float');
  // The water stopped rising at the decision (no hole floods while the result waits).
  assert.equal(R.roundWater(state), R.waterLevel(n, state.decidedAt));
  assert.notEqual(R.waterLevel(n, state.t), R.waterLevel(n, state.decidedAt)); // (the water would have risen meanwhile)
});
await t('won only when every cub is safe; the result waits for the arcs and the mother', () => {
  const n = R.normalize({}, 'easy');
  const state = R.createState(n, { catch: R.catchOffsets(n, BODY) }, rng(8));
  const player = careful(0);
  const r = rng(9);
  let decidedAt = null;
  for (let i = 0; i < 60 * 300 && !R.finished(state); i += 1) {
    R.step(state, DT, { dive: player(state, r) });
    if (decidedAt === null && state.outcome) decidedAt = state.t;
  }
  assert.equal(state.outcome, 'victory');
  assert.equal(state.safe, n.total);
  // Decided on the last catch, finished only once that cub's flight (arcSeconds) and every mother's trip are over.
  const lastArc = Math.max(...state.arcs.map((a) => a.end));
  assert.ok(lastArc - decidedAt > n.arcSeconds - 0.05, `the last arc ends ${lastArc} s, decided ${decidedAt} s`);
  assert.ok(state.endAt >= lastArc - 1e-9 && state.endAt >= state.mother.busyUntil - 1e-9, 'endAt before the drawing settles');
  assert.ok(state.t >= state.endAt);
  // Not finished in between.
  const again = R.createState(n, { catch: R.catchOffsets(n, BODY) }, rng(8));
  const player2 = careful(0);
  const r2 = rng(9);
  for (let i = 0; i < 60 * 300 && !again.outcome; i += 1) R.step(again, DT, { dive: player2(again, r2) });
  assert.ok(!R.finished(again), 'finished on the same step as the last catch');
});
await t("motherView: a saved cub counts, and her strength is spent, once she is back; she rests after the last", () => {
  const n = R.normalize({ logs: [] }, 'easy'); // two saves
  const state = R.createState(n, { catch: n.dragons.map(() => ({ dx: 0, dy: 0 })) }, rng(12));
  state.dragon.x = -1000;
  state.cubs[0].status = 'float';
  state.cubs[1].status = 'float';
  const edge = state.W - n.branchLength / 2;
  state.pieces.push({ id: 'a', kind: 'branch', x: edge - 0.1, speed: 60, cub: 0, held: false },
    { id: 'b', kind: 'branch', x: edge - 0.2, speed: 60, cub: 1, held: false });
  R.step(state, DT, {});
  let v = R.motherView(state);
  assert.equal(state.safe, 2);
  assert.deepEqual([v.onTheWay, v.savesShown, v.waiting, v.back, v.resting, v.carrying], [2, 2, 2, 0, false, false]);
  assert.deepEqual(R.hudView(state), { score: '0 z 7', status: 'Máma pomůže: 2×' }, 'the HUD: none back yet');
  const trip = n.motherLeap + n.motherReturn;
  stepUntil(state, () => state.t >= n.motherLeap + 0.05);
  v = R.motherView(state);
  assert.deepEqual([v.carrying, v.waiting, v.onTheWay], [true, 1, 2], 'carrying the first, the second still waiting');
  stepUntil(state, () => state.t >= trip + 0.05);
  v = R.motherView(state);
  assert.deepEqual([v.back, v.onTheWay, v.savesShown, v.resting], [1, 1, 1, false], 'the first back, the second on its way');
  assert.equal(R.statusText(n, v.savesShown), 'Máma pomůže: 1×');
  assert.deepEqual(R.hudView(state), { score: '1 z 7', status: 'Máma pomůže: 1×' }, 'the HUD: one back');
  stepUntil(state, () => state.t >= 2 * trip + 0.05);
  v = R.motherView(state);
  assert.deepEqual([v.back, v.onTheWay, v.savesShown, v.resting, v.trip], [2, 0, 0, true, null], 'both back, she rests');
  assert.equal(R.statusText(n, v.savesShown), 'Máma už nemůže');
  assert.deepEqual(R.hudView(state), { score: '2 z 7', status: 'Máma už nemůže' }, 'the HUD: both back');
  // On a level without saves she never rests.
  const hard = R.createState(R.normalize({}, 'hard'), null, rng(1));
  assert.equal(R.motherView(hard).resting, false);
  // Once a cub is lost the HUD says she can't help, also while she is still on her way with a saved one.
  const lost = R.createState(R.normalize({ logs: [] }, 'normal'), { catch: n.dragons.map(() => ({ dx: 0, dy: 0 })) }, rng(13));
  lost.dragon.x = -1000;
  lost.cubs[0].status = 'float';
  lost.pieces.push({ id: 'a', kind: 'branch', x: edge - 0.1, speed: 60, cub: 0, held: false });
  R.step(lost, DT, {});
  assert.deepEqual(R.hudView(lost), { score: '0 z 7', status: 'Máma pomůže: 1×' });
  lost.outcome = 'failure';
  lost.decidedAt = lost.t;
  assert.equal(R.hudView(lost).status, 'Máma už nemůže');
});
await t('two cubs reaching the edge on one step: one is lost, the result waits for its branch', () => {
  const n = R.normalize({ logs: [] }, 'hard'); // no mother
  const state = R.createState(n, { catch: n.dragons.map(() => ({ dx: 0, dy: 0 })) }, rng(14));
  state.dragon.x = -1000;
  state.cubs[0].status = 'float';
  state.cubs[1].status = 'float';
  const edge = state.W - n.branchLength / 2;
  state.pieces.push({ id: 'slow', kind: 'branch', x: edge - 0.1, speed: 40, cub: 0, held: false },
    { id: 'fast', kind: 'branch', x: edge - 0.1, speed: 120, cub: 1, held: false });
  R.step(state, DT, {});
  assert.deepEqual(state.events.filter((e) => e.type === 'lost').map((e) => e.cub), [0]);
  assert.equal(state.cubs[1].status, 'float');
  assert.ok(Math.abs(state.endAt - (state.t + n.branchLength / 40 + 0.2)) < 1e-9, `endAt ${state.endAt}`);
});
await t('the status text: the mother left, worn out, none on Těžká', () => {
  const easy = R.normalize({}, 'easy');
  assert.equal(R.statusText(easy, 2), 'Máma pomůže: 2×');
  assert.equal(R.statusText(easy, 0), 'Máma už nemůže');
  assert.equal(R.statusText(R.normalize({}, 'hard'), 0), 'Zachraň všechna!');
});

// --- balance -------------------------------------------------------------------------------------------------------
await t('balance: mashing wins Normální < 30 %', () => {
  const rate = winRate(R.normalize({}, 'normal'), () => masher);
  console.log(`     mashing Normální ${(rate * 100).toFixed(1)} %, Lehká ${(winRate(R.normalize({}, 'easy'), () => masher) * 100).toFixed(1)} %`);
  assert.ok(rate < 0.3, `mashing wins Normální ${rate}: a tuned value in DEFAULTS made a masher win; keep the floors or change them deliberately (D42)`);
  const jittery = winRate(R.normalize({}, 'normal'), () => jitteryMasher);
  console.log(`     jittery masher Normální ${(jittery * 100).toFixed(1)} %`);
  assert.ok(jittery < 0.3, `a jittery masher wins Normální ${jittery}: a tuned value in DEFAULTS made mashing pay; keep the floors or change them deliberately (D42)`);
});
await t('balance: a careful player (σ 25) wins Normální ≥ 85 %', () => {
  const rate = winRate(R.normalize({}, 'normal'), () => careful(25));
  console.log(`     careful σ25 Normální ${(rate * 100).toFixed(1)} %`);
  assert.ok(rate >= 0.85, `a careful player wins Normální only ${rate}: a tuned value in DEFAULTS made it too hard; keep the floors or change them deliberately (D42)`);
});
await t('balance: a less precise careful player (σ 50) wins Těžká (7 cubs) ≥ 40 %', () => {
  const rate = winRate(R.normalize({}, 'hard'), () => careful(50));
  console.log(`     careful σ50 Těžká ${(rate * 100).toFixed(1)} %`);
  assert.ok(rate >= 0.4, `a careful player wins Těžká only ${rate}: a tuned value in DEFAULTS made it too hard; keep the floors or change them deliberately (D42)`);
});

// --- files ---------------------------------------------------------------------------------------------------------
await t('badger_flood.png is BACKGROUND (1672×941)', () => {
  const buf = fs.readFileSync(`${root}/public/assets/backgrounds/badger_flood.png`);
  assert.equal(buf.readUInt32BE(16), R.BACKGROUND.width);
  assert.equal(buf.readUInt32BE(20), R.BACKGROUND.height);
});
await t('every event sound names a sound key, and every sound key is played by an event', () => {
  assert.deepEqual(Object.values(R.EVENT_SOUNDS).sort(), Object.keys(R.DEFAULTS.sounds).sort());
});
await t("each catchPoint is its fly strip's lowest opaque point on diveFrame (±2 strip px)", async () => {
  const { PNG } = (await import('pngjs')).default;
  ['roza', 'emma', 'anna'].forEach((name, i) => {
    const m = DRAGON_SOURCE.match(new RegExp(`fly: \\{ src: 'assets/minigames/dragon-attack/${name}_fly\\.png', frames: (\\d+), anchor: \\[([\\d.]+), ([\\d.]+)\\]`));
    assert.ok(m, `${name}'s fly strip spec not found in dragonAttack.js`);
    const [frames, ax, ay] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const png = PNG.sync.read(fs.readFileSync(`${root}/public/assets/minigames/dragon-attack/${name}_fly.png`));
    const fw = png.width / frames;
    const f = R.DEFAULTS.dragons[i].diveFrame;
    let low = null;
    for (let y = png.height - 1; y >= 0 && !low; y -= 1) {
      for (let x = Math.round(f * fw); x < Math.round((f + 1) * fw); x += 1) {
        if (png.data[(y * png.width + x) * 4 + 3] > 128) { low = [x - f * fw - ax * fw, y - ay * png.height]; break; }
      }
    }
    assert.ok(low, `${name}: no opaque pixel on fly frame ${f}; diveFrame or the strip changed, re-measure catchPoint in badgerRules.js`);
    const want = R.DEFAULTS.dragons[i].catchPoint;
    assert.ok(Math.abs(low[0] - want[0]) <= 2 && Math.abs(low[1] - want[1]) <= 2,
      `${name}: measured [${low.map(Math.round)}], DEFAULTS has [${want}]: a re-packed strip moved the claws; put the measured point in badgerRules.js`);
  });
});
if (!process.env.NO_GIT) {
  await t('every asset path in DEFAULTS is in git', () => {
    const tracked = new Set(execFileSync('git', ['-C', root, 'ls-files'], { encoding: 'utf8' }).split('\n'));
    const paths = [...Object.values(R.DEFAULTS.assets), ...Object.values(R.DEFAULTS.sounds)].filter((p) => typeof p === 'string');
    const missing = paths.filter((p) => !tracked.has(`public/${p}`));
    assert.deepEqual(missing, []);
  });
}
process.exit(failures ? 1 : 0);
