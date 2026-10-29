import { readFileSync, realpathSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

//   node scripts/removeCheckerboard.mjs <file.png | folder> [--enclosed] [--glow] [--force]
// Overwrites the files in place. A PNG that already has fully transparent pixels has been
// cleaned (or packed) before and is skipped, unless --force.
const args = process.argv.slice(2);
const paths = args.filter((arg) => !arg.startsWith('--'));
if (paths.length !== 1) {
  console.error('usage: node scripts/removeCheckerboard.mjs <file.png | folder> [--enclosed] [--glow] [--force]');
  process.exit(1);
}
const ROOT = paths[0];
// art/ holds the untouched originals (D23): clean a copy of them, never the files themselves.
// Checked on every file's real path (links and short names resolved; case-insensitive on Windows),
// so neither a folder run nor a junction gets into art/.
const real = (p) => {
  const path = realpathSync.native(p);
  return process.platform === 'win32' ? path.toLowerCase() : path;
};
const ART = real(fileURLToPath(new URL('../art/', import.meta.url))) + sep;
const insideArt = (p) => (real(p) + sep).startsWith(ART);
if (insideArt(ROOT)) {
  console.error('removeCheckerboard: refusing to overwrite art/ (copy the file elsewhere first)');
  process.exit(1);
}
// --enclosed: also erase checkerboard in enclosed gaps (step 2). --glow: for fire and light
// effects painted over the checkerboard (step 3).
const ENCLOSED = args.includes('--enclosed');
const GLOW = args.includes('--glow');
const FORCE = args.includes('--force');
const unknown = args.filter((arg) => arg.startsWith('--') && !['--enclosed', '--glow', '--force'].includes(arg));
if (unknown.length) {
  console.error(`Unknown option ${unknown.join(', ')} (known: --enclosed, --glow, --force)`);
  process.exit(1);
}

// A pixel counts as checkerboard background if it is very light and (near) gray.
function isLightBg(r, g, b) {
  const min = Math.min(r, g, b);
  const max = Math.max(r, g, b);
  return min >= 222 && (max - min) <= 22;
}

// Strictly neutral light gray: the checkerboard itself (tones ~244 and ~255, spread 0–1).
// White clothing is warm and textured (spread 50+), so it never matches.
function isChecker(r, g, b) {
  const min = Math.min(r, g, b);
  return min >= 236 && Math.max(r, g, b) - min <= 3;
}

function processFile(file) {
  // A hard link to an original in art/ would be written through (the path check can't see it).
  if (statSync(file).nlink > 1) {
    console.log(`  ${file} — skipped, it has other names (a hard link; art/ may be one of them)`);
    return;
  }
  const png = PNG.sync.read(readFileSync(file));
  const { width, height, data } = png;
  const n = width * height;

  // Already has transparency: a packed strip's erased pixels are RGB 0, so the edge flood fill
  // would never start and it would come out an opaque box; a cleaned sprite keeps its colours,
  // so cleaning it again would only rewrite the file.
  if (!FORCE) {
    for (let p = 0; p < n; p += 1) {
      if (data[p * 4 + 3] === 0) {
        console.log(`  ${file} — skipped, already has transparency (--force to clean anyway)`);
        return;
      }
    }
  }

  // The 4-neighbours of pixel p that lie inside the image: left, right, up, down.
  const neighbours = (p) => {
    const x = p % width;
    const out = [];
    if (x > 0) out.push(p - 1);
    if (x < width - 1) out.push(p + 1);
    if (p >= width) out.push(p - width);
    if (p < n - width) out.push(p + width);
    return out;
  };

  // 1) Flood fill the background from every edge pixel that looks like the
  //    checkerboard. Connected-only so interior light pixels stay opaque.
  const bg = new Uint8Array(n); // 1 = background to erase
  const stack = [];
  const lightBgAt = (p) => isLightBg(data[p * 4], data[p * 4 + 1], data[p * 4 + 2]);

  const pushIfEdgeBg = (x, y) => {
    const p = y * width + x;
    if (!bg[p] && lightBgAt(p)) {
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

  const grow = () => {
    while (stack.length) {
      for (const np of neighbours(stack.pop())) {
        if (!bg[np] && lightBgAt(np)) {
          bg[np] = 1;
          stack.push(np);
        }
      }
    }
  };
  grow();

  // Every pixel connected to `start` (4-neighbours) for which `accept` holds; `mark` claims each
  // one as it is added, so no pixel is visited twice.
  const region = (start, accept, mark) => {
    const members = [start];
    mark(start);
    for (let head = 0; head < members.length; head += 1) {
      for (const np of neighbours(members[head])) {
        if (accept(np)) {
          mark(np);
          members.push(np);
        }
      }
    }
    return members;
  };

  // 2) --enclosed: checkerboard showing through enclosed gaps (between hair strands, a wing
  //    and the tail, arms and reins) is not reached from the edges. Erase strictly-gray
  //    enclosed regions of 20+ px that aren't almost all pure white (a fire core), then grow
  //    them like step 1. Opt-in: it also takes neutral grey-white art such as the beavers'
  //    eye whites, so check eyes and teeth after using it.
  if (ENCLOSED) {
    const seen = new Uint8Array(n);
    const checkerAt = (p) => isChecker(data[p * 4], data[p * 4 + 1], data[p * 4 + 2]);
    for (let s = 0; s < n; s += 1) {
      if (bg[s] || seen[s] || !checkerAt(s)) continue;
      const members = region(s, (p) => !bg[p] && !seen[p] && checkerAt(p), (p) => { seen[p] = 1; });
      let light = 0;
      for (const p of members) if (Math.min(data[p * 4], data[p * 4 + 1], data[p * 4 + 2]) >= 250) light += 1;
      if (members.length >= 20 && light / members.length <= 0.85) {
        for (const p of members) {
          bg[p] = 1;
          stack.push(p);
        }
      }
    }
    grow();
  }

  // Apply: erased pixels become fully transparent.
  for (let p = 0; p < n; p += 1) {
    data[p * 4 + 3] = bg[p] ? 0 : 255;
  }

  // 3) --glow: fire and light effects were painted over the checkerboard, so their soft
  //    glow and the gaps between flames are opaque cream instead of see-through. Every pale
  //    pixel is un-blended from the light background ("colour to alpha"), except the
  //    white-hot cores, which stay opaque.
  if (GLOW) {
    const B = 250; // between the two checker tones
    const lum = (p) => (data[p * 4] + data[p * 4 + 1] + data[p * 4 + 2]) / 3;
    // Each piece of art (a fireball) has one white-hot core: its largest bright region, if
    // 300+ px. Other bright regions are checker seen through gaps in the flames.
    const piece = new Int32Array(n).fill(-1);
    for (let s0 = 0; s0 < n; s0 += 1) {
      if (bg[s0] || piece[s0] !== -1) continue;
      region(s0, (p) => !bg[p] && piece[p] === -1, (p) => { piece[p] = s0; });
    }
    const seenBright = new Uint8Array(n);
    const largest = new Map(); // piece -> brightest region's members
    for (let s0 = 0; s0 < n; s0 += 1) {
      if (bg[s0] || seenBright[s0] || lum(s0) < 240) continue;
      const members = region(s0, (p) => !bg[p] && !seenBright[p] && lum(p) >= 240, (p) => { seenBright[p] = 1; });
      const best = largest.get(piece[s0]);
      if (members.length >= 300 && (!best || members.length > best.length)) largest.set(piece[s0], members);
    }
    const core = new Uint8Array(n);
    for (const members of largest.values()) for (const p of members) core[p] = 1;
    // The core's own glow (its yellow gradient) is opaque art too: protect 40 px around it.
    const near = new Int16Array(n).fill(-1);
    const ring = [];
    for (let p = 0; p < n; p += 1) if (core[p] === 1) { near[p] = 0; ring.push(p); }
    for (let head = 0; head < ring.length; head += 1) {
      const p = ring[head];
      if (near[p] >= 40) continue;
      for (const np of neighbours(p)) {
        if (near[np] === -1 && !bg[np]) { near[np] = near[p] + 1; ring.push(np); }
      }
    }
    // Pale pixels connected to the erased background through other pale, non-core pixels:
    // background showing through at the edge (the cream rim on the leading edge).
    const pale = (p) => Math.min(data[p * 4], data[p * 4 + 1], data[p * 4 + 2]) >= 160;
    const outside = new Uint8Array(n);
    const fromEdge = [];
    for (let p = 0; p < n; p += 1) if (bg[p]) { outside[p] = 1; fromEdge.push(p); }
    for (let head = 0; head < fromEdge.length; head += 1) {
      for (const np of neighbours(fromEdge[head])) {
        if (!outside[np] && core[np] !== 1 && pale(np)) { outside[np] = 1; fromEdge.push(np); }
      }
    }
    for (let p = 0; p < n; p += 1) {
      const i = p * 4;
      const min = Math.min(data[i], data[i + 1], data[i + 2]);
      if (bg[p] || core[p] === 1 || min < 160) continue;
      // Near a core, only pale unsaturated pixels reached from outside are background; the
      // saturated yellow gradient and white veins enclosed by fire are the core's own glow.
      if (near[p] !== -1 && (!outside[p] || Math.max(data[i], data[i + 1], data[i + 2]) - min >= 70)) continue;
      const a = Math.min(1, Math.max(0, ...[0, 1, 2].map((c) => (B - data[i + c]) / B)));
      for (let c = 0; c < 3; c += 1) {
        data[i + c] = a > 0 ? Math.round(Math.min(255, Math.max(0, (data[i + c] - (1 - a) * B) / a))) : 0;
      }
      data[i + 3] = Math.round(a * 255);
    }
  }

  // 4) Remove tiny opaque islands (compression noise in the background that
  //    was not light enough to flood-fill). Anything below MIN_KEEP px that
  //    is not part of the main figure is erased. (Not for --glow: embers are small.)
  if (!GLOW) {
    const MIN_KEEP = 1000;
    const label = new Int32Array(n).fill(-1);
    for (let s = 0; s < n; s += 1) {
      if (bg[s] || label[s] !== -1) continue;
      const members = region(s, (p) => !bg[p] && label[p] === -1, (p) => { label[p] = s; });
      if (members.length < MIN_KEEP) {
        for (const p of members) {
          bg[p] = 1;
          data[p * 4 + 3] = 0;
        }
      }
    }
  }

  let erased = 0;
  for (let p = 0; p < n; p += 1) if (bg[p]) erased += 1;

  // 5) Feather the 1px boundary: light fringe pixels that touch an erased
  //    pixel get partial alpha so there is no white halo on the silhouette.
  //    (Not for --glow, whose edges are already un-blended.)
  if (!GLOW) {
    for (let p = 0; p < n; p += 1) {
      if (bg[p] || !neighbours(p).some((np) => bg[np])) continue;

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
    if (insideArt(full)) {
      console.log(`  ${full} — skipped, art/ holds the originals`);
    } else if (statSync(full).isDirectory()) {
      walk(full);
    } else if (extname(full).toLowerCase() === '.png') {
      processFile(full);
    }
  }
}

console.log(`Removing checkerboard background under: ${ROOT}`);
if (statSync(ROOT).isDirectory()) walk(ROOT);
else processFile(ROOT);
console.log('Done.');
