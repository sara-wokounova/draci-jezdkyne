// The wisent song (D46): the rules as a pure state machine, shared by the game (zubrMelody.js draws the state, plays
// the tones and feeds taps) and the node checks (tests/zubrRules.test.mjs plays it). No Pixi, no DOM, no audio.
//
// An echo game (Sára's variant A) with the calm rule of variant B ("Tichý hlas"): Róza sings a step of the song, each
// note lighting its star; the player taps the stars in the same order. A wrong star, or tapping so fast that it counts
// as shouting, is a mistake (the wisent snorts); after `mistakes` of them he charges and the round is lost. After the
// last step Róza sings the whole song once and the round is won.
import { isPlainObject, mergeConfig } from './configRules.js';

export const BACKGROUND = { width: 1672, height: 941 }; // mountain_meadow.png (the node check measures the file)
export const FIELD_HEIGHT = 600;
export const FIELD_WIDTH = (FIELD_HEIGHT * BACKGROUND.width) / BACKGROUND.height; // ≈ 1066 game px
export const STEP = 1 / 60; // s: step() is run at most this long at a time (the game and the node checks alike)
export const STARS = 5;
export const LEVELS = ['easy', 'normal', 'hard'];
const DUPLICATE = 0.06; // s: a second tap on the expected star sooner than this is one pointer event twice, never a note
const PLAYER_LIGHT = 0.3; // s a star stays lit after the player's tap (for the drawing)
const INTRO_LIGHT = 0.35; // s a star stays lit as it appears in the intro
/** Which sound plays for each event (zubrMelody.js plays them; each a key of DEFAULTS.sounds). */
export const EVENT_SOUNDS = { mistake: 'snort', charge: 'charge', clear: 'clear' };

// The song's name as the player sees it (Sára, 2026-11-18: "stará píseň proti kletbám", never "ukolébavka"): the HUD's
// title (zubrMelody.js's HUD_TEXTS, also on the play-test page); the story names it in hory_zubr's line 10 ("starou
// píseň proti kletbám": the test checks it holds the name).
export const SONG = 'Píseň proti kletbám';

// The song's words (Fable, Sára's pick of 2026-11-18), one line per phrase, syllables split by "-" and spaces: one
// note per syllable (a lone k, s, v or z is a preposition, no syllable; tests/zubrRules.test.mjs counts them against
// DEFAULTS.phrases). The only place in the code that holds the lyric; the story quotes its first two lines in
// hory_zubr's line 11 (lokace-hory.json; the test checks the quote) and tells what it does in line 10. A new lyric:
// replace these lines and those story lines, keeping 7 trochaic syllables a line (or refit the phrases' notes).
export const LYRIC = [
  'Ci-zí pí-seň ztrá-cí moc,',
  'ko-lem te-be dý-chá noc.',
  'Sly-šíš? Vo-lám jmé-no tvé,',
  'vrať se k so-bě, srd-ce mé.',
];

export const DEFAULTS = {
  // The five stars, low to high: D4 E4 G4 A4 B4 (an E minor pentatonic: any order sounds consonant; the tune ends on E
  // with the folk D–E cadence).
  tones: [293.66, 329.63, 392.0, 440.0, 493.88],
  beat: 0.4, // s: 3/4 at ♩ = 150; each trochee long–short (2 + 1 beats), a line's last syllable held 3
  // The phrases, one per LYRIC line: [star 0–4, beats] per syllable.
  // G A B A G E A– | B A G E G A G– | G A B A G E A– | G E G A G D E–   (the tunes A B A C; line 3 new words on A)
  phrases: [
    [[2, 2], [3, 1], [4, 2], [3, 1], [2, 2], [1, 1], [3, 3]],
    [[4, 2], [3, 1], [2, 2], [1, 1], [2, 2], [3, 1], [2, 3]],
    [[2, 2], [3, 1], [4, 2], [3, 1], [2, 2], [1, 1], [3, 3]],
    [[2, 2], [1, 1], [2, 2], [3, 1], [2, 2], [0, 1], [1, 3]],
  ],
  // The steps Róza sings and the player echoes (phrase indices joined; one list for every level): the four lines one
  // at a time, 7 notes each (Sára: 14 can't be remembered; line 3 has line 1's tune).
  steps: [[0], [1], [2], [3]],
  // The charge on this mistake: Lehká allows 5, Normální 2, Těžká none ("úplně bez chyby", D46).
  mistakes: { easy: 6, normal: 3, hard: 1 },
  rubinka: { easy: 0, normal: 0, hard: 0 }, // Rubínka's red tones per phrase in Róza's demo (off: D46's balance)
  // s in the echo without a tap (from its opening, or the last tap) before the replay button pulses. Nothing is ever
  // replayed by itself (Sára, after her play-test): the button is the only way to hear the step again.
  hintAfter: { easy: 6, normal: 10, hard: 20 },
  // The calm meter, a leaky bucket: +1 a tap, drains `calm` a second (not tied to the beat), over `burst` a shout; its
  // warning segment from warn × burst.
  voice: { burst: 3.5, calm: 3.125, warn: 0.8 },
  finale: true, // Róza sings the whole song after the last step (false: the round is won at the last success)
  introGap: 0.45, // s between the stars appearing
  introTail: 0.4, // s after the fifth star before the first demo
  echoGap: 0.3, // s after the finale's last note before the shimmer
  successSeconds: 1.0,
  snortSeconds: 1.4,
  chargeSeconds: 2.2,
  endHold: 0.8, // s after the shimmer before the result
  bounce: 0.12, // s: a second tap on the same star this soon is ignored (a finger bouncing)
  redBeats: 0.5, // a red tone's length
  followLag: 1.0, // s: in the grace, a tap on a star Róza lit this recently is a follower's, not a mistake
  echoLead: 0.5, // s: the echo opens this long before Róza's last onset
  restartPause: 2.75, // beats: after the grace, a fall back to the phrase's start is a restart only after this pause
  anticipate: 0.25, // s: in the grace, a tap this far ahead of a Róza note on its star is tapping along
  quietEnd: 1.5, // s without any input before a lost round ends (after the charge)
  quietMax: 15, // at most this long after the charge
  // Drawing (field fractions unless px): the stars low to high on a rising line; hit and drawn radii in game px.
  stars: [[0.31, 0.34], [0.42, 0.31], [0.53, 0.28], [0.64, 0.25], [0.75, 0.22]],
  hitRadius: 56,
  starRadius: 30,
  colors: ['#56B4E9', '#009E73', '#F0E442', '#E69F00', '#CC79A7'], // Okabe–Ito: safe for the common colour-blindnesses
  // The wisent: his centre x and feet (fractions), width (px); the eyes and nostrils on zubr_neutral.png (texture
  // fractions, measured; tests/zubrRules.test.mjs checks them on the file).
  zubr: { x: 0.25, feet: 0.97, width: 400, eyes: [[0.707, 0.517], [0.84, 0.557]], nostrils: [[0.73, 0.69], [0.785, 0.69]] },
  roza: { x: 0.84, feet: 0.97, height: 330 },
  meter: [0.955, 0.70], // the voice meter's centre x and bottom
  replayButton: [0.10, 0.30], // the replay button's centre (moves down with the stars under a tall HUD bar)
  words: [0.585, 0.53], // the words' block: its centre x and top (between the wisent and Róza, under the stars)
  // Drawn sizes in game px: the stars' backing disc, the voice meter, the words' and the replay label's font (14.4 CSS px
  // at 568×270), the widths the words' block and the label fit into.
  sizes: { backing: 42, meterWidth: 16, meterHeight: 70, words: 32, wordsWidth: 300, label: 32, labelWidth: 200 },
  // status: the snorts so far; flawless: the status before any mistake when the first one charges (Těžká: no snort);
  // replay: the button's label (Fable).
  labels: { status: 'Zubr funí: {n} z {max}', flawless: 'Bez chyby!', replay: 'Ještě jednou' },
  assets: {
    zubr: 'assets/characters/zubr/zubr_neutral.png',
    rozaTalking: 'assets/characters/roza/roza_talking.png',
    rozaNeutral: 'assets/characters/roza/roza_neutral.png',
    rozaHappy: 'assets/characters/roza/roza_happy.png',
    rozaNervous: 'assets/characters/roza/roza_nervous.png',
  },
  // Sára's picks (2026-11-18: snort b, charge b, clear c), built by scripts/build-zubr-sfx.sh into
  // public/assets/minigames/zubr/sfx/ (null: silent; the tones are the game's own sound).
  sounds: {
    snort: 'assets/minigames/zubr/sfx/snort.mp3',
    charge: 'assets/minigames/zubr/sfx/charge.mp3',
    clear: 'assets/minigames/zubr/sfx/clear.mp3',
  },
};

const inRange = (v, lo, hi, fallback) => (Number.isFinite(v) && v >= lo && v <= hi ? v : fallback);
const intRange = (v, lo, hi, fallback) => (Number.isInteger(v) && v >= lo && v <= hi ? v : fallback);
const fraction = (v, fallback) => inRange(v, 0, 1, fallback);
const isPoint = (p) => Array.isArray(p) && p.length === 2 && p.every((v) => Number.isFinite(v) && v >= 0 && v <= 1);
const points = (list, n, fallback) => (Array.isArray(list) && list.length === n && list.every(isPoint) ? list : fallback);
// A table by difficulty ({ easy, normal, hard }), or one number for every level.
const byLevel = (table, level) => (Number.isFinite(table) ? table : isPlainObject(table) ? table[level] : undefined);
const strings = (value) => (isPlainObject(value) ? Object.fromEntries(Object.entries(value).filter(([, v]) => typeof v === 'string')) : {});

function validPhrases(list) {
  return Array.isArray(list) && list.length >= 1 && list.length <= 8 && list.every((p) => Array.isArray(p) && p.length >= 1
    && p.length <= 16 && p.every((n) => Array.isArray(n) && n.length === 2 && intRange(n[0], 0, STARS - 1, null) !== null
      && inRange(n[1], 0.25, 4, null) !== null));
}
function validSteps(list, phrases) {
  return Array.isArray(list) && list.length >= 1 && list.length <= 12 && list.every((s) => Array.isArray(s) && s.length >= 1
    && s.every((i) => Number.isInteger(i) && i >= 0 && i < phrases.length)
    && s.reduce((a, i) => a + phrases[i].length, 0) <= 32);
}

/**
 * The game's numbers from DEFAULTS and the story's config, checked (D24: a typo falls back to the default, nothing
 * loops or floods, no star becomes untappable), for one difficulty ('easy' | 'normal' | 'hard'; anything else plays
 * as 'normal'). Arrays and objects that pass come back by reference (the config's own, or DEFAULTS'): never write into
 * the result (D23).
 */
export function normalize(config = {}, difficulty = 'normal') {
  const level = LEVELS.includes(difficulty) ? difficulty : 'normal';
  const c = mergeConfig(DEFAULTS, isPlainObject(config) ? config : {});
  const d = DEFAULTS;
  const phrases = validPhrases(c.phrases) ? c.phrases : d.phrases;
  const steps = [c.steps, d.steps].find((s) => validSteps(s, phrases)) ?? phrases.map((_, i) => [i]);
  const voice = isPlainObject(c.voice) ? c.voice : {};
  const zubr = isPlainObject(c.zubr) ? c.zubr : {};
  const roza = isPlainObject(c.roza) ? c.roza : {};
  const sizes = isPlainObject(c.sizes) ? c.sizes : {};
  const durations = Object.fromEntries(['introGap', 'introTail', 'echoGap', 'successSeconds', 'snortSeconds', 'chargeSeconds', 'endHold']
    .map((k) => [k, inRange(c[k], 0, 10, d[k])]));
  return {
    level,
    tones: Array.isArray(c.tones) && c.tones.length === STARS && c.tones.every((f) => inRange(f, 100, 2000, null) !== null) ? c.tones : d.tones,
    beat: inRange(c.beat, 0.2, 2, d.beat),
    phrases,
    steps,
    mistakes: intRange(byLevel(c.mistakes, level), 1, 10, d.mistakes[level]),
    rubinka: intRange(byLevel(c.rubinka, level), 0, 3, d.rubinka[level]),
    hintAfter: inRange(byLevel(c.hintAfter, level), 1, 30, d.hintAfter[level]),
    voice: {
      burst: inRange(voice.burst, 1.5, 10, d.voice.burst),
      calm: inRange(voice.calm, 0.5, 10, d.voice.calm),
      warn: inRange(voice.warn, 0.1, 0.95, d.voice.warn),
    },
    finale: typeof c.finale === 'boolean' ? c.finale : d.finale,
    ...durations,
    bounce: inRange(c.bounce, 0, 0.5, d.bounce),
    redBeats: inRange(c.redBeats, 0.1, 4, d.redBeats),
    followLag: inRange(c.followLag, 0, 2, d.followLag),
    echoLead: inRange(c.echoLead, 0, 1, d.echoLead),
    restartPause: inRange(c.restartPause, 1, 8, d.restartPause),
    anticipate: inRange(c.anticipate, 0, 0.5, d.anticipate),
    quietEnd: inRange(c.quietEnd, 0, 5, d.quietEnd),
    quietMax: inRange(c.quietMax, 1, 60, d.quietMax),
    stars: points(c.stars, STARS, d.stars),
    hitRadius: inRange(c.hitRadius, 30, 120, d.hitRadius),
    starRadius: inRange(c.starRadius, 10, 80, d.starRadius),
    colors: Array.isArray(c.colors) && c.colors.length === STARS && c.colors.every((x) => typeof x === 'string' && /^#[0-9a-f]{6}$/i.test(x)) ? c.colors : d.colors,
    zubr: {
      x: fraction(zubr.x, d.zubr.x),
      feet: fraction(zubr.feet, d.zubr.feet),
      width: inRange(zubr.width, 100, 800, d.zubr.width),
      eyes: points(zubr.eyes, 2, d.zubr.eyes),
      nostrils: points(zubr.nostrils, 2, d.zubr.nostrils),
    },
    roza: { x: fraction(roza.x, d.roza.x), feet: fraction(roza.feet, d.roza.feet), height: inRange(roza.height, 100, 500, d.roza.height) },
    meter: isPoint(c.meter) ? c.meter : d.meter,
    replayButton: isPoint(c.replayButton) ? c.replayButton : d.replayButton,
    words: isPoint(c.words) ? c.words : d.words,
    sizes: Object.fromEntries(Object.entries(d.sizes).map(([k, v]) => [k, inRange(sizes[k], 1, 400, v)])),
    labels: { ...d.labels, ...strings(c.labels) },
    assets: { ...d.assets, ...strings(c.assets) },
    sounds: isPlainObject(c.sounds) ? c.sounds : d.sounds, // checked by soundEntry() where they are played
  };
}

/** The lyric's line i as the story quotes it (no syllable marks): the quoted form the checks compare with the story. */
export const lyricLine = (i) => LYRIC[i].replaceAll('-', '');

/** The lyric's line i as syllables (a lone k, s, v or z joins the next one), or null when there is none. */
export function lyricSyllables(i) {
  if (typeof LYRIC[i] !== 'string') return null;
  const out = [];
  let lead = '';
  for (const word of LYRIC[i].split(' ')) {
    if (/^[ksvz]$/i.test(word)) { lead += `${word} `; continue; }
    word.split('-').forEach((syllable, k) => out.push({ text: (k === 0 ? lead : '') + syllable, wordStart: k === 0 }));
    lead = '';
  }
  return out;
}

/** The syllables to show for phrase p: its lyric line when that has one syllable per note, else null (no words). */
export function phraseWords(cfg, p) {
  const words = lyricSyllables(p);
  return words && cfg.phrases[p] && words.length === cfg.phrases[p].length ? words : null;
}

/** The notes of step i: [{ star, beats }] (its phrases joined). */
export const stepNotes = (cfg, i) => cfg.steps[i].flatMap((p) => cfg.phrases[p].map(([star, beats]) => ({ star, beats })));

/**
 * Róza's demo of step i as a timeline: notes { t, star, who: 'roza' | 'rubinka', dur } in time order, its length, the
 * last Róza note's onset and length, and `lead` (how long before that onset the echo opens). Rubínka's red tones
 * go into the middles of each phrase's longest notes (the held note first), on a star Róza isn't lighting and hasn't lit
 * within followLag before it, never the step's first star (a red tap must never start the echo); else any star but hers.
 */
export function demoTimeline(cfg, i, rng = Math.random, rubinka = cfg.rubinka) {
  const out = [];
  const first = cfg.phrases[cfg.steps[i][0]][0][0];
  let t = 0;
  for (const p of cfg.steps[i]) {
    const notes = cfg.phrases[p];
    const longest = [...notes.keys()].sort((a, b) => notes[b][1] - notes[a][1]).slice(0, rubinka);
    notes.forEach(([star, beats], k) => {
      const dur = beats * cfg.beat;
      out.push({ t, star, who: 'roza', dur });
      if (longest.includes(k)) {
        const redDur = cfg.redBeats * cfg.beat;
        const redT = Math.max(t, t + dur / 2 - redDur / 2); // never before its note (a red tone longer than it)
        const busy = new Set(out.filter((n) => n.who === 'roza' && n.t <= redT && n.t + n.dur >= redT - cfg.followLag).map((n) => n.star));
        busy.add(star);
        busy.add(first);
        const all = [...Array(STARS).keys()];
        const free = all.filter((x) => !busy.has(x));
        const pool = free.length ? free : all.filter((x) => x !== star);
        out.push({ t: redT, star: pool[Math.floor(rng() * pool.length)], who: 'rubinka', dur: redDur });
      }
      t += dur;
    });
  }
  const last = out.filter((n) => n.who === 'roza').at(-1);
  out.sort((a, b) => a.t - b.t);
  const end = Math.max(...out.map((n) => n.t + n.dur)); // the latest note's end (a red tone longer than its note too)
  return { notes: out, length: t, end, lastOnset: last.t, lastDur: last.dur, lead: Math.min(cfg.echoLead, last.t) };
}

export function createState(cfg, rng = Math.random) {
  return {
    cfg, rng, t: 0, phase: 'intro', phaseT: 0, step: 0, index: 0, mistakes: 0, done: 0, cursor: 0,
    voice: 0, voiceAt: 0, lastTap: { star: -1, t: -Infinity }, lastActivity: 0, lastInput: -Infinity,
    timeline: null, echoT0: 0, taps: [], tapTimes: [], playerLit: Array(STARS).fill(-Infinity),
    outcome: null, endAt: null, events: [], shouts: 0,
  };
}

const enter = (s, phase, over = 0) => {
  s.phase = phase;
  s.phaseT = over;
  s.cursor = 0;
};
function startDemo(s, over = 0) {
  enter(s, 'demo', over);
  s.timeline = demoTimeline(s.cfg, s.step, s.rng);
}
/** The finale's one step: the whole song (the words follow it too). */
export const finaleSteps = (cfg) => [cfg.phrases.map((_, i) => i)];
function startFinale(s, over = 0) {
  enter(s, 'finale', over);
  s.timeline = demoTimeline({ ...s.cfg, steps: finaleSteps(s.cfg) }, 0, s.rng, 0);
}
function win(s, over = 0) {
  s.outcome = 'victory';
  s.endAt = s.t - over + s.cfg.endHold;
  enter(s, 'done', over);
}

/** The voice meter now (drained since its last change). */
export const voiceNow = (s) => Math.max(0, s.voice - s.cfg.voice.calm * (s.t - s.voiceAt));
const live = (s) => ['intro', 'demo', 'echo', 'snort', 'success'].includes(s.phase);
/** The grace's length from the echo's opening: until Róza's held note ends + followLag. */
const graceLength = (s) => s.timeline.lead + s.timeline.lastDur + s.cfg.followLag;

function mistake(s, reason, ev) {
  s.mistakes += 1;
  ev('mistake', { reason });
  if (s.mistakes >= s.cfg.mistakes) {
    enter(s, 'charge');
    ev('charge');
    s.outcome = 'failure';
    s.endAt = s.t + s.cfg.chargeSeconds;
  } else enter(s, 'snort');
}

/** A tap on star `star` at the state's time; returns its events ('tone' among them when it sounds). */
export function tap(s, star) {
  const events = [];
  const ev = (type, extra = {}) => events.push({ type, t: s.t, ...extra });
  if (!live(s) || !(Number.isInteger(star) && star >= 0 && star < STARS)) return events;
  if (s.phase === 'intro' && star >= s.cursor) return events; // not shown yet
  const notes = s.phase === 'echo' ? stepNotes(s.cfg, s.step) : null;
  const expected = notes ? notes[s.index]?.star : -1;
  const since = s.t - s.lastTap.t;
  // A finger bouncing on one star; the star the echo expects next is a note again after DUPLICATE (G–G at a joint).
  if (star === s.lastTap.star && since < s.cfg.bounce && (star !== expected || since < DUPLICATE)) return events;
  s.lastTap = { star, t: s.t };
  s.lastActivity = s.t;
  s.playerLit[star] = s.t;
  ev('tone', { star, who: 'player' });
  s.voice = voiceNow(s) + 1;
  s.voiceAt = s.t;
  const shout = s.voice > s.cfg.voice.burst;
  if (shout) {
    s.voice = s.cfg.voice.burst;
    s.shouts += 1;
    ev('shout');
  }
  if (s.phase === 'demo' && shout) mistake(s, 'shout', ev); // talking over Róza: only loudness counts
  if (s.phase !== 'echo') return events; // the intro (nothing heard yet), a snort, a success: the meter only
  if (shout) {
    mistake(s, 'shout', ev);
    return events;
  }
  const tl = s.timeline;
  // The echo is the longest run of the latest taps that matches the step's start, for the whole echo, so taps that
  // follow Róza's lights and then the child's own echo line up wherever the echo really starts.
  s.taps.push(star);
  s.tapTimes.push(s.t);
  if (s.taps.length > notes.length) {
    s.taps.shift();
    s.tapTimes.shift();
  }
  let k = s.taps.length;
  for (; k > 0; k -= 1) if (s.taps.slice(-k).every((x, i) => x === notes[i].star)) break;
  const advanced = k === s.index + 1;
  // The grace: from the echo's opening until Róza's held note ends + followLag, a tap that breaks every alignment is
  // forgiven when its star is one Róza is lighting, lights within `anticipate`, or lit under followLag ago, and no red
  // tone has lit it since (tapping Rubínka's flashes is never following).
  const inGrace = s.phaseT < graceLength(s);
  const now = s.echoT0 + s.phaseT;
  const followed = inGrace && tl.notes.some((n) => n.who === 'roza' && n.star === star && now >= n.t - s.cfg.anticipate
    && now - (n.t + n.dur) <= s.cfg.followLag
    && !tl.notes.some((m) => m.who === 'rubinka' && m.star === star && m.t > n.t - s.cfg.anticipate && m.t <= now));
  // A fall back to an earlier alignment is a restart only after a pause before the new run's first tap (or in the
  // grace); otherwise the slip is a mistake on the tap itself. (A correct note equal to the step's first star after a
  // pause, then the start's second note, reads as a restart even when the child meant to go on: the same taps as a child
  // starting again, which the plan keeps lenient; the next wrong tap is snorted at.)
  const first = s.taps.length - k;
  const pause = s.cfg.restartPause * s.cfg.beat;
  const restart = k > 0 && first > 0 && s.tapTimes[first] - s.tapTimes[first - 1] >= pause;
  if ((k === 0 && !followed) || (k > 0 && !advanced && !inGrace && !restart)) {
    mistake(s, 'wrong', ev);
    return events;
  }
  s.index = k; // a forgiven tap or a restart: no sparkle
  if (advanced) {
    ev('correct', { star, index: k - 1 });
  }
  if (s.index === notes.length) {
    s.done += 1;
    ev('success', { step: s.step });
    enter(s, 'success');
  }
  return events;
}

/** Any tap, click or key press (repeats too), for the quiet before a lost round's end. */
export function noteInput(s) {
  s.lastInput = s.t;
}

export function step(s, dt) {
  s.events = [];
  const ev = (type, extra = {}) => s.events.push({ type, t: s.t, ...extra });
  s.t += dt;
  s.phaseT += dt;
  const c = s.cfg;
  if (s.phase === 'intro') {
    while (s.cursor < STARS && s.phaseT >= s.cursor * c.introGap) ev('tone', { star: s.cursor++, who: 'intro', dur: c.introGap });
    const end = STARS * c.introGap + c.introTail;
    if (s.phaseT >= end) startDemo(s, s.phaseT - end);
  } else if (s.phase === 'demo' || s.phase === 'finale') {
    const tl = s.timeline;
    while (s.cursor < tl.notes.length && s.phaseT >= tl.notes[s.cursor].t) ev('tone', tl.notes[s.cursor++]);
    const opens = s.phase === 'demo' ? tl.lastOnset - tl.lead : tl.length + c.echoGap;
    if (s.phaseT >= opens) {
      const over = s.phaseT - opens;
      if (s.phase === 'finale') {
        ev('clear');
        win(s, over);
      } else {
        const cursor = s.cursor;
        enter(s, 'echo', over);
        Object.assign(s, { cursor, index: 0, taps: [], tapTimes: [], echoT0: opens, lastActivity: s.t - over });
      }
    }
  } else if (s.phase === 'echo') {
    const tl = s.timeline; // the demo's held tail (and a red tone in it) plays on
    const at = s.echoT0 + s.phaseT;
    while (s.cursor < tl.notes.length && at >= tl.notes[s.cursor].t) ev('tone', tl.notes[s.cursor++]);
  } else if (s.phase === 'snort') {
    if (s.phaseT >= c.snortSeconds) startDemo(s, s.phaseT - c.snortSeconds);
  } else if (s.phase === 'success') {
    if (s.phaseT >= c.successSeconds) {
      const over = s.phaseT - c.successSeconds;
      s.step += 1;
      if (s.step < c.steps.length) startDemo(s, over);
      else if (c.finale) startFinale(s, over);
      else win(s, over);
    }
  } else if (s.phase === 'charge') {
    if (s.phaseT >= c.chargeSeconds) enter(s, 'hold', s.phaseT - c.chargeSeconds);
  }
  return s;
}

/** The replay button is enabled: in the echo, once every note of Róza's demo has ended (not while she sings, nor in a
 *  snort, a success, the finale, the charge, the hold or after the end). */
export const canReplay = (s) => s.phase === 'echo' && s.echoT0 + s.phaseT >= s.timeline.end;

/** The replay button pressed: Róza sings the current step again, free (no mistake, nothing on the meter); the echo starts
 *  over after it. Nothing while the button is disabled. */
export function replay(s) {
  if (!canReplay(s)) return [];
  startDemo(s);
  return [{ type: 'replay', t: s.t }];
}

/** The button pulses: enabled, and hintAfter has passed since the echo opened or the last tap. */
export const replayHint = (s) => canReplay(s) && s.t - s.lastActivity >= s.cfg.hintAfter;

/** The round is over: a victory endHold after the shimmer; a failure once the charge is over and quietEnd passed
 *  without input (noteInput), or quietMax after the charge. A loss ends only from the hold: endAt (the charge's time +
 *  chargeSeconds) and the charge's own phaseT can round apart by 1e-15, and a round frozen in the charge would never
 *  draw the hold. */
export const finished = (s) => s.endAt !== null && s.t >= s.endAt
  && (s.outcome === 'victory' || (s.phase === 'hold' && (s.t - s.lastInput >= s.cfg.quietEnd || s.t >= s.endAt + s.cfg.quietMax)));

/** The hold's ring after a charge: 0 → 1 as the quiet goes on; null outside the hold. */
export function quietView(s) {
  if (s.phase !== 'hold') return null;
  return s.cfg.quietEnd > 0 ? Math.min(1, Math.max(0, (s.t - s.lastInput) / s.cfg.quietEnd)) : 1; // as finished() counts
}

/** How many stars are shown (the intro shows them one by one). */
export const shown = (s) => (s.phase === 'intro' ? s.cursor : STARS);

/** Each star's light now: 'rubinka' | 'player' | 'roza' | null (for the drawing). */
export function lit(s) {
  const out = Array(STARS).fill(null);
  if (s.phase === 'done') return out.fill('roza'); // the song sung: the stars stay lit under the result
  if (s.phase === 'intro') {
    const star = Math.floor(s.phaseT / s.cfg.introGap);
    if (star < s.cursor && s.phaseT - star * s.cfg.introGap < INTRO_LIGHT) out[star] = 'roza';
    return out;
  }
  const at = s.phase === 'echo' ? s.echoT0 + s.phaseT : s.phaseT;
  const sounding = ['demo', 'echo', 'finale'].includes(s.phase) ? s.timeline.notes.filter((n) => at >= n.t && at < n.t + n.dur) : [];
  for (const n of sounding) if (n.who === 'roza') out[n.star] = 'roza';
  if (live(s)) for (let i = 0; i < STARS; i += 1) if (s.t - s.playerLit[i] < PLAYER_LIGHT) out[i] = 'player';
  for (const n of sounding) if (n.who === 'rubinka') out[n.star] = 'rubinka';
  return out;
}

/** The mist over the wisent's eyes, 0–1: thinner with each step done, thicker with each mistake, down to a veil (0.3)
 *  during the finale. */
export function mistView(s) {
  const steps = s.cfg.steps.length;
  const base = Math.min(1, 0.3 + 0.5 * (1 - s.done / steps) + 0.07 * s.mistakes);
  if (s.phase === 'finale') return 0.3 + (base - 0.3) * Math.max(0, 1 - s.phaseT / s.timeline.length);
  if (s.phase === 'done') return 0.3;
  return base;
}

/** The HUD's score (steps done) and status (snorts). */
export function hudView(s) {
  return {
    score: `${s.done} z ${s.cfg.steps.length}`,
    status: s.cfg.mistakes === 1 && s.mistakes === 0 ? s.cfg.labels.flawless
      : s.cfg.labels.status.replaceAll('{n}', String(s.mistakes)).replaceAll('{max}', String(s.cfg.mistakes)),
  };
}
