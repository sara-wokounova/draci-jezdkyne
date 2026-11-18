// Act 2a's calendar check (D40): the days and locations walked through every choice and every possible location pick,
// from Act 1's end to a2_konec, plus static checks of the text rules; since D45 also the rescues' minigames (both
// outcomes, the retry, the give-up and the return: the badger's, D45, and the wisent's song, D46) and the badger texts'
// cub count (badgerRules.js's holeCubs). Update it when
// Act 2a's structure changes, or when Act 2b gives a2_konec a way on. Fail-before: tests/mutate/act2a.mutate.mjs.
//   node tests/act2a.test.mjs [repoOrCopy]
import { fileURLToPath, pathToFileURL } from 'node:url';
import fs from 'node:fs';

const root = (process.argv[2] ?? fileURLToPath(new URL('..', import.meta.url))).replaceAll('\\', '/').replace(/\/$/, '');
const F = await import(pathToFileURL(`${root}/src/engine/storyFlow.js`).href);
const R = await import(pathToFileURL(`${root}/src/engine/minigames/badgerRules.js`).href); // pure, for the cub count
const Z = await import(pathToFileURL(`${root}/src/engine/minigames/zubrRules.js`).href); // pure, for the song's words
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
// The location events whose quest is a minigame with a lose screen (D45, D46): the helpers only through the game's
// victory; the lose screen a retry and a give-up (setting lostFlag); the event's first visit and its return after giving
// up each with their own lines (firstEnd: the first visit's last lines; returnLines: exactly the return's).
const RESCUES = [
  { event: 'reka_jezevec', game: 'reka_jezevec_zachrana', win: 'reka_jezevec_pomoc', lose: 'reka_jezevec_prohra',
    helpers: ['jezevci'], lostFlag: 'jezevci_prohra', location: 'reka', firstEnd: '3,4,5,6,7', returnLines: '8,9,10' },
  { event: 'hory_zubr', game: 'hory_zubr_zpev', win: 'hory_zubr_pomoc', lose: 'hory_zubr_prohra',
    helpers: ['zubr', 'melodie'], lostFlag: 'zubr_prohra', location: 'hory', firstEnd: '10,11,12,13', returnLines: '14,15,16,17' },
];
const returns = new Map(RESCUES.map((r) => [r.event, 0])); // each event entered again after giving up its rescue
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
const SONG_LINES = Z.LYRIC.map((_, i) => Z.lyricLine(i).replace(/[.,]$/, ''));
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
    // The shortest night is the solstice, not a time of day; the song's words quoted („…“, in hory_zubr) are the song's.
    const timeText = text.replace(/nejkratší\S* noc\S*/gi, '')
      .replace(/„[^“]*“/g, (quote) => SONG_LINES.reduce((s, line) => s.replaceAll(line, ''), quote));
    if (TIME.test(timeText) && !TIME_SCENES.test(id) && !conditionNames(item.if).includes('pul')) {
      staticProblems.push(`${id} ${where} names a time of day ("${timeText.match(TIME)[0]}"), but this scene can come at any half-day: rephrase, or add an "if" on "pul"`);
    }
  }
}
// A minigame's retry (a choice of its onFailure scene leading back to it) changes nothing: a retry that costs time or
// sets a name would be a different visit each time (and the walk below would never end).
for (const scene of story.scenes.values()) {
  if (!scene.minigame || !act2aIds.has(scene.id)) continue;
  const lose = story.scenes.get(scene.minigame.onFailure);
  for (const [i, choice] of (Array.isArray(lose?.choices) ? lose.choices : []).entries()) {
    if (choice.next === scene.id && (choice.set !== undefined || choice.add !== undefined)) {
      staticProblems.push(`${lose.id} choice ${i}: the retry of ${scene.id} has a set/add (a retry must change nothing; giving up is the way out)`);
    }
  }
}
// The badger event's texts count the cubs (D45): every count word (5–15 as cardinals, ordinals and collectives, or
// digits) names the number of cubs the minigame plays with (DEFAULTS.holeCubs, or the scene's own config).
const COUNT_STEMS = [ // [n, cardinals, ordinal stem, collective stems]
  [5, ['pět', 'pěti'], 'pát', ['pět']], [6, ['šest', 'šesti'], 'šest', ['šest']], [7, ['sedm', 'sedmi'], 'sedm', ['sedm']],
  [8, ['osm', 'osmi'], 'osm', ['osm']], [9, ['devět', 'devíti'], 'devát', ['devat', 'devít']],
  [10, ['deset', 'deseti'], 'desát', ['desít', 'desat']], [11, ['jedenáct', 'jedenácti'], 'jedenáct', []],
  [12, ['dvanáct', 'dvanácti'], 'dvanáct', []], [13, ['třináct', 'třinácti'], 'třináct', []],
  [14, ['čtrnáct', 'čtrnácti'], 'čtrnáct', []], [15, ['patnáct', 'patnácti'], 'patnáct', []],
];
const ORDINAL = '(?:á|é|ý|í|ého|ému|ém|ou|ých|ým|ými)';
const COUNT_WORDS = COUNT_STEMS.map(([n, cardinals, ordinal, collectives]) => [n, new RegExp(`^(?:${[...cardinals,
  `${ordinal}${ORDINAL}`, ...collectives.map((c) => `${c}(?:ice|ero|ka|ku)\\p{L}*`)].join('|')})$`, 'iu')]);
const countOf = (word) => (/^\d+$/.test(word) ? Number(word) : COUNT_WORDS.find(([, re]) => re.test(word))?.[0]);
// Whole words and whole numbers: "zpět", "devatenáct", "sedmikráska" or "19" are no count of 5–15.
const countWordsIn = (text) => [...text.matchAll(/(?<!\p{L})\p{L}+(?!\p{L})|(?<!\d)\d+(?!\d)/gu)].map((m) => m[0])
  .filter((word) => countOf(word) >= 5 && countOf(word) <= 15);
const badgerGame = story.scenes.get('reka_jezevec_zachrana');
if (!badgerGame?.minigame) staticProblems.push('reka_jezevec_zachrana is not the badger rescue\'s minigame scene');
else {
  const cubs = R.normalize(badgerGame.minigame.config ?? {}).total;
  let named = 0;
  for (const id of F.eventSceneIds(story, 'reka_jezevec')) {
    const scene = story.scenes.get(id);
    const items = [...scene.lines.map((l, i) => [`line ${i}`, l]),
      ...(Array.isArray(scene.choices) ? scene.choices.map((c, i) => [`choice ${i}`, c]) : [])];
    for (const [where, item] of items) {
      for (const word of countWordsIn(String(item.text ?? ''))) {
        named += 1;
        if (countOf(word) !== cubs) {
          staticProblems.push(`${id} ${where} says "${word}", but the badger rescue plays with ${cubs} cubs: change the text to the new count, pin config.holeCubs on reka_jezevec_zachrana, or reword a number that isn't a cub count (e.g. "pět děr")`);
        }
      }
    }
  }
  if (named === 0) staticProblems.push(`the badger event's texts never say how many cubs (${cubs}): name the cub count, or extend the count words' table in tests/act2a.test.mjs`);
}
for (const id of ['a2_kam', 'haj_otazka']) {
  const scene = story.scenes.get(id);
  const heads = id === 'a2_kam' ? scene.lines : [scene.lines.at(-1)];
  for (const line of heads) if (line.text.length > 40) staticProblems.push(`${id}: "${line.text}" is over 40 characters (the phone panel's heading): shorten it`);
}
if (staticProblems.length) staticProblems.forEach(textFail);
else ok('static: no if reads its own scene\'s set or a finale name; Rubínka only with vedma; times of day only where allowed; headings ≤ 40; retries change nothing; the cub count in the badger texts');

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

function enter(id, memory, taps, from = null) {
  const land = F.resolveEntry(story, id, memory);
  if (land.dead) return problem(`dead end into ${id}`);
  const m = land.memory;
  const sid = land.scene.id;
  if (land.scene.lines.length === 0 && !land.scene.minigame && F.followUp(story, land.scene, m).kind !== 'choices') {
    return problem(`a pass-through shown: ${sid}`);
  }
  // The rescues (D45, D46): the helpers only through the minigame's victory; the return after giving up its own lines.
  for (const r of RESCUES) {
    for (const name of r.helpers) {
      if (get(m, name) && !get(memory, name) && !(sid === r.win && from === r.game)) {
        problem(`${name} set by ${sid} (from ${from}), not by ${r.game}'s victory`);
      }
    }
    if (sid !== r.event) continue;
    const shown = F.visibleLines(land.scene, m).join(',');
    const back = r.returnLines.split(',');
    if (get(m, r.lostFlag)) {
      returns.set(r.event, returns.get(r.event) + 1);
      if (shown !== r.returnLines) problem(`${sid} after giving up shows lines ${shown}, not ${r.returnLines}`);
    } else if (shown.split(',').some((i) => back.includes(i)) || !shown.endsWith(r.firstEnd)) {
      problem(`${sid}'s first visit shows lines ${shown}`);
    }
  }
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
  if (sid === 'haj_01' && from !== 'haj_lisky') problem('the grove entered without the fox family before it (D41)');
  if (sid === 'haj_konec' && ['haj_nebe', 'haj_zeme', 'haj_nav'].filter((h) => get(m, h)).length !== 2) {
    problem('the grove visit did not unveil exactly two distinct heads');
  }
  walk(land.scene, land.line, m, taps + 1, from);
}

function walk(scene, line, memory, taps, from = null) {
  if (taps > 2000) return problem(`over 2000 taps at ${scene.id}`);
  const k = key(scene, line, memory);
  // A retry from the minigame's own lose scene comes back to the state it left: that branch is walked already.
  if (onPath.has(k) && scene.minigame && from === scene.minigame.onFailure) return;
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
  const rescue = RESCUES.find((r) => r.event === scene.id || r.lose === scene.id);
  if (rescue?.event === scene.id && (after.kind !== 'next' || after.id !== rescue.game)) {
    problem(`${scene.id} leads to ${after.id ?? after.kind}, not the minigame`);
  }
  if (rescue?.lose === scene.id) {
    const choices = after.choices ?? [];
    const retry = choices.filter((c) => c.next === rescue.game && c.giveUp !== true);
    const giveUp = choices.filter((c) => c.giveUp === true);
    if (choices.length !== 2 || retry.length !== 1 || giveUp.length !== 1) {
      problem(`${scene.id} shows ${choices.length} choices (${retry.length} retry, ${giveUp.length} giveUp), not a retry and a give-up`);
    }
  }
  const targets = after.kind === 'minigame' ? [[scene.minigame.onVictory, memory], [scene.minigame.onFailure, memory]]
    : after.kind === 'choices' ? after.choices.flatMap((c) => {
    // A give-up (D37) un-plays its event, as the engine does (startVisualNovel.js's pickChoice).
    const m = c.giveUp === true ? F.giveUpMemory(story, scene, c, memory) : F.applyChanges(memory, c);
    if (c.giveUp === true && rescue?.lose === scene.id) {
      const { event, lostFlag, location } = rescue;
      if (get(m, 'pul') !== pul) problem(`giving up ${event}'s rescue changed pul ${pul} → ${get(m, 'pul')}`);
      if (get(m, event) || !get(m, lostFlag)) problem(`giving up ${event}'s rescue didn't un-play it or set ${lostFlag}`);
      if (pul < 6 && !F.eventCandidates(story, location, m).some((e) => e.scene === event)) {
        problem(`after giving up at pul ${pul} the location ${location} can't offer ${event} again`);
      }
    }
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
  for (const [id, m] of targets) enter(id, m, taps, scene.id);
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
for (const [event, count] of returns) if (count === 0) fail(`no path comes back to ${event} after giving up its rescue`);
process.exit(failures ? 1 : 0);
