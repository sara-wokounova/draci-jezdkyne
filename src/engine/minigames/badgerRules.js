// The badger cubs rescue (D42): the rules as a pure state machine, shared by the game (badgerRescue.js draws the state
// and feeds taps) and the node checks (tests/badgerRules.test.mjs plays it). No Pixi, no DOM.
//
// The field is the contain rectangle of the 1672×941 background, in game px: 600 tall, FIELD_WIDTH wide. The water
// rises, flooding the burrow's holes in order; each flooded hole's cubs climb onto branches one after another, and the
// current carries the branches right. A tap makes the flying dragon dive straight down; a cub in reach is caught. A
// branch that reaches the right edge uncaught is saved by the mother while she has strength (motherSaves), else the
// round is lost. Won when every cub is safe.
import { isPlainObject, mergeConfig, nonNegative, positive } from './configRules.js';

export const BACKGROUND = { width: 1672, height: 941 }; // badger_flood.png (the node check measures the file)
export const FIELD_HEIGHT = 600;
export const STEP = 1 / 60; // s: step() is run at most this long at a time (the game and the node checks alike)
export const FIELD_WIDTH = (FIELD_HEIGHT * BACKGROUND.width) / BACKGROUND.height; // ≈ 1066 game px
const LEVELS = ['easy', 'normal', 'hard'];
// Caps for story typos (D24): beyond them a value falls back or is clamped, so no round can hang or flood the screen.
const MAX_CUBS = 15; // a typo in holeCubs must not start hundreds of branches
const MAX_PER_HOLE = 5;
const MAX_DRAGONS = 6;
const MAX_LOGS = 8;
const MAX_SECONDS = 60; // the first flood and the gap between floods
const LOST_SECONDS = 1.2; // at least this long a lost cub is seen floating away past the edge before the result,
const LOST_MAX_SECONDS = 5; // until its branch is out of sight, at most this long,
const LOST_MARGIN = 0.2; // and a moment more
const DRAGON_MARGIN = 100; // px beyond the field's edges where a pass starts and ends (the game draws the tail out)
export const LOG_RETURN_DELAY = 1.5; // s: a log a cub boarded floats in again from the left this long after (D43)
const LOG_WAIT_MAX = 2; // s a cub waits in its hole for logs in the way, then boards the nearest regardless (D43)
const OVERLAP_EPS = 1e-6; // px: pieces parked touching (no passing) never count as overlapping through rounding
// The branch's line in cub_branch.png as a share of its height (the middle row of the rows with at least 220 px of
// alpha > 8, measured 2026-11-17; tests/badgerRules.test.mjs measures it again): badgerRescue.js draws it on the water.
export const BRANCH_LINE = 0.58;
export const FALLBACK_BODY_WIDTH = 290; // strip px, for a dragon with no width at all (Róza's fly strip)
/** Which sound plays for each event of step() (badgerRescue.js plays them; each a key of DEFAULTS.sounds). */
export const EVENT_SOUNDS = { dive: 'dive', splash: 'splash', bump: 'bump', catch: 'caught', mother: 'mother', lost: 'lost' };

export const DEFAULTS = {
  // Field fractions, measured on badger_flood.png (2026-11-17). The holes in flood order: holeCubs[i] belongs to holes[i].
  holes: [[0.42, 0.80], [0.35, 0.785], [0.28, 0.77], [0.21, 0.73], [0.13, 0.68]],
  holeCubs: [1, 1, 1, 2, 2], // Sára: 7 cubs, the last two holes with two (the play-test page also offers [1, 1, 2, 2, 3])
  burrow: [0.12, 0.47], // the new burrow, where the father waits
  waterStart: 0.86, // the painted water line; the game's band rises from here to the last hole
  firstFlood: 6, // s
  floodGap: 7, // s between floods, the same at every level
  cubGap: 2.5, // s between the cubs of one hole
  currentSpeed: { easy: 45, normal: 60, hard: 80 }, // px/s: how long a cub holds on before it floats away (Sára)
  currentSpread: 0.15, // each piece's speed is the current ± this share
  // × the current at the highest water, rising with it (Sára: the game shouldn't get easier as the water brings the cubs
  // closer); Lehká without it (Sára: "jen na Normální a Těžké"; there a faster current helped the masher).
  currentRise: { easy: 1, normal: 1.3, hard: 1.3 },
  motherSaves: { easy: 2, normal: 1, hard: 0 }, // Sára: the mother saves two cubs (Lehká) or one (Normální)
  mother: { x: 0.92, top: 0.55 }, // her boulder near the right edge: its top above the highest water
  branchLength: 90, // px, a branch with its cub (the balance checks were measured at 90)
  logLength: 90,
  logs: [0.5, 0.8], // the bare logs' starting x (field fractions, at most 8); they re-enter at the left edge
  reach: 12, // px past a piece's ends that still counts (0 anywhere over it)
  dragonWidth: 140, // px, so the bodies stay above the water
  flightY: 0.30, // the eye's line, field fraction (the class pushes it below the HUD on short screens)
  // At most 6, in turns. speed px/s; catchPoint = the lowest opaque point of fly frame diveFrame (wings up), in strip px
  // from its anchor (the eye); tests/badgerRules.test.mjs measures it on the committed strips (re-packed strip: update).
  dragons: [
    { speed: 260, catchPoint: [-85, 38], diveFrame: 0 }, // Róza
    { speed: 300, catchPoint: [-104, 97], diveFrame: 0 }, // Emma
    { speed: 240, catchPoint: [-118, 79], diveFrame: 0 }, // Anna
  ],
  flightGap: 0.45, // s between two dragons' passes
  dive: { down: 0.35, up: 0.35, missCooldown: 1.0, bumpCooldown: 1.5, tilt: 10 },
  arcSeconds: 0.8, // a caught cub's flight to the new burrow
  motherLeap: 0.6, // s into the water,
  motherReturn: 0.6, // and back onto the boulder with the cub
  // Drawn sizes in game px (to resize by eye; the game's own sizes are branchLength, logLength and dragonWidth).
  // arcHeight: how high a cub's flight to the burrow rises; the cubs drawn at the burrow are spaced by their own size.
  sizes: { cubPeek: 46, father: 120, mother: 120, cubFly: 44, homeCub: 34, arcHeight: 120 },
  labels: { motherLeft: 'Máma pomůže: {n}×', motherDone: 'Máma už nemůže', motherNone: 'Zachraň všechna!' },
  assets: {
    cubPeek: 'assets/minigames/badger-rescue/cub_peek.png',
    cubBranch: 'assets/minigames/badger-rescue/cub_branch.png',
    cubFly: 'assets/minigames/badger-rescue/cub_fly.png',
    log: 'assets/minigames/badger-rescue/log.png',
    father: 'assets/minigames/badger-rescue/father.png',
    motherWatch: 'assets/minigames/badger-rescue/mother_watch.png',
    motherRest: 'assets/minigames/badger-rescue/mother_rest.png',
    boulder: 'assets/minigames/badger-rescue/boulder.png',
    // The animation frames (D43), each the size of its still: the father shifting his weight, a cub on its branch, the
    // mother's tail and head. A story frame of another size still draws at its still's width.
    father2: 'assets/minigames/badger-rescue/father2.png',
    father3: 'assets/minigames/badger-rescue/father3.png',
    cubBranch2: 'assets/minigames/badger-rescue/cub_branch2.png',
    cubBranch3: 'assets/minigames/badger-rescue/cub_branch3.png',
    motherTail: 'assets/minigames/badger-rescue/mother_watch_tail.png',
    motherHead: 'assets/minigames/badger-rescue/mother_watch_head.png',
    motherHeadTail: 'assets/minigames/badger-rescue/mother_watch_headtail.png',
  },
  sounds: { dive: null, splash: null, bump: null, caught: null, mother: null, lost: null }, // step 2 (D42)
};

const finite01 = (v, fallback) => (Number.isFinite(v) && v >= 0 && v <= 1 ? v : fallback);
const point = (p, fallback) => (Array.isArray(p) && p.length === 2 ? [finite01(p[0], fallback[0]), finite01(p[1], fallback[1])] : fallback);
const clampInt = (v, lo, hi, fallback) => (Number.isInteger(v) && v >= lo && v <= hi ? v : fallback);
const rise1to3 = (v, fallback) => (Number.isFinite(v) && v >= 1 && v <= 3 ? v : fallback);
// A table by difficulty ({ easy, normal, hard }), or one number for every level.
const byLevel = (table, level, fallback) => (Number.isFinite(table) ? table
  : isPlainObject(table) && Number.isFinite(table[level]) ? table[level] : fallback);

/**
 * The game's numbers from DEFAULTS and the story's config, checked (D24: a typo falls back to the default, nothing
 * loops or freezes), for one difficulty ('easy' | 'normal' | 'hard'; anything else plays as 'normal').
 */
export function normalize(config = {}, difficulty = 'normal') {
  const level = LEVELS.includes(difficulty) ? difficulty : 'normal';
  const c = mergeConfig(DEFAULTS, isPlainObject(config) ? config : {});
  const d = DEFAULTS;
  const holes = Array.isArray(c.holes) && c.holes.length === d.holes.length ? c.holes.map((p, i) => point(p, d.holes[i])) : d.holes;
  let holeCubs = Array.isArray(c.holeCubs) && c.holeCubs.length === holes.length
    && c.holeCubs.every((n) => Number.isInteger(n) && n >= 1 && n <= MAX_PER_HOLE) ? c.holeCubs : d.holeCubs;
  if (holeCubs.reduce((a, b) => a + b, 0) > MAX_CUBS) holeCubs = d.holeCubs;
  const waterStart = finite01(c.waterStart, d.waterStart);
  // Heights between the start and the top, rising in flood order, so the water never goes down.
  let previous = waterStart;
  const holeY = holes.map(([, y]) => {
    previous = Math.min(previous, y);
    return previous;
  });
  const dragons = (Array.isArray(c.dragons) && c.dragons.length > 0 ? c.dragons : d.dragons).slice(0, MAX_DRAGONS).map((dr, i) => {
    const base = d.dragons[i % d.dragons.length];
    const cp = isPlainObject(dr) && Array.isArray(dr.catchPoint) && dr.catchPoint.length === 2 && dr.catchPoint.every((v) => Number.isFinite(v) && Math.abs(v) <= 500)
      ? dr.catchPoint : base.catchPoint;
    return {
      speed: Math.min(1000, Math.max(20, positive(isPlainObject(dr) ? dr.speed : undefined, base.speed))),
      catchPoint: cp,
      diveFrame: clampInt(isPlainObject(dr) ? dr.diveFrame : undefined, 0, 63, base.diveFrame),
    };
  });
  const dive = isPlainObject(c.dive) ? c.dive : d.dive;
  return {
    holes,
    holeY,
    holeCubs,
    total: holeCubs.reduce((a, b) => a + b, 0),
    burrow: point(c.burrow, d.burrow),
    waterStart,
    firstFlood: Math.min(MAX_SECONDS, nonNegative(c.firstFlood, d.firstFlood)),
    floodGap: Math.min(MAX_SECONDS, Math.max(1, positive(c.floodGap, d.floodGap))),
    cubGap: Math.min(30, Math.max(0.3, positive(c.cubGap, d.cubGap))),
    currentSpeed: Math.min(400, Math.max(10, byLevel(c.currentSpeed, level, d.currentSpeed[level]))),
    currentSpread: Math.min(0.5, nonNegative(c.currentSpread, d.currentSpread)),
    // A number from 1 to 3, else the level's default (not clamped: a typo like 30 mustn't become the maximum).
    currentRise: rise1to3(byLevel(c.currentRise, level, d.currentRise[level]), d.currentRise[level]),
    motherSaves: clampInt(byLevel(c.motherSaves, level, d.motherSaves[level]), 0, 10, d.motherSaves[level]),
    mother: { x: finite01(c.mother?.x, d.mother.x), top: finite01(c.mother?.top, d.mother.top) },
    branchLength: Math.min(300, Math.max(20, positive(c.branchLength, d.branchLength))),
    logLength: Math.min(300, Math.max(20, positive(c.logLength, d.logLength))),
    logs: (Array.isArray(c.logs) ? c.logs : d.logs).slice(0, MAX_LOGS).map((x, i) => finite01(x, d.logs[i % d.logs.length] ?? 0.5)),
    reach: Math.min(100, nonNegative(c.reach, d.reach)),
    dragonWidth: Math.min(400, Math.max(40, positive(c.dragonWidth, d.dragonWidth))),
    flightY: finite01(c.flightY, d.flightY),
    dragons,
    flightGap: Math.min(10, nonNegative(c.flightGap, d.flightGap)),
    dive: {
      down: Math.min(3, Math.max(0.05, positive(dive.down, d.dive.down))),
      up: Math.min(3, Math.max(0.05, positive(dive.up, d.dive.up))),
      missCooldown: Math.min(10, nonNegative(dive.missCooldown, d.dive.missCooldown)),
      bumpCooldown: Math.min(10, nonNegative(dive.bumpCooldown, d.dive.bumpCooldown)),
      tilt: Math.min(45, nonNegative(dive.tilt, d.dive.tilt)),
    },
    arcSeconds: Math.min(5, nonNegative(c.arcSeconds, d.arcSeconds)),
    motherLeap: Math.min(5, nonNegative(c.motherLeap, d.motherLeap)),
    motherReturn: Math.min(5, nonNegative(c.motherReturn, d.motherReturn)),
    labels: { ...d.labels, ...strings(c.labels) },
    sizes: Object.fromEntries(Object.entries(d.sizes).map(([k, v]) => [k, Math.min(400, positive(c.sizes?.[k], v))])),
    assets: { ...d.assets, ...strings(c.assets) },
    sounds: isPlainObject(c.sounds) ? c.sounds : d.sounds, // checked by soundEntry() where they are played
  };
}

/** A story object's own string values (anything else in it is a typo and ignored). */
function strings(value) {
  return isPlainObject(value) ? Object.fromEntries(Object.entries(value).filter(([, v]) => typeof v === 'string')) : {};
}

/** When each hole floods (s): firstFlood, then every floodGap. */
export function floodTimes(cfg) {
  return cfg.holes.map((_, i) => cfg.firstFlood + i * cfg.floodGap);
}

/** The water line (field fraction) at time t: piecewise linear through each hole at its flood time, then still. */
export function waterLevel(cfg, t) {
  const times = floodTimes(cfg);
  let t0 = 0;
  let y0 = cfg.waterStart;
  for (let i = 0; i < times.length; i += 1) {
    if (t <= times[i]) return y0 + (cfg.holeY[i] - y0) * (times[i] === t0 ? 1 : Math.max(0, t - t0) / (times[i] - t0));
    t0 = times[i];
    y0 = cfg.holeY[i];
  }
  return y0;
}

/** Each dragon's catch offset from its eye in game px (flying left, the art mirrored), from its fly strip's bodyWidth
 *  (strip px). The game tilts the diving art around this point, so the offset holds at the dive's bottom. */
export function catchOffsets(cfg, bodyWidths) {
  return cfg.dragons.map((dragon, i) => {
    const scale = cfg.dragonWidth / positive(bodyWidths?.[i], FALLBACK_BODY_WIDTH);
    return { dx: -dragon.catchPoint[0] * scale, dy: dragon.catchPoint[1] * scale }; // mirrored: dx flips
  });
}

/** A fresh state for one round. `geometry.catch[i]` = { dx, dy } from catchOffsets (game px); `rng` returns [0, 1). */
export function createState(cfg, geometry, rng = Math.random) {
  const W = FIELD_WIDTH;
  const times = floodTimes(cfg);
  const cubs = [];
  cfg.holeCubs.forEach((count, hole) => {
    for (let k = 0; k < count; k += 1) cubs.push({ id: cubs.length, hole, status: 'hole', releaseAt: times[hole] + k * cfg.cubGap, logWaitSince: null });
  });
  const speed = () => cfg.currentSpeed * (1 + (rng() * 2 - 1) * cfg.currentSpread);
  return {
    cfg,
    t: 0,
    W,
    cubs,
    pieces: cfg.logs.map((x, i) => ({ id: `log${i}`, kind: 'log', x: x * W, speed: speed(), cub: null, held: false })),
    nextPiece: 0,
    speed,
    catch: geometry?.catch ?? cfg.dragons.map(() => ({ dx: 0, dy: 0 })),
    dragon: { index: 0, x: W + DRAGON_MARGIN, phase: 'fly', phaseT: 0, diveX: 0, cooldownUntil: 0, lastResult: null },
    mother: { saves: cfg.motherSaves, queue: [], busyUntil: 0 },
    arcs: [],
    safe: 0,
    outcome: null, // 'victory' | 'failure', decided
    decidedAt: null, // when it was decided
    endAt: null, // when the drawing settles and the result shows
    events: [],
  };
}

const halfLength = (piece, cfg) => (piece.kind === 'log' ? cfg.logLength : cfg.branchLength) / 2;
const pieceDistance = (piece, x, cfg) => Math.max(0, Math.abs(x - piece.x) - halfLength(piece, cfg));
/** Does `piece` overlap the stretch of half-length `half` centred on `x`? (Touching doesn't count.) */
const overlaps = (piece, x, half, cfg) => Math.abs(piece.x - x) - (halfLength(piece, cfg) + half) < -OVERLAP_EPS;

/**
 * The current's factor now: 1 at the painted water line, `currentRise` at the highest hole's level, linear in between
 * (with the round's water, so still once decided). 1 when the highest level isn't above the start (a config typo).
 */
export function currentFactor(state) {
  const { cfg } = state;
  const top = cfg.holeY[cfg.holeY.length - 1];
  if (!(cfg.waterStart > top)) return 1;
  const rise = Math.min(1, Math.max(0, (cfg.waterStart - roundWater(state)) / (cfg.waterStart - top)));
  return 1 + (cfg.currentRise - 1) * rise;
}

/** The catch point's x for the flying dragon. */
export function catchX(state) {
  const off = state.catch[state.dragon.index % state.catch.length];
  return state.dragon.x + off.dx;
}

/** Can a tap start a dive now? */
export function canDive(state) {
  const d = state.dragon;
  if (state.outcome || d.phase !== 'fly' || state.t < d.cooldownUntil) return false;
  const x = catchX(state);
  return x >= 0 && x <= state.W;
}

/**
 * One step of `dt` seconds. `input.dive`: a tap this step. Mutates and returns the state; `state.events` lists what
 * happened this step (for the drawing and the sounds): { type, ... }.
 */
export function step(state, dt, input = {}) {
  const { cfg, W } = state;
  state.events = [];
  const ev = (type, extra = {}) => state.events.push({ type, t: state.t, ...extra });
  state.t += dt;
  const t = state.t;
  // Once decided, the field keeps moving until the result (the dragon finishes its dive and flies on, the logs drift)
  // but nothing new happens: no cub climbs out, nothing is caught, no branch reaches the edge.
  const decided = state.outcome !== null;

  // Cubs climb out of flooded holes onto a new branch at their hole, never over another piece (D43): another cub's
  // branch in the way → the cub waits in its hole (branches always move off); a bare log centred at the hole, with room
  // around it → the cub boards it (the log floats in again from the left a moment later); a log only partly over the
  // hole, or with no room → the cub waits, at most LOG_WAIT_MAX, then boards the nearest regardless (logs can block a
  // hole for ever in a story config). Pieces released or boarded earlier in this loop count.
  const bh = cfg.branchLength / 2;
  for (const cub of state.cubs) {
    if (decided || cub.status !== 'hole' || t < cub.releaseAt) continue;
    const hx = cfg.holes[cub.hole][0] * W;
    const logs = state.pieces.filter((p) => p.kind === 'log' && overlaps(p, hx, bh, cfg));
    if (logs.length === 0) cub.logWaitSince = null; // LOG_WAIT_MAX counts from the start of each block by logs
    if (state.pieces.some((p) => p.kind === 'branch' && overlaps(p, hx, bh, cfg))) continue;
    let log = null;
    if (logs.length > 0) {
      log = logs.reduce((a, b) => (Math.abs(b.x - hx) < Math.abs(a.x - hx) ? b : a));
      const room = !state.pieces.some((p) => p !== log && overlaps(p, log.x, bh, cfg));
      cub.logWaitSince ??= t;
      if (!(Math.abs(log.x - hx) < bh && room) && t - cub.logWaitSince < LOG_WAIT_MAX) continue;
    }
    cub.status = 'float';
    const piece = { id: `b${state.nextPiece += 1}`, kind: 'branch', x: log ? log.x : hx, speed: log ? log.speed : state.speed(), cub: cub.id, held: false };
    if (log) log.x = -halfLength(log, cfg) - log.speed * currentFactor(state) * LOG_RETURN_DELAY;
    state.pieces.push(piece);
    ev('release', { cub: cub.id, hole: cub.hole });
  }

  // The dragon: passes in turns, dives.
  const d = state.dragon;
  const spec = cfg.dragons[d.index % cfg.dragons.length];
  if (d.phase === 'fly') {
    if (input.dive && canDive(state)) {
      d.phase = 'down';
      d.phaseT = 0;
      d.diveX = catchX(state);
      d.lastResult = null; // this dive's own result decides its cooldown (none when the round was decided meanwhile)
      ev('dive', { dragon: d.index });
    } else {
      d.x -= spec.speed * dt;
      if (d.x < -DRAGON_MARGIN) {
        d.phase = 'gap';
        d.phaseT = 0;
      }
    }
  } else if (d.phase === 'gap') {
    d.phaseT += dt;
    if (d.phaseT >= cfg.flightGap) {
      d.index += 1;
      d.x = W + DRAGON_MARGIN;
      d.phase = 'fly';
      d.cooldownUntil = 0;
    }
  } else if (d.phase === 'down') {
    d.phaseT += dt;
    if (d.phaseT >= cfg.dive.down) {
      if (!decided) resolveDive(state, ev);
      d.phase = 'up';
      d.phaseT = 0;
    }
  } else if (d.phase === 'up') {
    d.phaseT += dt;
    if (d.phaseT >= cfg.dive.up) {
      d.phase = 'fly';
      d.cooldownUntil = t + (d.lastResult === 'bump' ? cfg.dive.bumpCooldown : d.lastResult === 'splash' ? cfg.dive.missCooldown : 0);
    }
  }

  // The current, faster as the water rises (currentFactor). No passing (D43): from the most downstream piece, each moves
  // at most up to touching the piece ahead (never back), so nothing floats over anything else; a faster piece follows a
  // slower one. A log limits the pieces behind it until it wraps; a lost branch floats away freely but limits the one
  // behind it; while a saved cub waits at the edge for the mother, its spot counts as a piece ahead (in the step of
  // the save the saved branch, at that very spot, still limits the next one). A branch at the edge waits there while a dive is going
  // down (even one started on this step): the round is never lost under the claws. Once decided, the branches drift on
  // to the edge and stay.
  const diving = d.phase === 'down';
  const f = currentFactor(state);
  for (const p of state.pieces) if (p.kind === 'log' && p.x - halfLength(p, cfg) > W) p.x = -halfLength(p, cfg);
  // A stable sort of a copy: on a tie the piece created first leads (state.pieces keeps creation order).
  const order = [...state.pieces, ...(motherView(state).waiting > 0 ? [{ kind: 'branch', spot: true, x: W - bh }] : [])].sort((a, b) => b.x - a.x);
  let ahead = null;
  const move = (piece) => {
    const x = piece.x + piece.speed * f * dt;
    return ahead ? Math.max(piece.x, Math.min(x, ahead.x - (halfLength(ahead, cfg) + halfLength(piece, cfg)))) : x;
  };
  for (const piece of order) {
    const half = halfLength(piece, cfg);
    if (piece.spot || piece.kind === 'log') {
      if (!piece.spot) piece.x = move(piece);
      ahead = piece;
      continue;
    }
    if (piece.lost) { // floating away past the edge (drawn until the result)
      piece.x += piece.speed * f * dt;
      ahead = piece;
      continue;
    }
    if (!(piece.held && diving)) {
      piece.held = false;
      piece.x = Math.min(move(piece), W - half);
    }
    ahead = piece;
    if (piece.held) continue;
    if (state.outcome || piece.x < W - half) continue; // (also decided earlier in this step: one cub lost, not two)
    // At the edge.
    if (diving) {
      piece.held = true;
      continue;
    }
    const cub = state.cubs[piece.cub];
    if (state.mother.saves > 0) {
      state.pieces.splice(state.pieces.indexOf(piece), 1);
      state.mother.saves -= 1;
      cub.status = 'saved';
      state.safe += 1;
      const begin = Math.max(t, state.mother.busyUntil);
      state.mother.busyUntil = begin + cfg.motherLeap + cfg.motherReturn;
      state.mother.queue.push({ cub: cub.id, begin, end: state.mother.busyUntil });
      // Once she is back on her rock, the cub flies to the father as a caught one does (D43).
      state.arcs.push({ cub: cub.id, mother: true, begin: state.mother.busyUntil, end: state.mother.busyUntil + cfg.arcSeconds });
      ev('mother', { cub: cub.id, begin });
    } else {
      cub.status = 'lost';
      piece.lost = true;
      ev('lost', { cub: cub.id });
      decide(state, 'failure', Math.min(LOST_MAX_SECONDS, Math.max(LOST_SECONDS, (2 * half) / (piece.speed * f) + LOST_MARGIN)));
      // The rest of the river moves on this step too (decided now: no other branch reaches the edge).
    }
  }

  if (!state.outcome && state.safe === cfg.total) decide(state, 'victory');
  return state;
}

function resolveDive(state, ev) {
  const { cfg } = state;
  const d = state.dragon;
  const x = d.diveX;
  const inReach = state.pieces.filter((p) => pieceDistance(p, x, cfg) <= cfg.reach);
  const cubs = inReach.filter((p) => p.kind === 'branch').sort((a, b) => Math.abs(a.x - x) - Math.abs(b.x - x));
  if (cubs.length > 0) {
    const piece = cubs[0];
    const cub = state.cubs[piece.cub];
    state.pieces.splice(state.pieces.indexOf(piece), 1);
    cub.status = 'caught';
    state.safe += 1;
    state.arcs.push({ cub: cub.id, from: x, begin: state.t, end: state.t + cfg.arcSeconds });
    d.lastResult = 'catch';
    ev('catch', { cub: cub.id, x });
  } else if (inReach.length > 0) {
    d.lastResult = 'bump';
    ev('bump', { x });
  } else {
    d.lastResult = 'splash';
    ev('splash', { x });
  }
}

/** The round's outcome is decided; the result waits for the drawing (the arcs and the mother's trips) to settle. */
function decide(state, outcome, hold = 0) {
  state.outcome = outcome;
  state.decidedAt = state.t; // the water stops rising here: no hole floods while the result waits
  const arcsEnd = Math.max(state.t + hold, ...state.arcs.map((a) => a.end));
  state.endAt = Math.max(arcsEnd, state.mother.busyUntil);
}

/**
 * What the mother is doing at the round's time, from her queue of trips (each saved cub: she leaps to the edge in
 * motherLeap, comes back with it in motherReturn). A saved cub counts, and her strength is spent, only once she is back
 * with it: `trip` (the one under way, or null), `carrying` (past its middle), `waiting` (saved cubs at the edge she
 * hasn't reached yet: at most one, D43), `waitingCub` (its id, or null), `onTheWay` (saved, not back yet), `savesShown`
 * (her saves as the HUD shows them), `resting` (exhausted: no saves left and every trip over, never on a level without
 * saves).
 */
export function motherView(state) {
  const { queue, saves, busyUntil } = state.mother;
  const { t } = state;
  const trip = queue.find((q) => t >= q.begin && t < q.end) ?? null;
  const onTheWay = queue.filter((q) => t < q.end).length;
  const waitingQ = queue.filter((q) => t < q.begin + state.cfg.motherLeap);
  return {
    trip,
    carrying: trip !== null && t >= trip.begin + state.cfg.motherLeap,
    waiting: waitingQ.length,
    waitingCub: waitingQ[0]?.cub ?? null,
    onTheWay,
    savesShown: saves + onTheWay,
    resting: saves === 0 && queue.length > 0 && t >= busyUntil,
  };
}

/** The water line (field fraction) of a round: rising until the round is decided, then still. */
export function roundWater(state) {
  return waterLevel(state.cfg, state.outcome ? Math.min(state.t, state.decidedAt) : state.t);
}

/**
 * The animals' animation (D43), pure so the node checks can play it: the frame of `order` (frame indices) at time `t`
 * (the round's time, so it pauses with the game), played at `fps`, then `pause` s on frame 0, round and round; `phase`
 * s shifts the loop (each cub its own).
 */
export function loopFrame(t, order, fps, pause = 0, phase = 0) {
  const play = order.length / fps;
  const local = (((t + phase) % (play + pause)) + play + pause) % (play + pause);
  return local < play ? order[Math.min(order.length - 1, Math.floor(local * fps))] : 0;
}

/** A state that changes only after holding its new value for `min` s (`{ value, since }` in and out). */
export function holdState(prev, want, t, min) {
  return want !== prev.value && t - prev.since >= min ? { value: want, since: t } : prev;
}

/** Should the mother look at the river (a cub floats on it, or waits at the edge for her)? */
export function motherLooks(state) {
  return state.pieces.some((p) => p.kind === 'branch' && !p.lost) || motherView(state).waiting > 0;
}

/** Is the round over (the result may show)? */
export const finished = (state) => state.endAt !== null && state.t >= state.endAt;

/** The HUD's status text, from the mother's saves left. */
export function statusText(cfg, saves) {
  if (cfg.motherSaves === 0) return cfg.labels.motherNone;
  if (saves > 0) return cfg.labels.motherLeft.replaceAll('{n}', String(saves));
  return cfg.labels.motherDone;
}

/**
 * The HUD's score ("3 z 7") and status at the round's time: a cub the mother saves counts, and her strength is spent,
 * once she has brought it back (motherView); once a cub is lost her strength is plainly spent, whatever trip she is on.
 */
export function hudView(state) {
  const mother = motherView(state);
  return {
    score: `${state.safe - mother.onTheWay} z ${state.cfg.total}`,
    status: statusText(state.cfg, state.outcome === 'failure' ? 0 : mother.savesShown),
  };
}
