// Every pose of a creature on one canvas (D37): `scale` sizes the whole texture, so a creature's poses must share one
// canvas size with the body at one pixel scale and the feet on the bottom edge, or it changes size between lines. Each
// pose's original in art/characters/<id>/<id>_<pose>.png is cropped to its alpha > 10 box (+4 px except the bottom),
// lined up on its alpha mass's centre (not its box's: a tail or a raised arm would shift the body) and bottom-aligned;
// the canvas is max(left of mass) + max(right of mass) (+4 px a side) wide and the tallest crop's height; then one factor
// per character scales every pose to fit 1536×1536 (ffmpeg lanczos, rgba) into public/assets/characters/<id>/. art/ is
// only read. A new pose of a creature: put its original in art/, then re-run for that creature (all its poses together).
//   node scripts/reexportCreatures.mjs <id> [<id>…]      e.g. node scripts/reexportCreatures.mjs jezevec zubr
// Its scratch files go to the system temp folder (TEMP / TMP on Windows: TEMP=C:/tmp/claude node scripts/… for the
// project's temp-folder rule); removed after.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const repo = fileURLToPath(new URL('..', import.meta.url));
const ids = process.argv.slice(2);
if (ids.length === 0 || ids.some((id) => !/^[a-z_]+$/.test(id))) {
  console.error('usage: node scripts/reexportCreatures.mjs <creature id> [<creature id>…]');
  process.exit(1);
}
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'creatures-'));
// art/ holds the only originals: never write there, also not through a link (D23, D30, D31's rule). The output folder is
// resolved to its real path (its nearest existing folder before it is made) and refused inside art/; ffmpeg writes into
// this script's own temp folder and the target is removed before the copy, so a link (or a hard-linked file) at the
// target is replaced, not written through.
const artDir = fs.realpathSync.native(path.join(repo, 'art')).toLowerCase();
const insideArt = (dir) => {
  let existing = dir;
  while (!fs.existsSync(existing)) existing = path.dirname(existing);
  const real = fs.realpathSync.native(existing).toLowerCase();
  if (real.startsWith('\\\\') && !artDir.startsWith('\\\\')) return true; // a UNC path can name art/ another way (D30)
  const rel = path.relative(artDir, real);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
};

try {
  for (const id of ids) {
    const sourceDir = path.join(repo, 'art', 'characters', id);
    const poses = fs.readdirSync(sourceDir).filter((file) => file.startsWith(`${id}_`) && file.endsWith('.png'))
        .map((file) => file.slice(id.length + 1, -4));
    if (poses.length === 0) throw new Error(`no poses in ${sourceDir}`);
    const crops = poses.map((pose) => {
      const png = PNG.sync.read(fs.readFileSync(path.join(sourceDir, `${id}_${pose}.png`)));
      let minX = png.width, minY = png.height, maxX = -1, maxY = -1, mass = 0, massX = 0;
      for (let y = 0; y < png.height; y += 1) {
        for (let x = 0; x < png.width; x += 1) {
          const a = png.data[(y * png.width + x) * 4 + 3];
          if (a <= 10) continue;
          minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
          mass += a; massX += a * x;
        }
      }
      if (mass === 0) throw new Error(`${id}_${pose}: no opaque pixels`);
      const left = Math.max(0, minX - 4), right = Math.min(png.width - 1, maxX + 4), top = Math.max(0, minY - 4);
      return { pose, png, left, right, top, bottom: maxY, center: massX / mass };
    });
    const leftOfMass = Math.max(...crops.map((c) => Math.ceil(c.center - c.left)));
    const rightOfMass = Math.max(...crops.map((c) => Math.ceil(c.right - c.center)));
    const width = leftOfMass + rightOfMass + 8;
    const height = Math.max(...crops.map((c) => c.bottom - c.top + 1));
    const factor = Math.min(1536 / width, 1536 / height);
    const outW = Math.round(width * factor), outH = Math.round(height * factor);
    const outDir = path.join(repo, 'public', 'assets', 'characters', id);
    if (insideArt(outDir)) throw new Error(`${outDir} leads into art/ (a link?): refusing to write there`);
    fs.mkdirSync(outDir, { recursive: true });
    if (insideArt(outDir)) throw new Error(`${outDir} leads into art/ (a link?): refusing to write there`);
    for (const c of crops) {
      const canvas = new PNG({ width, height });
      const dx = Math.round(4 + leftOfMass - (c.center - c.left)) - c.left; // source x → canvas x
      const dy = height - 1 - c.bottom; // feet on the bottom edge
      for (let y = c.top; y <= c.bottom; y += 1) {
        for (let x = c.left; x <= c.right; x += 1) {
          const cx = x + dx, cy = y + dy;
          if (cx < 0 || cx >= width || cy < 0 || cy >= height) continue;
          c.png.data.copy(canvas.data, (cy * width + cx) * 4, (y * c.png.width + x) * 4, (y * c.png.width + x) * 4 + 4);
        }
      }
      const raw = path.join(tmp, `${id}_${c.pose}.png`);
      fs.writeFileSync(raw, PNG.sync.write(canvas));
      const out = path.join(outDir, `${id}_${c.pose}.png`);
      const scaled = path.join(tmp, `${id}_${c.pose}.scaled.png`);
      execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', raw, '-vf', `scale=${outW}:${outH}:flags=lanczos`, '-pix_fmt', 'rgba', scaled]);
      fs.rmSync(out, { force: true }); // a link or hard link at the target goes, the target in art/ stays untouched
      fs.copyFileSync(scaled, out, fs.constants.COPYFILE_EXCL);
      console.log(`${id}_${c.pose}: crop ${c.right - c.left + 1}×${c.bottom - c.top + 1}, canvas ${width}×${height} → ${outW}×${outH}`);
    }
  }
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
