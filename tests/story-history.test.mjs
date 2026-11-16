// story.test.mjs's history checks on synthetic git repos (D37, D38): event names are permanent (a removed or re-pointed
// event fails until its name is listed, active or retired), movedScenes points into an event only from its own old
// scenes, and a merge can't hide a deployed commit. The repos live outside the project (the system temp folder, or
// STORY_TEST_TMP), so a git command can never reach the project's own repository, and are removed after.
//   node tests/story-history.test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('..', import.meta.url));
const outsideRepo = (dir) => {
  const rel = path.relative(fs.realpathSync.native(repo), dir); // absolute when on another drive: outside
  return rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel); // not '..tmp'
};
const asked = process.env.STORY_TEST_TMP;
if (asked) {
  // An absolute path only (a shell that ate the backslashes gives 'C:tmpclaude…', relative to the current folder), and
  // outside the project before anything is made there; checked again below on the real path.
  let existing = path.resolve(asked);
  while (!fs.existsSync(existing)) existing = path.dirname(existing); // its real path: a link into the project counts
  if (!path.isAbsolute(asked) || !outsideRepo(fs.realpathSync.native(existing))) throw new Error(`STORY_TEST_TMP=${asked}: not an absolute folder outside the project (in Git Bash write C:/tmp/…)`);
  fs.mkdirSync(asked, { recursive: true });
}
const BASE = fs.realpathSync.native(asked || os.tmpdir()); // native: Windows short names expanded
if (!outsideRepo(BASE)) throw new Error(`the temp folder ${BASE} is inside the project`);
// The environment for every git and child run: no GIT_* variable from the caller (a pre-commit hook sets GIT_INDEX_FILE,
// a worktree GIT_DIR: either would point git at the caller's repository whatever -C says), and a ceiling at the temp folder.
const cleanEnv = { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^GIT_/i.test(key))), GIT_CEILING_DIRECTORIES: '' };
const TMP = fs.realpathSync(fs.mkdtempSync(path.join(BASE, 'story-history-'))); // one per run: parallel runs don't collide
const STORY_TEST = path.join(repo, 'tests', 'story.test.mjs');
let failures = 0;

const hub = { id: 'hub', lines: [{ text: 'Kam?' }], choices: [{ text: 'Do lesa', location: 'les' }], next: 'end' };
const end = { id: 'end', lines: [{ text: 'k' }], end: { good: true, title: 't', text: 't' } };
const scene = (id, next = 'hub') => ({ id, lines: [{ text: id }], next });
const forest = (events, scenes) => ({ location: { id: 'les', events }, scenes });

function makeRepo(name) {
  const dir = path.join(TMP, name);
  fs.mkdirSync(path.join(dir, 'src', 'engine'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'public', 'story'), { recursive: true });
  for (const file of ['storyFlow.js', 'storyRepository.js']) { // story.test.mjs loads the story as the game does
    fs.copyFileSync(path.join(repo, 'src', 'engine', file), path.join(dir, 'src', 'engine', file));
  }
  fs.writeFileSync(path.join(dir, 'public', 'story', 'story.json'), '{"scenes":[]}'); // the frozen file (its hash check fails here: not read)
  // Git never looks above the temp folder (GIT_CEILING_DIRECTORIES), ignores the machine's signing and hooks, and every
  // command after init first checks it is in this synthetic repo, not a parent one.
  const env = { ...cleanEnv, GIT_CEILING_DIRECTORIES: TMP };
  const raw = (...args) => execFileSync('git', ['-C', dir, '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=', ...args],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env });
  raw('init', '-q', '-b', 'main', '--template='); // no template hooks either (core.hooksPath= turns the machine's off)
  const gitDir = fs.realpathSync(raw('rev-parse', '--absolute-git-dir').trim());
  if (gitDir !== fs.realpathSync(path.join(dir, '.git'))) throw new Error(`git init went to ${gitDir}, not the synthetic repo ${dir}`);
  const git = (...args) => {
    const top = fs.realpathSync(raw('rev-parse', '--show-toplevel').trim());
    if (top !== fs.realpathSync(dir)) throw new Error(`git would run in ${top}, not in the synthetic repo ${dir}`);
    return raw(...args);
  };
  git('config', 'user.email', 'test@example.invalid');
  git('config', 'user.name', 'test');
  git('config', 'core.autocrlf', 'false');
  // The story as it is laid out since D39: characters.json and compatibility.json (the main's movedScenes) as parts.
  // legacyWrite: the layout before it, everything in story-v2.json (old commits still hold it).
  const file = (name, data) => fs.writeFileSync(path.join(dir, 'public', 'story', name), JSON.stringify(data));
  const write = ({ movedScenes = {}, ...main }, part, parts = ['characters.json', 'compatibility.json', 'les.json']) => {
    file('story-v2.json', { id: 't', start: 'hub', parts, ...main, scenes: [hub, end] });
    file('characters.json', { characters: {} });
    file('compatibility.json', { movedScenes });
    file('les.json', part);
  };
  const legacyWrite = (main, part) => {
    file('story-v2.json', { id: 't', start: 'hub', characters: {}, parts: ['les.json'], ...main, scenes: [hub, end] });
    file('les.json', part);
  };
  const commit = (message) => { git('add', '-A'); git('commit', '-q', '-m', message); };
  // The verdict of one of story.test.mjs's checks: 'ok', 'FAIL' or 'missing'.
  const verdict = (label) => {
    let out;
    const env = { ...cleanEnv };
    delete env.NO_GIT; // the history checks are what this test is about
    try {
      out = execFileSync(process.execPath, [STORY_TEST, dir], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...env, GIT_CEILING_DIRECTORIES: TMP } });
    } catch (error) {
      out = String(error.stdout ?? '');
    }
    const line = out.split('\n').find((l) => l.includes(label));
    // A pass also needs the lint clean: a history verdict that only a lint warning contradicts must not hide.
    const lintOk = out.split('\n').some((l) => l.startsWith('ok') && l.includes('story-v2.json and its parts: no warnings'));
    if (!line) return 'missing';
    // Three outcomes: the history check's own FAIL, a pass with the lint clean, or a lint warning (which must never
    // satisfy a "fails" expectation in place of the history check).
    if (line.startsWith('FAIL')) return 'FAIL';
    return lintOk ? 'ok' : 'lint';
  };
  return { dir, git, write, legacyWrite, commit, verdict };
}
const NAMES = 'every committed event name still listed';
const MOVED = 'movedScenes into an event only from its own old scenes';
function expect(name, got, want) {
  const ok = got === want;
  if (!ok) failures += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` (got ${got}, want ${want})`}`);
}

try {
// Removing an event, then retiring it.
{
  const r = makeRepo('remove');
  r.write({}, forest([{ scene: 'a' }, { scene: 'b' }], [scene('a'), scene('b')]));
  r.commit('base');
  r.write({ movedScenes: { b: { scene: 'hub', line: 0 } } }, forest([{ scene: 'a' }], [scene('a')]));
  expect('an event removed (uncommitted): fails', r.verdict(NAMES), 'FAIL');
  r.commit('removed');
  expect('an event removed (committed, as CI sees it): fails', r.verdict(NAMES), 'FAIL');
  r.write({ movedScenes: { b: { scene: 'hub', line: 0 } } }, forest([{ scene: 'a' }, { name: 'b', retired: true }], [scene('a')]));
  r.commit('retired');
  expect('the removed event retired: passes', r.verdict(NAMES), 'ok');
}
// Re-pointing an event at a new intro.
{
  const r = makeRepo('repoint');
  r.write({}, forest([{ scene: 'a' }, { scene: 'b' }], [scene('a'), scene('b')]));
  r.commit('base');
  r.write({}, forest([{ scene: 'a' }, { scene: 'b0' }], [scene('a'), scene('b0', 'b'), scene('b')]));
  r.commit('re-pointed');
  expect('an event re-pointed without its "name" (committed): fails', r.verdict(NAMES), 'FAIL');
  r.write({}, forest([{ scene: 'a' }, { scene: 'b0', name: 'b' }], [scene('a'), scene('b0', 'b'), scene('b')]));
  r.commit('name kept');
  expect('the old name kept, but the refused commit\'s name b0 gone: fails', r.verdict(NAMES), 'FAIL');
  r.write({}, forest([{ scene: 'a' }, { scene: 'b0', name: 'b' }, { name: 'b0', retired: true }], [scene('a'), scene('b0', 'b'), scene('b')]));
  r.commit('b0 retired');
  expect('… and b0 retired too (every committed version counts): passes', r.verdict(NAMES), 'ok');
  const r2 = makeRepo('repoint-clean');
  r2.write({}, forest([{ scene: 'a' }, { scene: 'b' }], [scene('a'), scene('b')]));
  r2.commit('base');
  r2.write({}, forest([{ scene: 'a' }, { scene: 'b0', name: 'b' }], [scene('a'), scene('b0', 'b'), scene('b')]));
  r2.commit('re-pointed with the name kept');
  expect('re-pointed with its "name" kept in one commit: passes', r2.verdict(NAMES), 'ok');
}
// movedScenes from another event's old scene.
{
  const r = makeRepo('moved');
  r.write({}, forest([{ scene: 'a' }, { scene: 'b' }], [scene('a'), scene('b')]));
  r.commit('base');
  r.write({ movedScenes: { a: { scene: 'b', line: 0 } } }, forest([{ name: 'a', retired: true }, { scene: 'b' }], [scene('b')]));
  r.commit('a into b');
  expect('movedScenes from another event\'s old scene: fails', r.verdict(MOVED), 'FAIL');
  r.write({ movedScenes: { a: { scene: 'hub', line: 0 } } }, forest([{ name: 'a', retired: true }, { scene: 'b' }], [scene('b')]));
  r.commit('a to the hub');
  expect('the old id pointed at the hub: passes', r.verdict(MOVED), 'ok');
}
// A merge that keeps one side's story drops the other side's deployed event.
{
  const r = makeRepo('merge');
  r.write({}, forest([{ scene: 'a' }], [scene('a')]));
  r.commit('c0');
  r.git('checkout', '-q', '-b', 'feat');
  r.write({}, forest([{ scene: 'a' }, { scene: 'c' }], [scene('a'), scene('c')]));
  r.commit('feat: c');
  r.git('checkout', '-q', 'main');
  r.write({}, forest([{ scene: 'a' }, { scene: 'b' }], [scene('a'), scene('b')]));
  r.commit('main: b (deployed)');
  r.git('checkout', '-q', 'feat');
  r.git('merge', '-q', '-s', 'ours', '-m', 'merge main', 'main');
  expect('a merge that drops a deployed event: fails', r.verdict(NAMES), 'FAIL');
}
// The split (D39): an old commit with movedScenes in story-v2.json, a newer one with them in compatibility.json.
const LOST = 'no committed id gone without a movedScenes entry in compatibility.json';
{
  const r = makeRepo('split');
  r.legacyWrite({}, forest([{ scene: 'a' }], [scene('a'), scene('old')]));
  r.commit('old id');
  r.legacyWrite({ movedScenes: { old: { scene: 'hub', line: 0 } } }, forest([{ scene: 'a' }], [scene('a')]));
  r.commit('old id moved, in story-v2.json');
  r.write({ movedScenes: { old: { scene: 'hub', line: 0 } } }, forest([{ scene: 'a' }], [scene('a')]));
  r.commit('split');
  expect('movedScenes moved from story-v2.json into compatibility.json: passes', r.verdict(LOST), 'ok');
  r.write({ movedScenes: { old: { scene: 'hub', line: 0 } } }, forest([{ scene: 'a' }], [scene('a')]), ['characters.json', 'les.json']);
  r.commit('compatibility.json dropped from parts');
  expect('compatibility.json dropped from parts: fails', r.verdict(LOST), 'FAIL');
}
// An invalid committed name was never offered: it may go.
{
  const r = makeRepo('invalid');
  r.write({}, forest([{ scene: 'a' }, { scene: 'e-2' }], [scene('a'), scene('e-2')]));
  r.commit('an invalid name');
  r.write({ movedScenes: { 'e-2': { scene: 'hub', line: 0 } } }, forest([{ scene: 'a' }], [scene('a')]));
  r.commit('removed');
  expect('an invalid committed name removed: passes', r.verdict(NAMES), 'ok');
}

// The caller's GIT_DIR / GIT_INDEX_FILE (a pre-commit hook, a worktree) never reach its repository.
if (!process.env.STORY_HISTORY_CHILD) {
  const caller = path.join(TMP, 'caller');
  fs.mkdirSync(caller, { recursive: true });
  const callerGit = (...args) => execFileSync('git', ['-C', caller, '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=', ...args],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...cleanEnv, GIT_CEILING_DIRECTORIES: TMP } });
  callerGit('init', '-q', '-b', 'main');
  callerGit('config', 'user.email', 'test@example.invalid');
  callerGit('config', 'user.name', 'test');
  fs.writeFileSync(path.join(caller, 'file.txt'), 'caller');
  callerGit('add', '-A');
  callerGit('commit', '-q', '-m', 'caller');
  fs.writeFileSync(path.join(caller, 'staged.txt'), 'staged');
  callerGit('add', 'staged.txt');
  const before = [callerGit('rev-parse', 'HEAD'), callerGit('status', '--porcelain'), callerGit('config', 'core.bare')].join('|');
  let child = 'ok';
  try {
    execFileSync(process.execPath, [fileURLToPath(import.meta.url)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, STORY_HISTORY_CHILD: '1', GIT_DIR: path.join(caller, '.git'), GIT_INDEX_FILE: path.join(caller, '.git', 'index') } });
  } catch (error) {
    child = `failed: ${String(error.stdout ?? '').split('\n').filter((l) => l.startsWith('FAIL')).join('; ') || error.message}`;
  }
  let after;
  try {
    after = [callerGit('rev-parse', 'HEAD'), callerGit('status', '--porcelain'), callerGit('config', 'core.bare')].join('|');
  } catch (error) {
    after = `damaged: ${error.message.split('\n')[0]}`; // a leak turned the caller's repo unusable: report it as a FAIL
  }
  expect('run with the caller\'s GIT_DIR and GIT_INDEX_FILE: passes, the caller\'s repo untouched', `${child} ${before === after}`, 'ok true');
}

} finally {
  fs.rmSync(TMP, { recursive: true, force: true });
}
process.exit(failures ? 1 : 0);
