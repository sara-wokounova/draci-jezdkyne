import './styles/main.css';
import './styles/playtest.css';
import { createPixiStage } from './engine/pixiStage.js';
import { VisualRenderer } from './engine/visualRenderer.js';
import { MinigameManager } from './engine/minigames/minigameManager.js';
import { DEFAULTS, worldScale } from './engine/minigames/dragonAttack.js';
import { DEFAULTS as BADGER } from './engine/minigames/badgerRules.js';
import { AudioManager } from './engine/audioManager.js';
import { setEffectsVolume } from './engine/sfx.js';
import { AutoSave } from './engine/autoSave.js';
import { fullscreenOnTap } from './engine/inputController.js';
import { TAP_GUARD_MS } from './engine/uiController.js';

// The play-test page (D33): one round of a minigame at a time, its main numbers on sliders, the URL the only state (a
// tester sends Sára the link). Nothing is sent anywhere or stored. `?game=jezevci` plays the badger cubs rescue (D42);
// without it, the beaver battle, as before.

const [ROZA, EMMA, ANNA] = DEFAULTS.dragons; // in DEFAULTS' order (spec() too)
// [group, URL key, label, min, max, step, default, hint]; spec() passes each value into the game's config.
const SLIDERS = [
  ['Bobři', 'count', 'Počet bobrů', 10, 50, 1, DEFAULTS.beavers.count],
  ['Bobři', 'spacing', 'Rozestup (px)', 100, 400, 5, DEFAULTS.beavers.spacingPx],
  ['Bobři', 'speed', 'Rychlost (px/s)', 60, 200, 5, DEFAULTS.beavers.speed],
  ['Bobři', 'speedUp', 'Zrychlení na konci (×)', 1, 3, 0.1, DEFAULTS.beavers.speedUp],
  ['Kolo', 'win', 'Potřeba zasáhnout (%)', 0, 100, 5, DEFAULTS.winPercent.normal],
  ['Kolo', 'flights', 'Nálety každého draka', 1, 15, 1, DEFAULTS.flightsPerDragon],
  ['Róza', 'rozaFly', 'Rychlost letu (px/s)', 200, 700, 10, ROZA.speed],
  ['Róza', 'rozaShot', 'Rychlost ohně (px/s)', 300, 1200, 20, ROZA.attack.speed],
  ['Emma', 'emmaFly', 'Rychlost letu (px/s)', 200, 700, 10, EMMA.speed],
  ['Emma', 'emmaShot', 'Rychlost blesku (px/s)', 200, 900, 10, EMMA.attack.speed],
  ['Anna', 'annaFly', 'Rychlost letu (px/s)', 200, 700, 10, ANNA.speed],
  ['Anna', 'annaShot', 'Rychlost trnu (px/s)', 150, 600, 10, ANNA.attack.speed],
  ['Anna', 'annaAngle', 'Úhel trnu (°)', -175, -95, 5, ANNA.attack.angleDeg, '−90 = dozadu, −180 = nahoru'],
  ['Anna', 'annaGravity', 'Tíže trnu', 300, 1500, 20, ANNA.attack.gravity],
  ['Anna', 'annaWait', 'Čekání mezi trny (%)', 0, 100, 1, Math.round(ANNA.attack.refireAfter * 100), '% doby letu trnu'],
];
const SEVEN_CUBS = [1, 1, 1, 2, 2]; // D42's layout (9 is the default since D44)
const sum = (list) => list.reduce((a, b) => a + b, 0);
const BADGER_SLIDERS = [
  ['Kolo', 'cubs', 'Jezevčat (7 nebo 9)', 7, 9, 2, sum(BADGER.holeCubs), `7 = ${SEVEN_CUBS.join('-')}, 9 = ${BADGER.holeCubs.join('-')}`],
  ['Kolo', 'current', 'Rychlost proudu (px/s)', 20, 150, 5, BADGER.currentSpeed.normal],
  ['Kolo', 'mother', 'Máma zachrání', 0, 3, 1, BADGER.motherSaves.normal],
  ['Voda', 'firstFlood', 'První zaplavení (s)', 2, 15, 0.5, BADGER.firstFlood],
  ['Voda', 'floodGap', 'Mezi zaplaveními (s)', 3, 15, 0.5, BADGER.floodGap],
  ['Voda', 'cubGap', 'Mezi jezevčaty z jedné nory (s)', 1, 6, 0.25, BADGER.cubGap],
  ['Chytání', 'branch', 'Délka větve (px)', 50, 160, 5, BADGER.branchLength],
  ['Chytání', 'reach', 'Dosah za konec větve (px)', 0, 40, 1, BADGER.reach],
  ['Chytání', 'dive', 'Doba střemhlavého letu (s)', 0.15, 1, 0.05, BADGER.dive.down],
  ['Chytání', 'miss', 'Čekání po minutí (s)', 0, 3, 0.1, BADGER.dive.missCooldown],
  ['Draci', 'rozaFly', 'Róza: rychlost letu (px/s)', 120, 500, 10, BADGER.dragons[0].speed],
  ['Draci', 'emmaFly', 'Emma: rychlost letu (px/s)', 120, 500, 10, BADGER.dragons[1].speed],
  ['Draci', 'annaFly', 'Anna: rychlost letu (px/s)', 120, 500, 10, BADGER.dragons[2].speed],
  // Last in the link; a link without rise= gets the default 1.3, rise=1 turns the speed-up off (D43).
  ['Kolo', 'rise', 'Zrychlení proudu u vysoké vody (×)', 1, 3, 0.05, BADGER.currentRise.normal, '1 = bez zrychlení'],
];
const GAMES = {
  beavers: {
    game: 'beavers', // never written into its URL: the page as before D42
    sliders: SLIDERS,
    scene: { background: { type: 'image', src: 'assets/backgrounds/dam_02.png' } }, // behind the battle in the game
    music: ['battle', 'assets/music/battle.mp3'],
    heading: 'Zkušební nálet na bobry',
    field: true,
    spec: beaverSpec,
  },
  jezevci: {
    game: 'jezevci',
    sliders: BADGER_SLIDERS,
    scene: { background: { type: 'image', src: 'assets/backgrounds/badger_flood.png' } }, // the game draws on it
    music: ['zachrana', 'assets/music/zachrana.mp3'],
    heading: 'Zkušební záchrana jezevčat',
    field: false, // the field is always the background's rectangle
    spec: badgerSpec,
  },
};
const GAME = new URLSearchParams(location.search).get('game') === 'jezevci' ? GAMES.jezevci : GAMES.beavers;

const root = document.querySelector('#game-root');
const panel = document.querySelector('#pt-panel');
const play = document.querySelector('#pt-play');
const link = document.querySelector('#pt-link');
const copied = document.querySelector('#pt-copied');

document.title = GAME.heading;
document.querySelector('#pt-heading').textContent = GAME.heading;
root.setAttribute('aria-label', GAME.heading);
document.querySelector('#pt-field-note').hidden = !GAME.field;
const inUrl = GAME !== GAMES.beavers; // the beaver page's links stay as they were before D42
document.querySelector('#pt-defaults').href = inUrl ? `playtest.html?game=${GAME.game}` : 'playtest.html';
document.querySelector(`#pt-switch [data-game="${GAME.game}"]`).setAttribute('aria-current', 'page');
const inputs = buildSliders(document.querySelector('#pt-sliders'));
readUrl();

const stage = await createPixiStage(document.querySelector('#pixi-host'));
const visuals = new VisualRenderer(stage, { characters: {} });
const minigames = new MinigameManager(stage, { root });
// The game's own saved volumes, read only (same origin, the story id): this page never saves.
const volumes = AutoSave.readSettings('draci-jezdkyne-z-vlpu'); // read only: both save keys stay as they are
const audio = new AudioManager({ [GAME.music[0]]: GAME.music[1] }, volumes.musicVolume);
setEffectsVolume(volumes.effectsVolume);
audio.playMusic(GAME.music[0]); // starts with the page's first input (D22) and loops for the whole visit
fullscreenOnTap(); // Android testers play the game's field (D12)
window.__vn = { stage, minigames, audio }; // the check scripts' hook, as in the game

visuals.render(GAME.scene);
writeUrl();
// Pixi applies a new size a frame after the resize event, so the background and the link's field size follow then.
let resizeFrame = 0;
window.addEventListener('resize', () => {
  cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(() => {
    visuals.render(GAME.scene);
    updateLink();
  });
});

for (const input of Object.values(inputs)) input.addEventListener('change', writeUrl);
// A held Enter presses a panel button once (sliders keep their key repeats).
panel.addEventListener('keydown', (event) => {
  if (event.repeat && event.target.closest('button')) event.preventDefault();
});

document.querySelector('#pt-copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(link.value);
    copied.hidden = false;
    setTimeout(() => { copied.hidden = true; }, 1500);
  } catch {
    // No clipboard, or refused (a phone's tap may have gone to its fullscreen request): copy by hand.
    link.focus();
    link.setSelectionRange(0, link.value.length);
  }
});

let playing = false;
// Enter and Space are attacks during a round: they don't press the HUD's skip buttons (as inputController does in the
// game, D33); the result's Pokračovat takes them.
document.addEventListener('keydown', (event) => {
  if (playing && (event.key === 'Enter' || event.key === ' ') && event.target.closest?.('.minigame-hud') && !event.target.closest('.mg-result')) {
    event.preventDefault();
  }
});
play.addEventListener('click', async () => {
  if (playing) return; // Enter, an attack key, would otherwise start a second round
  playing = true;
  panel.hidden = true;
  await minigames.run(GAME.spec(), { difficulty: 'normal' }); // the sliders set the normal level's values
  panel.hidden = false;
  guardPanel();
  playing = false;
});

function buildSliders(container) {
  const found = {};
  const groups = new Map();
  for (const [group, key, label, min, max, step, value, hint] of GAME.sliders) {
    if (!groups.has(group)) {
      const section = document.createElement('section');
      section.className = 'pt-group';
      section.append(Object.assign(document.createElement('h2'), { textContent: group }));
      container.append(section);
      groups.set(group, section);
    }
    const row = document.createElement('label');
    row.className = 'pt-row';
    const input = Object.assign(document.createElement('input'), { type: 'range', min, max, step, name: key });
    input.value = String(value);
    const output = document.createElement('output');
    const show = () => { output.textContent = input.value.replace('-', '−'); };
    input.addEventListener('input', show);
    row.append(Object.assign(document.createElement('span'), { textContent: label }), input, output);
    groups.get(group).append(row);
    if (hint) groups.get(group).append(Object.assign(document.createElement('small'), { className: 'pt-hint', textContent: `(${hint})` }));
    found[key] = input;
    show();
  }
  return found;
}

/** A link's values into the sliders. Missing, blank or not a number: the default. A number is written as
 *  String(Number(raw)) (the slider puts ' 40', '+40' or '40.' at its midpoint) and the slider clamps it to its
 *  range and rounds it to its step itself, with clean decimals. */
function readUrl() {
  const params = new URLSearchParams(location.search);
  for (const [key, input] of Object.entries(inputs)) {
    const raw = params.get(key);
    if (raw === null || raw.trim() === '' || !Number.isFinite(Number(raw))) continue;
    input.value = String(Number(raw));
    input.dispatchEvent(new Event('input')); // its shown value
  }
}

function query() {
  const values = Object.entries(inputs).map(([key, input]) => [key, input.value]);
  return new URLSearchParams(inUrl ? [['game', GAME.game], ...values] : values);
}

/** The values into the address bar (written on `change`, not on every `input`: Safari throws after 100 history
 *  calls in a short time) and the link field. */
function writeUrl() {
  try {
    history.replaceState(null, '', `?${query()}`);
  } catch {
    // Refused (too many calls): the link field below is built from the sliders anyway.
  }
  updateLink();
}

/** The link to send: always playtest.html, the sliders' values, and the tester's field in game px (information
 *  for Sára, never read back: the game plays somewhat differently by screen, D33). */
function updateLink() {
  const url = new URL('playtest.html', location.href);
  url.search = String(query());
  if (GAME.field) {
    const { width, height } = stage.app.screen;
    const scale = worldScale(height);
    url.search += `&field=${Math.round(width / scale)}x${Math.round(height / scale)}`;
  }
  link.value = url.href;
}

function value(key) {
  return Number(inputs[key].value);
}

function badgerSpec() {
  // New objects: BADGER (the game's DEFAULTS) is never written to.
  const speeds = [value('rozaFly'), value('emmaFly'), value('annaFly')];
  return {
    type: 'badgerRescue',
    title: 'Záchrana jezevčat',
    allowSkip: true,
    config: {
      holeCubs: value('cubs') === 7 ? SEVEN_CUBS : BADGER.holeCubs,
      currentSpeed: { normal: value('current') },
      currentRise: { normal: value('rise') }, // per level, like the others: Lehká stays without it
      motherSaves: { normal: value('mother') },
      firstFlood: value('firstFlood'),
      floodGap: value('floodGap'),
      cubGap: value('cubGap'),
      branchLength: value('branch'),
      reach: value('reach'),
      dive: { ...BADGER.dive, down: value('dive'), up: value('dive'), missCooldown: value('miss') },
      dragons: BADGER.dragons.map((dragon, i) => ({ ...dragon, speed: speeds[i] })),
    },
  };
}

function beaverSpec() {
  // New objects: DEFAULTS is never written to.
  const [roza, emma, anna] = DEFAULTS.dragons.map((dragon) => ({ ...dragon, attack: { ...dragon.attack } }));
  roza.speed = value('rozaFly');
  roza.attack.speed = value('rozaShot');
  emma.speed = value('emmaFly');
  emma.attack.speed = value('emmaShot');
  anna.speed = value('annaFly');
  anna.attack.speed = value('annaShot');
  anna.attack.angleDeg = value('annaAngle');
  anna.attack.gravity = value('annaGravity');
  anna.attack.refireAfter = value('annaWait') / 100;
  return {
    type: 'dragonAttack',
    title: 'Dračí nálet na bobry', // the game's (a longer title wraps the top bar on small phones)
    allowSkip: true,
    config: {
      background: { sprite: null }, // the dam is drawn behind, as in the game
      beavers: { count: value('count'), spacingPx: value('spacing'), speed: value('speed'), speedUp: value('speedUp') },
      winPercent: { normal: value('win') },
      flightsPerDragon: value('flights'),
      dragons: [roza, emma, anna],
    },
  };
}

/** Back after a round, the panel ignores taps and keys until TAP_GUARD_MS have passed without one (the rest of a
 *  double tap on Pokračovat, a child still tapping), as Ano does (D27); then Hrát has the focus. */
function guardPanel() {
  panel.inert = true;
  panel.classList.add('pt-guarded'); // pointer-events: none, for browsers without inert
  let timer = 0;
  const arm = (event) => {
    // Without inert (old browsers) only pointer-events guard the panel: keys pressed inside it are held back too.
    if (event?.type === 'keydown' && panel.contains(event.target)) event.preventDefault();
    clearTimeout(timer);
    timer = setTimeout(() => {
      document.removeEventListener('pointerdown', arm, true);
      document.removeEventListener('keydown', arm, true);
      panel.inert = false;
      panel.classList.remove('pt-guarded');
      play.focus({ preventScroll: true }); // a plain focus would scroll a phone's panel to the bottom
    }, TAP_GUARD_MS);
  };
  document.addEventListener('pointerdown', arm, true);
  document.addEventListener('keydown', arm, true);
  arm();
}
