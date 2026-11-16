// The story's rules, pure (no DOM, no fetch; the exceptions: pickEvent's Math.random for a location's pick, and the
// warnings logged once by warnOnce):
// scenes with lines, locations, the choice memory, what follows a scene, where a move lands, old saves and the load-time lint
// (D37). The node checks import this file; the game uses it through storyRepository.js and startVisualNovel.js.

export const MAX_FORWARDS = 20; // pass-throughs in a row before a move counts as a dead end (D37; a freeze guard as D24's)
export const MAX_HISTORY = 500;
const CENTER_LINE_MAX = 80; // a centred hub's last line is repeated as the phone panel's heading

const NAME_PATTERN = '[\\p{L}_][\\p{L}\\p{N}_]*'; // a letter or _ first, then letters, digits, _
const NAME = new RegExp(`^${NAME_PATTERN}$`, 'u');
const CONDITION = new RegExp(`^(?:(!?)(${NAME_PATTERN})|(${NAME_PATTERN}) *(>=|<) *(\\d+))$`, 'u');
const PART_NAME = /^[\w-]+\.json$/;
const LOCATION_ID = /^[\w-]+$/;
const NAMED_POSITIONS = { left: 0.25, center: 0.5, right: 0.75 };

const warned = new Set();
function warnOnce(key, message) {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(message);
}

export const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isWhole = (value) => Number.isInteger(value) && value >= 0;
const describe = (value) => (typeof value === 'string' ? value : JSON.stringify(value));

// --- the parts ---------------------------------------------------------------------------------------------------

/** The main file's part names, checked, each once (a repeat warned). Throws on a malformed list or name. */
export function partNames(main, warnings = []) {
  if (!isObject(main)) throw new Error('Story file is not a JSON object.');
  if (main.parts === undefined) return [];
  if (!Array.isArray(main.parts) || main.parts.some((name) => typeof name !== 'string')) {
    throw new Error('Story "parts" must be a list of file names.');
  }
  const names = [];
  for (const name of main.parts) {
    if (!PART_NAME.test(name) || name === 'story.json' || name === 'story-v2.json') {
      throw new Error(`Bad story part name: ${name}`);
    }
    if (names.includes(name)) warnings.push(`Story part listed twice (loaded once): ${name}`);
    else names.push(name);
  }
  return names;
}

// Objects a part may carry besides scenes (D39: characters.json, compatibility.json), merged into the main file's own
// (the base: the main file may still hold them, as committed versions and test stories do), the first entry kept.
const MERGED = ['characters', 'movedScenes'];

/**
 * One story from the main file and its parts (a Map name → parsed JSON): the main file's scenes, then each part's; a
 * part's location; the main file's characters and movedScenes, then each part's.
 */
export function mergeStory(main, parts, warnings = []) {
  if (!isObject(main)) throw new Error('Story file is not a JSON object.');
  const scenes = Array.isArray(main.scenes) ? [...main.scenes] : [];
  const locations = [];
  if ('location' in main) warnings.push('A location in the main file is ignored (it belongs in a part of its own)');
  const merged = new Map(MERGED.map((key) => [key, new Map()])); // entries kept as a Map: `__proto__` is just an id
  const take = (key, value, where) => {
    if (value === undefined) return;
    if (!isObject(value)) {
      warnings.push(`${where}: "${key}" is not an object (ignored)`);
      return;
    }
    for (const [id, entry] of Object.entries(value)) {
      if (merged.get(key).has(id)) warnings.push(`${where}: duplicate ${key} entry ${id} (the first kept)`);
      else merged.get(key).set(id, entry);
    }
  };
  for (const key of MERGED) take(key, main[key], 'Story file');
  for (const name of partNames(main, warnings)) {
    const part = parts.get(name);
    const scenesOk = isObject(part) && (Array.isArray(part.scenes)
        || (part.scenes === undefined && ['location', ...MERGED].some((key) => key in part)));
    if (!scenesOk) throw new Error(`Story part ${name} has no "scenes" list.`);
    const extra = Object.keys(part).filter((key) => key !== 'scenes' && key !== 'location' && !MERGED.includes(key));
    if (extra.length > 0) warnings.push(`Story part ${name}: ignored ${extra.join(', ')}`);
    scenes.push(...(part.scenes ?? []));
    if ('location' in part) locations.push(part.location);
    for (const key of MERGED) take(key, part[key], `Story part ${name}`);
  }
  const { parts: _parts, location: _location, ...rest } = main;
  const shared = Object.fromEntries([...merged].map(([key, entries]) => [key, Object.fromEntries(entries)]));
  return { ...rest, scenes, locations, ...shared };
}

// --- normalising ---------------------------------------------------------------------------------------------------

/** The scenes as a Map with every scene's `lines` an array of line objects; `movedScenes` as a Map. */
export function normalizeStory(data, warnings = []) {
  const scenes = new Map();
  for (const entry of Array.isArray(data.scenes) ? data.scenes : []) {
    if (!isObject(entry) || typeof entry.id !== 'string') {
      warnings.push(`Skipped a malformed scene entry: ${describe(entry)?.slice(0, 80)}`);
      continue;
    }
    if (scenes.has(entry.id)) {
      warnings.push(`Duplicate scene id (the first kept): ${entry.id}`);
      continue;
    }
    scenes.set(entry.id, { ...entry, lines: normalizeLines(entry, warnings) });
  }
  const movedScenes = new Map();
  if (isObject(data.movedScenes)) {
    for (const [id, place] of Object.entries(data.movedScenes)) {
      if (isObject(place) && typeof place.scene === 'string' && isWhole(place.line)) movedScenes.set(id, place);
      else warnings.push(`movedScenes: malformed entry for ${id} (in compatibility.json)`);
    }
  }
  // Locations (D37): by id, in part order; each with its events list (entries checked where they are read).
  const locations = new Map();
  for (const location of Array.isArray(data.locations) ? data.locations : []) {
    if (!isObject(location) || typeof location.id !== 'string' || !LOCATION_ID.test(location.id)) {
      warnings.push(`Skipped a malformed location: ${describe(location)?.slice(0, 80)}`);
    } else if (locations.has(location.id)) {
      warnings.push(`Duplicate location id (the first kept): ${location.id}`);
    } else {
      locations.set(location.id, { id: location.id, events: Array.isArray(location.events) ? location.events : [] });
    }
  }
  return {
    id: data.id ?? 'visual-novel',
    start: data.start,
    menuMusic: data.menuMusic ?? null,
    resumeMusic: Array.isArray(data.resumeMusic) ? data.resumeMusic : [], // D26
    assets: data.assets ?? {},
    characters: isObject(data.characters) ? data.characters : {},
    scenes,
    movedScenes,
    locations,
  };
}

function normalizeLines(scene, warnings) {
  const hasOldText = 'text' in scene || 'speaker' in scene;
  if (scene.minigame) {
    if ('lines' in scene) warnings.push(`${scene.id}: a minigame scene's lines are ignored`);
    return [];
  }
  if ('lines' in scene) {
    if (!Array.isArray(scene.lines)) {
      warnings.push(`${scene.id}: "lines" is not a list (one empty line instead)`);
      return [{ text: '' }];
    }
    if (hasOldText) warnings.push(`${scene.id}: scene-level "text"/"speaker" ignored beside "lines"`);
    return scene.lines.map((line, index) => {
      if (isObject(line)) return line;
      warnings.push(`${scene.id}: line ${index} is malformed (an empty line instead)`);
      return { text: '' };
    });
  }
  // The old one-line form: its stage is the scene's characters.
  if (hasOldText) return [{ speaker: scene.speaker, text: scene.text }];
  warnings.push(`${scene.id}: no lines (one empty line instead)`);
  return [{ text: '' }];
}

// --- memory and conditions -----------------------------------------------------------------------------------------

/** A condition parsed, or null when malformed. */
function parseCondition(condition) {
  if (typeof condition !== 'string') return null;
  const match = CONDITION.exec(condition);
  if (!match) return null;
  if (match[2]) return { name: match[2], op: match[1] ? 'not' : 'yes' };
  return { name: match[3], op: match[4], n: Number(match[5]) };
}

/** The conditions of an `if` (a string or a list), or null when any is malformed (an empty list too). */
function parseIf(value) {
  const list = Array.isArray(value) ? value : [value];
  if (list.length === 0) return null;
  const parsed = list.map(parseCondition);
  return parsed.includes(null) ? null : parsed;
}

export function conditionMet(value, memory) {
  if (value === undefined) return true;
  const conditions = parseIf(value);
  if (!conditions) {
    warnOnce(`if:${describe(value)}`, `Malformed condition (counts as not met): ${describe(value)}`);
    return false;
  }
  return conditions.every(({ name, op, n }) => {
    const value = memory.get(name) ?? 0;
    if (op === 'yes') return value > 0;
    if (op === 'not') return value === 0;
    if (op === '>=') return value >= n;
    return value < n;
  });
}

/** The well-formed `set` names and `add` entries of a scene or choice, and the malformed ones. */
function parseChanges({ set, add }) {
  const sets = [];
  const adds = [];
  const bad = [];
  if (set !== undefined) {
    if (!Array.isArray(set)) bad.push(`set ${describe(set)}`);
    else for (const name of set) (typeof name === 'string' && NAME.test(name) ? sets : bad).push(name);
  }
  if (add !== undefined) {
    if (!isObject(add)) bad.push(`add ${describe(add)}`);
    else {
      for (const [name, amount] of Object.entries(add)) {
        if (NAME.test(name) && Number.isInteger(amount)) adds.push([name, amount]);
        else bad.push(`add ${name}: ${describe(amount)}`);
      }
    }
  }
  return { sets, adds, bad };
}

/** A new memory with the changes applied: `set` names to at least 1, `add` raised, never below 0. */
export function applyChanges(memory, changes) {
  const { sets, adds } = parseChanges(changes ?? {});
  if (sets.length === 0 && adds.length === 0) return memory;
  const next = new Map(memory);
  for (const name of sets) next.set(name, Math.max(next.get(name) ?? 0, 1));
  for (const [name, amount] of adds) next.set(name, Math.max(0, (next.get(name) ?? 0) + amount));
  return next;
}

/** A saved memory object → a Map (own entries with a valid name and a whole number ≥ 0 only). */
export function memoryFrom(object) {
  const memory = new Map();
  if (!isObject(object)) return memory;
  for (const [name, value] of Object.entries(object)) {
    if (NAME.test(name) && isWhole(value)) memory.set(name, value);
  }
  return memory;
}

export const memoryObject = (memory) => Object.fromEntries(memory);

/** Whether a string is a valid memory name (a letter or `_` first, then letters, digits, `_`). */
export const isName = (value) => typeof value === 'string' && NAME.test(value);

export function sameMemory(a, b) {
  const keysA = [...a.keys()].filter((key) => a.get(key) !== 0);
  const keysB = [...b.keys()].filter((key) => b.get(key) !== 0);
  return keysA.length === keysB.length && keysA.every((key) => a.get(key) === b.get(key));
}

// --- a scene's lines, stage and follow-up --------------------------------------------------------------------------

export function visibleLines(scene, memory) {
  const visible = [];
  scene.lines.forEach((line, index) => {
    if (conditionMet(line.if, memory)) visible.push(index);
  });
  return visible;
}

/** Who is on stage at a line: the last `characters` among the visible lines up to it, else the scene's. */
export function stageAt(scene, line, memory) {
  let stage = Array.isArray(scene.characters) ? scene.characters : [];
  if (line === null || line === undefined) return stage;
  for (let index = 0; index <= line && index < scene.lines.length; index += 1) {
    const entry = scene.lines[index];
    if (Array.isArray(entry.characters) && conditionMet(entry.if, memory)) {
      stage = entry.characters;
    }
  }
  return stage;
}

/** The scene's `next`: a string, or the first list entry (with a `next` key) whose `if` holds; else null. */
export function nextSceneId(scene, memory) {
  if (typeof scene.next === 'string') return scene.next;
  if (!Array.isArray(scene.next)) return null;
  for (const entry of scene.next) {
    if (isObject(entry) && 'next' in entry && conditionMet(entry.if, memory)) {
      return typeof entry.next === 'string' ? entry.next : null;
    }
  }
  return null;
}

/**
 * An event's name in the memory, set when it is played: its `name`, else its scene id. It must never change once
 * players have played it (a renamed scene with `movedScenes` keeps the event's old name as `name`), or they get it again.
 */
export const eventName = (event) => (typeof event.name === 'string' ? event.name : event.scene);

/** A location's events that can still happen: not played (its name unset) and its `if` holding. */
export function availableEvents(story, locationId, memory) {
  const location = story?.locations?.get(locationId);
  if (!location) return [];
  return location.events.filter((event) => isObject(event) && event.retired !== true && typeof event.scene === 'string'
      && story.scenes.has(event.scene) && NAME.test(eventName(event)) && !(memory.get(eventName(event)) > 0)
      && conditionMet(event.if, memory));
}

/** What a location's pick can give: the first available `first` event, else every available event. */
export function eventCandidates(story, locationId, memory) {
  const available = availableEvents(story, locationId, memory);
  const first = available.find((event) => event.first === true);
  return first ? [first] : available;
}

/**
 * A location choice picked: its own changes, then an event (`first` before the rest, the rest at random), marked
 * played by setting its name (`eventName`). `{ sceneId, memory }` to enter, or null when nothing is available.
 */
export function pickEvent(story, choice, memory) {
  const after = applyChanges(memory, choice);
  const candidates = eventCandidates(story, choice.location, after);
  if (candidates.length === 0) return null;
  const event = candidates.length === 1 ? candidates[0] : candidates[Math.floor(Math.random() * candidates.length)];
  return { sceneId: event.scene, memory: applyChanges(after, { set: [eventName(event)] }) };
}

/**
 * A give-up choice (`"giveUp": true`, D37) picked: its own changes, then the event whose scenes hold `scene` (its
 * first scene and what only it leads to) un-played, so its location offers it again ("a lost quest is offered again").
 */
export function giveUpMemory(story, scene, choice, memory) {
  const after = applyChanges(memory, choice);
  const owner = owningEvent(story, scene.id);
  if (!owner) return after;
  const next = new Map(after);
  next.delete(eventName(owner));
  return next;
}

/** The active event whose scenes (`eventSceneIds`) hold the scene, or null. */
export function owningEvent(story, sceneId) {
  for (const location of story.locations?.values() ?? []) {
    for (const event of location.events) {
      if (!isObject(event) || event.retired === true || typeof event.scene !== 'string') continue;
      if (eventSceneIds(story, event.scene).has(sceneId)) return event;
    }
  }
  return null;
}

/**
 * The choices shown: their `if` holding, and a location choice only while its pick would find an event (judged with
 * the choice's own changes applied, as the pick is).
 */
export function visibleChoices(scene, memory, story) {
  return (Array.isArray(scene.choices) ? scene.choices : []).filter((choice) => isObject(choice)
      && conditionMet(choice.if, memory)
      && (choice.location === undefined
        || availableEvents(story, choice.location, applyChanges(memory, choice)).length > 0));
}

/**
 * What follows the scene's last visible line: its visible choices, else its `next` (a typo is a dead end), else its
 * `end`, else a dead end. A minigame scene is its own kind (its outcomes go on, D9).
 */
export function followUp(story, scene, memory) {
  if (scene.minigame) return { kind: 'minigame' };
  const choices = visibleChoices(scene, memory, story);
  if (choices.length > 0) return { kind: 'choices', choices };
  const id = nextSceneId(scene, memory);
  if (id !== null) {
    if (story.scenes.has(id)) return { kind: 'next', id };
    warnOnce(`dead:${scene.id}`, `Dead end: ${scene.id} goes to an unknown scene "${id}"`);
    return { kind: 'dead' };
  }
  if (scene.end) return { kind: 'end', end: scene.end };
  warnOnce(`dead:${scene.id}`, `Dead end: nothing follows ${scene.id}`);
  return { kind: 'dead' };
}

/** Whether a scene's choices show in the big centred panel: more than two of them, or `choiceLayout: "center"`. */
export const centresChoices = (scene, count) => scene.choiceLayout === 'center' || count > 2;

/** A saved line placed on what is visible now: itself, else the next visible, else the last visible, else null. */
export function placeLine(scene, line, memory) {
  const visible = visibleLines(scene, memory);
  if (visible.length === 0) return null;
  const wanted = isWhole(line) ? line : 0;
  return visible.find((index) => index >= wanted) ?? visible.at(-1);
}

/** The next visible line after `line` in the scene, or null. */
export function nextLine(scene, line, memory) {
  if (line === null) return null;
  return visibleLines(scene, memory).find((index) => index > line) ?? null;
}

/** Whether the position is the last thing shown before the end card. */
export function isEndingPosition(story, scene, line, memory) {
  return nextLine(scene, line, memory) === null && followUp(story, scene, memory).kind === 'end';
}

/**
 * Where a move into `sceneId` lands: the scene's changes applied, pass-throughs (no visible line, no visible choice,
 * a `next` that gives a scene) followed. `{ scene, line, memory }`, or `{ dead: true }` with nothing changed.
 */
export function resolveEntry(story, sceneId, memory) {
  let id = sceneId;
  let current = memory;
  for (let forwards = 0; forwards <= MAX_FORWARDS; forwards += 1) {
    const scene = story.scenes.get(id);
    if (!scene) {
      warnOnce(`unknown:${id}`, `Dead end: unknown scene "${id}"`);
      return { dead: true };
    }
    current = applyChanges(current, scene);
    if (scene.minigame) return { scene, line: null, memory: current };
    const visible = visibleLines(scene, current);
    if (visible.length > 0) return { scene, line: visible[0], memory: current };
    const after = followUp(story, scene, current);
    if (after.kind === 'choices' || after.kind === 'end') return { scene, line: null, memory: current };
    if (after.kind !== 'next') return { dead: true };
    id = after.id;
  }
  warnOnce(`forwards:${sceneId}`, `Dead end: more than ${MAX_FORWARDS} pass-throughs from ${sceneId}`);
  return { dead: true };
}

// --- preload -------------------------------------------------------------------------------------------------------

/**
 * The positions within `taps` taps of the current one, read with the current memory (a warm-up, not a prediction:
 * the changes on the way aren't applied). A minigame scene counts as one tap; its outcomes aren't walked (issue P2).
 * A pass-through is walked for free and never returned.
 */
export function reachableWithin(story, position, memory, taps) {
  const seen = new Set();
  const found = [];
  const add = (scene, line, depth, queue) => {
    const key = `${scene.id}:${line}`;
    if (seen.has(key)) return;
    seen.add(key);
    found.push({ scene, line });
    queue.push({ scene, line, depth });
  };
  // Like resolveEntry's walk, but read with the current memory and applying nothing (a warm-up, not a prediction: a
  // hub's own `add` must not hide the lines it is about to show), and a dead end only stops the walk there (`followUp` warns once, as it would when the player gets there).
  const landing = (id) => {
    for (let forwards = 0; forwards <= MAX_FORWARDS; forwards += 1) {
      const scene = story.scenes.get(id);
      if (!scene) return null;
      if (scene.minigame) return { scene, line: null };
      const visible = visibleLines(scene, memory);
      if (visible.length > 0) return { scene, line: visible[0] };
      const after = followUp(story, scene, memory);
      if (after.kind !== 'next') return after.kind === 'dead' ? null : { scene, line: null };
      id = after.id;
    }
    return null;
  };
  const queue = [];
  add(position.scene, position.line, 0, queue);
  while (queue.length > 0) {
    const { scene, line, depth } = queue.shift();
    if (depth >= taps || scene.minigame) continue;
    const later = nextLine(scene, line, memory);
    if (later !== null) {
      add(scene, later, depth + 1, queue);
      continue;
    }
    const after = followUp(story, scene, memory);
    // A location choice's targets: every scene its pick could give.
    const targets = after.kind === 'choices'
      ? after.choices.flatMap((choice) => (choice.location === undefined ? [choice.next]
        : eventCandidates(story, choice.location, applyChanges(memory, choice)).map((event) => event.scene)))
      : after.kind === 'next' ? [after.id] : [];
    for (const id of targets) {
      const land = typeof id === 'string' ? landing(id) : null;
      if (land) add(land.scene, land.line, depth + 1, queue);
    }
  }
  return found;
}

// --- saves ---------------------------------------------------------------------------------------------------------

function placeId(story, sceneId, line) {
  if (typeof sceneId !== 'string') return null;
  if (story.scenes.has(sceneId)) return { scene: story.scenes.get(sceneId), line, moved: false };
  const moved = story.movedScenes.get(sceneId);
  if (!moved || !story.scenes.has(moved.scene)) return null;
  return { scene: story.scenes.get(moved.scene), line: moved.line, moved: true };
}

/** Two positions alike: the same scene, line and memory (Back never shows one screen twice). */
export const samePlace = (a, b) => a.scene === b.scene && a.line === b.line && sameMemory(a.memory, b.memory);

/**
 * A loaded `autosave2` save placed on the story: ids through `movedScenes`, lines through `placeLine`, history entries
 * on minigame or unknown scenes dropped, entries placed alike collapsed, trailing entries placed like the position
 * dropped; an unplaceable position falls back to the newest placeable history entry. Null: a fresh start.
 */
export function placeSave(story, data) {
  const history = [];
  for (const entry of data.history ?? []) {
    const placed = placeId(story, entry.sceneId, entry.line);
    if (!placed || placed.scene.minigame) continue;
    const memory = memoryFrom(entry.memory);
    const item = { scene: placed.scene, line: placeLine(placed.scene, placed.line, memory), memory };
    if (history.length > 0 && samePlace(history.at(-1), item)) continue;
    history.push(item);
  }
  let position = null;
  let fellBack = false;
  const current = placeId(story, data.currentSceneId, data.currentLine);
  if (current) {
    const memory = memoryFrom(data.memory);
    const line = current.scene.minigame ? null : placeLine(current.scene, current.line, memory);
    position = { scene: current.scene, line, memory };
  } else if (history.length > 0) {
    position = history.pop();
    fellBack = true;
  }
  if (!position) return null;
  while (history.length > 0 && samePlace(history.at(-1), position)) history.pop();
  return { position, history, fellBack };
}

/**
 * An old-key save (one-line scenes: `currentSceneId`, `history` a list of ids) in the `autosave2` format: the path
 * placed, the memory replayed from the scenes' own changes (choices' can't be: which one was picked isn't saved).
 */
export function migrateOldSave(story, old) {
  const fresh = resolveEntry(story, story.start, new Map());
  const ids = (Array.isArray(old.history) ? old.history : []).filter((id) => typeof id === 'string');
  const path = [...ids, old.currentSceneId];
  let memory = fresh.dead ? new Map() : fresh.memory;
  let previous = null;
  let first = true;
  const entries = [];
  path.forEach((id, index) => {
    const isCurrent = index === path.length - 1;
    const placed = placeId(story, id, 0);
    if (!placed) return;
    if (placed.scene.minigame && !isCurrent) return;
    const enters = placed.scene !== previous || !placed.moved;
    if (enters && !placed.scene.minigame) {
      const isStart = placed.scene.id === story.start || placed.scene === fresh.scene;
      if (!(first && isStart)) memory = applyChanges(memory, placed.scene);
    }
    first = false;
    previous = placed.scene;
    entries.push({ sceneId: placed.scene.id, line: placed.line, memory: memoryObject(memory), isCurrent });
  });
  const current = entries.pop(); // the current id, else the newest placeable history entry
  const history = entries.slice(-MAX_HISTORY).map(({ sceneId, line, memory }) => ({ sceneId, line, memory }));
  const endings = [...new Set((Array.isArray(old.readSceneIds) ? old.readSceneIds : [])
      .filter((id) => placeId(story, id, 0)?.scene.end).map((id) => endingId(story, id)))];
  return {
    currentSceneId: current?.sceneId ?? null,
    currentLine: current?.line ?? 0,
    memory: current?.memory ?? {},
    history,
    endings,
  };
}

/** The recorded endings' scenes, in story order (through `movedScenes`). */
export function endScenes(story, endings) {
  const ids = new Set(endings.map((id) => placeId(story, id, 0)?.scene.id).filter(Boolean));
  return [...story.scenes.values()].filter((scene) => scene.end && ids.has(scene.id));
}

/** The id an ending is recorded under (its scene now, after `movedScenes`). */
export function endingId(story, id) {
  return placeId(story, id, 0)?.scene.id ?? id;
}

// --- sprites -------------------------------------------------------------------------------------------------------

/** A stage entry's position as a fraction of the width (a name or a number in [0, 1]; else the centre). */
export function positionFraction(position) {
  if (isFraction(position)) return position;
  return isNamedPosition(position) ? NAMED_POSITIONS[position] : NAMED_POSITIONS.center;
}

/** A character's `scale` (a positive finite number) or null; its `raise` (0–1) or 0 (D37). */
export const characterScale = (character) => (typeof character?.scale === 'number' && Number.isFinite(character.scale)
  && character.scale > 0 ? character.scale : null);
export const characterRaise = (character) => (typeof character?.raise === 'number' && character.raise >= 0
  && character.raise <= 1 ? character.raise : 0);
export const isFraction = (position) => typeof position === 'number' && position >= 0 && position <= 1;

export const isNamedPosition = (position) =>
  typeof position === 'string' && Object.hasOwn(NAMED_POSITIONS, position);

// --- the lint ------------------------------------------------------------------------------------------------------

/** The scene ids a scene can lead to: its `next` (every list entry), its choices, its minigame's outcomes. */
function targetsOf(scene) {
  const ids = typeof scene.next === 'string' ? [scene.next]
    : Array.isArray(scene.next) ? scene.next.filter(isObject).map((entry) => entry.next) : [];
  for (const choice of Array.isArray(scene.choices) ? scene.choices : []) if (isObject(choice)) ids.push(choice.next);
  if (scene.minigame) ids.push(scene.minigame.onVictory, scene.minigame.onFailure);
  return ids.filter((id) => typeof id === 'string');
}

/**
 * An event's scenes: its first scene and the scenes reachable from it that nothing outside the set leads to (start
 * with everything reachable, drop any scene with a way in from outside until none is left), so a shared router or hub,
 * reached from elsewhere too, is not part of it, while a retry loop inside the event is.
 */
export function eventSceneIds(story, firstScene) {
  // Ways in from scenes something can reach (the start, the events' first scenes and what they lead to): a leftover
  // scene nothing reaches doesn't count. The start is entered from outside every event.
  const reachable = new Set();
  const roots = [story.start, ...[...(story.locations?.values() ?? [])].flatMap((location) => location.events)
      .filter((event) => isObject(event) && event.retired !== true && typeof event.scene === 'string').map((event) => event.scene)];
  for (const queue = [...roots]; queue.length > 0;) {
    const id = queue.shift();
    const scene = story.scenes.get(id);
    if (!scene || reachable.has(id)) continue;
    reachable.add(id);
    queue.push(...targetsOf(scene));
  }
  const incoming = new Map([[story.start, [null]]]);
  for (const scene of story.scenes.values()) {
    if (!reachable.has(scene.id)) continue;
    for (const id of targetsOf(scene)) incoming.set(id, [...(incoming.get(id) ?? []), scene.id]);
  }
  const ids = new Set([firstScene]);
  for (const queue = [firstScene]; queue.length > 0;) {
    const scene = story.scenes.get(queue.shift());
    for (const id of scene ? targetsOf(scene) : []) {
      if (!ids.has(id) && story.scenes.has(id)) {
        ids.add(id);
        queue.push(id);
      }
    }
  }
  for (let shrank = true; shrank;) {
    shrank = false;
    for (const id of ids) {
      if (id !== firstScene && (incoming.get(id) ?? []).some((source) => !ids.has(source))) {
        ids.delete(id);
        shrank = true;
      }
    }
  }
  return ids;
}

/** The scenes reachable from `ids` without leaving `within` and without going on through a minigame. */
function reachWithin(story, ids, within) {
  const seen = new Set();
  for (const queue = ids.filter((id) => within.has(id)); queue.length > 0;) {
    const id = queue.shift();
    const scene = story.scenes.get(id);
    if (!scene || seen.has(id)) continue;
    seen.add(id);
    if (!scene.minigame) queue.push(...targetsOf(scene).filter((target) => within.has(target)));
  }
  return seen;
}

/** Load-time checks: the warnings as a list (the game logs them; the node check requires none). */
export function lintStory(story) {
  const warnings = [];
  const has = (id) => typeof id === 'string' && story.scenes.has(id);
  const written = new Set();
  const read = [];

  const checkIf = (value, where) => {
    if (value === undefined) return;
    const parsed = parseIf(value);
    if (!parsed) warnings.push(`${where}: malformed condition ${describe(value)}`);
    else for (const { name } of parsed) read.push([name, where]);
  };
  const checkChanges = (owner, where) => {
    const { sets, adds, bad } = parseChanges(owner);
    for (const item of bad) warnings.push(`${where}: malformed ${describe(item)}`);
    for (const name of sets) written.add(name);
    for (const [name] of adds) written.add(name);
  };
  const checkStage = (stage, where) => {
    if (stage === undefined) return;
    if (!Array.isArray(stage)) {
      warnings.push(`${where}: "characters" is not a list`);
      return;
    }
    for (const entry of stage) {
      if (!isObject(entry)) {
        warnings.push(`${where}: malformed stage entry`);
        continue;
      }
      if (!Object.hasOwn(story.characters, entry.id)) warnings.push(`${where}: unknown character "${describe(entry.id)}"`);
      const scaled = isObject(story.characters[entry.id]) && 'scale' in story.characters[entry.id];
      const { position } = entry;
      if (position !== undefined && !isNamedPosition(position) && !isFraction(position)) {
        warnings.push(`${where}: malformed position ${describe(position)}`);
      } else if (typeof position === 'number' && (position < 0.2 || position > 0.8)) {
        warnings.push(`${where}: position ${position} is outside 0.2–0.8${scaled ? '' : ' (not clamped)'}`);
      }
      if ('flip' in entry && entry.flip !== true && entry.flip !== false) {
        warnings.push(`${where}: malformed flip ${describe(entry.flip)}`);
      }
      if ('alpha' in entry && !(typeof entry.alpha === 'number' && entry.alpha >= 0 && entry.alpha <= 1)) {
        warnings.push(`${where}: alpha ${describe(entry.alpha)} is not a number from 0 to 1`);
      }
    }
  };

  for (const [id, character] of Object.entries(story.characters)) {
    if (!isObject(character)) continue;
    if ('scale' in character && characterScale(character) === null) warnings.push(`character ${id}: malformed scale ${describe(character.scale)}`);
    if ('raise' in character && characterRaise(character) !== character.raise) {
      warnings.push(`character ${id}: raise ${describe(character.raise)} is not 0–1`);
    }
  }

  const giveUps = []; // give-up choices, judged once the locations are known
  for (const scene of story.scenes.values()) {
    const where = scene.id;
    checkChanges(scene, where);
    checkStage(scene.characters, where);
    if (scene.minigame) {
      if (scene.set !== undefined || scene.add !== undefined) {
        warnings.push(`${where}: set/add on a minigame scene (re-applied on every retry)`);
      }
      for (const key of ['onVictory', 'onFailure']) {
        const target = scene.minigame[key];
        if (target !== undefined && !has(target)) warnings.push(`${where}: ${key} "${describe(target)}" is not a scene`);
      }
    }
    scene.lines.forEach((line, index) => {
      checkIf(line.if, `${where} line ${index}`);
      checkStage(line.characters, `${where} line ${index}`);
      if (line.if !== undefined && Array.isArray(line.characters)) {
        const after = scene.lines[index + 1];
        if (after && after.characters == null) {
          warnings.push(`${where} line ${index}: a conditional line sets the stage the next line relies on`);
        }
      }
    });
    const choices = Array.isArray(scene.choices) ? scene.choices : [];
    if (scene.choices !== undefined && !Array.isArray(scene.choices)) warnings.push(`${where}: "choices" is not a list`);
    choices.forEach((choice, index) => {
      if (!isObject(choice)) {
        warnings.push(`${where} choice ${index}: malformed`);
        return;
      }
      if ('location' in choice) {
        if ('next' in choice) warnings.push(`${where} choice ${index}: both "next" and "location"`);
        if (!story.locations.has(choice.location)) {
          warnings.push(`${where} choice ${index}: location "${describe(choice.location)}" is not a location`);
        }
      } else if (!has(choice.next)) warnings.push(`${where} choice ${index}: next "${describe(choice.next)}" is not a scene`);
      checkIf(choice.if, `${where} choice ${index}`);
      checkChanges(choice, `${where} choice ${index}`);
      if ('giveUp' in choice && typeof choice.giveUp !== 'boolean') warnings.push(`${where} choice ${index}: malformed giveUp`);
      if (choice.giveUp === true) giveUps.push({ scene, choice, where: `${where} choice ${index}` });
    });
    if (new Set(choices.map((choice) => choice?.text)).size > 9) {
      warnings.push(`${where}: more than 9 choice texts (keys pick only 1–9)`);
    }
    let alwaysNext = false;
    if (typeof scene.next === 'string') {
      alwaysNext = true;
      if (!has(scene.next)) warnings.push(`${where}: next "${describe(scene.next)}" is not a scene`);
    } else if (Array.isArray(scene.next)) {
      scene.next.forEach((entry, index) => {
        if (!isObject(entry) || !('next' in entry)) {
          warnings.push(`${where} next ${index}: no "next" (skipped)`);
          return;
        }
        if (!has(entry.next)) warnings.push(`${where} next ${index}: "${describe(entry.next)}" is not a scene`);
        checkIf(entry.if, `${where} next ${index}`);
        if (entry.if === undefined) alwaysNext = true;
      });
    } else if (scene.next !== undefined) {
      warnings.push(`${where}: malformed next ${describe(scene.next)}`);
    }
    if (!scene.minigame && (choices.length > 0 || Array.isArray(scene.next))
        && choices.every((choice) => isObject(choice) && (choice.if !== undefined || 'location' in choice))
        && !alwaysNext && !scene.end) {
      warnings.push(`${where}: can end in a dead end by its conditions`);
    }
    if (scene.choiceLayout !== undefined && scene.choiceLayout !== 'center') {
      warnings.push(`${where}: choiceLayout "${describe(scene.choiceLayout)}" (only "center")`);
    }
    if (centresChoices(scene, choices.length)
        && (scene.lines.at(-1)?.text?.length ?? 0) > CENTER_LINE_MAX) {
      warnings.push(`${where}: a centred hub's last line is over ${CENTER_LINE_MAX} characters`);
    }
  }

  for (const [id, place] of story.movedScenes) {
    if (story.scenes.has(id)) warnings.push(`movedScenes: "${id}" is also a scene (its entry is ignored; in compatibility.json)`);
    const target = story.scenes.get(place.scene);
    if (!target) warnings.push(`movedScenes: ${id} → "${place.scene}" is not a scene (in compatibility.json)`);
    else if (place.line >= Math.max(1, target.lines.length)) {
      warnings.push(`movedScenes: ${id} → ${place.scene} line ${place.line} is out of range (in compatibility.json)`);
    }
  }
  // Names the story itself changes: an event must not share one (a set or a positive add would count it as played
  // before it happens; a lost event comes back only through a give-up choice, `"giveUp": true`, never a negative add).
  const raised = new Set();
  const lowered = []; // [name, where]
  const targets = new Set([story.start]); // Nová hra enters the start without a pick
  for (const scene of story.scenes.values()) {
    const owners = [scene, ...(Array.isArray(scene.choices) ? scene.choices.filter(isObject) : [])];
    for (const owner of owners) {
      const { sets, adds } = parseChanges(owner);
      for (const name of sets) raised.add(name);
      for (const [name, amount] of adds) {
        if (amount > 0) raised.add(name);
        else if (amount < 0) lowered.push([name, owner === scene ? scene.id : `${scene.id} choice`]);
      }
    }
    for (const id of targetsOf(scene)) targets.add(id);
  }
  const named = new Set([...story.scenes.values()].flatMap((scene) => (Array.isArray(scene.choices) ? scene.choices : [])
      .filter(isObject).map((choice) => choice.location)));
  const eventScenes = new Set(); // the active events' scenes
  const eventNames = new Set(); // every listed event's name, active or retired (scene ids and names never clash in memory)
  for (const location of story.locations.values()) {
    const where = `location ${location.id}`;
    if (location.events.length === 0) warnings.push(`${where}: no events`);
    const allRetired = location.events.length > 0 && location.events.every((event) => isObject(event) && event.retired === true);
    if (!named.has(location.id) && !allRetired) warnings.push(`${where}: no choice goes there`);
    location.events.forEach((event, index) => {
      if (isObject(event) && event.retired === true) {
        // A retired event: never offered, listed only so its name stays (a committed name is permanent).
        if (typeof event.name !== 'string' || !NAME.test(event.name)) warnings.push(`${where} event ${index}: a retired event needs its "name"`);
        else if (eventNames.has(event.name)) warnings.push(`${where} event ${index}: "${event.name}" is listed twice`);
        else {
          eventNames.add(event.name);
          written.add(event.name);
          if (raised.has(event.name)) warnings.push(`${where} event ${index}: the story sets the retired "${event.name}" (its players already have it)`);
        }
        return;
      }
      if (!isObject(event) || typeof event.scene !== 'string') {
        warnings.push(`${where} event ${index}: malformed`);
        return;
      }
      const name = eventName(event);
      if (!has(event.scene)) warnings.push(`${where} event ${index}: "${event.scene}" is not a scene`);
      else if (story.scenes.get(event.scene).minigame) {
        warnings.push(`${where} event ${index}: starts on a minigame scene (start it on a scene before it)`);
      }
      if ('name' in event && typeof event.name !== 'string') warnings.push(`${where} event ${index}: malformed name`);
      if (!NAME.test(name)) warnings.push(`${where} event ${index}: "${name}" is not a valid name`);
      if (eventScenes.has(event.scene)) warnings.push(`${where} event ${index}: "${event.scene}" is listed twice`);
      else if (eventNames.has(name)) warnings.push(`${where} event ${index}: the name "${name}" is listed twice`);
      eventScenes.add(event.scene);
      eventNames.add(name);
      if (raised.has(name)) warnings.push(`${where} event ${index}: the story also sets "${name}" (it would count as played)`);
      if (targets.has(event.scene)) {
        warnings.push(`${where} event ${index}: "${event.scene}" is also reached another way (it would not be marked played)`);
      }
      written.add(name); // the engine sets it when the event is played
      checkIf(event.if, `${where} event ${index}`);
      if ('first' in event && typeof event.first !== 'boolean') warnings.push(`${where} event ${index}: malformed first`);
    });
  }
  const activeNames = new Set([...story.locations.values()].flatMap((location) => location.events)
      .filter((event) => isObject(event) && event.retired !== true && typeof event.scene === 'string').map(eventName));
  for (const [name, where] of lowered) {
    if (activeNames.has(name)) warnings.push(`${where}: lowers the event name "${name}" (a lost event comes back by "giveUp": true)`);
  }
  // A give-up choice: inside an event's own scenes (a lose scene of its own per event), not a location choice, leaving
  // the event (its next outside the event's scenes: anything inside, a retry or a "sure?" question, could lead to a won
  // retry, and the won event would be offered again), and only after a loss: reached from a minigame's failure, not from
  // its victory, and not before trying (from the event's first scene without a minigame on the way).
  for (const { scene, choice, where } of giveUps) {
    const owner = owningEvent(story, scene.id);
    if (!owner) {
      warnings.push(`${where}: giveUp outside any event's scenes (give each event its own lose scene)`);
      continue;
    }
    if ('location' in choice) {
      warnings.push(`${where}: giveUp on a location choice (its pick could play the event again at once)`);
      continue;
    }
    const own = eventSceneIds(story, owner.scene);
    const minigames = [...own].map((id) => story.scenes.get(id)).filter((sc) => sc?.minigame);
    const afterLoss = reachWithin(story, minigames.map((sc) => sc.minigame.onFailure), own);
    const afterWin = reachWithin(story, minigames.map((sc) => sc.minigame.onVictory), own);
    const beforeTrying = reachWithin(story, [owner.scene], own);
    if (own.has(choice.next)) warnings.push(`${where}: giveUp leads back into its event (a retry, or a question before one)`);
    else if (!afterLoss.has(scene.id) || afterWin.has(scene.id) || beforeTrying.has(scene.id)) {
      warnings.push(`${where}: giveUp not only after a loss (after a win, or before trying)`);
    }
  }
  for (const [name, where] of read) {
    if (!written.has(name)) warnings.push(`${where}: "${name}" is read but nothing sets or adds it`);
  }
  return warnings;
}
