import { Container, FillGradient, Graphics, Sprite, Text } from 'pixi.js';
import { Howler } from 'howler';
import { effectsOutput, keepAudioAwake, playSound, resumeAudio, sound } from '../sfx.js';
import { DEFAULTS as DRAGON_DEFAULTS, createDragonGraphic, loadStrip, showFrame, soundEntry, tryLoadTexture } from './dragonAttack.js';
import { containRect } from '../visualRenderer.js';
import { createVoices } from './zubrTones.js';
import { STAR_SHAPES, drawStar } from './zubrStars.js';
import * as R from './zubrRules.js';

/** The HUD's own texts for this game type (registered with its factory; a scene's title and labels still win). The
 *  title is the song's name (R.SONG, beside the lyric). */
export const HUD_TEXTS = {
  title: R.SONG,
  labels: {
    score: 'Píseň', // "Píseň: 2 z 4": the steps sung
    resultWin: 'Píseň dozpívána', // the song sung, not the curse broken: the story wakes the wisent
    resultLose: 'Zubr se rozzlobil',
    resultHits: 'Píseň: {hit} z {total}',
    instructions: 'Poslouchej Rózu, pak ťukej na hvězdy ve stejném pořadí. Pomalu a potichu!',
  },
};

const REPLAY_KEY = 'KeyR'; // the replay button's key, by position (no clash with the star keys 1–5 or Space)
const DISABLED_ALPHA = 0.35; // the replay button whenever it can't be pressed (R.canReplay)
const WORD_COLORS = { roza: 0xf0e442, echoed: 0xffffff, rest: 0xdfe6ff };
const DIGIT_CODES = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5']; // by key position: a Czech layout's row gives + ě š č ř
const NUMPAD_CODES = ['Numpad1', 'Numpad2', 'Numpad3', 'Numpad4', 'Numpad5'];
const AUDIO_WAIT = 0.5; // s the round waits for a running audio context before the intro and each demo's first note
const TAP_SECONDS = 0.4; // a player's tap is a note this long
const TAP_ATTACK = 0.008; // s: a soft attack would add felt latency
const DUSK_IN = 1; // s, the dusk gradient fading in
const FADE_OUT = 0.6; // s, the stars and the dusk after the charge
const SNORT_JERK = 0.25; // s, the head jerk
const PUFF_SECONDS = 0.6;
const SHOUT_SECONDS = 0.5; // the jagged burst on the meter
const SPARKLE_SECONDS = 0.4;
const LUNGE_SECONDS = 0.5;
const LUNGE_TO = 0.45; // field fraction, where the wisent stays dazed after his charge
const SHAKE_SECONDS = 0.6;
const DRAGON_WIDTH = 200; // game px, Bezzubka rising out of the dust at a charge
const MAX_STAR_SHIFT = 60; // game px the stars move down under the HUD's top bar at most
const LIT_SCALE = 1.25;
const METER_COLORS = [0x3cb44b, 0x3cb44b, 0xf0e442, 0xe69f00, 0xd62728]; // green, green, yellow, orange, red
const ZUBR_BROWN = 0x5a3d24; // the placeholder's colour while art is missing (D7)
const deg = (d) => (d * Math.PI) / 180;
const hex = (color) => Number.parseInt(color.slice(1), 16);

/** Sets the page's audio session type (Safari 17+) and returns the one before; undefined where there is none. */
function setAudioSession(type) {
  try {
    const session = navigator.audioSession;
    if (!session) return undefined;
    const before = session.type;
    session.type = type;
    return before;
  } catch {
    return undefined; // an older or stricter browser: as before
  }
}

/**
 * The wisent's song (D46). The rules live in zubrRules.js (pure, played by the node checks); this class loads the art,
 * plays the tones (zubrTones.js, through the effects' bus) and the effects, applies taps to the rules at once (no tap
 * waits for a frame) and draws the state. The field is the background's contain rectangle, 600 game px tall.
 */
export class ZubrMelodyMinigame {
  constructor({ app, layer, config, hud, onComplete, difficulty }) {
    this.app = app;
    this.layer = layer;
    this.hud = hud;
    this.onComplete = onComplete;
    this.cfg = R.normalize(config ?? {}, difficulty);
    this.sounds = Object.fromEntries(Object.keys(R.DEFAULTS.sounds).map((name) => [name, soundEntry(this.cfg.sounds[name], `sounds.${name}`)]));
    this.root = new Container();
    this.finished = false;
    this.state = null;
    this.tex = {};
    this.strip = null;
    this.fx = { snort: -Infinity, success: -Infinity, shout: -Infinity, charge: null, sparkle: Array(R.STARS).fill(-Infinity) };
    this.audioWait = 0;
    this.waitingForAudio = false;
    this.starShift = 0;
    this.lastScore = '';
    this.lastStatus = '';
    this.touch = matchMedia('(pointer: coarse)').matches;
    this.tick = this.tick.bind(this);
    this.handleKey = this.handleKey.bind(this);
    this.handlePointer = this.handlePointer.bind(this);
    this.noteInput = this.noteInput.bind(this);
    this.handleVisibility = this.handleVisibility.bind(this);
  }

  async start() {
    this.layer.addChild(this.root);
    keepAudioAwake(true);
    // The tones heard on a silenced iPhone, as the other games' HTML5 music is: this round has none to keep iOS's audio
    // session in 'playback'. Only for the round: the type before comes back at its end.
    this.sessionBefore = setAudioSession('playback');
    document.addEventListener('visibilitychange', this.handleVisibility); // gone with restoreSession()
    resumeAudio();
    // The Howls first: the page's first Howl can replace Howler's context; then the tones' bus on the live one.
    for (const entry of Object.values(this.sounds)) if (entry) sound(entry.src);
    this.setupAudio();
    const state = R.createState(this.cfg); // this.state only once the art is in (input and drawing wait for it)
    const { score, status } = R.hudView(state);
    this.hud.setScore(score);
    this.hud.setStatus(status);

    // Only the wisent and Róza singing are awaited (both on hory_zubr's stages, so usually preloaded); the rest arrives
    // during the round and is used once it has (until then Róza sings in every pose, the vector dragon at a charge).
    const { assets } = this.cfg;
    const [zubr, rozaTalking] = await Promise.all([tryLoadTexture(assets.zubr), tryLoadTexture(assets.rozaTalking)]);
    if (this.finished) return; // skipped while loading
    this.tex = { zubr, rozaTalking };
    for (const name of ['rozaNeutral', 'rozaHappy', 'rozaNervous']) {
      tryLoadTexture(assets[name]).then((texture) => { if (texture) this.tex[name] = texture; });
    }
    loadStrip(DRAGON_DEFAULTS.dragons[0].animation?.fly).then((strip) => { this.strip = strip; });
    this.state = state;
    this.build();
    window.addEventListener('keydown', this.handleKey);
    this.app.canvas.addEventListener('pointerdown', this.handlePointer);
    this.app.canvas.addEventListener('pointerup', resumeAudio);
    // Any input anywhere (repeats too) holds a lost round's end until it is quiet (the calm rule's picture).
    document.addEventListener('pointerdown', this.noteInput, true);
    document.addEventListener('keydown', this.noteInput, true);
    this.app.ticker.add(this.tick);
  }

  // ------------------------------------------------------------------ audio ---

  /** The tones' voices on Howler's current context, through the effects' bus (rebuilt when Howler replaced it). */
  setupAudio() {
    try {
      this.voices?.stopAll();
    } catch {
      // the old context is gone
    }
    this.output = effectsOutput(); // the effects' bus (read by the browser checks)
    this.audioCtx = Howler.ctx;
    this.voices = this.output ? createVoices(this.output.context, this.output) : null;
  }

  audioRunning() {
    return Howler.ctx?.state === 'running';
  }

  /** A tone of the rules' 'tone' event; only with the context running (nothing piles up to play late).
   *  ponytail: Róza's notes start on the frame step() reaches them (≤ 17 ms late at 60 fps, ≤ 33 ms at 30 fps); if
   *  the demo limps on a slow phone, schedule each note ahead on the audio clock with a ~50 ms lookahead. */
  playTone(e) {
    if (!this.voices || !this.audioRunning()) return;
    try {
      const freq = this.cfg.tones[e.star];
      if (e.who === 'rubinka') this.voices.red(freq, e.dur);
      else if (e.who === 'player') this.voices.play(`p${e.star}`, freq, TAP_SECONDS, TAP_ATTACK);
      else this.voices.play(`r${e.star}`, freq, e.dur); // Róza and the intro
    } catch {
      // a sound must never break the game
    }
  }

  // ---------------------------------------------------------------- drawing ---

  /** A sprite standing on its bottom centre, `size` game px wide (or tall with `byHeight`), or null without texture. */
  sprite(texture, size, byHeight = false) {
    if (!texture) return null;
    const s = new Sprite(texture);
    s.anchor.set(0.5, 1);
    s.scale.set(size / (byHeight ? texture.height : texture.width));
    return s;
  }

  build() {
    const { cfg, tex } = this;
    const W = R.FIELD_WIDTH;
    const H = R.FIELD_HEIGHT;
    this.mask = new Graphics().rect(0, 0, W, H).fill(0xffffff);
    this.field = new Container(); // shaken at a charge
    this.root.addChild(this.mask, this.field);
    this.root.mask = this.mask;

    // The dusk the song calls out: a translucent blue from the top down to 0.6 of the field.
    const gradient = new FillGradient({
      type: 'linear', start: { x: 0, y: 0 }, end: { x: 0, y: 1 },
      colorStops: [{ offset: 0, color: 'rgba(27, 40, 80, 0.55)' }, { offset: 1, color: 'rgba(27, 40, 80, 0)' }],
    });
    this.dusk = new Graphics().rect(0, 0, W, 0.6 * H).fill(gradient);
    this.dusk.alpha = 0;
    this.field.addChild(this.dusk);

    // The wisent: a container at his hooves (turned about them), the sprite, the mist over his eyes, the puffs.
    const { zubr } = cfg;
    this.zubrHeight = tex.zubr ? (zubr.width * tex.zubr.height) / tex.zubr.width : zubr.width * 0.6;
    this.zubrView = new Container();
    this.zubrView.position.set(zubr.x * W, zubr.feet * H);
    const body = this.sprite(tex.zubr, zubr.width) ?? this.zubrPlaceholder();
    this.zubrBody = body;
    this.mist = new Graphics();
    this.puffs = new Graphics();
    this.zubrView.addChild(body, this.mist, this.puffs);
    this.field.addChild(this.zubrView);

    // Róza (her poses face left, towards the wisent: unflipped), her notes, the dust and Bezzubka at a charge.
    this.rozaView = this.sprite(tex.rozaTalking, cfg.roza.height, true) ?? this.rozaPlaceholder();
    this.rozaView.position.set(cfg.roza.x * W, cfg.roza.feet * H);
    this.notes = new Graphics();
    this.dust = new Graphics();
    this.dragonLayer = new Container();
    this.field.addChild(this.rozaView, this.notes, this.dust, this.dragonLayer);

    // The stars: a dark backing disc (the yellow one reads over the pale sky), a halo, the shape, Rubínka's ring.
    const digits = matchMedia('(pointer: fine)').matches;
    this.starViews = cfg.stars.map((_, i) => {
      const view = new Container();
      const backing = new Graphics().circle(0, 0, cfg.sizes.backing).fill({ color: 0x101830, alpha: 0.55 });
      const halo = new Graphics().circle(0, 0, cfg.starRadius * 1.6).fill({ color: 0xffffff, alpha: 0.35 });
      const shape = drawStar(new Graphics(), STAR_SHAPES[i], cfg.starRadius, hex(cfg.colors[i]));
      const ring = this.thornRing(cfg.starRadius * 1.35);
      const sparkle = new Graphics();
      view.addChild(backing, halo, shape, ring, sparkle);
      if (digits) {
        const label = new Text({ text: String(i + 1), style: { fill: 0xffffff, fontSize: 18, fontWeight: 'bold' } });
        label.anchor.set(0.5, 0);
        label.position.set(0, cfg.sizes.backing + 2);
        view.addChild(label);
      }
      this.field.addChild(view);
      return { view, halo, shape, ring, sparkle };
    });

    // The voice meter beside Róza, its shout burst and the hold's ring.
    this.meter = new Graphics();
    this.burst = new Graphics();
    this.ring = new Graphics();
    this.field.addChild(this.meter, this.burst, this.ring);

    // The replay button (upper left): a disc with a circular arrow, its label above, the key under it on a fine pointer.
    const button = new Container();
    const disc = new Graphics().circle(0, 0, cfg.sizes.backing).fill({ color: 0x101830, alpha: 0.7 }).stroke({ color: 0xffffff, width: 2, alpha: 0.8 });
    const r = cfg.starRadius * 0.8;
    const icon = new Graphics().arc(0, 0, r, -Math.PI * 0.9, Math.PI * 0.6).stroke({ color: 0xffffff, width: 5 })
      .poly([r * Math.cos(Math.PI * 0.6) - 9, r * Math.sin(Math.PI * 0.6) + 2, r * Math.cos(Math.PI * 0.6) + 9, r * Math.sin(Math.PI * 0.6) + 6,
        r * Math.cos(Math.PI * 0.6) + 2, r * Math.sin(Math.PI * 0.6) - 10]).fill(0xffffff);
    const label = new Text({ text: cfg.labels.replay, style: { fill: 0xffffff, fontSize: cfg.sizes.label, fontWeight: 'bold', stroke: { color: 0x101830, width: 5 } } });
    label.anchor.set(0.5, 1);
    if (label.width > cfg.sizes.labelWidth) label.scale.set(cfg.sizes.labelWidth / label.width);
    label.position.set(0, -cfg.sizes.backing - 6);
    this.replayPulse = new Graphics();
    button.addChild(this.replayPulse, disc, icon, label);
    if (digits) {
      const key = new Text({ text: 'R', style: { fill: 0xffffff, fontSize: 18, fontWeight: 'bold' } });
      key.anchor.set(0.5, 0);
      key.position.set(0, cfg.sizes.backing + 2);
      button.addChild(key);
    }
    this.replayButton = button;
    this.replayLabel = label;
    this.field.addChild(button);

    // The words of the line being sung (between the wisent and Róza, under the stars).
    this.wordsView = new Container();
    this.field.addChild(this.wordsView);
    this.wordsPhrase = null;
    this.wordsFirst = 0;
  }

  zubrPlaceholder() {
    const { width, eyes } = this.cfg.zubr;
    const h = this.zubrHeight;
    const g = new Graphics().ellipse(0, -h / 2, width / 2, h / 2).fill(ZUBR_BROWN);
    for (const [fx, fy] of eyes) g.circle((fx - 0.5) * width, -(1 - fy) * h, 6).fill(0xffffff);
    return g;
  }

  rozaPlaceholder() {
    const h = this.cfg.roza.height;
    return new Graphics().roundRect(-h * 0.15, -h, h * 0.3, h, h * 0.1).fill(0xd6462f).circle(0, -h * 0.85, h * 0.1).fill(0xeac470);
  }

  thornRing(radius) {
    const g = new Graphics();
    const spikes = 12;
    const pts = [];
    for (let i = 0; i < spikes * 2; i += 1) {
      const a = (i * Math.PI) / spikes;
      const r = i % 2 ? radius : radius * 1.3;
      pts.push(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.poly(pts).stroke({ color: 0xffd6d0, width: 5 }).poly(pts).stroke({ color: 0xe0342c, width: 3 });
    return g;
  }

  /** A point on the wisent's texture (fractions) in his container's coordinates. */
  zubrPoint([fx, fy]) {
    return { x: (fx - 0.5) * this.cfg.zubr.width, y: -(1 - fy) * this.zubrHeight };
  }

  /** The replay button's centre in field coordinates (moved down with the stars). */
  replayPoint() {
    const [fx, fy] = this.cfg.replayButton;
    return { x: fx * R.FIELD_WIDTH, y: fy * R.FIELD_HEIGHT + this.starShift };
  }

  /** Whether a field point is on the replay button (its hit circle, or its label). */
  onReplayButton(x, y) {
    const p = this.replayPoint();
    if (Math.hypot(x - p.x, y - p.y) <= this.cfg.hitRadius) return true;
    const label = this.replayLabel; // anchored at its bottom centre, in the button's own coordinates
    return Math.abs(x - p.x) <= label.width / 2 && y - p.y <= label.y && y - p.y >= label.y - label.height;
  }

  /** Star i's centre in field coordinates (pushed down under the HUD's top bar). */
  starPoint(i) {
    const [fx, fy] = this.cfg.stars[i];
    return { x: fx * R.FIELD_WIDTH, y: fy * R.FIELD_HEIGHT + this.starShift };
  }

  /** The field's place on the screen: the background's contain rectangle (VisualRenderer fits the scene's the same). */
  layout() {
    const { width, height } = this.app.screen;
    const fit = containRect(width, height, R.BACKGROUND.width, R.BACKGROUND.height);
    const scale = (R.BACKGROUND.height * fit.scale) / R.FIELD_HEIGHT;
    this.root.scale.set(scale);
    this.root.position.set(fit.x, fit.y);
    // The stars below the HUD's top bar: the highest hit circle's top 4 px under it, by at most MAX_STAR_SHIFT.
    const hudBottom = (this.hud.coveredTop() - fit.y) / scale;
    const top = Math.min(...this.cfg.stars.map(([, y]) => y)) * R.FIELD_HEIGHT - this.cfg.hitRadius;
    this.starShift = Math.min(MAX_STAR_SHIFT, Math.max(0, hudBottom + 4 - top));
    return scale;
  }

  draw() {
    const { state, fx } = this;
    const t = state.t;
    this.layout();
    const fade = fx.charge === null ? 1 : Math.max(0, 1 - (t - fx.charge) / FADE_OUT);
    this.dusk.alpha = Math.min(1, t / DUSK_IN) * fade;

    // The field shakes at a charge.
    const shaking = fx.charge !== null && t - fx.charge < SHAKE_SECONDS;
    this.field.position.set(shaking ? Math.sin(t * 90) * 6 : 0, shaking ? Math.cos(t * 70) * 4 : 0);

    this.drawZubr(t);
    this.drawRoza(t);
    this.drawStars(t, fade);
    this.drawMeter(t);
    this.drawReplay(t, fade);
    this.drawWords(fade);
  }

  /** The replay button: dimmed while it can't be pressed; a breathing gold ring when the child seems stuck. */
  drawReplay(t, fade) {
    const { state } = this;
    const p = this.replayPoint();
    this.replayButton.position.set(p.x, p.y);
    this.replayButton.alpha = fade * (R.canReplay(state) ? 1 : DISABLED_ALPHA);
    this.replayPulse.clear();
    if (R.replayHint(state)) {
      const k = (Math.sin(t * 5) + 1) / 2;
      this.replayPulse.circle(0, 0, this.cfg.sizes.backing + 6 + 6 * k).stroke({ color: 0xf0e442, width: 4, alpha: 0.5 + 0.5 * k });
    }
  }

  /** The step's notes as (phrase, syllable) pairs, and which note Róza sounds now (-1: none) and whether she still sings. */
  noteMap() {
    const { state } = this;
    const whole = state.phase === 'finale' || state.phase === 'done';
    const steps = whole ? R.finaleSteps(this.cfg) : this.cfg.steps;
    const stepIndex = whole ? 0 : state.step;
    const notes = (steps[stepIndex] ?? []).flatMap((p) => this.cfg.phrases[p].map((_, k) => ({ phrase: p, syllable: k })));
    const tl = state.timeline;
    const at = state.phase === 'echo' ? state.echoT0 + state.phaseT : state.phaseT;
    let sounding = -1;
    const singing = tl && ['demo', 'echo', 'finale'].includes(state.phase) && at < tl.end;
    if (singing) tl.notes.filter((n) => n.who === 'roza').forEach((n, k) => { if (at >= n.t && at < n.t + n.dur) sounding = k; });
    return { notes, sounding, singing };
  }

  /** The words of the phrase being sung or echoed: Róza's syllable gold while she sings, the echoed ones white, the next
   *  one underlined, the rest dimmed; none in the intro or the hold (they fade out with the stars at a charge), or where a
   *  phrase has no fitting lyric line. */
  drawWords(fade) {
    const { state, cfg } = this;
    const show = ['demo', 'echo', 'snort', 'success', 'finale', 'done', 'charge'].includes(state.phase);
    const { notes, sounding, singing } = show ? this.noteMap() : { notes: [] };
    const echoing = state.phase === 'echo';
    // The note in view: the one being echoed once the child taps, else Róza's, else the step's (a story step may join
    // phrases: each shows its own line).
    const atIndex = Math.min(state.index, notes.length - 1);
    const focus = echoing && state.taps.length > 0 ? atIndex
      : sounding >= 0 ? sounding
        : echoing || state.phase === 'snort' ? atIndex
          : state.phase === 'success' ? notes.length - 1 : -1;
    const phrase = focus >= 0 ? notes[focus].phrase : this.wordsPhrase;
    const words = phrase === null ? null : R.phraseWords(cfg, phrase);
    this.wordsView.visible = show && fade > 0 && words !== null;
    this.wordsView.alpha = fade; // out with the stars at a charge
    if (!this.wordsView.visible) return;
    if (phrase !== this.wordsPhrase) this.buildWords(phrase, words);
    // The phrase's first note in the step: from the focused note (a step may sing a phrase twice), else as last drawn.
    const first = focus >= 0 ? focus - notes[focus].syllable : this.wordsFirst;
    this.wordsFirst = first;
    const [cx, top] = cfg.words;
    this.wordsView.position.set(cx * R.FIELD_WIDTH, top * R.FIELD_HEIGHT + this.starShift);
    this.underline.clear();
    this.wordTexts.forEach((text, k) => {
      const note = first + k;
      const color = singing && note === sounding ? WORD_COLORS.roza
        : (echoing || state.phase === 'success') && note < state.index ? WORD_COLORS.echoed
          : state.phase === 'done' || (state.phase === 'finale' && state.phaseT >= state.timeline.end) ? WORD_COLORS.echoed
            : WORD_COLORS.rest;
      if (text.zubrColor !== color) { // a restyle re-renders the Text: only when its light changes
        text.zubrColor = color;
        text.style.fill = color;
      }
      text.alpha = color === WORD_COLORS.rest ? 0.6 : 1;
      if (echoing && !singing && note === state.index) {
        this.underline.rect(text.x, text.y + text.height - 2, text.width, 3).fill(0xffffff);
      }
    });
  }

  /** The words' Texts for a phrase, in two rows split at the word boundary that best balances the syllables. */
  buildWords(phrase, words) {
    const { cfg } = this;
    this.wordsView.removeChildren().forEach((child) => child.destroy());
    this.wordsPhrase = phrase;
    const style = { fill: WORD_COLORS.rest, fontSize: cfg.sizes.words, fontWeight: 'bold' };
    this.wordTexts = words.map((w) => Object.assign(new Text({ text: w.text, style }), { zubrWordStart: w.wordStart }));
    const starts = words.map((w, k) => (w.wordStart && k > 0 ? k : -1)).filter((k) => k > 0);
    const split = starts.reduce((best, k) => (Math.abs(k - words.length / 2) < Math.abs(best - words.length / 2) ? k : best), starts[0] ?? words.length);
    const gap = cfg.sizes.words * 0.3;
    const rows = [this.wordTexts.slice(0, split), this.wordTexts.slice(split)].filter((row) => row.length);
    const lineHeight = cfg.sizes.words * 1.25;
    const gapBefore = (text, k) => (k > 0 && text.zubrWordStart ? gap : 0);
    const widths = rows.map((row) => row.reduce((a, text, k) => a + gapBefore(text, k) + text.width, 0));
    const inner = new Container();
    rows.forEach((row, r) => {
      let x = -widths[r] / 2;
      row.forEach((text, k) => {
        x += gapBefore(text, k);
        text.position.set(x, r * lineHeight);
        x += text.width;
        inner.addChild(text);
      });
    });
    this.underline = new Graphics();
    inner.addChild(this.underline);
    const width = Math.max(...widths);
    const pad = 12;
    const backing = new Graphics().roundRect(-width / 2 - pad, -pad / 2, width + 2 * pad, rows.length * lineHeight + pad, 12)
      .fill({ color: 0x101830, alpha: 0.55 });
    this.wordsView.addChild(backing, inner);
    const limit = cfg.sizes.wordsWidth;
    this.wordsView.scale.set(width + 2 * pad > limit ? limit / (width + 2 * pad) : 1);
  }

  drawZubr(t) {
    const { state, cfg, fx } = this;
    const W = R.FIELD_WIDTH;
    let x = cfg.zubr.x * W;
    let scale = 1;
    let rotation = 0;
    if (fx.charge !== null) { // a lunge right, where he stays, dazed again
      const k = Math.min(1, (t - fx.charge) / LUNGE_SECONDS);
      x += (LUNGE_TO * W - x) * k;
      scale = 1 + 0.1 * Math.sin(Math.PI * k);
      rotation = deg(4) * Math.sin(Math.PI * k);
    }
    const jerk = (t - fx.snort) / SNORT_JERK;
    if (jerk >= 0 && jerk < 1) rotation += deg(-3) * Math.sin(Math.PI * jerk);
    const wobble = t - fx.success;
    if (wobble >= 0 && wobble < cfg.successSeconds) rotation += deg(2) * Math.sin((wobble / cfg.successSeconds) * 4 * Math.PI) * (1 - wobble / cfg.successSeconds);
    if (state.phase === 'finale') rotation += deg(3) * Math.min(1, state.phaseT / state.timeline.length);
    if (state.phase === 'done') rotation += deg(3);
    this.zubrView.position.x = x;
    this.zubrView.scale.set(scale);
    this.zubrView.rotation = rotation;

    // The mist over his painted misty eyes.
    const mist = R.mistView(state);
    this.mist.clear();
    for (const eye of cfg.zubr.eyes) {
      const p = this.zubrPoint(eye);
      for (const r of [1, 0.75, 0.5]) { // a soft cloud: rings adding up towards the middle
        this.mist.ellipse(p.x, p.y, 36 * r, 22 * r).fill({ color: 0xeef3f8, alpha: 0.16 * mist });
      }
    }
    // Two steam puffs from the nostrils at a snort.
    const puff = (t - fx.snort) / PUFF_SECONDS;
    this.puffs.clear();
    if (puff >= 0 && puff < 1) {
      for (const nostril of cfg.zubr.nostrils) {
        const p = this.zubrPoint(nostril);
        this.puffs.circle(p.x + 30 * puff, p.y + 10 * puff, 8 + 22 * puff).fill({ color: 0xffffff, alpha: 0.7 * (1 - puff) });
      }
    }
  }

  /** Róza's pose: singing in a demo and the finale (in the echo until her last note ends, as the words' gold), happy
   *  after a success, nervous at a snort, listening otherwise; a pose not loaded yet falls back to singing. */
  rozaPose() {
    const { state } = this;
    const singing = state.phase === 'demo' || state.phase === 'finale'
      || (state.phase === 'echo' && state.echoT0 + state.phaseT < state.timeline.end);
    if (singing) return 'rozaTalking';
    if (state.phase === 'success' || state.phase === 'done') return 'rozaHappy';
    if (state.phase === 'snort') return 'rozaNervous';
    return 'rozaNeutral';
  }

  drawRoza(t) {
    const { state, cfg, fx } = this;
    const view = this.rozaView;
    const pose = this.rozaPose();
    const texture = this.tex[pose] ?? this.tex.rozaTalking;
    if (view instanceof Sprite && texture && view.texture !== texture) {
      view.texture = texture;
      view.scale.set(cfg.roza.height / texture.height);
    }
    // Small notes rising from her while she sings.
    this.notes.clear();
    const head = { x: view.x - cfg.roza.height * 0.12, y: view.y - cfg.roza.height * 0.85 };
    if (pose === 'rozaTalking' && fx.charge === null && state.phase !== 'intro') {
      for (let i = 0; i < 3; i += 1) {
        const k = (t * 0.8 + i / 3) % 1;
        this.notes.circle(head.x - 30 * k - i * 8, head.y - 70 * k, 5).fill({ color: 0xffffff, alpha: 0.8 * (1 - k) });
      }
    }
    // A charge: dust and wingbeats hide her; Bezzubka (her fly strip shows Róza riding) rises out of it and away.
    this.dust.clear();
    if (fx.charge === null) return;
    const k = (t - fx.charge) / cfg.chargeSeconds;
    view.visible = false;
    const dust = Math.min(1, k * 2);
    if (dust < 1) {
      for (let i = 0; i < 6; i += 1) {
        const a = (i * Math.PI) / 3;
        this.dust.circle(view.x + Math.cos(a) * 50 * dust, view.y - cfg.roza.height * 0.4 + Math.sin(a) * 40 * dust, 30 + 30 * dust)
          .fill({ color: 0xcbb89a, alpha: 0.75 * (1 - dust) });
      }
    }
    if (!this.dragonView) {
      if (this.strip) {
        this.dragonView = new Sprite(this.strip.frames[0]);
        const spec = DRAGON_DEFAULTS.dragons[0].animation;
        this.dragonView.scale.set(DRAGON_WIDTH / (spec.bodyWidth ?? this.strip.width));
      } else {
        this.dragonView = createDragonGraphic(DRAGON_WIDTH, DRAGON_WIDTH * 0.6, DRAGON_DEFAULTS.dragons[0].color, 1);
      }
      this.dragonLayer.addChild(this.dragonView);
    }
    const up = Math.min(1, k);
    this.dragonView.position.set(view.x + 120 * up, view.y - cfg.roza.height * 0.5 - (view.y + 200) * up * up);
    if (this.strip && this.dragonView instanceof Sprite) {
      const { flyFrames = [0], flyFps = 12 } = DRAGON_DEFAULTS.dragons[0].animation;
      showFrame(this.dragonView, this.strip, flyFrames[Math.floor(t * flyFps) % flyFrames.length]);
    }
  }

  drawStars(t, fade) {
    const { state, cfg, fx } = this;
    const shown = R.shown(state);
    const lit = R.lit(state);
    this.starViews.forEach((star, i) => {
      const p = this.starPoint(i);
      star.view.position.set(p.x, p.y);
      star.view.visible = i < shown && fade > 0;
      star.view.alpha = fade;
      const light = lit[i];
      star.halo.visible = light === 'roza' || light === 'player';
      star.ring.visible = light === 'rubinka';
      star.shape.scale.set(light === 'roza' || light === 'player' ? LIT_SCALE : 1);
      star.shape.alpha = light === 'rubinka' ? 0.5 : light ? 1 : 0.8; // a red tone dims the star
      const k = (t - fx.sparkle[i]) / SPARKLE_SECONDS;
      star.sparkle.clear();
      if (k >= 0 && k < 1) { // the "right" sparkle
        for (let j = 0; j < 8; j += 1) {
          const a = (j * Math.PI) / 4;
          const r0 = cfg.starRadius * (1.2 + k);
          star.sparkle.moveTo(Math.cos(a) * r0, Math.sin(a) * r0).lineTo(Math.cos(a) * (r0 + 12), Math.sin(a) * (r0 + 12));
        }
        star.sparkle.stroke({ color: 0xffffff, width: 3, alpha: 1 - k });
      }
    });
  }

  drawMeter(t) {
    const { state, cfg, fx } = this;
    const { meterWidth: w, meterHeight: h } = cfg.sizes;
    const x = cfg.meter[0] * R.FIELD_WIDTH;
    const bottom = cfg.meter[1] * R.FIELD_HEIGHT;
    const v = R.voiceNow(state) / cfg.voice.burst;
    const seg = h / 5;
    this.meter.clear().roundRect(x - w / 2 - 3, bottom - h - 3, w + 6, h + 6, 4).fill({ color: 0x101830, alpha: 0.6 });
    METER_COLORS.forEach((color, k) => {
      // The fill's height carries the level (not only the colour); the top segment lights at warn × burst.
      const on = k === 4 ? v >= cfg.voice.warn : v > k / 5;
      this.meter.rect(x - w / 2, bottom - (k + 1) * seg + 1, w, seg - 2).fill({ color: on ? color : 0x555a66, alpha: on ? 1 : 0.5 });
    });
    const burst = (t - fx.shout) / SHOUT_SECONDS;
    this.burst.clear();
    if (burst >= 0 && burst < 1) {
      const pts = [];
      for (let i = 0; i < 20; i += 1) {
        const a = (i * Math.PI) / 10;
        const r = (i % 2 ? 22 : 44) * (1 + 0.4 * burst);
        pts.push(x + Math.cos(a) * r, bottom - h + Math.sin(a) * r);
      }
      this.burst.poly(pts).fill({ color: 0xd62728, alpha: 0.8 * (1 - burst) }).stroke({ color: 0xffffff, width: 2, alpha: 1 - burst });
    }
    // After a charge: a thin ring closing round the meter while it is quiet (it starts again at every input).
    const quiet = R.quietView(state);
    this.ring.clear();
    if (quiet !== null) {
      const cy = bottom - h / 2;
      this.ring.circle(x, cy, h * 0.75).stroke({ color: 0xffffff, width: 2, alpha: 0.25 });
      if (quiet > 0) this.ring.arc(x, cy, h * 0.75, -Math.PI / 2, -Math.PI / 2 + quiet * 2 * Math.PI).stroke({ color: 0xffffff, width: 4 });
    }
  }

  // ------------------------------------------------------------------ input ---

  /** A tap reaches the rules only while the round is live, not paused and not waiting for the audio. */
  accepting() {
    return !this.finished && this.state && !this.paused() && !this.waitingForAudio;
  }

  paused() {
    const { width, height } = this.app.screen;
    return (this.touch && height > width) || this.hud.skipMenuOpen();
  }

  /** Applied to the rules at once, in the input's own task (its tone starts there: no frame of latency). */
  tapStar(star) {
    if (!this.accepting()) return;
    try {
      this.onEvents(R.tap(this.state, star));
    } catch (error) {
      console.error('Minigame error — ending the round.', error);
      this.complete('failure');
    }
  }

  /** The replay button pressed (a tap or R): Róza sings the step again, when the rules allow it. */
  pressReplay() {
    if (!this.accepting()) return;
    try {
      this.onEvents(R.replay(this.state));
    } catch (error) {
      console.error('Minigame error — ending the round.', error);
      this.complete('failure');
    }
  }

  handleKey(event) {
    resumeAudio();
    // Repeats, and a modifier held (Ctrl+1 switches tabs; AltGr+1 types a sign on a Czech layout): no tap.
    if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.code === REPLAY_KEY) {
      this.pressReplay();
      return;
    }
    const star = Math.max(DIGIT_CODES.indexOf(event.code), NUMPAD_CODES.indexOf(event.code));
    if (star >= 0) this.tapStar(star);
  }

  handlePointer(event) {
    if (!this.accepting() || event.button !== 0) return; // a right or middle click taps nothing (touch and pen: 0)
    const rect = this.app.canvas.getBoundingClientRect();
    const sx = ((event.clientX - rect.left) * this.app.screen.width) / (rect.width || 1);
    const sy = ((event.clientY - rect.top) * this.app.screen.height) / (rect.height || 1);
    const scale = this.root.scale.x;
    const x = (sx - this.root.position.x) / scale;
    const y = (sy - this.root.position.y) / scale;
    // The replay button first (disabled: the tap does nothing at all).
    if (this.onReplayButton(x, y)) {
      this.pressReplay();
      return;
    }
    // The nearest shown star within the hit radius, else nothing (no sound, no meter).
    let best = -1;
    let bestDistance = this.cfg.hitRadius;
    for (let i = 0; i < R.shown(this.state); i += 1) {
      const p = this.starPoint(i);
      const distance = Math.hypot(x - p.x, y - p.y);
      if (distance <= bestDistance) {
        best = i;
        bestDistance = distance;
      }
    }
    if (best >= 0) this.tapStar(best);
  }

  noteInput() {
    if (this.state && !this.finished) R.noteInput(this.state);
  }

  // ------------------------------------------------------------------- loop ---

  tick(ticker) {
    try {
      this.update(Math.min(0.1, ticker.deltaMS / 1000));
    } catch (error) {
      console.error('Minigame error — ending the round.', error);
      this.complete('failure'); // at once, never waiting for the hold (a throwing step() could never reach it)
    }
  }

  /** Before the intro and before each demo's first note the round waits for a running audio context (at most
   *  AUDIO_WAIT), resuming it at each demo's start (a hidden page may have let Howler suspend it). */
  gateAudio(dt) {
    const { state } = this;
    const gate = state.t === 0 || (state.phase === 'demo' && state.cursor === 0);
    if (!gate) {
      this.audioWait = 0;
      this.waitingForAudio = false;
      return false;
    }
    if (this.audioWait === 0) resumeAudio();
    if (this.audioRunning() || this.audioWait >= AUDIO_WAIT) {
      this.waitingForAudio = false;
      return false;
    }
    this.audioWait += dt;
    this.waitingForAudio = true; // taps ignored: the frozen clock wouldn't drain the meter
    return true;
  }

  update(dt) {
    if (this.finished) return;
    const { width, height } = this.app.screen;
    if (!(width > 0 && height > 0)) return;
    if (Howler.ctx !== this.audioCtx) this.setupAudio(); // Howler replaced its context
    // Paused in portrait on a touch device (the rotate hint covers the game, D15) and while the skip menu is open.
    if (this.paused()) return;
    const { state } = this;
    let left = dt;
    while (left > 1e-9 && !this.finished) {
      if (this.gateAudio(dt)) break; // real time: at most once a frame (it breaks out)
      const h = Math.min(R.STEP, left);
      left -= h;
      R.step(state, h);
      this.onEvents(state.events);
      if (R.finished(state)) break;
    }
    if (this.finished) return;
    this.draw();
    const { score, status } = R.hudView(state);
    if (score !== this.lastScore) this.hud.setScore((this.lastScore = score));
    if (status !== this.lastStatus) this.hud.setStatus((this.lastStatus = status));
    if (R.finished(state)) this.complete(state.outcome);
  }

  /** A batch of the rules' events; a charge silences its own mistake's snort sound (one sound for the last mistake;
   *  the snort's puffs still show under the lunge). */
  onEvents(events) {
    const charge = events.some((e) => e.type === 'charge');
    for (const e of events) this.onEvent(e, charge && e.type === 'mistake');
  }

  onEvent(e, silent = false) {
    const { fx } = this;
    const entry = this.sounds[R.EVENT_SOUNDS[e.type]];
    if (entry && !silent) playSound(sound(entry.src), entry.volume);
    if (e.type === 'tone') this.playTone(e);
    else if (e.type === 'mistake') fx.snort = e.t;
    else if (e.type === 'shout') fx.shout = e.t;
    else if (e.type === 'correct') fx.sparkle[e.star] = e.t;
    else if (e.type === 'replay') this.hud.hideInstructions();
    else if (e.type === 'success') {
      fx.success = e.t;
      this.hud.hideInstructions();
    } else if (e.type === 'charge') {
      fx.charge = e.t;
      this.hud.hideInstructions();
    }
  }

  complete(outcome) {
    if (this.finished) return;
    this.finished = true;
    this.app.ticker.remove(this.tick);
    keepAudioAwake(false);
    this.unbind();
    // A won round's last notes and its shimmer ring out under the result (destroy() ends them and the session).
    if (outcome !== 'victory') {
      this.restoreSession();
      this.stopVoices();
    }
    const done = this.state?.done ?? 0;
    const total = this.cfg.steps.length;
    // The HUD's hits line needs all four numbers ("Píseň: 4 z 4"); no score (it would add a "Píseň: 4" line).
    this.onComplete(outcome === 'victory' ? 'victory' : 'failure', {
      hits: done, total, percent: Math.floor((100 * done) / total), target: 100,
    });
  }

  /** A hidden page mid-round (a locked phone) gives other apps' audio back; on return the round takes 'playback' again and
   *  resumes the context. */
  handleVisibility() {
    if (this.sessionBefore !== undefined) setAudioSession(document.hidden ? this.sessionBefore : 'playback');
    if (!document.hidden) resumeAudio(); // Howler may have suspended the context meanwhile (mid-demo: its notes heard)
  }

  /** The audio session as it was before the round, its visibility handler gone (a loss at once, a win at destroy()). */
  restoreSession() {
    document.removeEventListener('visibilitychange', this.handleVisibility);
    if (this.sessionBefore !== undefined) setAudioSession(this.sessionBefore);
    this.sessionBefore = undefined;
  }

  stopVoices() {
    try {
      this.voices?.stopAll();
    } catch {
      // never throws
    }
  }

  unbind() {
    window.removeEventListener('keydown', this.handleKey);
    this.app.canvas.removeEventListener('pointerdown', this.handlePointer);
    this.app.canvas.removeEventListener('pointerup', resumeAudio);
    document.removeEventListener('pointerdown', this.noteInput, true);
    document.removeEventListener('keydown', this.noteInput, true);
  }

  destroy() {
    keepAudioAwake(false);
    this.finished = true;
    this.app.ticker.remove(this.tick);
    this.unbind();
    this.restoreSession();
    this.stopVoices();
    this.root.destroy({ children: true });
  }
}
