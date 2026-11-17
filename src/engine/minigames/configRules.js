// Config helpers shared by the minigames (moved out of dragonAttack.js for badgerRescue, D42). Pure, no imports, so the
// node checks can load the games' rules.

/** A positive number from the config, or the fallback (a typo like 0, -5 or "three" would stop an animation or a cap
 *  for good). */
export function positive(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function nonNegative(value, fallback) {
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

export function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** The defaults with the story's config merged in. Arrays are replaced wholesale (a custom `dragons` list fully
 *  overrides the defaults) and returned by reference, the defaults' own included: never write into the result (D23). */
export function mergeConfig(defaults, override) {
  if (Array.isArray(defaults)) {
    return Array.isArray(override) ? override.map((item) => item) : defaults;
  }
  if (isPlainObject(defaults) && isPlainObject(override)) {
    const result = { ...defaults };
    for (const key of Object.keys(override)) {
      if (key === '__proto__') continue; // a JSON "__proto__" key would set the result's prototype, not a value
      result[key] = mergeConfig(defaults[key], override[key]);
    }
    return result;
  }
  return override === undefined ? defaults : override;
}
