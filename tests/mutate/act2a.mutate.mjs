// Fail-before for tests/act2a.test.mjs: breaks the story (or the cub count) one thing at a time in a copy and runs the
// test there; every mutation must make it fail, and the controls marked `pass` must not. D40's calendar and text rules
// (moved in from C:\tmp\claude\act2a-build\mutate.mjs), D45's badger rescue and D46's wisent song.
//   node tests/mutate/act2a.mutate.mjs [part of a mutation name]
// The copy: see runMutations.mjs. On Windows in Git Bash: MUTATE_TMP=C:/tmp/claude/mutate node tests/mutate/act2a.mutate.mjs
import fs from 'node:fs';
import { REPO, runMutations } from './runMutations.mjs';
import { lyricLine } from '../../src/engine/minigames/zubrRules.js';

const files = ['src/engine/storyFlow.js', 'src/engine/minigames/badgerRules.js', 'src/engine/minigames/zubrRules.js',
  'src/engine/minigames/configRules.js',
  ...fs.readdirSync(`${REPO}/public/story`).filter((n) => n.endsWith('.json')).map((n) => `public/story/${n}`)];
const STORY = 'public/story/';
const ACT = `${STORY}act2a.json`;
const LES = `${STORY}lokace-les.json`;
const HORY = `${STORY}lokace-hory.json`;
const REKA = `${STORY}lokace-reka.json`;
const RULES = 'src/engine/minigames/badgerRules.js';
/** A change to a story part (`change(part)`). */
const part = (change) => (text) => {
  const parsed = JSON.parse(text);
  change(parsed);
  return `${JSON.stringify(parsed, null, 2)}\n`;
};
const sc = (p, id) => p.scenes.find((s) => s.id === id);
/** A change to one scene of a part. */
const scene = (id, change) => part((p) => change(sc(p, id)));
const lineText = (id, index, change) => scene(id, (s) => { s.lines[index].text = change(s.lines[index].text); });

runMutations({
  prefix: 'act2a-mutate',
  files,
  test: 'tests/act2a.test.mjs',
  mutations: [
    // D40: the calendar, the locations, Triglav, the text rules.
    ['router pul>=6 removed', ACT, scene('a2_cesta', (s) => { s.next = s.next.filter((n) => n.if !== 'pul>=6'); })],
    ['lair without its if', HORY, part((p) => { delete p.location.events[0].if; })],
    ['promise allowed on day 3', LES, scene('les_sona', (s) => { s.choices[0].if = 'pul<7'; })],
    ['hlavy>=3', ACT, part((p) => { for (const id of ['haj_nebe', 'haj_zeme', 'haj_nav']) sc(p, id).next[0].if = 'hlavy>=3'; })],
    ['the fox adds pul', ACT, scene('a2_liska', (s) => { s.add = { pul: 1 }; })],
    ['rano2 without its set', ACT, scene('a2_rano2', (s) => { delete s.set; })],
    ['rano3 without its set', ACT, scene('a2_rano3', (s) => { delete s.set; })],
    ['rest with if pul<5', ACT, scene('a2_kam', (s) => { s.choices.find((c) => c.next === 'a2_odpocinek').if = 'pul<5'; })],
    ['a hub line of 41 characters', ACT, scene('a2_kam', (s) => { s.lines[0].text = 'X'.repeat(41); })],
    ['Soňa without first', LES, part((p) => { delete p.location.events[0].first; })],
    ['a wording without !vedma', ACT, scene('haj_otazka', (s) => { s.choices[0].if = '!haj_nebe'; })],
    ['a head choice without its !haj_*', ACT, scene('haj_otazka', (s) => { delete s.choices[2].if; })],
    ['a haj_nav line inside haj_nav', ACT, scene('haj_nav', (s) => { s.lines.push({ text: 'x', if: 'haj_nav' }); })],
    ['a vědma line on studanka', ACT, scene('vedma_voda', (s) => { s.lines.unshift({ text: 'x', if: 'studanka' }); })],
    ['a !vedma line in vedma_voda', ACT, scene('vedma_voda', (s) => { s.lines.unshift({ text: 'x', if: '!vedma' }); })],
    ['the hub\'s first line on pul<2', ACT, scene('a2_kam', (s) => { s.lines[0].if = 'pul<2'; })],
    ['the forest choice duplicated', ACT, scene('a2_kam', (s) => { s.choices.unshift({ ...s.choices[0], text: 'Les 2' }); })],
    ['a2_cesta given a line', ACT, scene('a2_cesta', (s) => { s.lines = [{ text: 'x' }]; })],
    ['a2_noc without its add', ACT, scene('a2_noc', (s) => { delete s.add; })],
    ['the router\'s !noc removed', ACT, scene('a2_cesta', (s) => {
      for (const n of s.next) if (Array.isArray(n.if)) n.if = n.if.filter((c) => c !== '!noc');
    })],
    ['a2_unos to the hub', ACT, scene('a2_unos', (s) => { s.next = 'a2_kam'; })],
    ['Rubínka without vedma', ACT, scene('a2_hejkal', (s) => { s.lines.push({ text: 'Rubínka tu byla.' }); })],
    ['a time of day in an event', HORY, scene('hory_zubr', (s) => { s.lines.push({ text: 'Bylo ráno.' }); })],
    ['Rubínka in a !vedma choice', ACT, scene('haj_otazka', (s) => { s.choices[1].text = 'Kde je Rubínka, ta čarodějnice?'; })],
    ['"dopoledne" in an event', HORY, scene('hory_zubr', (s) => { s.lines.push({ text: 'Bylo dopoledne.' }); })],
    ['a time word in an event\'s choice', ACT, scene('vedma_01', (s) => { s.choices[0].text = 'Počkat do večera'; })],
    ['the grove without the fox family', ACT, scene('a2_kam', (s) => { s.choices.find((c) => c.next === 'haj_lisky').next = 'haj_01'; })],
    ['haj_otazka missing', ACT, part((p) => { p.scenes = p.scenes.filter((s) => s.id !== 'haj_otazka'); })],
    // D45: the badger rescue.
    ['the retry costs time', REKA, scene('reka_jezevec_prohra', (s) => { s.choices[0].add = { pul: 1 }; })],
    ['a third choice on the lose screen', REKA, scene('reka_jezevec_prohra', (s) => { s.choices.push({ text: 'Jinam.', next: 'a2_cesta' }); })],
    ['the give-up without giveUp', REKA, scene('reka_jezevec_prohra', (s) => { delete s.choices[1].giveUp; })],
    ['the give-up without jezevci_prohra', REKA, scene('reka_jezevec_prohra', (s) => { delete s.choices[1].set; })],
    ['the return lines on the first visit too', REKA, scene('reka_jezevec', (s) => { s.lines.slice(8).forEach((l) => { delete l.if; }); })],
    ['the first visit\'s lines on the return too', REKA, scene('reka_jezevec', (s) => { delete s.lines[5].if; })],
    ['the victory onto the lose screen', REKA, scene('reka_jezevec_zachrana', (s) => { s.minigame.onVictory = 'reka_jezevec_prohra'; })],
    ['the event straight to its win', REKA, scene('reka_jezevec', (s) => { s.next = 'reka_jezevec_pomoc'; })],
    ['a retry from another scene is a loop', REKA, scene('reka_jezevec_pomoc', (s) => { s.next = 'reka_jezevec_zachrana'; })],
    ['an ordinal of another count', REKA, lineText('reka_jezevec_pomoc', 6, (t) => t.replace('deváté', 'sedmé'))],
    ['a cardinal of another count', REKA, lineText('reka_jezevec', 6, (t) => t.replace('Devět', 'Sedm'))],
    ['a digit of another count', REKA, lineText('reka_jezevec', 7, (t) => `${t} Je jich 7.`)],
    ['no count word at all', REKA, (text) => text.replace(/[Dd]evět|[Dd]eváté/g, 'všechna')],
    ['the game plays seven cubs', RULES, 'holeCubs: [1, 1, 2, 2, 3],', 'holeCubs: [1, 1, 1, 2, 2],'],
    ['"opět" and "zpět" are no counts', REKA, lineText('reka_jezevec', 7, (t) => `${t} Zpět a opět.`), { pass: true }],
    ['the count as a digit', REKA, lineText('reka_jezevec', 7, (t) => `${t} Je jich 9.`), { pass: true }],
    ['a pinned holeCubs with new texts', REKA, (text) => scene('reka_jezevec_zachrana', (s) => { s.minigame.config = { holeCubs: [1, 1, 1, 2, 2] }; })(
      text.replaceAll('Devět', 'Sedm').replaceAll('devět', 'sedm').replaceAll('Deváté', 'Sedmé').replaceAll('deváté', 'sedmé')), { pass: true }],
    // D46: the wisent's song.
    ['the wisent\'s retry costs time', HORY, scene('hory_zubr_prohra', (s) => { s.choices[0].add = { pul: 1 }; })],
    ['the wisent\'s give-up without giveUp', HORY, scene('hory_zubr_prohra', (s) => { delete s.choices[1].giveUp; })],
    ['the wisent\'s give-up without zubr_prohra', HORY, scene('hory_zubr_prohra', (s) => { delete s.choices[1].set; })],
    ['a return line on the first visit too', HORY, scene('hory_zubr', (s) => { delete s.lines[15].if; })],
    ['a first-visit line on the return too', HORY, scene('hory_zubr', (s) => { s.lines[12].if = 'pul<9'; })],
    ['the song\'s victory onto the lose screen', HORY, scene('hory_zubr_zpev', (s) => { s.minigame.onVictory = 'hory_zubr_prohra'; })],
    ['hory_zubr straight to its win', HORY, scene('hory_zubr', (s) => { s.next = 'hory_zubr_pomoc'; })],
    ['melodie set by hory_zubr', HORY, scene('hory_zubr', (s) => { s.set = ['melodie']; })],
    ['zubr set on the lose screen', HORY, scene('hory_zubr_prohra', (s) => { s.choices[0].set = ['zubr']; })],
    ['a "noc" of the narration in hory_zubr', HORY, lineText('hory_zubr', 12, (t) => `${t} Padala noc.`)],
    ['the song\'s words outside a quote', HORY, lineText('hory_zubr', 12, (t) => `${t} ${lyricLine(1)}`)],
    ['the song\'s words quoted elsewhere in hory_zubr', HORY, lineText('hory_zubr', 16, (t) => `${t} „${lyricLine(0)} ${lyricLine(1)}“`), { pass: true }],
  ],
});
