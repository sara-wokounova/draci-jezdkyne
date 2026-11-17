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
      // Where it will be at the dive's bottom: the current speeds up with the water; a cub waiting at the edge for the
      // mother holds the next branch a branch further back (D43). (A piece held behind a slower one moves slower: off
      // by a few px.)
      const bl = state.cfg.branchLength;
      const limit = R.motherView(state).waiting > 0 ? state.W - 1.5 * bl : state.W - bl / 2;
      const at = Math.min(piece.x + piece.speed * R.currentFactor(state) * state.cfg.dive.down, limit);
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
  // The mother saves them all: every release is seen. No logs: a log at a hole would make a cub wait or board it (D43).
  const n = R.normalize({ motherSaves: { normal: 10 }, logs: [] });
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
  // 'c' overlapped the lost branch: it never moves back, waits until the lost one has floated a branch away, then follows
  // it to the edge and stops there (D43: no passing; a lost branch limits the one behind it).
  assert.equal(state.pieces.find((p) => p.id === 'c').x, state.W - n.branchLength / 2 - 5, 'the branch behind the lost one moved');
  stepUntil(state, () => state.pieces.find((p) => p.id === 'c').x >= state.W - n.branchLength / 2);
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
await t("motherView: one save at a time; a saved cub counts, and her strength is spent, once she is back; she rests after the last", () => {
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
  // The first is saved; its waiting spot holds the second (D43), which never moves back.
  assert.equal(state.safe, 1, 'two saved on one step');
  assert.equal(state.pieces.find((p) => p.id === 'b').x, edge - 0.2);
  assert.deepEqual([v.onTheWay, v.savesShown, v.waiting, v.waitingCub, v.resting, v.carrying], [1, 2, 1, 0, false, false]);
  assert.deepEqual(R.hudView(state), { score: '0 z 7', status: 'Máma pomůže: 2×' }, 'the HUD: none back yet');
  const first = state.mother.queue[0];
  stepUntil(state, () => state.mother.queue.length === 2);
  assert.ok(state.t >= first.begin + n.motherLeap - 1e-9, `the second saved at ${state.t}, before she reached the first`);
  const second = state.mother.queue[1];
  assert.ok(Math.abs(second.begin - first.end) < 1e-9, 'her second trip starts when she is back from the first');
  v = R.motherView(state);
  assert.deepEqual([v.carrying, v.waiting, v.waitingCub, v.onTheWay], [true, 1, 1, 2], 'carrying the first, the second waiting');
  // Each cub flies to the father once she is back with it (D43).
  assert.deepEqual(state.arcs.map((a) => [a.cub, a.mother, a.begin, Math.round((a.end - a.begin) * 1e9) / 1e9]),
    [[0, true, first.end, n.arcSeconds], [1, true, second.end, n.arcSeconds]]);
  stepUntil(state, () => state.t >= first.end + 0.05);
  v = R.motherView(state);
  assert.deepEqual([v.onTheWay, v.savesShown, v.resting], [1, 1, false], 'the first back, the second on its way');
  assert.equal(R.statusText(n, v.savesShown), 'Máma pomůže: 1×');
  assert.deepEqual(R.hudView(state), { score: '1 z 7', status: 'Máma pomůže: 1×' }, 'the HUD: one back');
  stepUntil(state, () => state.t >= second.end + 0.05);
  v = R.motherView(state);
  assert.deepEqual([v.onTheWay, v.savesShown, v.resting, v.trip], [0, 0, true, null], 'both back, she rests');
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
await t('the one ahead is lost, the one behind parks behind it; the result waits for the lost branch', () => {
  // (No passing makes two losses on one step unreachable: the piece behind a lost one is limited by it, D43.)
  const n = R.normalize({ logs: [] }, 'hard'); // no mother
  const state = R.createState(n, { catch: n.dragons.map(() => ({ dx: 0, dy: 0 })) }, rng(14));
  state.dragon.x = -1000;
  state.cubs[0].status = 'float';
  state.cubs[1].status = 'float';
  const edge = state.W - n.branchLength / 2;
  state.pieces.push({ id: 'slow', kind: 'branch', x: edge - 0.1, speed: 40, cub: 0, held: false },
    { id: 'fast', kind: 'branch', x: edge - 0.1, speed: 120, cub: 1, held: false });
  R.step(state, DT, {});
  assert.deepEqual(state.events.filter((e) => e.type === 'lost').map((e) => e.cub), [0], 'the one created first leads on a tie');
  assert.equal(state.cubs[1].status, 'float');
  assert.equal(state.pieces.find((p) => p.id === 'fast').x, edge - 0.1, 'the one behind moved');
  const f = R.currentFactor(state);
  assert.ok(Math.abs(state.endAt - (state.t + n.branchLength / (40 * f) + 0.2)) < 1e-9, `endAt ${state.endAt}`);
});
await t('the status text: the mother left, worn out, none on Těžká', () => {
  const easy = R.normalize({}, 'easy');
  assert.equal(R.statusText(easy, 2), 'Máma pomůže: 2×');
  assert.equal(R.statusText(easy, 0), 'Máma už nemůže');
  assert.equal(R.statusText(R.normalize({}, 'hard'), 0), 'Zachraň všechna!');
});

// --- D43: no passing, releases, the rising current, the animation helpers -----------------------------------------
const still = (n) => ({ catch: n.dragons.map(() => ({ dx: 0, dy: 0 })) });
const piece = (id, kind, x, speed, cub = null) => ({ id, kind, x, speed, cub, held: false });
await t('no passing: a faster piece closes up behind a slower one, follows it touching, and moves on once it is caught', () => {
  const n = R.normalize({ logs: [] }, 'hard');
  const state = R.createState(n, still(n), rng(20));
  state.dragon.x = -1000;
  state.cubs[0].status = 'float';
  state.cubs[1].status = 'float';
  state.pieces.push(piece('slow', 'branch', 400, 30, 0), piece('fast', 'branch', 250, 90, 1));
  const p = (id) => state.pieces.find((q) => q.id === id);
  stepUntil(state, () => p('slow').x - p('fast').x <= n.branchLength + 1e-9);
  for (let i = 0; i < 60; i += 1) {
    R.step(state, DT, {});
    assert.ok(p('slow').x - p('fast').x >= n.branchLength - 1e-9, 'the fast branch slid over the slow one');
  }
  assert.ok(Math.abs(p('slow').x - p('fast').x - n.branchLength) < 1e-6, 'it does not follow touching');
  // Caught: no longer in the way.
  const before = p('fast').x;
  state.pieces.splice(state.pieces.indexOf(p('slow')), 1);
  state.cubs[0].status = 'caught';
  R.step(state, DT, {});
  assert.ok(p('fast').x - before > 90 * DT * 0.99, 'it stayed behind a caught branch');
});
await t('no passing: an overlapping piece stops and never moves back; a log past the edge holds the one behind until it wraps', () => {
  const n = R.normalize({ logs: [] }, 'hard');
  const state = R.createState(n, still(n), rng(21));
  state.dragon.x = -1000;
  state.cubs[0].status = 'float';
  state.pieces.push(piece('ahead', 'log', 500, 30), piece('over', 'log', 470, 90));
  const p = (id) => state.pieces.find((q) => q.id === id);
  R.step(state, DT, {});
  assert.equal(p('over').x, 470, 'an overlapping piece moved (back or on)');
  // A log past the edge (not yet wrapped) still holds the piece touching it from behind; once wrapped it no longer limits.
  const W = state.W;
  const s2 = R.createState(n, still(n), rng(21));
  s2.dragon.x = -1000;
  s2.pieces.push(piece('log', 'log', W + 20, 10), piece('b', 'log', W + 20 - 90, 80));
  const q = (id) => s2.pieces.find((x) => x.id === id);
  for (let i = 0; i < 30; i += 1) {
    R.step(s2, DT, {});
    assert.ok(q('b').x <= q('log').x - 90 + 1e-9, 'the piece behind slid under the log at the edge');
  }
  stepUntil(s2, () => q('log').x < 0);
  const before = q('b').x;
  R.step(s2, DT, {});
  assert.ok(q('b').x > before, 'the piece behind did not move once the log had wrapped');
});
await t('no passing: the cub waiting at the edge for the mother holds a log and a branch behind it until she reaches it', () => {
  const n = R.normalize({ logs: [] }, 'easy');
  const state = R.createState(n, still(n), rng(22));
  state.dragon.x = -1000;
  const W = state.W;
  const bl = n.branchLength;
  state.cubs[0].status = 'float';
  state.cubs[1].status = 'float';
  state.pieces.push(piece('a', 'branch', W - bl / 2 - 0.1, 60, 0), piece('b', 'branch', W - bl / 2 - 95, 120, 1),
    piece('l', 'log', W - bl / 2 - 190, 120));
  const p = (id) => state.pieces.find((q) => q.id === id);
  R.step(state, DT, {});
  assert.equal(state.safe, 1);
  const begin = state.mother.queue[0].begin;
  while (state.t < begin + n.motherLeap - DT) {
    R.step(state, DT, {});
    assert.ok(p('b').x <= W - 1.5 * bl + 1e-9, `the next branch reached ${p('b').x} while the cub waits`);
    assert.ok(p('l').x <= p('b').x - bl + 1e-9, 'the log slid over the branch');
  }
  assert.equal(state.safe, 1, 'the next branch was saved while the first cub waited');
  stepUntil(state, () => state.safe === 2);
  assert.ok(state.t >= begin + n.motherLeap - 1e-9, 'the spot freed before she reached the cub');
});
await t('release: a cub boards a log centred at its hole; the log floats in from the left a moment later', () => {
  const n = R.normalize({ logs: [], firstFlood: 10 });
  const state = R.createState(n, still(n), rng(23));
  state.dragon.x = -1000;
  const hx = n.holes[0][0] * state.W;
  state.t = 10 - DT / 2; // the pieces placed just before the hole floods
  state.pieces.push(piece('l', 'log', hx - 10, 50), piece('other', 'log', 50, 50));
  R.step(state, DT, {});
  const b = state.pieces.find((q) => q.kind === 'branch');
  assert.equal(state.cubs[0].status, 'float');
  const log = state.pieces.find((q) => q.id === 'l');
  assert.ok(Math.abs(b.x - (hx - 10)) < 2, `the branch is at ${b.x}, not where the log was (${hx - 10})`);
  assert.equal(b.speed, 50, 'the branch has not the log\'s speed');
  assert.ok(log.x <= -n.logLength / 2 - 50 * R.LOG_RETURN_DELAY + 1, `the log came back at ${log.x}, not a moment upstream`);
  assert.equal(state.pieces.filter((q) => q.kind === 'log').length, 2);
});
await t('release: another cub\'s branch at the hole → the cub waits (also with a log there); a log partly over → waits, then boards', () => {
  const n = R.normalize({ logs: [], firstFlood: 10 });
  const state = R.createState(n, still(n), rng(24));
  state.dragon.x = -1000;
  const hx = n.holes[0][0] * state.W;
  state.cubs[6].status = 'float';
  state.t = 10 - DT / 2;
  // A log centred at the hole with room around it, and another cub's branch over the release point: waiting wins.
  state.pieces.push(piece('b', 'branch', hx - 55, 40, 6), piece('l', 'log', hx + 40, 40));
  stepUntil(state, () => state.t >= 10.05);
  assert.equal(state.cubs[0].status, 'hole', 'released over another cub\'s branch');
  stepUntil(state, () => state.cubs[0].status !== 'hole');
  const b = state.pieces.find((q) => q.cub === 0);
  const other = state.pieces.find((q) => q.id === 'b');
  assert.ok(Math.abs(b.x - other.x) >= n.branchLength - 1e-6, 'the new branch overlaps the other cub\'s');
  // A log only partly over the hole: the cub waits until it is centred (then boards) or has passed.
  const s2 = R.createState(n, still(n), rng(25));
  s2.dragon.x = -1000;
  s2.t = 10 - DT / 2;
  s2.pieces.push(piece('l', 'log', hx - 80, 40));
  stepUntil(s2, () => s2.t >= 10.05);
  assert.equal(s2.cubs[0].status, 'hole', 'released with a log partly over the hole');
  stepUntil(s2, () => s2.cubs[0].status !== 'hole');
  assert.ok(s2.pieces.find((q) => q.id === 'l').x < 0, 'it did not board the log once centred');
});
await t('release: boards a log with a neighbour parked against it; waits when the boarded branch would overlap one', () => {
  const n = R.normalize({ logs: [], firstFlood: 10 });
  const state = R.createState(n, still(n), rng(26));
  state.dragon.x = -1000;
  const hx = n.holes[0][0] * state.W;
  // The neighbour parks against the log by a real step (no passing), so the gap is the rounding of a sum.
  state.pieces.push(piece('l', 'log', hx - 200, 20), piece('n', 'log', hx - 400, 200));
  stepUntil(state, () => state.cubs[0].status !== 'hole' || state.t > 14);
  assert.equal(state.cubs[0].status, 'float', 'a touching neighbour counted as overlapping');
  assert.ok(state.t < 10 + 2, 'it waited for the log limit instead of boarding');
  // Touching up to a sum's rounding (a gap of −1e-9 px, as no passing can leave one) still isn't overlapping.
  const x = hx - 10;
  const s3 = R.createState(n, still(n), rng(26));
  s3.dragon.x = -1000;
  s3.t = 10 - DT / 2;
  s3.pieces.push(piece('l', 'log', x, 0), piece('n', 'log', x - 90 + 1e-9, 0));
  R.step(s3, DT, {});
  assert.equal(s3.cubs[0].status, 'float', 'a neighbour touching by rounding counted as overlapping');
  // branchLength 160: a log centred at the hole with a piece 100 px away → the boarded branch would overlap: wait.
  const n2 = R.normalize({ logs: [], firstFlood: 10, branchLength: 160 });
  const s2 = R.createState(n2, still(n2), rng(27));
  s2.dragon.x = -1000;
  s2.pieces.push(piece('l', 'log', hx, 0), piece('m', 'log', hx + 100, 0));
  stepUntil(s2, () => s2.t >= 11);
  assert.equal(s2.cubs[0].status, 'hole', 'boarded where the branch overlaps a neighbour');
});
await t('release: logs blocking a hole for ever → the cub boards after the log limit; two holes on one step never overlap', () => {
  const ring = R.normalize({ currentSpread: 0, currentSpeed: 10, branchLength: 200,
    logs: [0, 0.13554, 0.27108, 0.40662, 0.54216, 0.6777, 0.81324, 0.94879] });
  const state = R.createState(ring, still(ring), rng(28));
  state.dragon.x = -1000;
  stepUntil(state, () => state.cubs[0].status !== 'hole');
  assert.ok(state.t <= ring.firstFlood + 2 + 2 * DT, `the first cub came out only at ${state.t}`);
  // Two holes releasing on one step: the second sees the first's new branch.
  const n = R.normalize({ logs: [], holes: [[0.42, 0.8], [0.40, 0.785], [0.28, 0.77], [0.21, 0.73], [0.13, 0.68]], firstFlood: 5, floodGap: 1, holeCubs: [1, 1, 1, 1, 1] });
  const s2 = R.createState(n, still(n), rng(29));
  s2.dragon.x = -1000;
  s2.cubs[1].releaseAt = s2.cubs[0].releaseAt;
  stepUntil(s2, () => s2.cubs[0].status !== 'hole');
  const branches = s2.pieces.filter((q) => q.kind === 'branch');
  for (const a of branches) for (const b of branches) if (a !== b) assert.ok(Math.abs(a.x - b.x) >= n.branchLength - 1e-6, 'two releases overlap');
});
await t('release: the log wait counts from each block by logs (a branch in between starts it again)', () => {
  const n = R.normalize({ logs: [], firstFlood: 10 });
  const state = R.createState(n, still(n), rng(34));
  state.dragon.x = -1000;
  const hx = n.holes[0][0] * state.W;
  state.t = 10 - DT / 2;
  state.cubs[6].status = 'float';
  // A log partly over the hole moving away (never centred), another cub's branch coming over it, a log far behind:
  // when the branch has passed (after > 2 s), that log is partly over the hole and must be waited for, not boarded.
  state.pieces.push(piece('a', 'log', hx + 80, 40), piece('b', 'branch', hx - 95, 40, 6), piece('c', 'log', hx - 245, 40));
  stepUntil(state, () => state.cubs[0].status !== 'hole');
  const mine = state.pieces.find((p) => p.cub === 0);
  assert.ok(Math.abs(mine.x - hx) <= n.branchLength / 2 + 2, `boarded ${(mine.x - hx).toFixed(1)} px from the hole: the wait counted from the first log`);
});
// Two branches at the very edge on one step (a config's or a forced boarding's overlap): one lost, not two.
await t('two branches at the edge on one step: one cub lost', () => {
  const n = R.normalize({ logs: [] }, 'hard');
  const state = R.createState(n, still(n), rng(35));
  state.dragon.x = -1000;
  state.cubs[0].status = 'float';
  state.cubs[1].status = 'float';
  const edge = state.W - n.branchLength / 2;
  state.pieces.push(piece('a', 'branch', edge, 60, 0), piece('b', 'branch', edge, 60, 1));
  R.step(state, DT, {});
  assert.deepEqual(state.events.filter((e) => e.type === 'lost').map((e) => e.cub), [0]);
});
await t('the current speeds up with the water: 1 at the start, currentRise at the top, still once decided; Lehká without it', () => {
  const n = R.normalize({}, 'normal');
  assert.equal(n.currentRise, 1.3);
  assert.equal(R.normalize({}, 'easy').currentRise, 1);
  assert.equal(R.normalize({}, 'hard').currentRise, 1.3);
  assert.equal(R.normalize({ currentRise: 2 }, 'easy').currentRise, 2); // one number: every level
  assert.equal(R.normalize({ currentRise: 30 }, 'normal').currentRise, 1.3); // a typo falls back, not clamped to 3
  assert.equal(R.normalize({ currentRise: { normal: 0.5 } }, 'normal').currentRise, 1.3);
  assert.equal(R.normalize({ currentRise: 'x' }, 'hard').currentRise, 1.3);
  const state = R.createState(n, still(n), rng(30));
  assert.equal(R.currentFactor(state), 1);
  state.t = R.floodTimes(n).at(-1) + 1;
  assert.ok(Math.abs(R.currentFactor(state) - 1.3) < 1e-9);
  state.t = R.floodTimes(n)[1];
  const mid = R.currentFactor(state);
  assert.ok(mid > 1 && mid < 1.3);
  state.outcome = 'failure';
  state.decidedAt = state.t;
  state.t += 20;
  assert.equal(R.currentFactor(state), mid, 'the current sped up after the decision');
  // A config whose holes are all below the start: no division by zero.
  const flat = R.normalize({ waterStart: 0.5 });
  const fs2 = R.createState(flat, still(flat), rng(31));
  fs2.t = 30;
  assert.equal(R.currentFactor(fs2), 1);
  // Pieces move by it.
  const moving = R.createState(n, still(n), rng(32));
  moving.dragon.x = -1000;
  moving.t = R.floodTimes(n).at(-1) + 1;
  moving.pieces = [piece('l', 'log', 100, 60)];
  for (const cub of moving.cubs) cub.status = 'caught'; // no releases in the way
  R.step(moving, DT, {});
  assert.ok(Math.abs(moving.pieces[0].x - (100 + 60 * 1.3 * DT)) < 1e-9);
});
await t('the animation helpers: loopFrame orders, fps, pauses and phases; holdState; motherLooks', () => {
  const order = [0, 1, 0, 2];
  assert.deepEqual([0, 0.39, 0.41, 0.81, 1.21, 1.61, 3.59, 3.61].map((t) => R.loopFrame(t, order, 2.5, 2)), [0, 0, 1, 0, 2, 0, 0, 0]);
  assert.equal(R.loopFrame(0.41, order, 2.5, 2, 0.8), 2, 'the phase does not shift the loop');
  assert.equal(R.loopFrame(-0.1, order, 2.5, 2), 0);
  let head = { value: false, since: 0 };
  head = R.holdState(head, true, 0.6, 0.5);
  assert.deepEqual(head, { value: true, since: 0.6 });
  assert.equal(R.holdState(head, false, 0.9, 0.5), head, 'turned back within 0.5 s');
  assert.deepEqual(R.holdState(head, false, 1.1, 0.5), { value: false, since: 1.1 });
  const n = R.normalize({ logs: [] }, 'easy');
  const state = R.createState(n, still(n), rng(33));
  assert.equal(R.motherLooks(state), false);
  state.cubs[0].status = 'float';
  state.pieces.push(piece('b', 'branch', 500, 0, 0));
  assert.equal(R.motherLooks(state), true);
  state.pieces = [];
  state.mother.queue.push({ cub: 0, begin: state.t, end: state.t + 1.2 });
  assert.equal(R.motherLooks(state), true, 'she does not look at the river while a cub waits at the edge');
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
await t('the animation frames: each the size of its still, lined up on it (a part that does not move, ±1 px)', async () => {
  const { PNG } = (await import('pngjs')).default;
  const read = (key) => PNG.sync.read(fs.readFileSync(`${root}/public/${R.DEFAULTS.assets[key]}`));
  // [still, frames, the part that doesn't move as fractions of the picture]: the father's rump, back and tail base (his
  // weight shift moves his paws, his head turns); the mother's body (her head and tail move); the cub's branch, left of
  // its paws and above its legs.
  const groups = [
    ['father', ['father2', 'father3'], [0.02, 0.2, 0.45, 0.7]],
    ['motherWatch', ['motherTail', 'motherHead', 'motherHeadTail'], [0.35, 0.15, 0.8, 0.7]],
    ['cubBranch', ['cubBranch2', 'cubBranch3'], [0.02, 0.5, 0.45, 0.68]],
  ];
  const at = (img, x, y) => {
    if (x < 0 || y < 0 || x >= img.width || y >= img.height) return [0, 0];
    const i = (y * img.width + x) * 4;
    const a = img.data[i + 3] / 255;
    return [a, (a * (img.data[i] + img.data[i + 1] + img.data[i + 2])) / 765];
  };
  for (const [still, frames, [fx0, fy0, fx1, fy1]] of groups) {
    const S = read(still);
    for (const frame of frames) {
      const F = read(frame);
      assert.deepEqual([F.width, F.height], [S.width, S.height], `${frame} is not the size of ${still}`);
      let best = null;
      for (let dy = -4; dy <= 4; dy += 1) for (let dx = -4; dx <= 4; dx += 1) {
        let cost = 0;
        let n = 0;
        for (let y = Math.round(fy0 * S.height); y < fy1 * S.height; y += 1) {
          for (let x = Math.round(fx0 * S.width); x < fx1 * S.width; x += 1) {
            const [a, l] = at(S, x, y);
            const [a2, l2] = at(F, x + dx, y + dy);
            cost += Math.abs(a - a2) + 2 * Math.abs(l - l2);
            n += 1;
          }
        }
        if (!best || cost / n < best.cost) best = { dx, dy, cost: cost / n };
      }
      assert.ok(Math.abs(best.dx) <= 1 && Math.abs(best.dy) <= 1,
        `${frame} sits ${best.dx}, ${best.dy} px off ${still}: re-pin its offset in scripts/cropBadgerSprites.mjs's FRAMES and re-run it`);
    }
  }
});
await t("BRANCH_LINE is cub_branch.png's branch line (the middle of its rows with ≥ 220 px of alpha > 8, ±0.02)", async () => {
  const { PNG } = (await import('pngjs')).default;
  const png = PNG.sync.read(fs.readFileSync(`${root}/public/${R.DEFAULTS.assets.cubBranch}`));
  const rows = [];
  for (let y = 0; y < png.height; y += 1) {
    let n = 0;
    for (let x = 0; x < png.width; x += 1) if (png.data[(y * png.width + x) * 4 + 3] > 8) n += 1;
    if (n >= 220) rows.push(y);
  }
  assert.ok(rows.length > 0, 'no row of cub_branch.png is 220 px wide: a new picture, re-measure BRANCH_LINE');
  const line = (rows[0] + rows.at(-1)) / 2 / png.height;
  assert.ok(Math.abs(line - R.BRANCH_LINE) <= 0.02, `measured ${line.toFixed(3)}, BRANCH_LINE is ${R.BRANCH_LINE}: put the measured line in badgerRules.js`);
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
