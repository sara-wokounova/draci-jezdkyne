// The wisent's song (D46): src/engine/minigames/zubrRules.js, played in node: normalising, the melody and its lyric,
// the intro, Róza's demo and Rubínka's red tones, the echo (the alignment, the grace, restarts, the replay button), the words, the calm meter,
// the mistakes and the charge, the quiet before a lost round's end, the finale, the drawing helpers; the balance
// through the rules' own step() and tap() with simulated players (ported from the planning prototype's sim.mjs); the
// background's size, the wisent's eye and nostril points on his sprite, the assets in git.
//   node tests/zubrRules.test.mjs [repoOrCopy]      NO_GIT=1 skips the git check of the asset paths
// Fail-before: tests/mutate/zubrRules.mutate.mjs.
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const root = (process.argv[2] ?? fileURLToPath(new URL('..', import.meta.url))).replaceAll('\\', '/').replace(/\/$/, '');
const R = await import(pathToFileURL(`${root}/src/engine/minigames/zubrRules.js`).href);
let failures = 0;
async function t(name, fn) {
  try {
    await fn();
    console.log(`ok   ${name}`);
  } catch (error) {
    failures += 1;
    console.log(`FAIL ${name}\n     ${error.message.split('\n').join('\n     ')}`);
  }
}
const DT = R.STEP;
function rng(seed) { // mulberry32
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
const gauss = (r) => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
const lognormal = (r, median, sigma) => median * Math.exp(sigma * gauss(r));

// --- driving helpers ---------------------------------------------------------------------------------------------
/** Steps until cond holds (at most 120 s of game time); returns every event stepped. */
function stepUntil(s, cond) {
  const events = [];
  for (let i = 0; i < 60 * 120; i += 1) {
    if (cond()) return events;
    R.step(s, DT);
    events.push(...s.events);
  }
  throw new Error(`stepUntil: the condition never held within 120 s (phase ${s.phase})`);
}
/** The time in the current step's demo timeline (the echo goes on counting from the demo's start). */
const demoTime = (s) => (s.phase === 'echo' ? s.echoT0 + s.phaseT : s.phaseT);
/** A state of `config` on `level` stepped to its first demo. */
function atDemo(config = {}, level = 'normal', random = rng(1)) {
  const s = R.createState(R.normalize(config, level), random);
  stepUntil(s, () => s.phase === 'demo');
  return s;
}
/** Steps to demo-timeline time `time` (into the echo); returns the events on the way. */
const to = (s, time) => stepUntil(s, () => ['demo', 'echo'].includes(s.phase) && demoTime(s) >= time - 1e-9);
const types = (events) => events.map((e) => e.type);
const has = (events, type) => events.some((e) => e.type === type);
const [G, A, B, E, D] = [2, 3, 4, 1, 0]; // the stars: D E G A B = 0 1 2 3 4
// Step [0]: G A B A G E A (onsets 0 0.8 1.2 2.0 2.4 3.2 3.6, the last held 1.2 s; the echo opens at 3.1, the grace
// ends 2.7 s later, at 5.8). Step [1]: B A G E G A G, the same rhythm.
const P0 = [G, A, B, A, G, E, A];
const P1 = [B, A, G, E, G, A, G];
const ONE = (steps) => ({ steps, finale: false });

// --- normalising ---------------------------------------------------------------------------------------------------
await t('normalize: each level\'s table, one number for every level, an unknown difficulty plays as normal', () => {
  const [easy, normal, hard] = ['easy', 'normal', 'hard'].map((l) => R.normalize({}, l));
  for (const level of [easy, normal, hard]) assert.deepEqual(level.steps, [[0], [1], [2], [3]], 'the four lines one at a time');
  assert.deepEqual([easy.mistakes, normal.mistakes, hard.mistakes], [6, 3, 1], '5 / 2 / 0 allowed');
  assert.deepEqual([easy.rubinka, normal.rubinka, hard.rubinka], [0, 0, 0]);
  assert.deepEqual([easy.hintAfter, normal.hintAfter, hard.hintAfter], [6, 10, 20]);
  assert.equal(R.normalize({}, 'extreme').mistakes, 3);
  const one = R.normalize({ mistakes: 4, rubinka: 0, hintAfter: 3, steps: [[0, 1]] }, 'hard');
  assert.deepEqual([one.mistakes, one.rubinka, one.hintAfter], [4, 0, 3]);
  assert.deepEqual(one.steps, [[0, 1]]);
  assert.equal(R.normalize({ mistakes: { normal: 2 } }, 'normal').mistakes, 2);
  assert.equal(R.normalize({ mistakes: { normal: 2 } }, 'easy').mistakes, 6);
  assert.deepEqual(R.normalize({ steps: { normal: [[3]] } }, 'normal').steps, [[0], [1], [2], [3]], 'steps by level: not read');
});
await t('normalize: typos fall back (D24), caps hold, DEFAULTS never written, __proto__ skipped', () => {
  const before = JSON.stringify(R.DEFAULTS);
  const d = R.DEFAULTS;
  const n = R.normalize({
    tones: [1, 2, 3], beat: 'x', phrases: [[[7, 1]]], steps: [[9]], mistakes: 0.5, rubinka: 4, hintAfter: 40,
    voice: { burst: 1, calm: 20, warn: 1 }, finale: 'yes', introGap: -1, snortSeconds: 11, chargeSeconds: NaN,
    quietEnd: 6, quietMax: 0.5, followLag: 3, anticipate: 0.6, echoLead: 2, restartPause: 9, redBeats: 0,
    bounce: 1, stars: [[0.1, 0.1], [0.2, 0.2], [0.3, 0.3], [0.4, 0.4]], hitRadius: 'x', starRadius: 200,
    colors: ['red', '#000000', '#000000', '#000000', '#000000'], zubr: { x: 2, width: 5000, eyes: [[0.5]] },
    roza: { height: -1 }, meter: [3, 1], sizes: { backing: 1000 }, labels: { status: 7 }, assets: { zubr: 3 },
  });
  assert.deepEqual(n.tones, d.tones);
  assert.equal(n.beat, d.beat);
  assert.deepEqual(n.phrases, d.phrases);
  assert.deepEqual(n.steps, d.steps);
  assert.equal(n.mistakes, 3);
  assert.equal(n.rubinka, 0);
  assert.equal(n.hintAfter, 10);
  assert.deepEqual(n.voice, d.voice);
  assert.equal(n.finale, true);
  assert.deepEqual([n.introGap, n.snortSeconds, n.chargeSeconds], [d.introGap, d.snortSeconds, d.chargeSeconds]);
  assert.deepEqual([n.quietEnd, n.quietMax, n.followLag, n.anticipate, n.echoLead, n.restartPause, n.redBeats, n.bounce],
    [d.quietEnd, d.quietMax, d.followLag, d.anticipate, d.echoLead, d.restartPause, d.redBeats, d.bounce]);
  assert.deepEqual(n.stars, d.stars);
  assert.equal(n.hitRadius, d.hitRadius);
  assert.equal(n.starRadius, d.starRadius);
  assert.deepEqual(n.colors, d.colors);
  assert.deepEqual(n.zubr, d.zubr);
  assert.equal(n.roza.height, d.roza.height);
  assert.deepEqual(n.meter, d.meter);
  assert.equal(n.sizes.backing, d.sizes.backing);
  assert.equal(n.labels.status, d.labels.status);
  assert.equal(n.assets.zubr, d.assets.zubr);
  // A step over 32 notes, too many steps, an empty step: the default.
  assert.deepEqual(R.normalize({ steps: [[0, 1, 2, 3, 0]] }).steps, d.steps);
  assert.deepEqual(R.normalize({ steps: Array(13).fill([0]) }).steps, d.steps);
  assert.deepEqual(R.normalize({ steps: [[]] }).steps, d.steps);
  // Custom phrases the default steps can't index: each phrase once.
  assert.deepEqual(R.normalize({ phrases: [[[0, 1]], [[1, 1]]] }).steps, [[0], [1]]);
  assert.equal(R.normalize({ hintAfter: 0 }).hintAfter, 10); // at least 1 s
  assert.equal(R.normalize(JSON.parse('{"__proto__": {"mistakes": 1}}')).mistakes, 3);
  assert.equal(R.normalize('nonsense').mistakes, 3);
  assert.equal(JSON.stringify(R.DEFAULTS), before);
});

// --- the melody and its words ----------------------------------------------------------------------------------------
await t('the melody: D4 E4 G4 A4 B4, four phrases, phrase 2 = phrase 0, no equal neighbours in a phrase, ends on E, every star', () => {
  const et = [-7, -5, -2, 0, 2].map((n) => 440 * 2 ** (n / 12)); // D4 E4 G4 A4 B4 around A4
  R.DEFAULTS.tones.forEach((f, i) => assert.ok(Math.abs(f / et[i] - 1) < 0.005, `tone ${i}: ${f} Hz`));
  const ph = R.DEFAULTS.phrases;
  assert.equal(ph.length, 4);
  assert.deepEqual(ph[2], ph[0]);
  for (const p of ph) {
    for (const [star] of p) assert.ok(star >= 0 && star <= 4);
    for (let i = 1; i < p.length; i += 1) assert.notEqual(p[i][0], p[i - 1][0], 'two equal notes in a row inside a phrase');
    assert.equal(p.reduce((a, [, b]) => a + b, 0), 12, 'a phrase is four 3/4 bars');
  }
  assert.equal(ph.at(-1).at(-1)[0], E);
  assert.deepEqual([...new Set(ph.flat().map(([s]) => s))].sort(), [0, 1, 2, 3, 4]);
});
/** A lyric line's syllables: split on spaces and hyphens; a lone k, s, v or z is a preposition, not a syllable. */
const syllables = (line) => line.split(/[\s-]+/).filter((w) => w && !/^[ksvz]$/i.test(w));
await t('the lyric: one syllable per note, line by line; the story quotes its first two lines (hory_zubr line 11)', () => {
  assert.equal(R.LYRIC.length, R.DEFAULTS.phrases.length);
  R.LYRIC.forEach((line, i) => assert.equal(syllables(line).length, R.DEFAULTS.phrases[i].length, `line ${i + 1}: "${line}"`));
  const hory = JSON.parse(fs.readFileSync(`${root}/public/story/lokace-hory.json`, 'utf8'));
  const quote = `${R.lyricLine(0)} ${R.lyricLine(1)}`.replace(/\.$/, '');
  const lines = hory.scenes.find((s) => s.id === 'hory_zubr').lines.map((l) => l.text);
  assert.ok(lines.some((text) => text.includes(quote)), `no line of hory_zubr quotes "${quote}": update its line 11 with the lyric`);
  // The song's name (the HUD's title) is the one the story gives it (line 10: "starou píseň proti kletbám").
  const name = R.SONG.toLowerCase();
  assert.ok(lines.some((text) => text.toLowerCase().includes(name)), `no line of hory_zubr names the song "${R.SONG}": update its line 10 with the name`);
});

// --- the intro and the demo ----------------------------------------------------------------------------------------
await t('the intro: five tones in order at introGap; an unshown star does nothing; a shout there is no mistake', () => {
  const s = R.createState(R.normalize(ONE([[0]])), rng(1));
  const events = stepUntil(s, () => s.phase !== 'intro');
  const intro = events.filter((e) => e.type === 'tone');
  assert.deepEqual(intro.map((e) => e.star), [0, 1, 2, 3, 4]);
  intro.forEach((e, i) => assert.ok(Math.abs(e.t - i * 0.45) < DT + 1e-9, `star ${i} at ${e.t}`));
  assert.equal(s.phase, 'demo');
  const t2 = R.createState(R.normalize(ONE([[0]])), rng(1));
  R.step(t2, DT); // star 0 shown
  assert.equal(R.shown(t2), 1);
  assert.deepEqual(R.tap(t2, 3), []);
  stepUntil(t2, () => R.shown(t2) === 5);
  const all = [0, 1, 2, 3].flatMap((star) => R.tap(t2, star));
  assert.ok(has(all, 'shout'));
  assert.ok(!has(all, 'mistake'));
  assert.equal(t2.mistakes, 0);
});
await t('demoTimeline: Róza\'s notes on the beats, the last onset, red tones only with rubinka, inside the longest notes', () => {
  const cfg = R.normalize({}, 'normal');
  const tl = R.demoTimeline(cfg, 0, rng(1));
  assert.deepEqual(tl.notes.map((n) => [n.star, +n.t.toFixed(3), +n.dur.toFixed(3)]),
    [[G, 0, 0.8], [A, 0.8, 0.4], [B, 1.2, 0.8], [A, 2, 0.4], [G, 2.4, 0.8], [E, 3.2, 0.4], [A, 3.6, 1.2]]);
  assert.ok(Math.abs(tl.lastOnset - 3.6) < 1e-9);
  assert.ok(Math.abs(tl.length - 4.8) < 1e-9);
  assert.ok(tl.notes.every((n) => n.who === 'roza'));
  const hard = R.normalize({ rubinka: 2, steps: [[0], [1], [0, 1], [3]] }, 'hard');
  for (let seed = 1; seed <= 200; seed += 1) {
    for (let i = 0; i < hard.steps.length; i += 1) {
      const h = R.demoTimeline(hard, i, rng(seed));
      const roza = h.notes.filter((n) => n.who === 'roza');
      const red = h.notes.filter((n) => n.who === 'rubinka');
      assert.equal(red.length, 2 * hard.steps[i].length);
      for (const r of red) {
        // inside a held (3-beat) or a 2-beat note, at its middle
        const host = roza.find((n) => n.t <= r.t && r.t < n.t + n.dur);
        assert.ok(host && host.dur >= 0.8 - 1e-9 && Math.abs(host.t + host.dur / 2 - (r.t + r.dur / 2)) < 1e-9, 'a red tone outside a long note');
        assert.notEqual(r.star, host.star, 'a red tone on Róza\'s star');
        assert.ok(!roza.some((n) => n.star === r.star && n.t <= r.t && n.t + n.dur >= r.t - hard.followLag), 'a red tone on a star Róza lit within followLag');
        assert.notEqual(r.star, roza[0].star, 'a red tone on the step\'s first star');
      }
    }
  }
  // A custom phrase whose stars are all busy: any star but hers.
  const busy = R.normalize({ phrases: [[[0, 1], [1, 1], [2, 1], [3, 1], [4, 3]]], steps: [[0]], rubinka: 1, followLag: 2 });
  const picks = new Set(Array.from({ length: 60 }, (_, k) => R.demoTimeline(busy, 0, rng(k + 1)).notes.find((n) => n.who === 'rubinka').star));
  assert.ok(!picks.has(4) && picks.size > 1, `the fallback picked ${[...picks]}`);
  // A red tone longer than the note it goes into starts with that note, never before the demo's start.
  const short = R.normalize({ phrases: [[[0, 0.25], [1, 0.25]]], steps: [[0]], rubinka: 1, redBeats: 2 });
  const early = R.demoTimeline(short, 0, rng(1)).notes.find((n) => n.who === 'rubinka');
  assert.ok(early.t >= 0, `a red tone at ${early.t} s`);
  // The finale: Róza alone, the whole tune.
  const s = atDemo({ steps: [[0]], rubinka: 2 }, 'hard');
  s.phase = 'success';
  s.phaseT = 0;
  s.step = 0;
  stepUntil(s, () => s.phase === 'finale');
  assert.equal(s.timeline.notes.length, 28);
  assert.ok(s.timeline.notes.every((n) => n.who === 'roza'));
});

// --- the echo -------------------------------------------------------------------------------------------------------
await t('the echo opens 0.5 s before Róza\'s last onset; her held note (and a red tone in it) still plays in the echo', () => {
  const s = atDemo(ONE([[0]]));
  to(s, 3.09);
  assert.equal(s.phase, 'demo');
  const events = to(s, 3.12);
  assert.equal(s.phase, 'echo');
  assert.ok(Math.abs(s.echoT0 - 3.1) < 1e-9);
  const later = to(s, 3.7);
  assert.ok(later.some((e) => e.type === 'tone' && e.who === 'roza' && e.star === A), 'the held note sounds in the echo');
  assert.ok(!has(events, 'mistake'));
  // Těžká: the red tone in the held note plays in the echo too.
  const h = atDemo({ ...ONE([[0]]), rubinka: 2 }, 'hard');
  to(h, 3.12);
  assert.equal(h.phase, 'echo');
  assert.ok(to(h, 4.8).some((e) => e.type === 'tone' && e.who === 'rubinka'), 'the held note\'s red tone in the echo');
  // A tap 0.45 s before the last onset is judged.
  const j = atDemo(ONE([[0]]));
  to(j, 3.15);
  assert.ok(has(R.tap(j, G), 'correct'));
});
await t('the grace (step [1]): taps on stars Róza lights or just lit are forgiven; her first star counts', () => {
  for (const [time, star, what] of [[3.9, G, 'the held G at 0.3 s'], [4.7, G, 'the held G at 1.1 s'], [4.1, A, 'A, dark 0.5 s'], [5.6, G, 'G, dark 0.8 s']]) {
    const s = atDemo(ONE([[1]]));
    to(s, time);
    const ev = R.tap(s, star);
    assert.ok(has(ev, 'tone') && !has(ev, 'mistake') && !has(ev, 'correct'), `${what}: ${types(ev)}`);
    assert.equal(s.index, 0, what);
  }
  const s = atDemo(ONE([[1]]));
  to(s, 3.3);
  assert.ok(has(R.tap(s, B), 'correct'));
  assert.equal(s.index, 1);
});
await t('the grace (step [0]): a late follow tap on G, then the child\'s own echo → success, no mistake', () => {
  const s = atDemo(ONE([[0]]));
  to(s, 3.3);
  R.tap(s, G); // the fifth note's G, late: aligns as the echo's first note
  assert.equal(s.index, 1);
  const indices = [];
  P0.forEach((star, k) => {
    to(s, 3.8 + 0.5 * k);
    R.tap(s, star);
    indices.push(s.index);
  });
  assert.deepEqual(indices.slice(0, 6), [1, 2, 3, 4, 5, 6]);
  assert.equal(s.phase === 'success' || s.phase === 'done', true);
  assert.equal(s.mistakes, 0);
});
await t('mistakes in the echo: a star dark over followLag in the grace; a quick slip after correct notes; k = 0 after the grace', () => {
  const s = atDemo(ONE([[0]]));
  to(s, 3.2); // B ended at 2.0: dark 1.2 s
  assert.ok(has(R.tap(s, B), 'mistake'));
  const d = atDemo(ONE([[0]]));
  to(d, 3.2);
  assert.ok(has(R.tap(d, D), 'mistake'), 'D, never lit');
  const slip = atDemo(ONE([[0]]));
  [G, A, B].forEach((star, k) => { to(slip, 6.0 + 0.5 * k); R.tap(slip, star); });
  assert.equal(slip.index, 3);
  to(slip, 7.5);
  const ev = R.tap(slip, D);
  assert.ok(has(ev, 'mistake') && ev.find((e) => e.type === 'mistake').reason === 'wrong');
  assert.equal(slip.phase, 'snort');
  const late = atDemo(ONE([[0]]));
  to(late, 3.1 + 2.75); // after the grace (2.7 s from the opening)
  assert.ok(has(R.tap(late, A), 'mistake'));
});
await t('a fall back on [0,1]: onto the first star at once → a mistake; after 1.1 s or in the grace → a silent restart; after Róza\'s 0.8 s → a mistake', () => {
  // [0,1]: the last onset 8.4, the echo opens at 7.9, the grace ends at 10.6.
  const notes = [...P0, ...P1];
  const run = (start, gap, pause) => {
    const s = atDemo(ONE([[0, 1]]));
    notes.slice(0, 8).forEach((star, k) => { to(s, start + gap * k); R.tap(s, star); });
    assert.equal(s.index, 8);
    to(s, start + gap * 7 + pause);
    return [s, R.tap(s, G)];
  };
  let [s, ev] = run(10.7, 0.5, 0.5);
  assert.ok(has(ev, 'mistake'), 'a quick slip onto G after the grace');
  [s, ev] = run(10.7, 0.5, 1.15); // the steps land on 1/60 s: just over the 1.1 s threshold
  assert.ok(!has(ev, 'mistake') && !has(ev, 'correct'), 'a 1.1 s pause: a restart');
  assert.equal(s.index, 1);
  [s, ev] = run(10.7, 0.5, 0.8);
  assert.ok(has(ev, 'mistake'), 'Róza\'s own 0.8 s gap is no restart pause');
  [s, ev] = run(7.95, 0.3, 0.3);
  assert.ok(!has(ev, 'mistake'), 'in the grace: a restart');
  assert.equal(s.index, 1);
});
await t('a restart is judged by the pause before the new run\'s first tap, not before the last tap', () => {
  // After the grace: G A B A, a 1.2 s pause, G, then A at once: [… G A] matches the start (k = 2) from the paused G:
  // a child starting again (the same taps as one who meant G to go on: lenient, as planned).
  const s = atDemo(ONE([[0]]));
  [G, A, B, A].forEach((star, k) => { to(s, 6.0 + 0.5 * k); R.tap(s, star); });
  to(s, 7.5 + 1.2);
  R.tap(s, G);
  to(s, 8.7 + 0.5);
  const ev = R.tap(s, A);
  assert.ok(!has(ev, 'mistake'), types(ev).join());
  assert.equal(s.index, 2);
});
await t('the restart pause is restartPause beats, unclamped (beat 1.0: 2.75 s; a fall back after 2.2 s is a mistake, after 2.8 s a restart)', () => {
  const fallBack = (pause) => {
    const s = atDemo({ ...ONE([[0]]), beat: 1.0 });
    // onsets 0 2 3 5 6 8 9: the echo opens at 8.5, the grace ends at 13.0
    [G, A, B].forEach((star, k) => { to(s, 13.1 + 0.5 * k); R.tap(s, star); });
    to(s, 14.1 + pause);
    return [s, R.tap(s, G)];
  };
  let [s, ev] = fallBack(2.2);
  assert.ok(has(ev, 'mistake'), `2.2 s: ${types(ev).join()}`);
  [s, ev] = fallBack(2.8);
  assert.ok(!has(ev, 'mistake'), `2.8 s: ${types(ev).join()}`);
  assert.equal(s.index, 1);
});
await t('G A, a pause, then the whole step across the grace\'s end → success; a red-lit star is never a follower\'s', () => {
  const s = atDemo(ONE([[0]]));
  to(s, 3.3); R.tap(s, G);
  to(s, 3.8); R.tap(s, A);
  P0.forEach((star, k) => { to(s, 5.1 + 0.5 * k); R.tap(s, star); });
  assert.equal(s.mistakes, 0);
  assert.notEqual(s.phase, 'echo');
  // A custom phrase whose red tone falls back onto a star Róza lit (followLag 2): a tap on it right after the red tone.
  const cfg = { phrases: [[[0, 1], [1, 1], [2, 1], [3, 1], [4, 3]]], steps: [[0]], rubinka: 1, followLag: 2, finale: false };
  const red = atDemo(cfg, 'normal', () => 0.3); // the pick: star 1
  const r = red.timeline.notes.find((n) => n.who === 'rubinka');
  assert.equal(r.star, 1);
  to(red, r.t + 0.1);
  assert.ok(has(R.tap(red, 1), 'mistake'), 'a tap on the star Rubínka lit last');
  const plain = atDemo({ ...cfg, rubinka: 0 });
  to(plain, r.t + 0.1);
  assert.ok(!has(R.tap(plain, 1), 'mistake'), 'the same tap without the red tone is a follower\'s');
});
await t('tapping along in time: 0.05 s ahead of Róza\'s last note is no mistake (anticipate)', () => {
  const s = atDemo(ONE([[0]]));
  to(s, 3.55); // A last ended at 2.4 (1.15 s ago); her held A begins at 3.6
  const ev = R.tap(s, A);
  assert.ok(!has(ev, 'mistake'), types(ev).join());
});
await t('after a tap nothing replays: 15 s of quiet → still the echo, no mistake; the button pulses after hintAfter', () => {
  const s = atDemo(ONE([[0]]));
  to(s, 3.2); R.tap(s, G);
  const at = s.t;
  let pulsedAt = null;
  const events = [];
  for (let i = 0; i < 60 * 15; i += 1) {
    R.step(s, DT);
    events.push(...s.events);
    if (pulsedAt === null && R.replayHint(s)) pulsedAt = s.t;
  }
  assert.ok(s.phase === 'echo' && s.mistakes === 0, types(events).join());
  assert.ok(pulsedAt !== null && Math.abs(pulsedAt - at - 10) < 2 * DT, `the pulse after ${pulsedAt - at} s (Normální: 10)`);
  R.tap(s, A);
  assert.equal(R.replayHint(s), false, 'a tap ends the pulse');
});
await t('the replay button: enabled only in the echo once the demo has ended; a press sings the step again, free; the echo starts over', () => {
  const s = atDemo({ steps: [[0], [1]], finale: false });
  assert.equal(R.canReplay(s), false, 'in the demo');
  assert.deepEqual(R.replay(s), []);
  to(s, 3.2);
  assert.equal(s.phase, 'echo');
  assert.equal(R.canReplay(s), false, 'while her held note sounds');
  to(s, s.timeline.end + 0.02);
  assert.equal(R.canReplay(s), true, 'after the demo');
  R.tap(s, G);
  R.tap(s, A);
  const voice = R.voiceNow(s);
  const ev = R.replay(s);
  assert.deepEqual(types(ev), ['replay']);
  assert.equal(s.phase, 'demo');
  assert.equal(s.step, 0);
  assert.equal(s.mistakes, 0);
  assert.ok(R.voiceNow(s) <= voice, 'nothing on the meter');
  assert.equal(R.DEFAULTS.labels.replay, 'Ještě jednou');
  stepUntil(s, () => s.phase === 'echo');
  assert.equal(s.index, 0, 'the echo starts over');
  assert.deepEqual(s.taps, []);
  // Disabled in a snort, a success, the finale, the charge, the hold and done.
  const m = atDemo({ ...ONE([[0]]), mistakes: 2 });
  to(m, 6.0);
  R.tap(m, D);
  assert.equal(m.phase, 'snort');
  assert.equal(R.canReplay(m), false, 'in a snort');
  const w = atDemo({ steps: [[0]] });
  P0.forEach((star, k) => { to(w, 3.2 + 0.5 * k); R.tap(w, star); });
  assert.equal(w.phase, 'success');
  assert.equal(R.canReplay(w), false, 'in a success');
  stepUntil(w, () => w.phase === 'finale');
  assert.equal(R.canReplay(w), false, 'in the finale');
  stepUntil(w, () => w.phase === 'done');
  assert.equal(R.canReplay(w), false, 'after the end');
  const c = atDemo({ ...ONE([[0]]), mistakes: 1 });
  to(c, 6.0);
  R.tap(c, D);
  assert.equal(R.canReplay(c), false, 'in the charge');
  stepUntil(c, () => c.phase === 'hold');
  assert.equal(R.canReplay(c), false, 'in the hold');
  // A red tone longer than its note: the button waits for its end (timeline.end).
  const long = atDemo({ phrases: [[[2, 1], [3, 0.25]]], steps: [[0]], rubinka: 1, redBeats: 2, finale: false, echoLead: 0 });
  assert.ok(long.timeline.end > long.timeline.length, 'set-up: the red tone ends after the phrase');
  stepUntil(long, () => long.phase === 'echo' && long.echoT0 + long.phaseT >= long.timeline.end - 0.05);
  assert.equal(R.canReplay(long), false, 'just before the red tone ends');
  stepUntil(long, () => long.echoT0 + long.phaseT >= long.timeline.end);
  assert.equal(R.canReplay(long), true, 'at its end');
});
await t('the words: lyricSyllables splits each line (a lone k joins the next syllable); phraseWords only where the line fits the notes', () => {
  assert.deepEqual(R.lyricSyllables(3).map((s) => s.text), ['vrať', 'se', 'k so', 'bě,', 'srd', 'ce', 'mé.']);
  for (let i = 0; i < 4; i += 1) assert.equal(R.lyricSyllables(i).length, 7);
  assert.equal(R.lyricSyllables(4), null);
  assert.equal(R.phraseWords(R.normalize({}), 0).length, 7);
  assert.equal(R.phraseWords(R.normalize({ phrases: [[[0, 1], [1, 1]]] }), 0), null, 'a line that doesn\'t fit its phrase');
  assert.equal(R.phraseWords(R.normalize({ phrases: [...R.DEFAULTS.phrases, [[0, 1]]] }), 4), null, 'a phrase with no line');
});
await t('the bounce: the same star within 0.12 s is ignored, unless the echo expects it (after 0.06 s): G–G at a joint', () => {
  const s = atDemo(ONE([[0]]));
  to(s, 1.0);
  assert.ok(has(R.tap(s, B), 'tone'));
  to(s, 1.08);
  assert.deepEqual(R.tap(s, B), []);
  // [1, 2]: B A G E G A G | G A B …: the seventh note G, then the eighth, also G.
  const j = atDemo(ONE([[1, 2]]));
  const notes = [...P1, ...P0];
  notes.slice(0, 7).forEach((star, k) => { to(j, 8.4 + 0.3 * k); R.tap(j, star); });
  assert.equal(j.index, 7);
  const now = demoTime(j);
  to(j, now + 0.03);
  assert.deepEqual(R.tap(j, G), [], 'a duplicate within 0.06 s');
  to(j, now + 0.08);
  assert.ok(has(R.tap(j, G), 'correct'), 'the expected G after 0.08 s');
  assert.equal(j.index, 8);
});
await t('a right sequence → success and the next demo; a wrong star → snort, the same step again; the max → the charge', () => {
  const s = atDemo({ steps: [[0], [1]], finale: false });
  P0.forEach((star, k) => { to(s, 3.2 + 0.5 * k); R.tap(s, star); });
  assert.equal(s.phase, 'success');
  assert.equal(s.done, 1);
  stepUntil(s, () => s.phase === 'demo');
  assert.equal(s.step, 1);
  to(s, 3.3);
  const ev = R.tap(s, D);
  assert.deepEqual(types(ev), ['tone', 'mistake']);
  assert.equal(s.phase, 'snort');
  stepUntil(s, () => s.phase === 'demo');
  assert.equal(s.step, 1);
  to(s, 3.2);
  assert.equal(s.index, 0);
  // Normální: the third mistake charges, then (after the charge and the quiet) a failure.
  const m = atDemo(ONE([[0]]));
  for (let k = 0; k < 3; k += 1) {
    stepUntil(m, () => m.phase === 'echo');
    const e2 = R.tap(m, D);
    if (k < 2) assert.ok(!has(e2, 'charge'));
    else assert.ok(has(e2, 'charge'));
  }
  assert.equal(m.phase, 'charge');
  assert.equal(m.outcome, 'failure');
  assert.equal(R.finished(m), false);
  stepUntil(m, () => R.finished(m));
  assert.ok(Math.abs(m.t - m.endAt) < 2 * DT, 'over right after the charge when nobody tapped');
  // Těžká: the first mistake charges.
  const h = atDemo(ONE([[0]]), 'hard');
  stepUntil(h, () => h.phase === 'echo');
  assert.ok(has(R.tap(h, D), 'charge'));
});
await t('the calm meter: 4 taps at once shout; 4 taps 0.1 s apart 3.06; 5 at 0.14 s 3.25; 6 shout', () => {
  const at = (n, gap) => {
    const s = atDemo(ONE([[0]]));
    let shout = false;
    const first = s.t;
    for (let k = 0; k < n; k += 1) {
      if (k) to(s, demoTime(s) + gap);
      shout = has(R.tap(s, k % 5), 'shout') || shout;
    }
    // The steps land on 1/60 s: the exact figure for the gaps the taps really had.
    return [shout, R.voiceNow(s), n - 3.125 * (s.t - first)];
  };
  assert.equal(at(4, 0)[0], true);
  const [s4, v4, e4] = at(4, 0.1);
  assert.equal(s4, false);
  assert.ok(Math.abs(v4 - e4) < 1e-9 && Math.abs(v4 - 3.0625) < 0.01, `${v4}`);
  const [s5, v5, e5] = at(5, 0.14);
  assert.equal(s5, false);
  assert.ok(Math.abs(v5 - e5) < 1e-9 && v5 > 3.1, `${v5}`);
  assert.equal(at(6, 0.14)[0], true);
});
await t('a shout: a mistake in a demo and in the echo; the meter only during a snort or a success', () => {
  const s = atDemo(ONE([[0]]));
  const ev = [0, 1, 2, 3].flatMap((star) => R.tap(s, star));
  assert.ok(has(ev, 'shout') && ev.find((e) => e.type === 'mistake')?.reason === 'shout');
  const e = atDemo(ONE([[0]]));
  to(e, 3.2);
  assert.ok([G, A, B, A].flatMap((star) => R.tap(e, star)).some((x) => x.type === 'mistake' && x.reason === 'shout'));
  stepUntil(s, () => s.phase === 'snort' || s.phase === 'demo');
  if (s.phase === 'snort') {
    const quiet = [0, 1, 2, 3, 4].flatMap((star) => R.tap(s, star));
    assert.ok(has(quiet, 'shout') && !has(quiet, 'mistake'));
  }
  const ok = atDemo({ steps: [[0], [1]], finale: false });
  P0.forEach((star, k) => { to(ok, 3.2 + 0.5 * k); R.tap(ok, star); });
  assert.equal(ok.phase, 'success');
  stepUntil(ok, () => ok.phaseT > 0.4); // the meter drained
  const during = [0, 1, 2, 3].flatMap((star) => R.tap(ok, star));
  assert.ok(has(during, 'shout') && !has(during, 'mistake'));
  assert.equal(ok.mistakes, 0);
});
await t('dead phases: no event in the charge, the hold, the finale or after the end', () => {
  const s = atDemo({ steps: [[0]] });
  P0.forEach((star, k) => { to(s, 3.2 + 0.5 * k); R.tap(s, star); });
  stepUntil(s, () => s.phase === 'finale');
  assert.deepEqual(R.tap(s, G), []);
  stepUntil(s, () => s.phase === 'done');
  assert.deepEqual(R.tap(s, G), []);
  const m = atDemo({ ...ONE([[0]]), mistakes: 1 });
  to(m, 3.2);
  R.tap(m, D);
  assert.equal(m.phase, 'charge');
  assert.deepEqual(R.tap(m, G), []);
  stepUntil(m, () => m.phase === 'hold');
  assert.deepEqual(R.tap(m, G), []);
});
await t('the quiet before a lost round ends: input every 0.7 s holds it; 1.5 s of quiet ends it; 15 s at most; a victory doesn\'t wait', () => {
  const m = atDemo({ ...ONE([[0]]), mistakes: 1 });
  to(m, 3.2);
  R.tap(m, D);
  const end = m.endAt;
  let next = m.t;
  for (let i = 0; i < 60 * 30 && !R.finished(m); i += 1) {
    if (m.t >= next && m.t < end + 4) {
      R.noteInput(m);
      next = m.t + 0.7;
    }
    R.step(m, DT);
  }
  assert.ok(R.finished(m));
  const lastInput = m.lastInput;
  assert.ok(m.t >= end + 4 - 0.7 && Math.abs(m.t - (lastInput + 1.5)) < 2 * DT, `ended at ${m.t - end} s after the charge`);
  assert.ok(R.quietView(m) === 1);
  const cap = atDemo({ ...ONE([[0]]), mistakes: 1 });
  to(cap, 3.2);
  R.tap(cap, D);
  for (let i = 0; i < 60 * 30 && !R.finished(cap); i += 1) {
    R.noteInput(cap);
    R.step(cap, DT);
  }
  assert.ok(Math.abs(cap.t - (cap.endAt + 15)) < 2 * DT, `capped at ${cap.t - cap.endAt} s`);
  const v = atDemo(ONE([[0]]));
  P0.forEach((star, k) => { to(v, 3.2 + 0.5 * k); R.tap(v, star); });
  stepUntil(v, () => v.outcome === 'victory');
  for (let i = 0; i < 60 * 5 && !R.finished(v); i += 1) {
    R.noteInput(v);
    R.step(v, DT);
  }
  assert.ok(R.finished(v) && Math.abs(v.t - v.endAt) < 2 * DT);
});
await t('nothing replays by itself: no tap in the echo for 40 s → still the echo (every level); the button pulses after 6 / 10 / 20 s', () => {
  for (const [level, wait] of [['easy', 6], ['normal', 10], ['hard', 20]]) {
    const s = atDemo(ONE([[0]]), level);
    stepUntil(s, () => s.phase === 'echo');
    const opened = s.t;
    let pulsedAt = null;
    const events = [];
    for (let i = 0; i < 60 * 40; i += 1) {
      R.step(s, DT);
      events.push(...s.events);
      if (pulsedAt === null && R.replayHint(s)) pulsedAt = s.t;
    }
    assert.ok(s.phase === 'echo', `${level}: ${types(events).join()}`);
    assert.ok(pulsedAt !== null && Math.abs(pulsedAt - opened - wait) < 2 * DT, `${level}: the pulse after ${pulsedAt - opened} s`);
  }
});
await t('a loss ends only from the hold (its end time and the charge\'s phase time round apart at large t)', () => {
  for (let k = 0; k < 300; k += 1) {
    const s = atDemo({ ...ONE([[0]]), mistakes: 1 });
    stepUntil(s, () => s.phase === 'echo');
    s.t = 10 + k * 0.00731;
    R.tap(s, D);
    s.lastInput = -Infinity;
    stepUntil(s, () => R.finished(s));
    assert.equal(s.phase, 'hold', `k ${k}`);
  }
});
await t('the finale: the shimmer, the victory endHold later (Těžká); finale: false wins at the last success', () => {
  const s = atDemo({ steps: [[0]] }, 'hard');
  P0.forEach((star, k) => { to(s, 3.2 + 0.5 * k); R.tap(s, star); });
  const events = stepUntil(s, () => R.finished(s));
  const clear = events.find((e) => e.type === 'clear');
  assert.ok(clear);
  assert.equal(s.outcome, 'victory');
  assert.ok(Math.abs(s.t - (clear.t + DT + 0.8)) < 2 * DT, `${s.t - clear.t}`);
  const f = atDemo(ONE([[0]]));
  P0.forEach((star, k) => { to(f, 3.2 + 0.5 * k); R.tap(f, star); });
  const fe = stepUntil(f, () => R.finished(f));
  assert.ok(!has(fe, 'clear'));
  assert.equal(f.outcome, 'victory');
});
await t('the finale counts 28 Róza notes', () => {
  const s = atDemo({ steps: [[0]] });
  P0.forEach((star, k) => { to(s, 3.2 + 0.5 * k); R.tap(s, star); });
  stepUntil(s, () => s.phase === 'finale');
  const events = stepUntil(s, () => s.phase === 'done');
  assert.equal(events.filter((e) => e.type === 'tone' && e.who === 'roza').length, 28);
  assert.ok(Math.abs(s.timeline.length - 19.2) < 1e-9);
});
await t('the finale\'s shorter reuse (a story config on Těžká): one step of two phrases, no red tones', () => {
  const cfg = R.normalize({ steps: [[0, 1]], finale: false, rubinka: 0 }, 'hard');
  assert.equal(cfg.steps.length, 1);
  assert.equal(R.stepNotes(cfg, 0).length, 14);
  assert.ok(R.demoTimeline(cfg, 0, rng(1)).notes.every((n) => n.who === 'roza'));
});
await t('stepNotes takes the step\'s own phrases', () => {
  const cfg = R.normalize({}, 'normal');
  assert.deepEqual(R.stepNotes(cfg, 1).map((n) => n.star), P1);
  assert.deepEqual(R.stepNotes(cfg, 2).map((n) => n.star), P0, "line 3 has line 1's tune");
  assert.deepEqual(R.stepNotes(cfg, 3).map((n) => n.star), [G, E, G, A, G, D, E]);
});
await t('mistView, lit, shown, hudView', () => {
  const s = atDemo({ steps: [[0]] });
  assert.ok(Math.abs(R.mistView(s) - 0.8) < 1e-9);
  assert.deepEqual(R.hudView(s), { score: '0 z 1', status: 'Zubr funí: 0 z 3' });
  to(s, 0.1);
  assert.equal(R.lit(s)[G], 'roza');
  to(s, 3.2);
  R.tap(s, D);
  assert.ok(R.mistView(s) > 0.8);
  assert.equal(R.hudView(s).status, 'Zubr funí: 1 z 3');
  // Těžká: the first mistake charges, so no snort count: the status says the song must be flawless.
  assert.equal(R.hudView(R.createState(R.normalize({}, 'hard'), rng(1))).status, 'Bez chyby!');
  const charged = atDemo(ONE([[0]]), 'hard');
  stepUntil(charged, () => charged.phase === 'echo');
  R.tap(charged, D);
  assert.equal(R.hudView(charged).status, 'Zubr funí: 1 z 1', 'after the mistake: no longer "Bez chyby!"');
  assert.equal(R.hudView(R.createState(R.normalize({ mistakes: 2 }, 'hard'), rng(1))).status, 'Zubr funí: 0 z 2');
  assert.equal(R.lit(s)[D], 'player');
  stepUntil(s, () => s.phase === 'demo');
  P0.forEach((star, k) => { to(s, 3.2 + 0.5 * k); R.tap(s, star); });
  stepUntil(s, () => s.phase === 'done');
  assert.ok(Math.abs(R.mistView(s) - 0.3) < 1e-9);
  assert.deepEqual(R.lit(s), Array(5).fill('roza'));
  assert.equal(R.hudView(s).score, '1 z 1');
  assert.equal(R.shown(s), 5);
});

// --- balance --------------------------------------------------------------------------------------------------------
// Simulated players (planning's simlib.mjs, D46): children of 8 and 11 and an adult by memory span: the error per note
// grows with the square of the excess over the span (a tune echoed before counts as 85 % of its notes: line 3 has line
// 1's; each retry ×0.9, at most twice, so free replays don't erase the levels),
// red-tone confusion; unsure of a phrase they may stop mid-echo (forget), then press the replay button (find) or guess.
// Calibrated so the adult can't hold the old 14-note step (Sára). Also mashers, the right stars too fast, followers,
// stoppers, early comers, along-tappers.
const CHUNK = 0.85;
const RETRY = 0.9;
const LOST_WAIT = 2.0; // s, the median wait before a lost child presses the button (or guesses)
const CHILDREN = {
  child8: { span: 4.5, base: 0.025, slope: 0.008, forget: 0.25, find: 0.6, red: 0.25, median: 0.6, sigma: 0.4, along: 0.2, think: 1.0 },
  child11: { span: 5, base: 0.015, slope: 0.006, forget: 0.15, find: 0.8, red: 0.12, median: 0.5, sigma: 0.35, along: 0.1, think: 0.8 },
  adult: { span: 6, base: 0.004, slope: 0.01, forget: 0.05, find: 0.95, red: 0.02, median: 0.5, sigma: 0.2, along: 0, think: 0.6 },
};
const tune = (s, ph) => JSON.stringify(s.cfg.phrases[ph]); // a tune echoed before is known, whichever line it was
function childPlayer(p) {
  const known = new Map();
  let attempt = 0;
  let lastStep = -1;
  let plan = null;
  let along = null;
  let lastPhase = null;
  let pressAt = null;
  let lostChoice = null;
  return (s, r) => {
    if (s.phase !== lastPhase) {
      pressAt = null;
      lostChoice = null;
      if (lastPhase === 'echo' && s.phase === 'success') for (const ph of s.cfg.steps[s.step]) known.set(tune(s, ph), (known.get(tune(s, ph)) ?? 0) + 1);
      lastPhase = s.phase;
      plan = null;
      if (s.phase !== 'echo') along = null;
      if (s.phase === 'demo' && r() < p.along) {
        const lag = 0.3 + 0.4 * r();
        along = s.timeline.notes.filter((n) => n.who === 'roza').map((n) => ({ t: s.t + n.t + lag, star: n.star }));
      }
      if (s.phase === 'echo') {
        if (s.step !== lastStep) { attempt = 0; lastStep = s.step; }
        attempt += 1;
        const ps = s.cfg.steps[s.step];
        const plen = (ph) => s.cfg.phrases[ph].length;
        const eff = ps.reduce((a, ph) => a + ((known.get(tune(s, ph)) ?? 0) > 0 ? Math.ceil(plen(ph) * CHUNK) : plen(ph)), 0);
        const phraseOf = ps.flatMap((ph) => Array(plen(ph)).fill(ph));
        const notes = R.stepNotes(s.cfg, s.step);
        const seq = [];
        let k = 0;
        for (const n of s.timeline.notes) {
          if (n.who === 'roza') {
            const fam = (known.get(tune(s, phraseOf[k])) ?? 0) > 0 ? 0.6 : 1;
            const pe = (p.base + p.slope * Math.max(0, eff - p.span) ** 2) * fam * RETRY ** Math.min(2, attempt - 1);
            let star = notes[k].star;
            if (r() < pe) {
              if (r() < 0.6) star = Math.max(0, Math.min(4, star + (r() < 0.5 ? -1 : 1)));
              if (star === notes[k].star) star = (star + 1 + Math.floor(r() * 4)) % 5;
            }
            seq.push(star);
            k += 1;
          } else if (r() < p.red) seq.push(n.star);
        }
        let at = s.t + lognormal(r, p.think, 0.5);
        plan = seq.map((star) => {
          const x = { t: at, star };
          at += Math.max(0.15, lognormal(r, p.median, p.sigma));
          return x;
        });
        if (plan.length > 1 && r() < p.forget * (eff > p.span ? 1 : 0.3)) plan = plan.slice(0, 1 + Math.floor(r() * (plan.length - 1)));
      }
    }
    if (plan && plan.length && plan[0].t <= s.t) along = null;
    const taps = [];
    for (const list of [plan, along]) while (list && list.length && list[0].t <= s.t) taps.push(list.shift().star);
    if (s.phase === 'echo' && plan && plan.length === 0 && taps.length === 0) {
      // Lost: the planned echo is done and the step goes on: the replay button (find), else a guess.
      pressAt ??= s.t + lognormal(r, LOST_WAIT, 0.4);
      lostChoice ??= r() < p.find ? 'press' : 'guess';
      if (s.t >= pressAt) {
        pressAt = null;
        if (lostChoice === 'press' && R.canReplay(s)) { plan = null; lostChoice = null; return ['R']; }
        if (lostChoice === 'guess') return [Math.floor(r() * 5)];
      }
    }
    return taps;
  };
}
/** A player following a plan made when a phase starts: `make(s, r)` → [{ t, star }] (null: keep the plan). */
function planned(phase, make) {
  let plan = null;
  let lastPhase = null;
  return (s, r) => {
    if (s.phase !== lastPhase) {
      lastPhase = s.phase;
      if (s.phase === phase) plan = make(s, r).sort((a, b) => a.t - b.t);
      else if (s.phase !== 'echo') plan = null;
    }
    const taps = [];
    while (plan && plan.length && plan[0].t <= s.t) taps.push(plan.shift().star);
    return taps;
  };
}
const own = (s, from, pace) => R.stepNotes(s.cfg, s.step).map((n, k) => ({ t: from + pace * k, star: n.star }));
const follower = (lag, sigma = 0) => planned('demo', (s, r) => [
  ...s.timeline.notes.filter((n) => n.who === 'roza').map((n) => ({ t: s.t + n.t + (sigma ? lognormal(r, lag, sigma) : lag), star: n.star })),
  ...own(s, s.t + s.timeline.length + 0.6, 0.6)]);
const stopper = (lag, sigma, start, pace = 0.55, spread = 0) => planned('demo', (s, r) => {
  const roza = s.timeline.notes.filter((n) => n.who === 'roza');
  const follow = lag === null ? [] : roza.slice(0, -1).map((n) => ({ t: s.t + n.t + (sigma ? lognormal(r, lag, sigma) : lag), star: n.star }));
  return [...follow, ...own(s, s.t + s.timeline.lastOnset + start + spread * r(), pace)];
});
const syncAlong = (mu, sigma) => planned('demo', (s, r) => [
  ...s.timeline.notes.filter((n) => n.who === 'roza').map((n) => ({ t: s.t + n.t + mu + sigma * gauss(r), star: n.star })),
  ...own(s, s.t + s.timeline.length + 0.6, 0.6)]);
const earlyStarter = () => planned('echo', (s) => own(s, s.t + 0.3, 0.5));
const restarter = () => planned('echo', (s) => {
  const notes = R.stepNotes(s.cfg, s.step);
  return [{ t: s.t + 0.6, star: notes[0].star }, { t: s.t + 1.2, star: notes[1].star }, ...own(s, s.t + 2.4, 0.6)];
});
/** Knows the tune and taps the next expected star every `interval` (± jitter) in the echo. */
const steady = (interval, jitter = 0, startAfter = 0.4) => {
  let next = Infinity;
  let lastPhase = null;
  return (s, r) => {
    if (s.phase !== lastPhase) { lastPhase = s.phase; next = s.phase === 'echo' ? s.t + startAfter : Infinity; }
    if (s.phase !== 'echo' || s.t < next) return [];
    next = s.t + interval * (1 + jitter * (2 * r() - 1));
    return [R.stepNotes(s.cfg, s.step)[s.index].star];
  };
};
const masher = (lo, hi) => {
  let next = 0;
  return (s, r) => {
    if (s.t < next) return [];
    next = s.t + lo + (hi - lo) * r();
    return [Math.floor(r() * 5)];
  };
};
const fastRight = () => {
  let next = 0;
  return (s, r) => {
    if (s.phase !== 'echo' || s.t < next) return [];
    next = s.t + 0.1 + 0.08 * r();
    return [R.stepNotes(s.cfg, s.step)[s.index].star];
  };
};
function play(level, player, seed, config = {}) {
  const r = rng(seed);
  const s = R.createState(R.normalize(config, level), r);
  for (let i = 0; i < 60 * 600 && !R.finished(s); i += 1) {
    R.step(s, DT);
    for (const action of player(s, r)) {
      if (action === 'R') R.replay(s);
      else R.tap(s, action);
    }
  }
  return s;
}
function rate(level, make, rounds, config) {
  let wins = 0;
  let shouts = 0;
  for (let i = 0; i < rounds; i += 1) {
    const s = play(level, make(), 1000 + i, config);
    if (s.outcome === 'victory') wins += 1;
    shouts += s.shouts;
  }
  return { win: wins / rounds, shouts };
}
const { LEVELS } = R;
const pct = (x) => `${(100 * x).toFixed(1)} %`;
await t('balance: mashers and the right stars too fast never win, on any level', () => {
  for (const level of LEVELS) {
    for (const [name, make] of [['masher 5–10/s', () => masher(0.1, 0.2)], ['masher 2–3/s', () => masher(0.33, 0.5)],
      ['masher 1.2–2/s', () => masher(0.5, 0.85)], ['fast right', fastRight]]) {
      const { win } = rate(level, make, 100);
      assert.equal(win, 0, `${name} on ${level}: ${pct(win)}`);
    }
  }
});
await t('balance: careful players (followers, stoppers, early comers, along-tappers, restarters, steady 0.3 s) win every round without a shout (the jittered "waits for silence" ≥ 95 % on Těžká)', () => {
  const players = [
    ['early starter', earlyStarter], ['restarter', restarter], ['jitter 0.3 ± 15 %', () => steady(0.3, 0.15, 0.5)], ['steady 0.3 s', () => steady(0.3)],
    ...[0.2, 0.6, 0.9, 1.2].map((lag) => [`follower ${lag} s`, () => follower(lag)]),
    ...[[0.5, 1.0], [0.8, 1.5], [1.1, 1.5]].map(([lag, st]) => [`stopper ${lag} s @${st}`, () => stopper(lag, 0, st)]),
    ...[1.8, 2.3, 3.0].map((st) => [`stopper 0.8 s @${st}`, () => stopper(0.8, 0, st)]),
    ...[-0.45, -0.3, -0.15, -0.05, 0.1].map((st) => [`early comer ${st}`, () => stopper(null, 0, st)]),
    ['waits for silence', () => stopper(0.6, 0.3, 2.0, 0.55, 0.7)],
    ...[[0, 0.08], [-0.03, 0.06], [-0.08, 0.05]].map(([mu, sg]) => [`along ${mu} ± ${sg}`, () => syncAlong(mu, sg)]),
  ];
  for (const level of LEVELS) {
    for (const [name, make] of players) {
      const { win, shouts } = rate(level, make, name === 'waits for silence' ? 100 : 20);
      // "waits for silence" is jittered: on Těžká (no mistake allowed) a rare misjudged tap loses.
      const floor = name === 'waits for silence' && level === 'hard' ? 0.95 : 1;
      assert.ok(win >= floor && shouts === 0, `${name} on ${level}: ${pct(win)}, ${shouts} shouts`);
    }
  }
});
await t('balance: jittered followers and stoppers (lag 0.6 ± 0.3, 0.7 ± 0.3) win ≥ 95 % on Lehká and Normální, ≥ 80 % on Těžká', () => {
  for (const level of LEVELS) {
    for (const [name, make] of [['follower 0.6 ± 0.3', () => follower(0.6, 0.3)], ['follower 0.7 ± 0.3', () => follower(0.7, 0.3)],
      ['stopper 0.6 ± 0.3', () => stopper(0.6, 0.3, 1.0)], ['stopper 0.7 ± 0.3', () => stopper(0.7, 0.3, 1.2)]]) {
      const { win } = rate(level, make, 200);
      if (level === 'hard') console.log(`info ${name} on Těžká ${pct(win)}`);
      assert.ok(win >= (level === 'hard' ? 0.8 : 0.95), `${name} on ${level}: ${pct(win)}`);
    }
  }
});
await t('balance: the children (500 rounds): 8-year-old Lehká ≥ 80 %, Normální 35–65 %, Těžká 4–25 %; 11-year-old Normální ≥ 75 %, Těžká 20–50 %; adult ≥ 95 / 95 / 55 %', () => {
  const results = {};
  for (const [name, p] of Object.entries(CHILDREN)) {
    for (const level of LEVELS) results[`${name} ${level}`] = rate(level, () => childPlayer(p), 500).win;
  }
  console.log(`info ${Object.entries(results).map(([k, v]) => `${k} ${pct(v)}`).join(', ')}`);
  assert.ok(results['child8 easy'] >= 0.8, 'child8 Lehká');
  assert.ok(results['child8 normal'] >= 0.35 && results['child8 normal'] <= 0.65, 'child8 Normální');
  assert.ok(results['child8 hard'] >= 0.04 && results['child8 hard'] <= 0.25, 'child8 Těžká');
  assert.ok(results['child11 normal'] >= 0.75, 'child11 Normální');
  assert.ok(results['child11 hard'] >= 0.2 && results['child11 hard'] <= 0.5, 'child11 Těžká');
  assert.ok(results['adult easy'] >= 0.95 && results['adult normal'] >= 0.95 && results['adult hard'] >= 0.55, 'adult');
});
await t('balance: the memory models\' calibration: the adult can\'t hold the old 14-note step (the old Normální: [0, 1] joined, 4 mistakes allowed; ≤ 40 %)', () => {
  const win = rate('normal', () => childPlayer(CHILDREN.adult), 300, { steps: [[0], [1], [0, 1], [3]], mistakes: 5 }).win;
  console.log(`info adult on the old 14-note Normální ${pct(win)}`);
  assert.ok(win <= 0.4, pct(win));
});

// --- files ----------------------------------------------------------------------------------------------------------
await t('BACKGROUND is mountain_meadow.png\'s size', () => {
  const png = fs.readFileSync(`${root}/public/assets/backgrounds/mountain_meadow.png`);
  assert.deepEqual({ width: png.readUInt32BE(16), height: png.readUInt32BE(20) }, R.BACKGROUND);
});
await t('the wisent\'s eyes (≥ 75 % of an 8 px disc near-white) and nostrils (a dark pixel within 4 px) on zubr_neutral.png', async () => {
  const { PNG } = (await import('pngjs')).default;
  const png = PNG.sync.read(fs.readFileSync(`${root}/public/${R.DEFAULTS.assets.zubr}`));
  const px = (x, y) => {
    const i = (y * png.width + x) * 4;
    return png.data.slice(i, i + 4);
  };
  const at = ([fx, fy]) => [Math.round(fx * (png.width - 1)), Math.round(fy * (png.height - 1))];
  for (const eye of R.DEFAULTS.zubr.eyes) {
    const [cx, cy] = at(eye);
    let n = 0;
    let white = 0;
    for (let dy = -8; dy <= 8; dy += 1) {
      for (let dx = -8; dx <= 8; dx += 1) {
        if (dx * dx + dy * dy > 64) continue;
        n += 1;
        const [r, g, b, a] = px(cx + dx, cy + dy);
        if (a > 200 && Math.min(r, g, b) > 180) white += 1;
      }
    }
    assert.ok(white / n >= 0.75, `eye ${eye}: ${pct(white / n)} near-white`);
  }
  for (const nostril of R.DEFAULTS.zubr.nostrils) {
    const [cx, cy] = at(nostril);
    let dark = false;
    for (let dy = -4; dy <= 4 && !dark; dy += 1) {
      for (let dx = -4; dx <= 4 && !dark; dx += 1) {
        const [r, g, b, a] = px(cx + dx, cy + dy);
        if (a > 200 && Math.max(r, g, b) < 60) dark = true;
      }
    }
    assert.ok(dark, `nostril ${nostril}: no dark pixel within 4 px`);
  }
});
await t('every event sound names a sound key; every sound path names a file', () => {
  assert.deepEqual(Object.values(R.EVENT_SOUNDS).sort(), Object.keys(R.DEFAULTS.sounds).sort());
  for (const [name, src] of Object.entries(R.DEFAULTS.sounds)) {
    if (src === null) continue;
    assert.ok(fs.existsSync(`${root}/public/${src}`), `sounds.${name}: ${src} is missing (build it with scripts/build-zubr-sfx.sh)`);
  }
});
if (!process.env.NO_GIT) {
  await t('every asset path in DEFAULTS is in git', () => {
    const tracked = new Set(execFileSync('git', ['-C', root, 'ls-files'], { encoding: 'utf8' }).split('\n'));
    const paths = [...Object.values(R.DEFAULTS.assets), ...Object.values(R.DEFAULTS.sounds)].filter((p) => typeof p === 'string');
    assert.deepEqual(paths.filter((p) => !tracked.has(`public/${p}`)), []);
  });
}
process.exit(failures ? 1 : 0);
