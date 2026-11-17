// The badger rescue's sound effects (D45), run by hand (needs ffmpeg and bash; not in npm test): every sound
// DEFAULTS.sounds names is mono, 96 kbps, ≤ 20 KB, at most its target length, RMS −14 dBFS (down to −18: the limiter
// takes a peaky clip lower, D29), peak ≤ −0.5 dBFS, and rebuilt byte for byte by scripts/build-badger-sfx.sh on a scratch copy; the dives' stacks through
// the effects' limiter (printed, as D32's for Emma); the headroom of the limiter's ceiling + zachrana.mp3 at the default
// music volume (asserted ≤ −0.15 dBFS). Sounds still null (Sára hasn't picked) are listed and skipped.
//   node tests/badgerSfx.test.mjs   (the scratch copy in the system temp folder, or STORY_TEST_TMP)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url)).replaceAll('\\', '/').replace(/\/$/, '');
const R = await import(pathToFileURL(`${root}/src/engine/minigames/badgerRules.js`).href);
// Numbers read as text (sfx.js imports Howler; the script is bash): a format this can't read stops it, saying where.
const grab = (file, re) => {
  const m = fs.readFileSync(`${root}/${file}`, 'utf8').match(re);
  if (!m) throw new Error(`${file}: no match for ${re} (its format changed: update tests/badgerSfx.test.mjs)`);
  return m;
};
const KNEE = Number(grab('src/engine/sfx.js', /SOFT_CLIP_KNEE = ([\d.]+)/)[1]);
const CEILING = Number(grab('src/engine/sfx.js', /SOFT_CLIP_CEILING = ([\d.]+)/)[1]);
const MIX = Number(grab('src/engine/sfx.js', /EFFECT_MIX = ([\d.]+)/)[1]);
const MUSIC = Number(grab('src/engine/autoSave.js', /musicVolume: ([\d.]+)/)[1]); // the defaults (DEFAULT_SETTINGS)
const EFFECTS = Number(grab('src/engine/autoSave.js', /effectsVolume: ([\d.]+)/)[1]);
const LEN = Object.fromEntries([...grab('scripts/build-badger-sfx.sh', /declare -A LEN=\(([^)]*)\)/)[1].matchAll(/\[(\w+)\]=([\d.]+)/g)].map((m) => [m[1], Number(m[2])]));

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
/** Decoded mono samples at 48 kHz (Float32Array). */
const decode = (file) => {
  const out = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-ac', '1', '-ar', '48000', '-f', 'f32le', '-'], { maxBuffer: 1 << 28 });
  return new Float32Array(out.buffer, out.byteOffset, out.byteLength / 4);
};
const db = (x) => 20 * Math.log10(x);

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
  t('rebuilt byte for byte by scripts/build-badger-sfx.sh (on a scratch copy)', () => {
    // Never inside the project: checked on the path as given, then on the real paths (links and junctions resolved).
    const inside = (from, to) => {
      const rel = path.relative(from, to);
      return rel === '' || (!path.isAbsolute(rel) && rel.split(/[\\/]/)[0] !== '..');
    };
    const base = path.resolve(process.env.STORY_TEST_TMP ?? os.tmpdir());
    if (inside(path.resolve(root), base)) throw new Error(`the scratch copy must not go inside the project (${base})`);
    fs.mkdirSync(base, { recursive: true });
    if (inside(fs.realpathSync.native(root), fs.realpathSync.native(base))) throw new Error(`the scratch copy must not go inside the project (${base})`);
    const scratch = fs.mkdtempSync(path.join(base, 'badger-sfx-'));
    try {
      fs.mkdirSync(`${scratch}/scripts`);
      fs.copyFileSync(`${root}/scripts/build-badger-sfx.sh`, `${scratch}/scripts/build-badger-sfx.sh`);
      fs.cpSync(`${root}/art/minigames/badger-rescue/sfx/variants`, `${scratch}/art/minigames/badger-rescue/sfx/variants`, { recursive: true });
      execFileSync('bash', [`${scratch}/scripts/build-badger-sfx.sh`.replaceAll('\\', '/')], { stdio: 'pipe' });
      const differ = Object.keys(R.DEFAULTS.sounds).filter((name) => !fs.readFileSync(`${scratch}/public/${R.DEFAULTS.sounds[name]}`)
        .equals(fs.readFileSync(fileOf(name))));
      if (differ.length) throw new Error(`differ: ${differ.join(', ')} (re-run the script with ffmpeg 8.1 and commit its output)`);
    } finally {
      fs.rmSync(scratch, { recursive: true, force: true });
    }
  });
}

// The stacks: each sound at EFFECT_MIX × the default effects volume, summed, through the limiter's curve.
const RATE = 48000;
const curve = (x) => (Math.abs(x) <= KNEE ? x : Math.sign(x) * (KNEE + (CEILING - KNEE) * Math.tanh((Math.abs(x) - KNEE) / (CEILING - KNEE))));
function stack(name, parts) {
  if (!parts.every(([sound]) => R.DEFAULTS.sounds[sound] !== null)) return console.log(`skip stack ${name} (a sound not picked yet)`);
  const decoded = Object.fromEntries(parts.map(([sound]) => [sound, decode(fileOf(sound))]));
  const length = Math.max(...parts.map(([sound, at]) => Math.round(at * RATE) + decoded[sound].length));
  const sum = new Float32Array(length);
  for (const [sound, at] of parts) decoded[sound].forEach((v, i) => { sum[Math.round(at * RATE) + i] += v * MIX * EFFECTS; });
  let above = 0;
  let cut = 0;
  let out = 0;
  for (const v of sum) {
    if (Math.abs(v) > KNEE) above += 1;
    if (v !== 0) cut = Math.max(cut, db(Math.abs(v)) - db(Math.abs(curve(v))));
    out = Math.max(out, Math.abs(curve(v)));
  }
  console.log(`info stack ${name}: ${(above / RATE * 1000).toFixed(1)} ms above the knee, cut up to ${cut.toFixed(1)} dB, out ${db(out).toFixed(2)} dBFS`);
  if (out > CEILING + 1e-6) throw new Error(`${name} passes the ceiling`);
}
t('the stacks stay under the limiter\'s ceiling (cut and time above the knee printed)', () => {
  // A good player dives about every 0.7 s (0.35 s down, 0.35 s up, no cooldown after a catch); the catch at the bottom.
  stack('10 catches 0.7 s apart', Array.from({ length: 10 }, (_, i) => [['dive', i * 0.7], ['caught', i * 0.7 + 0.35]]).flat());
  stack('a dive and its bump', [['dive', 0], ['bump', 0.35]]);
  stack('a dive and its splash', [['dive', 0], ['splash', 0.35]]);
  stack('the mother over a catch', [['dive', 0], ['caught', 0.35], ['mother', 0.35]]);
});
t(`the limiter's ceiling + zachrana.mp3's true peak × the music volume (${MUSIC}) ≤ −0.15 dBFS`, () => {
  const stats = ffErr(['-i', `${root}/public/assets/music/zachrana.mp3`, '-af', 'ebur128=peak=true', '-f', 'null', '-']);
  const peakDb = Number([...stats.matchAll(/Peak:\s+(-?[\d.]+) dBFS/g)].at(-1)[1]);
  const total = db(CEILING + 10 ** (peakDb / 20) * MUSIC);
  console.log(`info zachrana true peak ${peakDb} dBFS; ceiling + music ${total.toFixed(2)} dBFS (D31's rule −0.2, accepted at −0.19 in D45)`);
  if (total > -0.15) throw new Error(`${total.toFixed(2)} dBFS: a louder track, or a higher ceiling or music default`);
});
process.exit(failures ? 1 : 0);
