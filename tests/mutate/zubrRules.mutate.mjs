// Fail-before for tests/zubrRules.test.mjs (D46): breaks one rule at a time in a copy of the files it needs and runs the
// test there; every mutation must make it fail (a control run without a mutation must pass, and so must the ones marked
// `pass`).
//   node tests/mutate/zubrRules.mutate.mjs [part of a mutation name]
// The copy: see runMutations.mjs. On Windows in Git Bash: MUTATE_TMP=C:/tmp/claude/mutate node tests/mutate/zubrRules.mutate.mjs
import fs from 'node:fs';
import { REPO, runMutations } from './runMutations.mjs';

const RULES = 'src/engine/minigames/zubrRules.js';
const SFX = 'public/assets/minigames/zubr/sfx';
const files = [RULES, 'src/engine/minigames/configRules.js', 'public/assets/backgrounds/mountain_meadow.png',
  'public/assets/characters/zubr/zubr_neutral.png', 'public/story/lokace-hory.json',
  // the sound effects (Sára's picks), once built
  ...(fs.existsSync(`${REPO}/${SFX}`) ? fs.readdirSync(`${REPO}/${SFX}`).map((n) => `${SFX}/${n}`) : [])];
const MUTATIONS = [
  // the calm meter
  ['a tap adds half', RULES, 's.voice = voiceNow(s) + 1;', 's.voice = voiceNow(s) + 0.5;'],
  ['the meter drains twice as fast', RULES, 's.voice - s.cfg.voice.calm * (s.t - s.voiceAt)', 's.voice - 2 * s.cfg.voice.calm * (s.t - s.voiceAt)'],
  ['a shout only over burst + 1', RULES, 'const shout = s.voice > s.cfg.voice.burst;', 'const shout = s.voice > s.cfg.voice.burst + 1;'],
  ['the drain at 2.5 a second', RULES, 'voice: { burst: 3.5, calm: 3.125, warn: 0.8 }', 'voice: { burst: 3.5, calm: 2.5, warn: 0.8 }'],
  ['an intro shout counted', RULES, "if (s.phase === 'demo' && shout) mistake", "if ((s.phase === 'demo' || s.phase === 'intro') && shout) mistake"],
  ['a shout in a demo not counted', RULES, "  if (s.phase === 'demo' && shout) mistake(s, 'shout', ev); // talking over Róza: only loudness counts\n", ''],
  ['a shout in a snort counted', RULES, "if (s.phase === 'demo' && shout) mistake", "if (['demo', 'snort', 'success'].includes(s.phase) && shout) mistake"],
  ['no shout event', RULES, "    ev('shout');\n", ''],
  // the bounce
  ['no bounce', RULES, '  if (star === s.lastTap.star && since < s.cfg.bounce && (star !== expected || since < DUPLICATE)) return events;\n', ''],
  ['no exception for the expected star', RULES, '(star !== expected || since < DUPLICATE)', 'true'],
  ['the exception without its 0.06 s', RULES, '(star !== expected || since < DUPLICATE)', '(star !== expected)'],
  // the echo
  ['the echo opens after the held note', RULES, "const opens = s.phase === 'demo' ? tl.lastOnset - tl.lead", "const opens = s.phase === 'demo' ? tl.length"],
  ['echoLead 0', RULES, 'echoLead: 0.5,', 'echoLead: 0,'],
  ['echoLead 0.25', RULES, 'echoLead: 0.5,', 'echoLead: 0.25,'],
  ['the grace off', RULES, 'const inGrace = s.phaseT < graceLength(s);', 'const inGrace = false;'],
  ['the grace for the whole echo', RULES, 'const inGrace = s.phaseT < graceLength(s);', 'const inGrace = true;'],
  ['the alignment ends with the grace', RULES, '  const advanced = k === s.index + 1;', '  if (!(s.phaseT < graceLength(s))) k = notes[s.index]?.star === star ? s.index + 1 : 0;\n  const advanced = k === s.index + 1;'],
  ['a red-lit star forgiven', RULES, "\n    && !tl.notes.some((m) => m.who === 'rubinka' && m.star === star && m.t > n.t - s.cfg.anticipate && m.t <= now)", ''],
  ['no sparkle in the grace', RULES, '  if (advanced) {\n    ev(', '  if (advanced && !inGrace) {\n    ev('],
  ['the grace forgives any wrong tap', RULES, 'now - (n.t + n.dur) <= s.cfg.followLag', 'true'],
  ['followLag from a note\'s onset', RULES, 'now - (n.t + n.dur) <= s.cfg.followLag', 'now - n.t <= s.cfg.followLag'],
  ['the grace ends with the held note', RULES, 'const graceLength = (s) => s.timeline.lead + s.timeline.lastDur + s.cfg.followLag;', 'const graceLength = (s) => s.timeline.lead + s.timeline.lastDur;'],
  ['the alignment as a reset to 0 or 1', RULES, '  for (; k > 0; k -= 1) if (s.taps.slice(-k).every((x, i) => x === notes[i].star)) break;', '  k = star === notes[s.index].star ? s.index + 1 : star === notes[0].star ? 1 : 0;'],
  ['anticipate 0', RULES, 'anticipate: 0.25,', 'anticipate: 0,'],
  ['the restart pause ignored', RULES, '&& !inGrace && !restart)', '&& !inGrace && false)'],
  ['no restarts after the grace', RULES, '&& !inGrace && !restart)', '&& !inGrace)'],
  ['the restart judged by the pause before the tap', RULES, 's.tapTimes[first] - s.tapTimes[first - 1]', 's.tapTimes.at(-1) - s.tapTimes.at(-2)'],
  ['a red tone before its note', RULES, 'const redT = Math.max(t, t + dur / 2 - redDur / 2);', 'const redT = t + dur / 2 - redDur / 2;'],
  ['the restart pause clamped at 2 s', RULES, 'const pause = s.cfg.restartPause * s.cfg.beat;', 'const pause = Math.min(s.cfg.restartPause * s.cfg.beat, 2);'],
  // the replay button
  ['the button while Róza sings', RULES, "export const canReplay = (s) => s.phase === 'echo' && s.echoT0 + s.phaseT >= s.timeline.end;", "export const canReplay = (s) => s.phase === 'echo';"],
  ['the button until the last onset only', RULES, 's.echoT0 + s.phaseT >= s.timeline.end;', 's.echoT0 + s.phaseT >= s.timeline.lastOnset;'],
  ['the button outside the echo', RULES, "export const canReplay = (s) => s.phase === 'echo' && s.echoT0 + s.phaseT >= s.timeline.end;", "export const canReplay = (s) => s.phase !== 'demo' && (s.phase !== 'echo' || s.echoT0 + s.phaseT >= s.timeline.end);"],
  ['a replay while disabled', RULES, '  if (!canReplay(s)) return [];\n  startDemo(s);', '  startDemo(s);'],
  ['a replay fills the meter', RULES, "  startDemo(s);\n  return [{ type: 'replay', t: s.t }];", "  s.voice = voiceNow(s) + 2;\n  s.voiceAt = s.t;\n  startDemo(s);\n  return [{ type: 'replay', t: s.t }];"],
  ['a replay costs a mistake', RULES, "  startDemo(s);\n  return [{ type: 'replay', t: s.t }];", "  s.mistakes += 1;\n  startDemo(s);\n  return [{ type: 'replay', t: s.t }];"],
  ['timeline.end without the red tones', RULES, 'const end = Math.max(...out.map((n) => n.t + n.dur));', "const end = Math.max(...out.filter((n) => n.who === 'roza').map((n) => n.t + n.dur));"],
  // the words
  ['a lone k not joined', RULES, 'if (/^[ksvz]$/i.test(word))', 'if (false)'],
  ['words for a line that doesn\'t fit', RULES, 'words && cfg.phrases[p] && words.length === cfg.phrases[p].length ? words : null', 'words'],
  ['an automatic replay with no tap', RULES, "  } else if (s.phase === 'snort') {", "    if (s.taps.length === 0 && s.t - s.lastActivity >= c.hintAfter && canReplay(s)) startDemo(s);\n  } else if (s.phase === 'snort') {"],
  ['the pulse only after a tap', RULES, 'export const replayHint = (s) => canReplay(s) && s.t', 'export const replayHint = (s) => canReplay(s) && s.taps.length > 0 && s.t'],
  ['the pulse after half the quiet', RULES, 's.t - s.lastActivity >= s.cfg.hintAfter;', 's.t - s.lastActivity >= s.cfg.hintAfter / 2;'],
  ['Těžká pulses after 10 s', RULES, 'hintAfter: { easy: 6, normal: 10, hard: 20 }', 'hintAfter: { easy: 6, normal: 10, hard: 10 }'],
  ['a hintAfter typo kept', RULES, 'hintAfter: inRange(byLevel(c.hintAfter, level), 1, 30,', 'hintAfter: inRange(byLevel(c.hintAfter, level), -1, 300,'],
  ['"Bez chyby!" after the mistake', RULES, 'status: s.cfg.mistakes === 1 && s.mistakes === 0 ?', 'status: s.cfg.mistakes === 1 ?'],
  ['the snort count on Těžká', RULES, 'status: s.cfg.mistakes === 1 && s.mistakes === 0 ? s.cfg.labels.flawless', 'status: false ? s.cfg.labels.flawless'],
  ['"Bez chyby!" on every level', RULES, 'status: s.cfg.mistakes === 1 && s.mistakes === 0 ? s.cfg.labels.flawless', 'status: true ? s.cfg.labels.flawless'],
  ['the index kept at a new echo', RULES, 'Object.assign(s, { cursor, index: 0,', 'Object.assign(s, { cursor,'],
  ['the mistake limit off by one', RULES, 'if (s.mistakes >= s.cfg.mistakes) {', 'if (s.mistakes > s.cfg.mistakes) {'],
  ['an unshown star tappable', RULES, "  if (s.phase === 'intro' && star >= s.cursor) return events; // not shown yet\n", ''],
  // Rubínka's red tones
  ['a red tone on a star Róza lit within followLag', RULES, 'n.t + n.dur >= redT - cfg.followLag', 'n.t + n.dur >= redT'],
  ['a red tone on the step\'s first star', RULES, '        busy.add(first);\n', ''],
  ['the fallback may pick Róza\'s star', RULES, 'const pool = free.length ? free : all.filter((x) => x !== star);', 'const pool = free.length ? free : all;'],
  ['red tones on Těžká', RULES, 'rubinka: { easy: 0, normal: 0, hard: 0 }', 'rubinka: { easy: 0, normal: 0, hard: 2 }'],
  ['red tones in the finale', RULES, '{ ...s.cfg, steps: finaleSteps(s.cfg) }, 0, s.rng, 0)', '{ ...s.cfg, steps: finaleSteps(s.cfg) }, 0, s.rng)'],
  // the levels
  ['a 14-note step again (lines 1 and 2 joined)', RULES, 'steps: [[0], [1], [2], [3]],', 'steps: [[0], [1], [0, 1], [3]],'],
  ['Lehká allows 6 mistakes', RULES, 'mistakes: { easy: 6, normal: 3, hard: 1 }', 'mistakes: { easy: 7, normal: 3, hard: 1 }'],
  ['Normální allows 3 mistakes', RULES, 'mistakes: { easy: 6, normal: 3, hard: 1 }', 'mistakes: { easy: 6, normal: 4, hard: 1 }'],
  ['Těžká allows one mistake', RULES, 'mistakes: { easy: 6, normal: 3, hard: 1 }', 'mistakes: { easy: 6, normal: 3, hard: 2 }'],
  ['the finale skipped', RULES, 'else if (c.finale) startFinale(s, over);', 'else if (false) startFinale(s, over);'],
  ['no endHold after the shimmer', RULES, 's.endAt = s.t - over + s.cfg.endHold;', 's.endAt = s.t - over;'],
  // the end
  ['no quiet before the lose screen', RULES, "(s.phase === 'hold' && (s.t - s.lastInput >= s.cfg.quietEnd", "(s.phase === 'hold' && (true"],
  ['a loss ending in the charge', RULES, "(s.outcome === 'victory' || (s.phase === 'hold' && (", "(s.outcome === 'victory' || (("],
  ['quietMax ignored', RULES, ' || s.t >= s.endAt + s.cfg.quietMax)));', ')));'],
  ['a victory waits for quiet', RULES, "&& (s.outcome === 'victory' || ", '&& ('],
  ['noteInput records nothing', RULES, '  s.lastInput = s.t;\n', ''],
  // normalising
  ['steps from the first step only', RULES, 'export const stepNotes = (cfg, i) => cfg.steps[i].flatMap', 'export const stepNotes = (cfg, i) => cfg.steps[0].flatMap'],
  ['a mistakes typo kept', RULES, 'mistakes: intRange(byLevel(c.mistakes, level), 1, 10, d.mistakes[level])', 'mistakes: byLevel(c.mistakes, level) ?? d.mistakes[level]'],
  ['four stars kept', RULES, 'stars: points(c.stars, STARS, d.stars),', 'stars: Array.isArray(c.stars) ? c.stars : d.stars,'],
  ['a hitRadius typo kept', RULES, 'hitRadius: inRange(c.hitRadius, 30, 120, d.hitRadius),', 'hitRadius: c.hitRadius,'],
  ['a step over 32 notes kept', RULES, '&& s.reduce((a, i) => a + phrases[i].length, 0) <= 32);', ');'],
  // drawing helpers and files
  ['the mist starts thinner', RULES, '0.3 + 0.5 * (1 - s.done / steps)', '0.3 + 0.4 * (1 - s.done / steps)'],
  ['the status without its max', RULES, ".replaceAll('{max}', String(s.cfg.mistakes))", ''],
  ['a wrong BACKGROUND', RULES, 'export const BACKGROUND = { width: 1672, height: 941 };', 'export const BACKGROUND = { width: 1672, height: 940 };'],
  ['an eye on the smoke wisp', RULES, 'eyes: [[0.707, 0.517]', 'eyes: [[0.655, 0.495]'],
  ['a nostril off the nose', RULES, 'nostrils: [[0.73, 0.69]', 'nostrils: [[0.6, 0.4]'],
  ['a lyric line of 8 syllables', RULES, "'Ci-zí pí-seň ztrá-cí moc,',", "'Ci-zí pí-seň ztrá-cí si-lu,',"],
  ['a note off its pitch', RULES, 'tones: [293.66, 329.63, 392.0, 440.0, 493.88]', 'tones: [293.66, 329.63, 392.0, 445.0, 493.88]'],
  ['hory_zubr line 11 not quoting the lyric', 'public/story/lokace-hory.json', 'Cizí píseň ztrácí moc, kolem', 'Cizí píseň ztrácí sílu, kolem'],
  ['a song name the story doesn\'t use', RULES, "export const SONG = 'Píseň proti kletbám';", "export const SONG = 'Ukolébavka';"],
  ['a sound path to no file', RULES, "    snort: 'assets/minigames/zubr/sfx/snort.mp3',", "    snort: 'assets/minigames/zubr/sfx/nope.mp3',"],
  ['a comment changed', RULES, '// The five stars, low to high', '// The five stars, from low to high', { pass: true }],
];
runMutations({ prefix: 'zubr-rules-mutate', files, test: 'tests/zubrRules.test.mjs', env: { NO_GIT: '1' }, mutations: MUTATIONS });
