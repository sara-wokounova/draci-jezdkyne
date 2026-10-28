/**
 * Asset paths from story.json are relative ("assets/…", D4). Resolves them against the
 * build's base URL; absolute http(s) URLs pass through.
 */
export function resolveAssetPath(value) {
  // A non-string from story.json (a number, an object) must not crash a scene or the gallery: it
  // becomes '' and simply fails to load.
  // Tabs and newlines go too: browsers drop them inside URLs, which would undo the slash strip below.
  const path = (typeof value === 'string' ? value : '').replace(/[\t\n\r]/g, '');
  if (/^(https?:)?\/\//.test(path)) {
    return path;
  }

  const base = import.meta.env.BASE_URL ?? './';
  const cleanBase = base.endsWith('/') ? base : `${base}/`;
  // Leading slashes and backslashes go: with the dev base "/", "/\host/x.png" would point at another
  // host (only a typo guard: absolute http(s) URLs above pass through on purpose).
  const cleanPath = path.replace(/^[\\/]+/, '');

  return `${cleanBase}${cleanPath}`;
}

/** The image file of a scene's background, or null when the background is generated. */
export function backgroundImage(background) {
  if (background?.type !== 'image') return null;
  const src = background.src ?? background.preset;
  // Anything else is drawn as a generated background. (resolveAssetPath guards non-strings too:
  // two layers on purpose, so either one alone keeps an odd story value from blanking a scene.)
  return typeof src === 'string' ? src : null;
}
