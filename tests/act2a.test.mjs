// Act 2a's calendar check (D40): the days and locations walked through every choice and every possible location pick,
// from Act 1's end to a2_konec, plus static checks of the text rules. Update it when Act 2a's structure changes, or when
// Act 2b gives a2_konec a way on.
//   node tests/act2a.test.mjs [repoOrCopy]
import { fileURLToPath, pathToFileURL } from 'node:url';
import fs from 'node:fs';

const root = (process.argv[2] ?? fileURLToPath(new URL('..', import.meta.url))).replaceAll('\\', '/').replace(/\/$/, '');
const F = await import(pathToFileURL(`${root}/src/engine/storyFlow.js`).href);
const DIR = `${root}/public/story/`;
const read = (name) => JSON.parse(fs.readFileSync(DIR + name, 'utf8'));
const main = read('story-v2.json');
const names = F.partNames(main);
const parts = new Map(names.map((name) => [name, read(name)]));
const story = F.normalizeStory(F.mergeStory(main, parts, []), []);
const act2aFiles = names.filter((name) => name === 'act2a.json' || name.startsWith('lokace-'));
const act2aIds = new Set(act2aFiles.flatMap((name) => parts.get(name).scenes.map((scene) => scene.id)));

let failures = 0;
const fail = (message, hint = 'update tests/act2a.test.mjs if Act 2a\'s structure changed on purpose') => {
  failures += 1;
  console.log(`FAIL Act 2a's calendar check: ${message}\n     (${hint})`);
};
const textFail = (message) => fail(message, 'a text rule of D40: rephrase the line, or give it the "if" the message names');
for (const id of ['act1_end', 'a2_rano1', 'a2_liska', 'a2_kam', 'haj_otazka', 'a2_konec']) {
  if (!story.scenes.has(id)) {
    fail(`the scene ${id} is missing`);
    process.exit(1);
  }
}
const ok = (message) => console.log(`ok   ${message}`);
const conditionNames = (value) => (value === undefined ? [] : (Array.isArray(value) ? value : [value]))
  .map((c) => String(c).replace(/^!/, '').replace(/ *(>=|<) *\d+$/, ''));

// --- static checks ----------------------------------------------------------------------------------------------
// Read by the finale, never by Act 2a's texts; each with the name of where the riders heard it, to read instead.
const FINALE = new Map([['studanka', '"vily" or "haj_nav"'], ['hlas', '"haj_zeme"'], ['melodie', '"zubr"']]);
// Whole words only ("rána" is left out: it is also a blow).
const TIME = /(?<!\p{L})(ráno|ránem|ranní\p{L}*|večer\p{L}*|dopoledn\p{L}*|poledn\p{L}*|odpoledn\p{L}*|setm\p{L}*|dnes\p{L}*|zítra|zítřejš\p{L}*|noc|noci|nocí|noční\p{L}*|půlnoc\p{L}*|svítání|soumrak\p{L}*|včera|pozítří)(?!\p{L})/iu;
// A condition list as written ("!vedma" is not "vedma").
const conditionList = (value) => (value === undefined ? [] : (Array.isArray(value) ? value : [value])).map(String);
const TIME_SCENES = /^(a2_rano[123]|a2_noc.*|a2_vecer3|a2_unos|a2_konec|a2_kam|les_sona|les_sona_slib|les_sona_ne)$/;
const VEDMA_SCENES = new Set(['vedma_01', 'vedma_zlost', 'vedma_pochopeni', 'vedma_voda']);
const staticProblems = [];
for (const id of act2aIds) {
  const scene = story.scenes.get(id);
  const own = new Set(Array.isArray(scene.set) ? scene.set : []);
  const readers = [
    ...scene.lines.map((line, i) => [`line ${i}`, line.if]),
    ...(Array.isArray(scene.choices) ? scene.choices.map((c, i) => [`choice ${i}`, c.if]) : []),
    ...(Array.isArray(scene.next) ? scene.next.map((n, i) => [`next ${i}`, n.if]) : []),
  ];
  for (const [where, cond] of readers) {
    for (const name of conditionNames(cond)) {
      if (own.has(name)) staticProblems.push(`${id} ${where} reads "${name}", which its own scene sets (always true there): move the line to a later scene, or drop the if`);
      if (FINALE.has(name)) staticProblems.push(`${id} ${where} reads "${name}" (kept for the finale): read where the riders heard it instead, ${FINALE.get(name)}`);
    }
  }
  const texts = [...scene.lines.map((line, i) => [`line ${i}`, line]), ...(Array.isArray(scene.choices) ? scene.choices.map((c, i) => [`choice ${i}`, c]) : [])];
  for (const [where, item] of texts) {
    const text = String(item.text ?? '');
    if (/Rubín[kč]/.test(text) && !VEDMA_SCENES.has(id) && !conditionList(item.if).includes('vedma')) {
      staticProblems.push(`${id} ${where} names Rubínka, a name only the vědma tells: add "if": "vedma" (and a "!vedma" twin saying "čarodějnice")`);
    }
    const timeText = text.replace(/nejkratší\S* noc\S*/gi, ''); // the shortest night is the solstice, not a time of day
    if (TIME.test(timeText) && !TIME_SCENES.test(id) && !conditionNames(item.if).includes('pul')) {
      staticProblems.push(`${id} ${where} names a time of day ("${timeText.match(TIME)[0]}"), but this scene can come at any half-day: rephrase, or add an "if" on "pul"`);
    }
  }
}
for (const id of ['a2_kam', 'haj_otazka']) {
  const scene = story.scenes.get(id);
  const heads = id === 'a2_kam' ? scene.lines : [scene.lines.at(-1)];
  for (const line of heads) if (line.text.length > 40) staticProblems.push(`${id}: "${line.text}" is over 40 characters (the phone panel's heading): shorten it`);
}
if (staticProblems.length) staticProblems.forEach(textFail);
else ok('static: no if reads its own scene\'s set or a finale name; Rubínka only with vedma; times of day only where allowed; headings ≤ 40');

// --- the walk ---------------------------------------------------------------------------------------------------
const key = (scene, line, memory) => `${scene.id}:${line}:${[...memory].filter(([, v]) => v).sort().join(',')}`;
const seenLines = new Set();
const done = new Set();
const onPath = new Set();
let states = 0;
let endings = 0;
let problems = 0;
const problem = (message) => {
  if (problems < 20) fail(message);
  problems += 1;
};
const get = (memory, name) => memory.get(name) ?? 0;

function enter(id, memory, taps) {
  const land = F.resolveEntry(story, id, memory);
  if (land.dead) return problem(`dead end into ${id}`);
  if (land.scene.lines.length === 0) return problem(`a pass-through shown: ${land.scene.id}`);
  const m = land.memory;
  const sid = land.scene.id;
  // Entry rules (the scene's own changes already applied).
  if (sid === 'a2_rano2' && memory.get('rano2')) problem('day 2\'s morning twice');
  if (sid === 'a2_rano3' && memory.get('rano3')) problem('day 3\'s morning twice');
  if (/^a2_rano[23]$|^a2_vecer3$/.test(sid) && get(m, 'slib') && !get(m, 'noc')) problem(`${sid} after Soňa's promise without the night`);
  if (sid === 'a2_noc') {
    if (memory.get('noc')) problem('the night twice');
    if (get(m, 'pul') % 2 !== 1) problem(`the night doesn't take the next morning (pul ${get(m, 'pul')} after it)`);
  }
  if (sid === 'a2_unos') {
    if (memory.get('unos')) problem('Bezzubka taken twice');
    if (get(m, 'pul') !== 6) problem(`Bezzubka taken at pul ${get(m, 'pul')}`);
  }
  if (sid === 'a2_kam' && get(m, 'unos')) problem('the hub after the abduction');
  if (sid === 'haj_konec' && ['haj_nebe', 'haj_zeme', 'haj_nav'].filter((h) => get(m, h)).length !== 2) {
    problem('the grove visit did not unveil exactly two distinct heads');
  }
  walk(land.scene, land.line, m, taps + 1);
}

function walk(scene, line, memory, taps) {
  if (taps > 2000) return problem(`over 2000 taps at ${scene.id}`);
  const k = key(scene, line, memory);
  if (onPath.has(k)) return problem(`a loop at ${scene.id} line ${line}`);
  if (done.has(k)) return;
  done.add(k);
  states += 1;
  onPath.add(k);
  seenLines.add(`${scene.id}:${line}`);
  const later = F.nextLine(scene, line, memory);
  if (later !== null) {
    walk(scene, later, memory, taps + 1);
    onPath.delete(k);
    return;
  }
  if (scene.id === 'a2_konec') {
    endings += 1;
    onPath.delete(k);
    return;
  }
  const pul = get(memory, 'pul');
  if (scene.id === 'a2_kam') {
    if (pul < 0 || pul > 5) problem(`the hub at pul ${pul}`);
    const visible = scene.lines.filter((l) => F.conditionMet(l.if, memory));
    if (visible.length !== 1) problem(`the hub shows ${visible.length} lines at pul ${pul}`);
  }
  const after = F.followUp(story, scene, memory);
  if (scene.id === 'a2_kam' || scene.id === 'haj_otazka') {
    if (after.kind !== 'choices') problem(`${scene.id} without a choice`);
    else {
      const dest = after.choices.map((c) => c.location ?? c.next);
      if (new Set(dest).size !== dest.length) problem(`${scene.id}: two choices to one place (${dest.join(', ')})`);
      if (scene.id === 'a2_kam' && !after.choices.some((c) => c.next === 'a2_odpocinek')) problem('the hub without the rest choice');
      if (scene.id === 'haj_otazka' && dest.length !== 3 - get(memory, 'hlavy')) {
        problem(`Triglav's question shows ${dest.length} choices with ${get(memory, 'hlavy')} heads unveiled`);
      }
    }
  }
  const targets = after.kind === 'choices' ? after.choices.flatMap((c) => {
    const m = F.applyChanges(memory, c);
    if (c.location === undefined) return [[c.next, m]];
    const candidates = F.eventCandidates(story, c.location, m);
    if (c.location === 'les' && !get(m, 'les_sona') && !(candidates.length === 1 && candidates[0].scene === 'les_sona')) {
      problem('the forest\'s first event is not Soňa');
    }
    if (candidates.some((e) => e.scene === 'hory_doupe') && !get(m, 'vedma')) problem('the lair before the vědma');
    return candidates.map((e) => {
      if (get(m, F.eventName(e))) problem(`${F.eventName(e)} played twice`);
      return [e.scene, F.applyChanges(m, { set: [F.eventName(e)] })];
    });
  }) : after.kind === 'next' ? [[after.id, memory]] : [];
  if (targets.length === 0) problem(`stuck at ${scene.id} (${after.kind})`);
  for (const [id, m] of targets) enter(id, m, taps);
  onPath.delete(k);
}

const act1End = story.scenes.get('act1_end');
const first = F.followUp(story, act1End, new Map());
if (first.kind !== 'next' || first.id !== 'a2_rano1') fail(`act1_end leads to ${first.id ?? first.kind}, not a2_rano1`);
const intoLiska = F.followUp(story, story.scenes.get('a2_rano1'), new Map());
if (intoLiska.kind !== 'next' || intoLiska.id !== 'a2_liska') fail('a2_rano1 doesn\'t lead to a2_liska');
const firstHub = F.resolveEntry(story, F.followUp(story, story.scenes.get('a2_liska'), new Map()).id, new Map());
if (firstHub.scene.id !== 'a2_kam' || get(firstHub.memory, 'pul') !== 0) fail(`the first hub is ${firstHub.scene.id} at pul ${get(firstHub.memory, 'pul')}`);
else if (!F.conditionMet(firstHub.scene.lines[firstHub.line].if, firstHub.memory) || !/^První den ráno/.test(firstHub.scene.lines[firstHub.line].text)) fail('the first hub doesn\'t say "První den ráno…"');

enter('a2_rano1', new Map(), 0);
const unseen = [...act2aIds].flatMap((id) => story.scenes.get(id).lines.map((line, i) => [id, i, line]))
  .filter(([id, i, line]) => !seenLines.has(`${id}:${i}`) && !conditionNames(line.if).some((n) => n.startsWith('bobri_')));
unseen.slice(0, 20).forEach(([id, i]) => fail(`${id} line ${i} is never shown`, 'check the line\'s "if": a misspelt name, or a condition no path can meet'));
if (problems > 20) fail(`… and ${problems - 20} more`);
if (!problems && !unseen.length) ok(`walk: ${states} states, ${endings} endings on a2_konec; every line shown; the calendar, the night, the abduction, Triglav and the picks hold`);
if (endings === 0) fail('no path reaches a2_konec');
process.exit(failures ? 1 : 0);
