// The badger rescue's sprites (D42): each original cropped to its alpha box (alpha > 8) and scaled with ffmpeg's
// lanczos to its width, RGBA PNG, into public/assets/minigames/badger-rescue/. Reads the Runway originals in
// art/minigames/badger-rescue/ and, for the father, the deployed jezevec_neutral.png. Then the animation frames (D43):
// each a Runway edit of a still's source, lined up on that source by a pinned scale and offset (found in a scratch
// search on a part that doesn't move; the father's at ~0.64: his source is reexportCreatures.mjs's re-export of the
// original, so re-running that script for a new jezevec pose makes his offsets stale), cropped with the still's box
// and scaled to the still's exact size in one ffmpeg step, so a frame swaps for its still without moving. Needs ffmpeg.
//   node scripts/cropBadgerSprites.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const ART = path.join(ROOT, 'art/minigames/badger-rescue');
const OUT = path.join(ROOT, 'public/assets/minigames/badger-rescue');
const JOBS = [ // [source, output, width in px]
  [path.join(ART, 'cub_branch.png'), 'cub_branch.png', 256],
  [path.join(ART, 'cub_peek.png'), 'cub_peek.png', 128],
  [path.join(ART, 'cub_fly.png'), 'cub_fly.png', 160],
  [path.join(ART, 'log.png'), 'log.png', 256],
  [path.join(ART, 'mother_watch.png'), 'mother_watch.png', 320],
  [path.join(ART, 'mother_rest.png'), 'mother_rest.png', 320],
  [path.join(ART, 'boulder.png'), 'boulder.png', 240],
  [path.join(ROOT, 'public/assets/characters/jezevec/jezevec_neutral.png'), 'father.png', 320],
];
// [edit, output, the still it animates (a JOBS output), scale, dx, dy]: still-source px = edit px × scale + (dx, dy).
const FRAMES = [
  [path.join(ART, 'father_paw.png'), 'father2.png', 'father.png', 0.64, -68, 35],
  [path.join(ART, 'father_head.png'), 'father3.png', 'father.png', 0.64, -68, 35],
  [path.join(ART, 'cub_legs.png'), 'cub_branch2.png', 'cub_branch.png', 0.7493, 1, 5],
  [path.join(ART, 'cub_paw.png'), 'cub_branch3.png', 'cub_branch.png', 0.75, 0, 4],
  [path.join(ART, 'mother_tail.png'), 'mother_watch_tail.png', 'mother_watch.png', 0.7493, 0, -1],
  [path.join(ART, 'mother_head.png'), 'mother_watch_head.png', 'mother_watch.png', 0.747, 3, 0],
  [path.join(ART, 'mother_headtail.png'), 'mother_watch_headtail.png', 'mother_watch.png', 0.747, 2, 0],
];

// art/ holds the only originals: never write there, also not through a link (D23, D30, D31; as reexportCreatures.mjs).
// The output folder's real path (its nearest existing folder, before anything is made) is refused inside art/; ffmpeg
// writes into this script's own temp folder and the target is removed before the copy, so a link at the target is
// replaced, not written through.
const artDir = fs.realpathSync.native(path.join(ROOT, 'art')).toLowerCase();
function refuseInsideArt(folder) {
  let existing = folder;
  while (!fs.existsSync(existing)) existing = path.dirname(existing);
  const real = fs.realpathSync.native(existing).toLowerCase();
  const rel = path.relative(artDir, real);
  if ((real.startsWith('\\\\') && !artDir.startsWith('\\\\')) || rel === '' || (!path.isAbsolute(rel) && rel.split(/[\\/]/)[0] !== '..')) { // ('..x' is a folder inside art/)
    console.error(`refusing to write into art/: ${folder} is ${real}`);
    process.exit(1);
  }
}
refuseInsideArt(OUT);
refuseInsideArt(os.tmpdir()); // ffmpeg's folder too (TMP/TEMP can point anywhere)
fs.mkdirSync(OUT, { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'badger-sprites-'));
try {
  const boxes = {};
  for (const [src, name, width] of JOBS) {
    const [x0, y0, x1, y1] = (boxes[name] = alphaBox(src));
    const crop = `crop=${x1 - x0 + 1}:${y1 - y0 + 1}:${x0}:${y0},scale=${width}:-1:flags=lanczos`;
    const temp = path.join(tmp, name);
    execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', src, '-vf', crop, '-pix_fmt', 'rgba', temp]);
    const target = path.join(OUT, name);
    fs.rmSync(target, { force: true });
    fs.copyFileSync(temp, target);
    console.log(name, crop);
  }
  for (const [src, name, still, scale, dx, dy] of FRAMES) {
    // The still's box mapped into the edit (whole pixels: ffmpeg crops whole pixels), then the still's exact size.
    const [x0, y0, x1, y1] = boxes[still];
    const size = PNG.sync.read(fs.readFileSync(path.join(OUT, still)));
    const crop = `crop=${Math.round((x1 - x0 + 1) / scale)}:${Math.round((y1 - y0 + 1) / scale)}:${Math.round((x0 - dx) / scale)}:`
      + `${Math.round((y0 - dy) / scale)},scale=${size.width}:${size.height}:flags=lanczos`;
    const temp = path.join(tmp, name);
    execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', src, '-vf', crop, '-pix_fmt', 'rgba', temp]);
    const target = path.join(OUT, name);
    fs.rmSync(target, { force: true });
    fs.copyFileSync(temp, target);
    console.log(name, crop);
  }
} finally {
  fs.rmSync(tmp, { recursive: true, force: true }); // also after a failure (a missing source, ffmpeg)
}

/** A picture's box of pixels with alpha > 8: [x0, y0, x1, y1]. */
function alphaBox(src) {
  const png = PNG.sync.read(fs.readFileSync(src));
  let [x0, y0, x1, y1] = [png.width, png.height, -1, -1];
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      if (png.data[(y * png.width + x) * 4 + 3] > 8) {
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      }
    }
  }
  if (x1 < 0) throw new Error(`${src}: no visible pixel`);
  return [x0, y0, x1, y1];
}
