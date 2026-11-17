// scripts/cropBadgerSprites.mjs never writes into art/ (D23, D42): on a fake repo whose output folder is a link into
// art/, it refuses before writing anything; with an ordinary output folder it gets past that check. No ffmpeg needed
// (the refusal comes first; the control stops at its missing sources). The fake repo lives in the system temp folder,
// or STORY_TEST_TMP (as for story-history.test.mjs; never inside the project).
//   node tests/cropBadgerSprites.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const base = path.resolve(process.env.STORY_TEST_TMP ?? os.tmpdir());
// Never inside the project: checked on the path as given before anything is made, then on the real paths.
const isInside = (from, to) => {
  const rel = path.relative(from, to);
  return rel === '' || (!path.isAbsolute(rel) && rel.split(/[\\/]/)[0] !== '..');
};
if (isInside(REPO, base)) {
  console.log(`FAIL the temp folder is inside the project: ${base}`);
  process.exit(1);
}
fs.mkdirSync(base, { recursive: true });
const realBase = fs.realpathSync.native(base);
if (isInside(fs.realpathSync.native(REPO), realBase)) {
  console.log(`FAIL the temp folder is inside the project: ${realBase}`);
  process.exit(1);
}
const fake = fs.mkdtempSync(path.join(realBase, 'crop-guard-'));
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
function setUp(outIsLink) {
  fs.rmSync(path.join(fake, 'r'), { recursive: true, force: true });
  const root = path.join(fake, 'r');
  fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
  fs.copyFileSync(path.join(REPO, 'scripts/cropBadgerSprites.mjs'), path.join(root, 'scripts/cropBadgerSprites.mjs'));
  fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(root, 'node_modules'), 'junction');
  const art = path.join(root, 'art/minigames/badger-rescue');
  fs.mkdirSync(art, { recursive: true });
  fs.writeFileSync(path.join(art, 'log.png'), 'the original');
  fs.mkdirSync(path.join(root, 'public/assets/minigames'), { recursive: true });
  if (outIsLink) fs.symlinkSync(art, path.join(root, 'public/assets/minigames/badger-rescue'), 'junction');
  const run = spawnSync(process.execPath, [path.join(root, 'scripts/cropBadgerSprites.mjs')], { encoding: 'utf8' });
  return { run, art };
}
try {
  t('an output folder linked into art/: refused, nothing written there', () => {
    const { run, art } = setUp(true);
    assert.notEqual(run.status, 0);
    assert.match(run.stderr, /refusing to write into art\//);
    assert.deepEqual(fs.readdirSync(art), ['log.png']);
    assert.equal(fs.readFileSync(path.join(art, 'log.png'), 'utf8'), 'the original');
  });
  t('an ordinary output folder: past the check (it stops later, at the missing sources)', () => {
    const { run } = setUp(false);
    assert.doesNotMatch(run.stderr, /refusing/);
    assert.match(run.stderr, /ENOENT/);
  });
} finally {
  fs.rmSync(fake, { recursive: true, force: true }); // the links are removed, not their targets
}
process.exit(failures ? 1 : 0);
