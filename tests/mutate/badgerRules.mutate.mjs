// Fail-before for tests/badgerRules.test.mjs (D42): breaks one rule at a time in a copy of the files it needs and runs
// the test there; every mutation must make it fail (a control run without a mutation must pass).
//   node tests/mutate/badgerRules.mutate.mjs [part of a mutation name]
// The copy lives in the system temp folder, or MUTATE_TMP (never inside the project; its node_modules is a link to the
// project's). On Windows in Git Bash: MUTATE_TMP=C:/tmp/claude/mutate node tests/mutate/badgerRules.mutate.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const REPO = path.resolve(fileURLToPath(new URL('../..', import.meta.url))).replaceAll('\\', '/');
// The copy is deleted again and again: never inside the project. Checked on the path as given before anything is
// created, then on the real paths (links, junctions and short names resolved) before anything is copied or deleted.
const isInside = (from, to) => {
  const rel = path.relative(from, to);
  return rel === '' || (!path.isAbsolute(rel) && rel.split(/[\\/]/)[0] !== '..');
};
const refuse = (where) => {
  console.log(`refusing to put the copy inside the project: ${where}`);
  process.exit(1);
};
const BASE = path.resolve(process.env.MUTATE_TMP ?? os.tmpdir());
if (isInside(REPO, BASE)) refuse(BASE);
fs.mkdirSync(BASE, { recursive: true });
const realBase = fs.realpathSync.native(BASE);
if (isInside(fs.realpathSync.native(REPO), realBase)) refuse(realBase);
// A folder of its own (never one that happens to be there already), removed again at the end.
const COPY = fs.mkdtempSync(path.join(realBase, 'badger-rules-mutate-')).replaceAll('\\', '/');
const files = ['src/engine/minigames/badgerRules.js', 'src/engine/minigames/configRules.js', 'src/engine/minigames/dragonAttack.js',
  'tests/badgerRules.test.mjs', 'public/assets/backgrounds/badger_flood.png',
  'public/assets/minigames/dragon-attack/roza_fly.png', 'public/assets/minigames/dragon-attack/emma_fly.png',
  'public/assets/minigames/dragon-attack/anna_fly.png'];
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
  ['the current too fast on Těžká', RULES, 'currentSpeed: { easy: 45, normal: 60, hard: 80 }', 'currentSpeed: { easy: 45, normal: 60, hard: 200 }'],
  ['the result does not wait for the arcs', RULES, 'state.endAt = Math.max(arcsEnd, state.mother.busyUntil);', 'state.endAt = state.t;'],
  ['no bump cooldown', RULES, "d.lastResult === 'bump' ? cfg.dive.bumpCooldown", "d.lastResult === 'bump' ? 0"],
  ['a bodyWidth the reader cannot see', DRAGON, 'bodyWidth: 194,', 'bodyWidth: 97 * 2,'],
  ['a catchPoint off the claws', RULES, 'catchPoint: [-104, 97]', 'catchPoint: [-104, 80]'],
  ['an event without its sound', RULES, "mother: 'mother', lost: 'lost' }", "mother: 'mother' }"],
  ['a JSON __proto__ key merged', 'src/engine/minigames/configRules.js', "      if (key === '__proto__') continue;", ''],
  ['the branches freeze after the decision', RULES, '    if (piece.held && diving) continue;', '    if (decided || (piece.held && diving)) continue;'],
  ['the water rises on after the decision', RULES, 'state.outcome ? Math.min(state.t, state.decidedAt) : state.t', 'state.t'],
  ['a cub on its way counts as back', RULES, '    back: queue.length - onTheWay,', '    back: queue.length,'],
  ['her saves shown before she is back', RULES, '    savesShown: saves + onTheWay,', '    savesShown: saves,'],
  ['the HUD counts a cub still on its way', RULES, '    score: `${state.safe - mother.onTheWay} z', '    score: `${state.safe} z'],
  ['the HUD keeps her saves after a loss', RULES, "state.outcome === 'failure' ? 0 : mother.savesShown", 'mother.savesShown'],
  ['two cubs lost on one step', RULES, '    if (state.outcome || piece.x < W - half) continue;', '    if (decided || piece.x < W - half) continue;'],
  ['the lost cub vanishes at once', RULES, '      piece.lost = true;\n', '      state.pieces.splice(state.pieces.indexOf(piece), 1);\n'],
  ['the lost cub doesn\'t end the round', RULES, "      decide(state, 'failure', Math.min(LOST_MAX_SECONDS, Math.max(LOST_SECONDS, (2 * half) / piece.speed + LOST_MARGIN)));\n", ''],
];
const only = process.argv[2];
let missed = 0;
const control = () => {
  fs.rmSync(COPY, { recursive: true, force: true });
  for (const f of files) {
    fs.mkdirSync(`${COPY}/${f.replace(/\/[^/]+$/, '')}`, { recursive: true });
    fs.copyFileSync(`${REPO}/${f}`, `${COPY}/${f}`);
  }
  fs.symlinkSync(`${REPO}/node_modules`, `${COPY}/node_modules`, 'junction');
};
let lastOutput = '';
const run = () => {
  try {
    // A run takes about a second; a mutation that hangs the test counts as caught (it doesn't pass) after 5 minutes.
    execFileSync(process.execPath, [`${COPY}/tests/badgerRules.test.mjs`, COPY],
      { env: { ...process.env, NO_GIT: '1' }, stdio: 'pipe', timeout: 5 * 60 * 1000 });
    return true;
  } catch (error) {
    lastOutput = `${error.code === 'ETIMEDOUT' ? 'TIMED OUT\n' : ''}${error.stdout ?? ''}${error.stderr ?? ''}`;
    return false;
  }
};
try {
  control();
  if (!run()) {
    // A module the test needs and the copy lacks (the files list above) shows up here.
    console.log(`CONTROL FAILED (the test fails on the unchanged copy):\n${lastOutput}`);
    missed = 1;
  } else {
    console.log('control passes');
    for (const [name, file, from, to] of MUTATIONS) {
      if (only && !name.includes(only)) continue;
      control();
      const text = fs.readFileSync(`${COPY}/${file}`, 'utf8').replaceAll('\r\n', '\n');
      if (!text.includes(from)) { console.log(`ANCHOR ${name}`); missed += 1; continue; }
      fs.writeFileSync(`${COPY}/${file}`, text.replace(from, to));
      const passed = run();
      console.log(`${passed ? 'MISSED' : 'caught'} ${name}`);
      if (passed) missed += 1;
    }
  }
} finally {
  fs.rmSync(COPY, { recursive: true, force: true }); // with its link to node_modules (rmSync removes the link, not its target)
}
process.exit(missed ? 1 : 0);
