// The story files (D37), story-agnostic so later edits don't break it: story-v2.json merged with its parts passes
// normalizeStory and lintStory with no warning; every listed part and every referenced file (parts, backgrounds,
// sprites, music) is in git; no scene id of a committed version is gone without a movedScenes entry; every committed
// event name is still listed (active or retired); movedScenes points into an event only from its own old scenes; the
// frozen story.json is unchanged; every character's pose textures have one size.
//   node tests/story.test.mjs [repo]      NO_GIT=1 skips the comparison with committed versions (not the git ls-files check)
import { fileURLToPath, pathToFileURL } from 'node:url';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';

const repo = (process.argv[2] ?? fileURLToPath(new URL('..', import.meta.url))).replaceAll('\\', '/').replace(/\/$/, '');
const F = await import(pathToFileURL(`${repo}/src/engine/storyFlow.js`).href);
const { StoryRepository } = await import(pathToFileURL(`${repo}/src/engine/storyRepository.js`).href);
const DIR = `${repo}/public/story/`;
const FROZEN_SHA256 = '84aba5536dbd0ec53afe41d3545604f1cc3e0dbda748ff31e53b5e7fbeed5486'; // story.json at the conversion
// Read-only git, without the caller's GIT_* variables (a pre-commit hook or a worktree would point it at another history).
// GIT_CEILING_DIRECTORIES stays: story-history.test.mjs fences its synthetic repos with it.
const gitEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^GIT_(?!CEILING_DIRECTORIES$)/i.test(key)));
const git = (...args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'pipe'], env: gitEnv });
let failures = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failures += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok || !detail ? '' : `\n     ${detail}`}`);
};

function load(read) {
  const main = JSON.parse(read('story-v2.json'));
  const names = F.partNames(main);
  const parts = new Map(names.map((name) => [name, JSON.parse(read(name))]));
  const warnings = [];
  const merged = F.mergeStory(main, parts, warnings);
  const story = F.normalizeStory(merged, warnings);
  return { main, names, story, warnings, merged };
}

let loaded;
try {
  loaded = load((name) => fs.readFileSync(DIR + name, 'utf8'));
} catch (error) {
  check('story-v2.json and its parts load', false, error.message);
  process.exit(1);
}
const { main, names, story, warnings } = loaded;
const lint = [...warnings, ...F.lintStory(story)];
check('story-v2.json and its parts: no warnings', lint.length === 0, lint.join('\n     '));
// The game's own load checks (a start, scenes, a start that resolves): StoryRepository.fromData, as the game runs it.
let loadError = '';
try {
  StoryRepository.fromData(loaded.merged, []);
} catch (error) {
  loadError = error.message;
}
check('the story loads as the game loads it', !loadError, loadError);

const tracked = new Set(git('ls-files').split('\n').filter(Boolean));
const referenced = new Set(['public/story/story-v2.json', ...names.map((name) => `public/story/${name}`)]);
for (const scene of story.scenes.values()) {
  if (scene.background?.type === 'image' && typeof scene.background.src === 'string') referenced.add(`public/${scene.background.src}`);
}
for (const character of Object.values(story.characters)) {
  for (const src of Object.values(character?.sprites ?? {})) if (typeof src === 'string') referenced.add(`public/${src}`);
}
for (const src of Object.values(story.assets?.music ?? {})) if (typeof src === 'string') referenced.add(`public/${src}`);
const missing = [...referenced].filter((path) => !tracked.has(path));
check(`every referenced file is in git (${referenced.size})`, missing.length === 0, missing.join('\n     '));

const sha = crypto.createHash('sha256').update(fs.readFileSync(DIR + 'story.json', 'utf8').replace(/\r\n/g, '\n')).digest('hex');
check('the frozen story.json is unchanged', sha === FROZEN_SHA256, sha);

// Ids that must keep placing: every scene id and movedScenes key of every committed version, and every id of the
// frozen story.json (old-key saves and cached old tabs can carry them).
const placeable = (id) => story.scenes.has(id) || story.movedScenes.has(id);
const frozen = JSON.parse(fs.readFileSync(DIR + 'story.json', 'utf8'));
const lostFrozen = frozen.scenes.map((scene) => scene.id).filter((id) => !placeable(id));
check('every id of the frozen story.json places', lostFrozen.length === 0, lostFrozen.join(', '));
if (process.env.NO_GIT) {
  console.log('skip committed versions (NO_GIT)');
} else {
  // Every commit that touched the story folder (a part-only edit too). A version that has no story-v2.json yet (before
  // the conversion) or doesn't load (a part forgotten in that commit, broken JSON) is skipped with a note: only the
  // working copy must load cleanly, or one bad push would block every later deploy.
  // --full-history: a merge whose story equals one parent's would otherwise hide the other side's (deployed) commits.
  // A shallow clone would hide every older version (only HEAD, which already holds the edit): refuse it.
  check('the clone has the full history (not shallow)', git('rev-parse', '--is-shallow-repository').trim() !== 'true',
    'fetch the whole history (CI: actions/checkout with fetch-depth: 0)');
  const commits = git('log', '--full-history', '--reverse', '--format=%H', '--', 'public/story/').split('\n').filter(Boolean); // oldest first
  const lost = new Set();
  const eventScenesByName = new Map(); // event name → every scene id it had in a committed version
  const committedNames = new Map(); // event name → the commit it first appears in
  // An event's name marks it played in saves, so it is permanent: once committed it stays listed in its location,
  // active or retired (`"retired": true`, never offered). Renaming the event's scene or re-pointing it at a new intro
  // changes an implicit name (its scene id): keep the old one as `"name"`.
  const events = (st) => [...st.locations.values()].flatMap((location) => location.events)
      .filter((event) => event && typeof F.eventName(event) === 'string');
  const current = events(story);
  const currentNames = new Set(current.map(F.eventName));
  let compared = 0;
  let newestLoads = true; // the newest committed version must load with today's engine, or the history check is blind
  for (const commit of commits) {
    if (!git('ls-tree', '--name-only', commit, 'public/story/').split('\n').includes('public/story/story-v2.json')) continue; // before the conversion
    let old;
    try {
      old = load((name) => git('show', `${commit}:public/story/${name}`));
      newestLoads = true;
    } catch (error) {
      newestLoads = false;
      console.log(`note: ${commit.slice(0, 7)} doesn't load, skipped (${error.message.split('\n')[0].slice(0, 80)})`);
      continue;
    }
    compared += 1;
    for (const id of [...old.story.scenes.keys(), ...old.story.movedScenes.keys()]) if (!placeable(id)) lost.add(`${id} (${commit.slice(0, 7)})`);
    for (const event of events(old.story)) {
      const name = F.eventName(event);
      if (!committedNames.has(name)) committedNames.set(name, commit.slice(0, 7));
      if (typeof event.scene === 'string') {
        eventScenesByName.set(name, new Set([...(eventScenesByName.get(name) ?? []), ...F.eventSceneIds(old.story, event.scene)]));
      }
    }
  }
  // A name that isn't a valid memory name was never offered (availableEvents), so never in a save: it may go.
  const gone = [...committedNames].filter(([name]) => F.isName(name) && !currentNames.has(name)).map(([name, commit]) => `${name} (${commit})`);
  check('the newest committed version loads (else the history checks compare nothing)', newestLoads,
    'an engine change that refuses the old files blinds this test: keep reading them');
  check(`no committed id gone without a movedScenes entry (${compared} versions)`, lost.size === 0, [...lost].join(', '));
  check('every committed event name still listed (active, or { "name", "retired": true })', gone.length === 0, gone.join(', '));
  // Saves are placed without marking events: a movedScenes entry may point into an event's scenes (its first scene and
  // what only it leads to) only from an id that was one of that same event's scenes (by name) in a committed version:
  // a rename, a second rename, a merge of the event's own scenes.
  const ownerOf = new Map(); // a current scene id → the name of the event it belongs to
  for (const event of current) {
    if (typeof event.scene === 'string' && event.retired !== true) {
      for (const id of F.eventSceneIds(story, event.scene)) ownerOf.set(id, F.eventName(event));
    }
  }
  const intoEvents = [...story.movedScenes].filter(([, place]) => ownerOf.has(place.scene))
      .filter(([id, place]) => !eventScenesByName.get(ownerOf.get(place.scene))?.has(id))
      .map(([id, place]) => `${id} → ${place.scene}`);
  check('movedScenes into an event only from its own old scenes (a save there would play it unmarked)', intoEvents.length === 0,
    intoEvents.join(', '));
}

// One canvas per character: every pose texture of a character has the same size (D37: scale sizes the texture).
const sizes = [];
for (const [id, character] of Object.entries(story.characters)) {
  const dims = new Set(Object.values(character?.sprites ?? {}).map((src) => {
    if (!fs.existsSync(`${repo}/public/${src}`)) return `missing ${src}`;
    const header = fs.readFileSync(`${repo}/public/${src}`).subarray(16, 24); // the PNG IHDR's width and height
    return `${header.readUInt32BE(0)}x${header.readUInt32BE(4)}`;
  }));
  if (dims.size > 1 || [...dims].some((dim) => dim.startsWith('missing'))) sizes.push(`${id}: ${[...dims].join(' / ')}`);
}
check("every character's poses share one texture size", sizes.length === 0, sizes.join('\n     '));

process.exit(failures ? 1 : 0);
