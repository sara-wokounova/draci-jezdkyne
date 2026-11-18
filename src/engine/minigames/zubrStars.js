// The wisent song's five stars (D46), drawn in Pixi so their shapes are exact at every size: each star its own
// shape as well as its own colour and pitch (playable colour-blind and with the sound off). Their colours are
// zubrRules.js's DEFAULTS.colors.

/** Low to high: a circle, a triangle, a diamond, a five-point star, a six-petal rosette (a Slavic folk motif). */
export const STAR_SHAPES = ['circle', 'triangle', 'diamond', 'star', 'rosette'];

const polygon = (n, radius, rotation = -Math.PI / 2) => Array.from({ length: n }, (_, i) => {
  const a = rotation + (i * 2 * Math.PI) / n;
  return [Math.cos(a) * radius, Math.sin(a) * radius];
}).flat();

/**
 * Draws `shape` centred on (0, 0) into `graphics` (cleared first): filled with `color` (a number), a white outline.
 */
export function drawStar(graphics, shape, radius, color) {
  graphics.clear();
  const outline = { color: 0xffffff, width: Math.max(2, radius * 0.1), alpha: 0.9 };
  if (shape === 'circle') graphics.circle(0, 0, radius * 0.85);
  else if (shape === 'triangle') graphics.poly(polygon(3, radius * 1.05));
  else if (shape === 'diamond') graphics.poly(polygon(4, radius * 1.05));
  else if (shape === 'star') {
    graphics.poly(Array.from({ length: 10 }, (_, i) => {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const r = i % 2 ? radius * 0.45 : radius * 1.05;
      return [Math.cos(a) * r, Math.sin(a) * r];
    }).flat());
  } else { // the rosette: six petals round a heart
    for (let i = 0; i < 6; i += 1) {
      const a = (i * Math.PI) / 3;
      graphics.circle(Math.cos(a) * radius * 0.5, Math.sin(a) * radius * 0.5, radius * 0.42);
    }
  }
  graphics.fill({ color }).stroke(outline);
  if (shape === 'rosette') graphics.circle(0, 0, radius * 0.3).fill({ color: 0xffffff, alpha: 0.85 });
  return graphics;
}
