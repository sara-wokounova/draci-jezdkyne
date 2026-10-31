// Prints Emma's attack anchors (D32) for art/minigames/dragon-attack/emma_attack.anchors.json: Emma's face is found in
// each frame of emma_attack.png by normalised cross-correlation (NCC) with her face from emma_flight_03.png (its pixels
// with alpha > 200), at the attack's size (03's scale in emma_fly.frames.json × the attack's factor 2: 1.34), and each
// anchor = the face + 03's face-to-eye offset (its eye from the frames list) × that size: where 03's eye sits relative
// to Emma, so she stays still while the dragon's head dips around her.
//
//   node scripts/measureEmmaAnchors.mjs > <tmp>/emma_attack.anchors.json   (then copy it into art/ by hand)
//
// After a re-export of emma_attack.png whose frames moved, update GUESS (Emma's face in each frame, in the sheet's
// px; the search looks within 8 px of it): it stops, printing nothing, when it can't find her face (NCC < 0.6).
// The sprite test's "emma" part imports load, faceTemplate and search to check the strips by the same method.
import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const ART = fileURLToPath(new URL('../art/minigames/dragon-attack/', import.meta.url));
const ATTACK_FACTOR = 2; // emma_attack.png is packed at packFrames.mjs's default factor
const FACE_BOX = [175, 44, 227, 93]; // Emma's face in 03, in its own px…
export const FACE_REF = [201, 68.5]; // …and the point the search reports
const GUESS = [[240, 272.5], [564.5, 272.2], [866.8, 278.8], [1179.5, 276.3], [1497.3, 276.5], [1819.3, 281.5]];
const MIN_NCC = 0.6;

/** A picture's luminance over a grey background (`bg`), for NCC. */
export function load(file, bg = 60) {
  const { width: w, height: h, data } = PNG.sync.read(readFileSync(file));
  const L = new Float32Array(w * h);
  for (let p = 0; p < w * h; p += 1) {
    const a = data[p * 4 + 3] / 255;
    L[p] = ((data[p * 4] + data[p * 4 + 1] + data[p * 4 + 2]) / 3) * a + bg * (1 - a);
  }
  return { w, h, L, data };
}

/** Bilinear luminance at (x, y); the background outside the picture. */
function sample(img, x, y, bg = 60) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  if (x0 < 0 || y0 < 0 || x0 + 1 >= img.w || y0 + 1 >= img.h) return bg;
  const fx = x - x0;
  const fy = y - y0;
  const at = (dx, dy) => img.L[(y0 + dy) * img.w + x0 + dx];
  return at(0, 0) * (1 - fx) * (1 - fy) + at(1, 0) * fx * (1 - fy) + at(0, 1) * (1 - fx) * fy + at(1, 1) * fx * fy;
}

/** A template: the box's pixels with alpha > 200, as [dx, dy, luminance] from the reference point. */
export function faceTemplate(img, box = FACE_BOX, ref = FACE_REF) {
  const points = [];
  for (let y = box[1]; y <= box[3]; y += 1) {
    for (let x = box[0]; x <= box[2]; x += 1) {
      if (img.data[(y * img.w + x) * 4 + 3] > 200) points.push([x - ref[0], y - ref[1], img.L[y * img.w + x]]);
    }
  }
  const mean = points.reduce((sum, p) => sum + p[2], 0) / points.length;
  return { points, mean, spread: Math.sqrt(points.reduce((sum, p) => sum + (p[2] - mean) ** 2, 0)) };
}

/** The template's NCC with the picture, its reference point at (cx, cy), scaled by s. */
function ncc(img, tpl, cx, cy, s) {
  const values = tpl.points.map(([dx, dy]) => sample(img, cx + dx * s, cy + dy * s));
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  let cross = 0;
  let spread = 0;
  values.forEach((v, i) => {
    cross += (tpl.points[i][2] - tpl.mean) * (v - mean);
    spread += (v - mean) ** 2;
  });
  return cross / (tpl.spread * Math.sqrt(spread) + 1e-9);
}

/** The best match within r px of (gx, gy) at scales s0…s1: coarse (2 px, ×1.02), then fine (0.25 px, ×1.004). */
export function search(img, tpl, gx, gy, r, s0, s1) {
  let best = { v: -2 };
  for (let s = s0; s <= s1 * 1.0001; s *= 1.02) {
    for (let y = gy - r; y <= gy + r; y += 2) {
      for (let x = gx - r; x <= gx + r; x += 2) {
        const v = ncc(img, tpl, x, y, s);
        if (v > best.v) best = { v, x, y, s };
      }
    }
  }
  const lo = s0 === s1 ? s0 : best.s / 1.02;
  const hi = s0 === s1 ? s1 : best.s * 1.02;
  for (let s = lo; s <= hi * 1.0001; s *= 1.004) {
    for (let y = best.y - 2; y <= best.y + 2; y += 0.25) {
      for (let x = best.x - 2; x <= best.x + 2; x += 0.25) {
        const v = ncc(img, tpl, x, y, s);
        if (v > best.v) best = { v, x, y, s };
      }
    }
  }
  return { ncc: best.v, x: best.x, y: best.y, s: best.s };
}

// Run as a script (also through a junction or another spelling of the path), not imported by the sprite test.
const same = (a, b) => (process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b);
if (process.argv[1] && same(realpathSync(process.argv[1]), realpathSync(fileURLToPath(import.meta.url)))) {
  // 03's eye and scale from the frames list: the attack's size is 03's scale × the attack's factor.
  const level03 = JSON.parse(readFileSync(`${ART}emma_fly.frames.json`, 'utf8')).find((e) => e.src === 'emma_flight_03.png');
  const size = level03.scale * ATTACK_FACTOR;
  const level = load(`${ART}emma_flight_03.png`);
  const attack = load(`${ART}emma_attack.png`);
  const face = faceTemplate(level);
  const offset = [level03.anchor[0] - FACE_REF[0], level03.anchor[1] - FACE_REF[1]];
  const anchors = GUESS.map(([gx, gy], frame) => {
    const free = search(attack, face, gx, gy, 8, 1.25, 1.45);
    const fixed = search(attack, face, free.x, free.y, 4, size, size);
    if (fixed.ncc < MIN_NCC) {
      console.error(`attack frame ${frame}: Emma's face not found near ${gx}, ${gy} (NCC ${fixed.ncc.toFixed(2)}): update GUESS`);
      process.exit(1);
    }
    console.error(`frame ${frame}: face (${fixed.x}, ${fixed.y}), NCC ${fixed.ncc.toFixed(3)}, free scale ${free.s.toFixed(3)}`);
    return [+(fixed.x + offset[0] * size).toFixed(1), +(fixed.y + offset[1] * size).toFixed(1)];
  });
  console.log(JSON.stringify(anchors));
}
