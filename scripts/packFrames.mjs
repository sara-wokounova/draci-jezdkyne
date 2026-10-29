// Packs a cleaned sprite sheet (run removeCheckerboard.mjs first) whose frames are scattered
// or misaligned into a one-row strip the game can slice evenly: every frame cut out by its own
// pixels (so a neighbour's flame or hair never leaks in), placed in an equal cell with its anchor
// at the same spot, then downscaled.
//
//   node scripts/packFrames.mjs <in.png> <out.png> <anchors.json|bright> [factor]
//
// Anchor = the point that stays put from frame to frame: `anchors.json` lists one [x, y] per
// frame in source px, in reading order (for a dragon: its eye, measured by hand, because the
// flapping wings move any automatic centre), or `bright` = centre of the white-hot pixels (a
// fireball's head). Frames are found as blobs of at least 1500 px, in reading order; smaller
// blobs (embers) join the nearest frame.
// Prints the strip's frame count, frame size and anchor for the game's config.
import { existsSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const [input, output, mode, factorArg = '2'] = process.argv.slice(2);
const factor = Number(factorArg);
if (!mode || !Number.isInteger(factor) || factor < 1 || factor > 8) {
  console.error('usage: node scripts/packFrames.mjs <in.png> <out.png> <anchors.json|bright> [factor: integer 1–8]');
  process.exit(1);
}
// The real path (links resolved), case-insensitive on Windows, where the file system is.
const real = (p) => {
  let path;
  try {
    path = realpathSync.native(p);
  } catch { // the output may not exist yet: resolve its folder (a junction there counts too)
    path = join(realpathSync.native(dirname(resolve(p))), basename(p));
  }
  return process.platform === 'win32' ? path.toLowerCase() : path;
};
// A hard link to an original would be written through: refuse an output that has other names.
const hardLinked = (p) => existsSync(p) && statSync(p).nlink > 1;
// art/ holds the untouched originals and their hand-measured anchors: never written.
const ART = real(fileURLToPath(new URL('../art/', import.meta.url))) + sep;
if (real(output) === real(input) || real(output) === real(mode) || real(output).startsWith(ART)
  || !/\.png$/i.test(output) || hardLinked(output)) {
  console.error('packFrames: <out.png> must be a new .png outside art/ (not the input or the anchors file)');
  process.exit(1);
}
const MIN_FRAME_AREA = 1500;
const PAD = 4;
const VISIBLE_ALPHA = 40; // a pixel belongs to a blob above this alpha
const EMBER_REACH = 80; // a small blob joins the nearest frame within this many source px
const HOT_ALPHA = 200; // `bright` anchors: the centroid of nearly opaque…
const HOT_LUM = 235; //   …and white-hot pixels

const { width: w, height: h, data } = PNG.sync.read(readFileSync(input));
const alpha = (p) => data[p * 4 + 3];
const lum = (p) => (data[p * 4] + data[p * 4 + 1] + data[p * 4 + 2]) / 3;

// 8-connected blobs of visible pixels.
const label = new Int32Array(w * h).fill(-1);
const blobs = [];
for (let s = 0; s < w * h; s += 1) {
  if (label[s] !== -1 || alpha(s) <= VISIBLE_ALPHA) continue;
  const id = blobs.length;
  const members = [s];
  label[s] = id;
  const box = { x0: w, y0: h, x1: 0, y1: 0 };
  for (let i = 0; i < members.length; i += 1) {
    const p = members[i];
    const x = p % w;
    const y = (p - x) / w;
    box.x0 = Math.min(box.x0, x); box.x1 = Math.max(box.x1, x);
    box.y0 = Math.min(box.y0, y); box.y1 = Math.max(box.y1, y);
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const np = ny * w + nx;
        if (label[np] === -1 && alpha(np) > VISIBLE_ALPHA) {
          label[np] = id;
          members.push(np);
        }
      }
    }
  }
  blobs.push({ id, members, ...box });
}

// Frames in reading order: rows by vertical overlap, left to right within a row.
const frames = blobs.filter((b) => b.members.length >= MIN_FRAME_AREA)
  .sort((a, b) => (a.y0 + a.y1) - (b.y0 + b.y1));
const rows = [];
for (const f of frames) {
  const row = rows.at(-1);
  const overlaps = row && Math.min(row[0].y1, f.y1) - Math.max(row[0].y0, f.y0) > 0.5 * (f.y1 - f.y0);
  if (overlaps) row.push(f); else rows.push([f]);
}
const ordered = rows.flatMap((row) => row.sort((a, b) => a.x0 - b.x0));
if (!ordered.length) {
  throw new Error(`${input}: no frame of ${MIN_FRAME_AREA}+ visible px (run removeCheckerboard.mjs on it first)`);
}

// Embers and other small blobs join the frame whose box is nearest (within 80 px).
const distance = (f, b) => Math.hypot(
  Math.max(f.x0 - b.x1, b.x0 - f.x1, 0), Math.max(f.y0 - b.y1, b.y0 - f.y1, 0));
for (const f of ordered) f.parts = [f];
for (const b of blobs) {
  if (b.members.length >= MIN_FRAME_AREA) continue;
  const nearest = ordered.reduce((best, f) => (distance(f, b) < distance(best, b) ? f : best));
  if (distance(nearest, b) <= EMBER_REACH) nearest.parts.push(b);
}

// Anchor of each frame.
const points = mode === 'bright' ? null : JSON.parse(readFileSync(mode, 'utf8'));
if (mode !== 'bright' && !Array.isArray(points)) {
  throw new Error(`${mode}: expected an array of [x, y] points`);
}
if (points && points.length !== ordered.length) {
  throw new Error(`${mode} has ${points.length} points but ${input} has ${ordered.length} frames`);
}
if (points && !points.every((pt) => Array.isArray(pt) && pt.length === 2 && pt.every(Number.isFinite))) {
  throw new Error(`${mode}: every point must be [x, y] in source px`);
}
ordered.forEach((f, index) => {
  if (points) {
    [f.ax, f.ay] = points[index];
    // A typo (an extra digit) would make the strip gigantic: the point must lie on its frame.
    if (f.ax < f.x0 - PAD || f.ax > f.x1 + PAD || f.ay < f.y0 - PAD || f.ay > f.y1 + PAD) {
      throw new Error(`${mode}: point ${index} [${f.ax}, ${f.ay}] is outside frame ${index} (${f.x0}–${f.x1}, ${f.y0}–${f.y1})`);
    }
  } else {
    let sx = 0;
    let sy = 0;
    let count = 0;
    for (const p of f.members) {
      if (alpha(p) <= HOT_ALPHA || lum(p) <= HOT_LUM) continue;
      sx += p % w;
      sy += Math.floor(p / w);
      count += 1;
    }
    // No white-hot pixels (the fireball's dissipating flame): the centre of its main blob, before
    // the embers widen the box below, so a stray ember can't drag the anchor.
    f.ax = count ? sx / count : (f.x0 + f.x1) / 2;
    f.ay = count ? sy / count : (f.y0 + f.y1) / 2;
  }
  f.x0 = Math.min(...f.parts.map((b) => b.x0)); f.x1 = Math.max(...f.parts.map((b) => b.x1));
  f.y0 = Math.min(...f.parts.map((b) => b.y0)); f.y1 = Math.max(...f.parts.map((b) => b.y1));
});

// Equal cells, anchor at the same spot in each; sizes rounded up to the downscale factor.
const roundUp = (v) => Math.ceil(v / factor) * factor;
const left = Math.ceil(Math.max(...ordered.map((f) => f.ax - f.x0))) + PAD;
const up = Math.ceil(Math.max(...ordered.map((f) => f.ay - f.y0))) + PAD;
const cellW = roundUp(left + Math.ceil(Math.max(...ordered.map((f) => f.x1 - f.ax))) + PAD);
const cellH = roundUp(up + Math.ceil(Math.max(...ordered.map((f) => f.y1 - f.ay))) + PAD);

const strip = new Float32Array(cellW * ordered.length * cellH * 4); // premultiplied RGBA
const stripW = cellW * ordered.length;
ordered.forEach((f, index) => {
  const ids = new Set(f.parts.map((b) => b.id));
  const dx = index * cellW + left - Math.round(f.ax);
  const dy = up - Math.round(f.ay);
  for (let y = Math.max(0, f.y0 - 2); y <= Math.min(h - 1, f.y1 + 2); y += 1) {
    for (let x = Math.max(0, f.x0 - 2); x <= Math.min(w - 1, f.x1 + 2); x += 1) {
      const p = y * w + x;
      // Own blobs, plus the faint edge pixels next to them that no blob claimed.
      if (label[p] === -1 ? alpha(p) === 0 : !ids.has(label[p])) continue;
      const tx = x + dx;
      const ty = y + dy;
      if (tx < index * cellW || tx >= (index + 1) * cellW || ty < 0 || ty >= cellH) continue;
      const a = alpha(p) / 255;
      const o = (ty * stripW + tx) * 4;
      strip[o] = data[p * 4] * a;
      strip[o + 1] = data[p * 4 + 1] * a;
      strip[o + 2] = data[p * 4 + 2] * a;
      strip[o + 3] = alpha(p);
    }
  }
});

// Box-filter downscale in premultiplied space (no dark fringes), then un-premultiply.
const outW = stripW / factor;
const outH = cellH / factor;
const out = new PNG({ width: outW, height: outH });
for (let y = 0; y < outH; y += 1) {
  for (let x = 0; x < outW; x += 1) {
    const sum = [0, 0, 0, 0];
    for (let j = 0; j < factor; j += 1) {
      for (let i = 0; i < factor; i += 1) {
        const o = ((y * factor + j) * stripW + x * factor + i) * 4;
        for (let c = 0; c < 4; c += 1) sum[c] += strip[o + c];
      }
    }
    const n = factor * factor;
    const a = sum[3] / n;
    const o = (y * outW + x) * 4;
    for (let c = 0; c < 3; c += 1) out.data[o + c] = a > 0 ? Math.round(Math.min(255, sum[c] / n / (a / 255))) : 0;
    out.data[o + 3] = Math.round(a);
  }
}
writeFileSync(output, PNG.sync.write(out));

// Each frame's box relative to the anchor, in output px: for sizes and launch points.
const boxes = ordered.map((f) => [f.x0 - f.ax, f.y0 - f.ay, f.x1 - f.ax, f.y1 - f.ay].map((v) => Math.round(v / factor)));
const medianOf = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length / 2;
  return Number.isInteger(mid) ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[Math.floor(mid)];
};
console.log(JSON.stringify({
  output,
  frames: ordered.length,
  frameWidth: cellW / factor,
  frameHeight: cellH / factor,
  anchor: [+(left / cellW).toFixed(3), +(up / cellH).toFixed(3)],
  boxes,
  // The median box width: the dragon's `animation.bodyWidth` (stable while the wings flap).
  medianWidth: medianOf(boxes.map(([x0, , x1]) => x1 - x0)),
}));
