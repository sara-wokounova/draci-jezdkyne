// The beaver sheets without their neighbours' bits (D31): art/minigames/dragon-attack/beaver{n}.png (already cleaned of
// their checkerboard) → public/assets/minigames/dragon-attack/beaver{n}_frames.png, n = 1…7.
//
//   node scripts/cleanBeavers.mjs
//
// The art isn't on the sheet's 6×2 grid (the carried logs cross the cell borders, frame 7's falling log reaches into
// cell 8), so every frame is cut by its own pieces (8-connected blobs of visible pixels, in reading order: PIECES says
// which frame each belongs to) and put into a padded cell of the same grid, at its offset from its old cell's centre.
// Two moves: row 2 (the hit, the log and the run, drawn higher in their cells) comes down onto the walkers' ground,
// and frame 8's lying log goes under frame 7's falling log. Then halved. Every sheet is read and checked before
// anything is written; the outputs are written beside their targets and renamed over them (a rename replaces a link at
// the target instead of writing through it). Fixed paths, no arguments: it can't be pointed into art/.
// Copied from packFrames.mjs (a fix in one belongs in the other): the 8-connected blobs, the reading order, median and
// the premultiplied box-filter downscale.
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const COLUMNS = 6;
const ROWS = 2;
const PIECES = [0, 1, 2, 3, 4, 5, 6, 7, 7, 8, 9, 10, 11]; // frame 7 = the beaver + its falling log
const PAD = 100; // source px added on each side of every cell (the logs stick out)
const FACTOR = 2;
const SHEETS = 7;
const ART = fileURLToPath(new URL('../art/minigames/dragon-attack/', import.meta.url));
const OUT = fileURLToPath(new URL('../public/assets/minigames/dragon-attack/', import.meta.url));

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length / 2;
  return Number.isInteger(mid) ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[Math.floor(mid)];
};

// One sheet → its new full-size grid (RGBA) and what was done, or a thrown error naming the problem.
function regrid(n) {
  const file = `${ART}beaver${n}.png`;
  const { width: w, height: h, data } = PNG.sync.read(readFileSync(file));
  const cw = w / COLUMNS;
  const ch = h / ROWS;

  // 1) Pieces in reading order: rows by vertical overlap, then left to right.
  const label = new Int32Array(w * h).fill(-1);
  const pieces = [];
  for (let s = 0; s < w * h; s += 1) {
    if (label[s] !== -1 || data[s * 4 + 3] === 0) continue;
    const members = [s];
    label[s] = pieces.length;
    let x0 = w;
    let x1 = 0;
    let y0 = h;
    let y1 = 0;
    for (let i = 0; i < members.length; i += 1) {
      const p = members[i];
      const x = p % w;
      const y = (p - x) / w;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const qx = x + dx;
          const qy = y + dy;
          if (qx < 0 || qy < 0 || qx >= w || qy >= h) continue;
          const q = qy * w + qx;
          if (label[q] === -1 && data[q * 4 + 3] > 0) {
            label[q] = pieces.length;
            members.push(q);
          }
        }
      }
    }
    pieces.push({ members, x0, x1, y0, y1 });
  }
  const rows = [];
  for (const piece of [...pieces].sort((a, b) => (a.y0 + a.y1) - (b.y0 + b.y1))) {
    const row = rows.at(-1);
    if (row && Math.min(row[0].y1, piece.y1) - Math.max(row[0].y0, piece.y0) > 0.5 * (piece.y1 - piece.y0)) row.push(piece);
    else rows.push([piece]);
  }
  const ordered = rows.flatMap((row) => row.sort((a, b) => a.x0 - b.x0));
  if (ordered.length !== PIECES.length) {
    throw new Error(`beaver${n}.png has ${ordered.length} pieces, not ${PIECES.length}: check the art by eye and update PIECES`);
  }
  ordered.forEach((piece, i) => {
    piece.frame = PIECES[i];
    piece.column = piece.frame % COLUMNS;
    piece.row = Math.floor(piece.frame / COLUMNS);
  });

  // 2) Row 2 onto the walkers' ground: a frame's bottom is its lowest pixel with alpha > 128, relative to its cell.
  const bottom = (frame) => {
    let lowest = -Infinity;
    for (const piece of ordered.filter((p) => p.frame === frame)) {
      for (const p of piece.members) if (data[p * 4 + 3] > 128) lowest = Math.max(lowest, Math.floor(p / w));
    }
    return lowest - Math.floor(frame / COLUMNS) * ch;
  };
  const lift = Math.round(median([0, 1, 2, 3, 4, 5].map(bottom)) - median([6, 7, 9, 10, 11].map(bottom)));
  // Frame 8's lying log under frame 7's falling log (the smaller of frame 7's pieces), box centres relative to the cells.
  const boxCentre = (piece) => (piece.x0 + piece.x1) / 2 - (piece.column * cw + cw / 2);
  const falling = ordered.filter((p) => p.frame === 7).sort((a, b) => a.members.length - b.members.length)[0];
  const lying = ordered.find((p) => p.frame === 8);
  const logShift = Math.round(boxCentre(falling) - boxCentre(lying));

  // 3) Into the padded grid, each piece at its offset from its old cell's centre (+ the moves).
  const nw = Math.ceil(cw) + 2 * PAD;
  const nh = Math.ceil(ch / FACTOR) * FACTOR;
  const out = Buffer.alloc(nw * COLUMNS * nh * ROWS * 4);
  let need = 0;
  for (const piece of ordered) {
    const dx = Math.round(piece.column * nw + nw / 2 - (piece.column * cw + cw / 2)) + (piece.frame === 8 ? logShift : 0);
    const dy = Math.round(piece.row * nh + nh / 2 - (piece.row * ch + ch / 2)) + (piece.row === 1 ? lift : 0);
    const left = piece.column * nw;
    const top = piece.row * nh;
    // The pad it would need: how far the piece reaches past the unpadded cell on either side.
    const own = Math.max(left + PAD - (piece.x0 + dx), piece.x1 + dx + 1 - (left + nw - PAD));
    need = Math.max(need, own);
    if (piece.x0 + dx < left || piece.x1 + dx >= left + nw || piece.y0 + dy < top || piece.y1 + dy >= top + nh) {
      throw new Error(`beaver${n}.png frame ${piece.frame} doesn't fit its cell at PAD ${PAD} (it needs ${Math.max(0, Math.ceil(own))} sideways, `
        + `rows ${piece.y0 + dy - top}…${piece.y1 + dy - top} of ${nh})`);
    }
    for (const p of piece.members) {
      const x = p % w;
      const y = (p - x) / w;
      data.copy(out, ((y + dy) * nw * COLUMNS + x + dx) * 4, p * 4, p * 4 + 4);
    }
  }
  return { n, width: nw * COLUMNS, height: nh * ROWS, data: out, need: Math.ceil(need), lift };
}

// 4) Box-filter downscale in premultiplied space (no dark fringes), then un-premultiply (as packFrames.mjs).
function halve({ width, height, data }) {
  const outW = width / FACTOR;
  const outH = height / FACTOR;
  const png = new PNG({ width: outW, height: outH });
  for (let y = 0; y < outH; y += 1) {
    for (let x = 0; x < outW; x += 1) {
      const sum = [0, 0, 0, 0];
      for (let j = 0; j < FACTOR; j += 1) {
        for (let i = 0; i < FACTOR; i += 1) {
          const o = ((y * FACTOR + j) * width + x * FACTOR + i) * 4;
          const a = data[o + 3] / 255;
          for (let c = 0; c < 3; c += 1) sum[c] += data[o + c] * a;
          sum[3] += data[o + 3];
        }
      }
      const n = FACTOR * FACTOR;
      const a = sum[3] / n;
      const o = (y * outW + x) * 4;
      for (let c = 0; c < 3; c += 1) png.data[o + c] = a > 0 ? Math.round(Math.min(255, sum[c] / n / (a / 255))) : 0;
      png.data[o + 3] = Math.round(a);
    }
  }
  return png;
}

const sheets = [];
for (let n = 1; n <= SHEETS; n += 1) {
  try {
    sheets.push(regrid(n));
  } catch (error) {
    console.error(`cleanBeavers: ${error.message}. Nothing written.`);
    process.exit(1);
  }
}
const pngs = sheets.map(halve);
sheets.forEach((sheet, i) => writeFileSync(`${OUT}beaver${sheet.n}_frames.png.tmp`, PNG.sync.write(pngs[i])));
sheets.forEach((sheet, i) => {
  renameSync(`${OUT}beaver${sheet.n}_frames.png.tmp`, `${OUT}beaver${sheet.n}_frames.png`);
  console.log(`beaver${sheet.n}_frames.png ${pngs[i].width}×${pngs[i].height}, needed pad ${sheet.need}, lift ${sheet.lift}`);
});
