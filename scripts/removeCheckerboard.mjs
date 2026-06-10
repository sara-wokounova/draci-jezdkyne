import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { PNG } from 'pngjs';

const ROOT = process.argv[2] ?? 'public/assets/characters';

// A pixel counts as checkerboard background if it is very light and (near) gray.
function isLightBg(r, g, b) {
  const min = Math.min(r, g, b);
  const max = Math.max(r, g, b);
  return min >= 222 && (max - min) <= 22;
}

function processFile(file) {
  const png = PNG.sync.read(readFileSync(file));
  const { width, height, data } = png;
  const n = width * height;

  // 1) Flood fill the background from every edge pixel that looks like the
  //    checkerboard. Connected-only so interior light pixels stay opaque.
  const bg = new Uint8Array(n); // 1 = background to erase
  const stack = [];

  const pushIfEdgeBg = (x, y) => {
    const p = y * width + x;
    const i = p * 4;
    if (!bg[p] && isLightBg(data[i], data[i + 1], data[i + 2])) {
      bg[p] = 1;
      stack.push(p);
    }
  };

  for (let x = 0; x < width; x += 1) {
    pushIfEdgeBg(x, 0);
    pushIfEdgeBg(x, height - 1);
  }
  for (let y = 0; y < height; y += 1) {
    pushIfEdgeBg(0, y);
    pushIfEdgeBg(width - 1, y);
  }

  while (stack.length) {
    const p = stack.pop();
    const x = p % width;
    const y = (p - x) / width;

    const neighbors = [
      [x - 1, y],
      [x + 1, y],
      [x, y - 1],
      [x, y + 1],
    ];

    for (const [nx, ny] of neighbors) {
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const np = ny * width + nx;
      if (bg[np]) continue;
      const ni = np * 4;
      if (isLightBg(data[ni], data[ni + 1], data[ni + 2])) {
        bg[np] = 1;
        stack.push(np);
      }
    }
  }

  // Apply: erased pixels become fully transparent.
  for (let p = 0; p < n; p += 1) {
    data[p * 4 + 3] = bg[p] ? 0 : 255;
  }

  // 1b) Remove tiny opaque islands (compression noise in the background that
  //     was not light enough to flood-fill). Anything below MIN_KEEP px that
  //     is not part of the main figure is erased.
  const MIN_KEEP = 1000;
  const label = new Int32Array(n).fill(-1);
  for (let s = 0; s < n; s += 1) {
    if (bg[s] || label[s] !== -1) continue;
    const members = [s];
    label[s] = s;
    let head = 0;
    while (head < members.length) {
      const p = members[head];
      head += 1;
      const x = p % width;
      const y = (p - x) / width;
      const nb = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]];
      for (const [nx, ny] of nb) {
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const np = ny * width + nx;
        if (!bg[np] && label[np] === -1) {
          label[np] = s;
          members.push(np);
        }
      }
    }
    if (members.length < MIN_KEEP) {
      for (const p of members) {
        bg[p] = 1;
        data[p * 4 + 3] = 0;
      }
    }
  }

  let erased = 0;
  for (let p = 0; p < n; p += 1) if (bg[p]) erased += 1;

  // 2) Feather the 1px boundary: light fringe pixels that touch an erased
  //    pixel get partial alpha so there is no white halo on the silhouette.
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const p = y * width + x;
      if (bg[p]) continue;

      let touchesBg = false;
      const neighbors = [
        [x - 1, y],
        [x + 1, y],
        [x, y - 1],
        [x, y + 1],
      ];
      for (const [nx, ny] of neighbors) {
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        if (bg[ny * width + nx]) {
          touchesBg = true;
          break;
        }
      }
      if (!touchesBg) continue;

      const i = p * 4;
      const lum = (data[i] + data[i + 1] + data[i + 2]) / 3;
      // Lighter boundary pixels (closer to the checkerboard) fade out more.
      if (lum >= 205) {
        const alpha = Math.round(Math.max(0, Math.min(1, (245 - lum) / 40)) * 255);
        data[i + 3] = Math.min(data[i + 3], alpha);
      }
    }
  }

  const out = new PNG({ width, height });
  data.copy(out.data);
  writeFileSync(file, PNG.sync.write(out));

  const pct = ((erased / n) * 100).toFixed(1);
  console.log(`  ${file} — erased ${pct}% as transparent`);
}

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full);
    } else if (extname(full).toLowerCase() === '.png') {
      processFile(full);
    }
  }
}

console.log(`Removing checkerboard background under: ${ROOT}`);
walk(ROOT);
console.log('Done.');

