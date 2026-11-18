// The wisent song's sound effects (D46, a copy of D45's tests/badgerSfx.test.mjs), run by hand (needs ffmpeg and bash;
// not in npm test): every sound DEFAULTS.sounds names is mono, 96 kbps, ≤ 20 KB, at most its target length, RMS −14 dBFS
// (down to −18: the limiter takes a peaky clip lower, D29), peak ≤ −0.5 dBFS, and rebuilt byte for byte by
// scripts/build-zubr-sfx.sh on a scratch copy. No music plays in the round (nothing to add up with). Sounds still null (Sára hasn't picked) are listed and
// skipped.
//   node tests/zubrSfx.test.mjs   (the scratch copy in the system temp folder, or STORY_TEST_TMP)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url)).replaceAll('\\', '/').replace(/\/$/, '');
const R = await import(pathToFileURL(`${root}/src/engine/minigames/zubrRules.js`).href);
// Numbers read as text (sfx.js imports Howler; the script is bash): a format this can't read stops it, saying where.
const grab = (file, re) => {
  const m = fs.readFileSync(`${root}/${file}`, 'utf8').match(re);
  if (!m) throw new Error(`${file}: no match for ${re} (its format changed: update tests/zubrSfx.test.mjs)`);
  return m;
};
const LEN = Object.fromEntries([...grab('scripts/build-zubr-sfx.sh', /declare -A LEN=\(([^)]*)\)/)[1].matchAll(/\[(\w+)\]=([\d.]+)/g)].map((m) => [m[1], Number(m[2])]));

let failures = 0;
const t = (name, fn) => {
  try {
    fn();
    console.log(`ok   ${name}`);
  } catch (error) {
    failures += 1;
    console.log(`FAIL ${name}\n     ${error.message}`);
  }
};
/** ffmpeg's report (its stderr) for a run that writes nothing. */
const ffErr = (args) => spawnSync('ffmpeg', ['-hide_banner', '-nostats', ...args], { encoding: 'utf8' }).stderr;
const probe = (file) => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=channels,bit_rate:format=duration', '-of', 'json', file], { encoding: 'utf8' }));

const picked = Object.entries(R.DEFAULTS.sounds).filter(([, src]) => src !== null);
const unpicked = Object.keys(R.DEFAULTS.sounds).filter((name) => R.DEFAULTS.sounds[name] === null);
if (unpicked.length) console.log(`note not picked yet (null in DEFAULTS.sounds): ${unpicked.join(', ')}`);
const fileOf = (name) => `${root}/public/${R.DEFAULTS.sounds[name]}`;

for (const [name] of picked) {
  t(`${name}: mono, 96 kbps, ≤ 20 KB, ≤ ${LEN[name]} s, RMS −18 to −12.5 dBFS, peak ≤ −0.5 dBFS`, () => {
    const file = fileOf(name);
    const info = probe(file);
    if (info.streams[0].channels !== 1) throw new Error(`${info.streams[0].channels} channels`);
    if (Math.abs(Number(info.streams[0].bit_rate) - 96000) > 1000) throw new Error(`${info.streams[0].bit_rate} b/s`);
    if (fs.statSync(file).size > 20 * 1024) throw new Error(`${fs.statSync(file).size} bytes`);
    // An mp3 frame of padding at most (1152 samples at 44.1 kHz).
    if (Number(info.format.duration) > LEN[name] + 0.03) throw new Error(`${info.format.duration} s`);
    const stats = ffErr(['-i', file, '-af', 'volumedetect', '-f', 'null', '-']);
    const mean = Number(stats.match(/mean_volume: (-?[\d.]+)/)[1]);
    const peak = Number(stats.match(/max_volume: (-?[\d.]+)/)[1]);
    if (mean > -12.5 || mean < -18) throw new Error(`RMS ${mean} dBFS`);
    if (peak > -0.5) throw new Error(`peak ${peak} dBFS`);
  });
}
if (unpicked.length === 0) {
  t('rebuilt byte for byte by scripts/build-zubr-sfx.sh (on a scratch copy)', () => {
    // Never inside the project: checked on the path as given, then on the real paths (links and junctions resolved).
    const inside = (from, to) => {
      const rel = path.relative(from, to);
      return rel === '' || (!path.isAbsolute(rel) && rel.split(/[\\/]/)[0] !== '..');
    };
    const base = path.resolve(process.env.STORY_TEST_TMP ?? os.tmpdir());
    if (inside(path.resolve(root), base)) throw new Error(`the scratch copy must not go inside the project (${base})`);
    fs.mkdirSync(base, { recursive: true });
    if (inside(fs.realpathSync.native(root), fs.realpathSync.native(base))) throw new Error(`the scratch copy must not go inside the project (${base})`);
    const scratch = fs.mkdtempSync(path.join(base, 'zubr-sfx-'));
    try {
      fs.mkdirSync(`${scratch}/scripts`);
      fs.copyFileSync(`${root}/scripts/build-zubr-sfx.sh`, `${scratch}/scripts/build-zubr-sfx.sh`);
      fs.cpSync(`${root}/art/minigames/zubr/sfx/variants`, `${scratch}/art/minigames/zubr/sfx/variants`, { recursive: true });
      execFileSync('bash', [`${scratch}/scripts/build-zubr-sfx.sh`.replaceAll('\\', '/')], { stdio: 'pipe' });
      const differ = Object.keys(R.DEFAULTS.sounds).filter((name) => !fs.readFileSync(`${scratch}/public/${R.DEFAULTS.sounds[name]}`)
        .equals(fs.readFileSync(fileOf(name))));
      if (differ.length) throw new Error(`differ: ${differ.join(', ')} (re-run the script with ffmpeg 8.1 and commit its output)`);
    } finally {
      fs.rmSync(scratch, { recursive: true, force: true });
    }
  });
}

process.exit(failures ? 1 : 0);
