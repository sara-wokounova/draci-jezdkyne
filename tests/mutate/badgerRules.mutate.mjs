// Fail-before for tests/badgerRules.test.mjs (D42): breaks one rule at a time in a copy of the files it needs and runs
// the test there; every mutation must make it fail (a control run without a mutation must pass).
//   node tests/mutate/badgerRules.mutate.mjs [part of a mutation name]
// The copy: see runMutations.mjs. On Windows in Git Bash: MUTATE_TMP=C:/tmp/claude/mutate node tests/mutate/badgerRules.mutate.mjs
import fs from 'node:fs';
import { REPO, runMutations } from './runMutations.mjs';
const SFX = 'public/assets/minigames/badger-rescue/sfx';
const files = ['src/engine/minigames/badgerRules.js', 'src/engine/minigames/configRules.js', 'src/engine/minigames/dragonAttack.js',
  'public/assets/backgrounds/badger_flood.png',
  'public/assets/minigames/dragon-attack/roza_fly.png', 'public/assets/minigames/dragon-attack/emma_fly.png',
  'public/assets/minigames/dragon-attack/anna_fly.png',
  ...fs.readdirSync(`${REPO}/public/assets/minigames/badger-rescue`).filter((n) => n.endsWith('.png'))
    .map((n) => `public/assets/minigames/badger-rescue/${n}`),
  // the sound effects (D45), once built
  ...(fs.existsSync(`${REPO}/${SFX}`) ? fs.readdirSync(`${REPO}/${SFX}`).map((n) => `${SFX}/${n}`) : [])];
const DRAGON = 'src/engine/minigames/dragonAttack.js';
const RULES = 'src/engine/minigames/badgerRules.js';
const MUTATIONS = [
  ['the mother never tires', RULES, 'state.mother.saves -= 1;', ''],
  ['no reach past the ends', RULES, 'pieceDistance(p, x, cfg) <= cfg.reach', 'pieceDistance(p, x, cfg) <= 0'],
  ['no hold at the edge during a dive', RULES, '    if (diving) {\n      piece.held = true;', '    if (false) {\n      piece.held = true;'],
  ['no hold for a dive started on the same step', RULES, '    if (diving) {\n      piece.held = true;', '    if (diving && state.dragon.phaseT > 0.02) {\n      piece.held = true;'],
  ['a log blocks a cub', RULES, "const cubs = inReach.filter((p) => p.kind === 'branch')", 'const cubs = inReach.slice(0, 1).filter((p) => p.kind === \'branch\')'],
  ['no cooldown after a splash', RULES, "d.lastResult === 'splash' ? cfg.dive.missCooldown : 0", '0'],
  ['the water may go down', RULES, 'previous = Math.min(previous, y);', 'previous = y;'],
  ['no cap on the cubs', RULES, 'if (holeCubs.reduce((a, b) => a + b, 0) > MAX_CUBS) holeCubs = d.holeCubs;', ''],
  ['won one cub early', RULES, 'state.safe === cfg.total', 'state.safe >= cfg.total - 1'],
  ['a hole\'s cubs all at once', RULES, 'releaseAt: times[hole] + k * cfg.cubGap', 'releaseAt: times[hole]'],
  ['the level ignored for the current', RULES, 'byLevel(c.currentSpeed, level, d.currentSpeed[level])', 'byLevel(c.currentSpeed, \'normal\', d.currentSpeed.normal)'],
  ['no status for a mother with no saves', RULES, 'if (cfg.motherSaves === 0) return cfg.labels.motherNone;', ''],
  ['a typo in holeCubs kept', RULES, '&& c.holeCubs.every((n) => Number.isInteger(n) && n >= 1 && n <= MAX_PER_HOLE)', ''],
  ['dives slower (balance)', RULES, 'dive: { down: 0.35, up: 0.35, missCooldown: 1.0', 'dive: { down: 0.8, up: 0.8, missCooldown: 1.0'],
  ['a wide branch (mashing wins)', RULES, 'branchLength: 90,', 'branchLength: 220,'],
  ['the current too fast on Těžká', RULES, 'currentSpeed: { easy: 50, normal: 70, hard: 80 }', 'currentSpeed: { easy: 50, normal: 70, hard: 200 }'],
  ['the result does not wait for the arcs', RULES, 'state.endAt = Math.max(arcsEnd, state.mother.busyUntil);', 'state.endAt = state.t;'],
  ['no bump cooldown', RULES, "d.lastResult === 'bump' ? cfg.dive.bumpCooldown", "d.lastResult === 'bump' ? 0"],
  ['a bodyWidth the reader cannot see', DRAGON, 'bodyWidth: 194,', 'bodyWidth: 97 * 2,'],
  ['a catchPoint off the claws', RULES, 'catchPoint: [-104, 97]', 'catchPoint: [-104, 80]'],
  ['an event without its sound', RULES, "mother: 'mother', lost: 'lost' }", "mother: 'mother' }"],
  ['a JSON __proto__ key merged', 'src/engine/minigames/configRules.js', "      if (key === '__proto__') continue;", ''],
  ['the branches freeze after the decision', RULES, '    if (!(piece.held && diving)) {', '    if (!decided && !(piece.held && diving)) {'],
  ['the water rises on after the decision', RULES, 'state.outcome ? Math.min(state.t, state.decidedAt) : state.t', 'state.t'],
  ['her saves shown before she is back', RULES, '    savesShown: saves + onTheWay,', '    savesShown: saves,'],
  ['the HUD counts a cub still on its way', RULES, '    score: `${state.safe - mother.onTheWay} z', '    score: `${state.safe} z'],
  ['the HUD keeps her saves after a loss', RULES, "state.outcome === 'failure' ? 0 : mother.savesShown", 'mother.savesShown'],
  ['the lost cub vanishes at once', RULES, '      piece.lost = true;\n', '      state.pieces.splice(state.pieces.indexOf(piece), 1);\n'],
  ['the lost cub doesn\'t end the round', RULES, "      decide(state, 'failure', Math.min(LOST_MAX_SECONDS, Math.max(LOST_SECONDS, (2 * half) / (piece.speed * f) + LOST_MARGIN)));\n", ''],
  // D43
  ['the current not speeding up', RULES, '  return 1 + (cfg.currentRise - 1) * rise;', '  return 1;'],
  ['the current speeding up after the decision', RULES, '(cfg.waterStart - roundWater(state))', '(cfg.waterStart - waterLevel(cfg, state.t))'],
  ['Lehká speeding up', RULES, 'currentRise: { easy: 1, normal: 2, hard: 1.8 }', 'currentRise: { easy: 1.3, normal: 2, hard: 1.8 }'],
  ['no guard for holes below the water start', RULES, '  if (!(cfg.waterStart > top)) return 1;\n', ''],
  ['currentRise clamped instead of falling back', RULES, '(Number.isFinite(v) && v >= 1 && v <= 3 ? v : fallback)', '(Number.isFinite(v) ? Math.min(3, Math.max(1, v)) : fallback)'],
  ['no passing off', RULES, '    return ahead ? Math.max(piece.x, Math.min(x, ahead.x - (halfLength(ahead, cfg) + halfLength(piece, cfg)))) : x;', '    return x;'],
  ['moving back allowed', RULES, 'ahead ? Math.max(piece.x, Math.min(x, ahead.x - (halfLength(ahead, cfg) + halfLength(piece, cfg)))) : x', 'ahead ? Math.min(x, ahead.x - (halfLength(ahead, cfg) + halfLength(piece, cfg))) : x'],
  ['a log at the edge no longer limiting', RULES, '      if (!piece.spot) piece.x = move(piece);\n      ahead = piece;', '      if (!piece.spot) piece.x = move(piece);\n      if (piece.spot || piece.x < W - half) ahead = piece;'],
  ['a lost branch not limiting the one behind', RULES, '      piece.x += piece.speed * f * dt;\n      ahead = piece;', '      piece.x += piece.speed * f * dt;'],
  ['no waiting-cub spot', RULES, "...(motherView(state).waiting > 0 ? [{ kind: 'branch', spot: true, x: W - bh }] : [])", '...[]'],
  ['boarding off', RULES, 'x: log ? log.x : hx, speed: log ? log.speed : state.speed()', 'x: hx, speed: state.speed()'],
  ['the boarded log not recycled', RULES, '    if (log) log.x = -halfLength(log, cfg) - log.speed * currentFactor(state) * LOG_RETURN_DELAY;\n', ''],
  ['no return delay', RULES, ' - log.speed * currentFactor(state) * LOG_RETURN_DELAY;', ';'],
  ['no wait for another cub\'s branch', RULES, "    if (state.pieces.some((p) => p.kind === 'branch' && overlaps(p, hx, bh, cfg))) continue;\n", ''],
  ['the log before the branch at a release', RULES, "p.kind === 'branch' && overlaps(p, hx, bh, cfg))) continue;", "p.kind === 'branch' && overlaps(p, hx, bh, cfg)) && !state.pieces.some((p) => p.kind === 'log' && overlaps(p, hx, bh, cfg))) continue;"],
  ['a log partly over the hole boarded', RULES, '!(Math.abs(log.x - hx) < bh && room)', '!room'],
  ['no room check when boarding', RULES, '      const room = !state.pieces.some(', '      const room = true || !state.pieces.some('],
  ['no log wait limit', RULES, ' && t - cub.logWaitSince < LOG_WAIT_MAX) continue;', ') continue;'],
  ['touching counts as overlapping', RULES, '(halfLength(piece, cfg) + half) < -OVERLAP_EPS', '(halfLength(piece, cfg) + half) < 0'],
  ['no arc for the mother\'s cub', RULES, "      state.arcs.push({ cub: cub.id, mother: true, begin: state.mother.busyUntil, end: state.mother.busyUntil + cfg.arcSeconds });\n", ''],
  ['the mother ignores the cub waiting at the edge', RULES, " || motherView(state).waiting > 0;\n}", ';\n}'],
  ['the head turns at once', RULES, 'want !== prev.value && t - prev.since >= min', 'want !== prev.value'],
  ['the phase ignored', RULES, '(((t + phase) % (play + pause))', '(((t) % (play + pause))'],
  ['BRANCH_LINE off the picture', RULES, 'export const BRANCH_LINE = 0.58;', 'export const BRANCH_LINE = 0.7;'],
  ['the log wait never reset', RULES, '    if (logs.length === 0) cub.logWaitSince = null; // LOG_WAIT_MAX counts from the start of each block by logs\n', ''],
  ['a sound path to no file', RULES, "    dive: 'assets/minigames/badger-rescue/sfx/dive.mp3',", "    dive: 'assets/minigames/badger-rescue/sfx/nope.mp3',"],
  ['two cubs lost on one step', RULES, '    if (state.outcome || piece.x < W - half) continue;', '    if (decided || piece.x < W - half) continue;'],
];
runMutations({ prefix: 'badger-rules-mutate', files, test: 'tests/badgerRules.test.mjs', env: { NO_GIT: '1' }, mutations: MUTATIONS });
