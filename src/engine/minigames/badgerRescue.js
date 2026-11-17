import { Container, Graphics, Sprite } from 'pixi.js';
import { keepAudioAwake, playSound, resumeAudio, sound } from '../sfx.js';
import { positive } from './configRules.js';
import { DEFAULTS as DRAGON_DEFAULTS, NOT_ATTACK_KEYS, createDragonGraphic, loadStrip, showFrame, soundEntry, tryLoadTexture } from './dragonAttack.js';
import { containRect } from '../visualRenderer.js';
import * as R from './badgerRules.js';

/** The HUD's own texts for this game type (registered with its factory, D42; a scene's labels still win). */
export const HUD_TEXTS = {
  labels: {
    score: 'V bezpečí',
    resultHits: 'V bezpečí: {hit} z {total}',
    resultLose: 'Jezevče odplavalo',
    instructions: 'Ťukni nebo zmáčkni mezerník, ať drak skočí pro jezevče!',
  },
};

const BADGER_BROWN = 0x6b5a4a; // the placeholders' colour while art is missing (D7)
/** A brown blob standing on its bottom: the placeholder for a missing badger sprite. */
const blob = (r) => new Graphics().circle(0, -r, r).fill(BADGER_BROWN);
const CLAW_DEPTH = 6; // px under the water line the claws reach at the dive's bottom
const EFFECT_SECONDS = 0.5; // a splash's or a bump's ring

/**
 * The badger cubs rescue (D42). The rules live in badgerRules.js (pure, played by the node checks); this class loads
 * the art, feeds taps into `step()` and draws the state. The field is the background's contain rectangle, 600 game px
 * tall, so the game lines up with the scene's own picture behind it.
 */
export class BadgerRescueMinigame {
  static CLAW_DEPTH = CLAW_DEPTH; // read by the browser check
  constructor({ app, layer, config, hud, onComplete, difficulty }) {
    this.app = app;
    this.layer = layer;
    this.hud = hud;
    this.onComplete = onComplete;
    this.cfg = R.normalize(config ?? {}, difficulty);
    this.assets = this.cfg.assets;
    this.sounds = Object.fromEntries(Object.keys(R.DEFAULTS.sounds).map((name) => [name, soundEntry(this.cfg.sounds[name], `sounds.${name}`)]));
    this.dragonSpecs = DRAGON_DEFAULTS.dragons; // the dragons' art and flaps, as in the beaver game
    this.root = new Container();
    this.finished = false;
    this.tapQueued = false;
    this.lastStatus = '';
    this.lastScore = '';
    this.effects = []; // splashes and bumps: { view, age, type }
    this.touch = matchMedia('(pointer: coarse)').matches;
    this.tick = this.tick.bind(this);
    this.handleKey = this.handleKey.bind(this);
    this.handlePointer = this.handlePointer.bind(this);
  }

  async start() {
    this.layer.addChild(this.root);
    keepAudioAwake(true);
    resumeAudio();
    for (const entry of Object.values(this.sounds)) if (entry) sound(entry.src);
    this.hud.setScore(`0 z ${this.cfg.total}`);
    this.hud.setStatus(R.statusText(this.cfg, this.cfg.motherSaves));

    const names = Object.keys(R.DEFAULTS.assets);
    const [textures, strips] = await Promise.all([
      Promise.all(names.map((name) => tryLoadTexture(this.assets[name]))),
      Promise.all(this.cfg.dragons.map((_, i) => loadStrip(this.dragonSpec(i).animation?.fly))),
    ]);
    if (this.finished) return; // skipped while loading
    this.tex = Object.fromEntries(names.map((name, i) => [name, textures[i]]));
    this.strips = strips;
    // Each dragon's width in strip px, for the catch offsets and the drawing alike (a vector placeholder too, drawn at
    // the same dragonWidth): its fly animation's bodyWidth, else its strip's frame width.
    this.bodyWidths = this.cfg.dragons.map((_, i) => positive(this.dragonSpec(i).animation?.bodyWidth, strips[i]?.width ?? R.FALLBACK_BODY_WIDTH));
    this.state = R.createState(this.cfg, { catch: R.catchOffsets(this.cfg, this.bodyWidths) });
    this.build();
    window.addEventListener('keydown', this.handleKey);
    this.app.canvas.addEventListener('pointerdown', this.handlePointer);
    this.app.canvas.addEventListener('pointerup', resumeAudio);
    this.app.ticker.add(this.tick);
  }

  // ---------------------------------------------------------------- drawing ---

  /** The beaver game's spec of dragon i (its strips, width, flap and colour); a 4th dragon reuses the first's. */
  dragonSpec(i) {
    return this.dragonSpecs[i % this.dragonSpecs.length];
  }

  /** The water line now, in field px (still once the round is decided). */
  surfaceY() {
    return R.roundWater(this.state) * R.FIELD_HEIGHT;
  }

  /** A sprite standing on its bottom centre, `width` game px wide, or null without its texture (a placeholder then). */
  sprite(texture, width) {
    if (!texture) return null;
    const s = new Sprite(texture);
    s.anchor.set(0.5, 1);
    s.scale.set(width / texture.width);
    return s;
  }

  build() {
    const { cfg, tex } = this;
    const { sizes } = cfg;
    const W = R.FIELD_WIDTH;
    const H = R.FIELD_HEIGHT;
    const sprite = (texture, width) => this.sprite(texture, width);
    this.mask = new Graphics().rect(0, 0, W, H).fill(0xffffff);
    this.root.addChild(this.mask);
    this.root.mask = this.mask;

    // The burrow side: the peeking cubs, the father at the new burrow.
    this.peeks = cfg.holes.map(([x, y]) => {
      const s = sprite(tex.cubPeek, sizes.cubPeek) ?? blob(14);
      s.position.set(x * W, y * H + 8);
      this.root.addChild(s);
      return s;
    });
    const father = sprite(tex.father, sizes.father) ?? new Graphics().ellipse(0, -30, 55, 30).fill(BADGER_BROWN);
    father.position.set(cfg.burrow[0] * W, cfg.burrow[1] * H + 10);
    this.root.addChild(father);
    this.home = new Container(); // cubs safe at the new burrow
    this.root.addChild(this.home);

    // The mother's boulder near the right edge reaches from the bottom up to the mother's place.
    const rockHeight = H - cfg.mother.top * H;
    const boulder = (tex.boulder && sprite(tex.boulder, (rockHeight * tex.boulder.width) / tex.boulder.height))
      ?? new Graphics().roundRect(-55, -rockHeight, 110, rockHeight, 30).fill(0x777068);
    boulder.position.set(cfg.mother.x * W, H);
    this.pieceLayer = new Container(); // in front of the boulder: the river's last stretch, where a cub is caught, shows
    this.root.addChild(boulder, this.pieceLayer);
    this.waiting = new Container(); // cubs at the edge waiting for the mother, busy with another
    this.motherWatch = sprite(tex.motherWatch, sizes.mother) ?? new Graphics().ellipse(0, -28, 55, 28).fill(BADGER_BROWN);
    this.motherRest = sprite(tex.motherRest, sizes.mother) ?? new Graphics().ellipse(0, -18, 60, 18).fill(BADGER_BROWN);
    this.motherCub = sprite(tex.cubFly, sizes.cubFly) ?? blob(12);
    this.motherKids = new Container(); // cubs the mother brought back, on the rock in front of her
    this.motherBack = 0;
    this.root.addChild(this.waiting, this.motherWatch, this.motherRest, this.motherCub, this.motherKids);

    this.dragonLayer = new Container();
    this.water = new Graphics();
    this.arcLayer = new Container();
    this.effectLayer = new Container();
    this.root.addChild(this.dragonLayer, this.water, this.effectLayer, this.arcLayer);
    this.pieceViews = new Map();
    this.arcViews = new Map();
    this.dragonView = null;
    this.dragonIndex = -1;
  }

  /** The field's place on the screen: the background's contain rectangle (VisualRenderer fits the scene's the same). */
  layout() {
    const { width, height } = this.app.screen;
    const fit = containRect(width, height, R.BACKGROUND.width, R.BACKGROUND.height);
    const scale = (R.BACKGROUND.height * fit.scale) / R.FIELD_HEIGHT;
    this.root.scale.set(scale);
    this.root.position.set(fit.x, fit.y);
    return scale;
  }

  draw() {
    const { state, cfg } = this;
    const W = R.FIELD_WIDTH;
    const H = R.FIELD_HEIGHT;
    const scale = this.layout();
    const surface = this.surfaceY();

    // Holes: a peeking cub while one is still inside and the water hasn't reached it yet (later ones wait under water).
    const floods = R.floodTimes(cfg);
    cfg.holes.forEach((_, hole) => {
      this.peeks[hole].visible = Math.min(state.t, state.decidedAt ?? Infinity) < floods[hole]
        && state.cubs.some((c) => c.hole === hole && c.status === 'hole');
    });

    // Pieces on the surface.
    const live = new Set();
    for (const piece of state.pieces) {
      live.add(piece.id);
      let view = this.pieceViews.get(piece.id);
      if (!view) {
        view = piece.kind === 'log'
          ? this.sprite(this.tex.log, cfg.logLength) ?? new Graphics().roundRect(-cfg.logLength / 2, -14, cfg.logLength, 14, 7).fill(0x7a5230)
          : this.sprite(this.tex.cubBranch, cfg.branchLength) ?? new Graphics().rect(-cfg.branchLength / 2, -8, cfg.branchLength, 8).fill(0x5a3d22).circle(0, -22, 14).fill(BADGER_BROWN);
        this.pieceLayer.addChild(view);
        this.pieceViews.set(piece.id, view);
      }
      const bob = Math.sin(state.t * 3 + piece.x * 0.05) * 2;
      view.position.set(piece.x, surface + 10 + bob);
    }
    for (const [id, view] of this.pieceViews) {
      if (!live.has(id)) {
        view.destroy();
        this.pieceViews.delete(id);
      }
    }

    // The water band, in front of the pieces and the dragons (a diving dragon dips in).
    this.water.clear().rect(0, surface, W, H - surface).fill({ color: 0x4f8fb0, alpha: 0.35 })
      .rect(0, surface - 1, W, 3).fill({ color: 0xdff4ff, alpha: 0.5 });

    this.drawDragon(surface, scale);
    this.drawArcs();
    this.drawMother(surface);
  }

  drawDragon(surface, screenScale) {
    const { state, cfg } = this;
    const d = state.dragon;
    const i = d.index % cfg.dragons.length;
    const strip = this.strips[i];
    const spec = this.dragonSpec(i);
    if (this.dragonIndex !== d.index) {
      this.dragonView?.destroy();
      this.dragonIndex = d.index;
      if (strip) {
        this.dragonView = new Sprite(strip.frames[0]);
        const s = cfg.dragonWidth / this.bodyWidths[i];
        this.dragonView.scale.set(-s, s); // flying left: mirrored
      } else {
        this.dragonView = createDragonGraphic(cfg.dragonWidth, cfg.dragonWidth * 0.6, spec.color, -1);
      }
      this.dragonLayer.addChild(this.dragonView);
    }
    const view = this.dragonView;
    // In the gap between passes the dragon flies on out of sight (its body reaches ~130 px behind the eye).
    const x = d.phase === 'gap' ? d.x - cfg.dragons[i].speed * d.phaseT : d.x;
    const off = state.catch[i];
    // The flight line, kept below the HUD's top bar (D15).
    const hudBottom = (this.hud.coveredTop() - this.root.position.y) / screenScale;
    const above = strip ? strip.anchor[1] * strip.height * Math.abs(view.scale.y) : cfg.dragonWidth * 0.3;
    const bottomY = surface - off.dy + CLAW_DEPTH;
    // Always above the dive's bottom (a big flightY in a story config would make it dive up).
    const flyY = Math.min(Math.max(cfg.flightY * R.FIELD_HEIGHT, hudBottom + above + 4), bottomY - 40);
    let y = flyY;
    let tilt = 0;
    if (d.phase === 'down' || d.phase === 'up') {
      const k = Math.min(1, d.phaseT / (d.phase === 'down' ? cfg.dive.down : cfg.dive.up));
      const depth = d.phase === 'down' ? k : 1 - k;
      y = flyY + (bottomY - flyY) * depth * (2 - depth); // ease out
      tilt = (cfg.dive.tilt * Math.PI) / 180 * depth;
      if (strip) showFrame(view, strip, cfg.dragons[i].diveFrame);
    } else if (strip) {
      const frames = spec.animation.flyFrames ?? [0];
      showFrame(view, strip, frames[Math.floor(state.t * (spec.animation.flyFps ?? 12)) % frames.length]);
    }
    // Turned around the catch point (the claws), not the eye the sprite is anchored on: the eye goes where the turned
    // offset puts it, so the claws stay over the point the rules catch at. Mirrored art: a negative angle dips the nose.
    const angle = -tilt;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    view.position.set(x + off.dx - (off.dx * cos - off.dy * sin), y + off.dy - (off.dx * sin + off.dy * cos));
    view.rotation = angle;
  }

  drawArcs() {
    const { state, cfg } = this;
    const [bx, by] = [cfg.burrow[0] * R.FIELD_WIDTH, cfg.burrow[1] * R.FIELD_HEIGHT];
    const surface = (t) => R.waterLevel(cfg, t) * R.FIELD_HEIGHT;
    for (const arc of state.arcs) {
      let view = this.arcViews.get(arc.cub);
      const k = arc.end > arc.begin ? (state.t - arc.begin) / (arc.end - arc.begin) : 1;
      if (k >= 1) {
        if (view !== null) { // drawn or not (an arc shorter than a frame), the cub sits at the burrow once
          view?.destroy();
          this.arcViews.set(arc.cub, null);
          this.addHomeCub();
        }
        continue;
      }
      if (view === undefined) {
        view = this.sprite(this.tex.cubFly, this.cfg.sizes.cubFly) ?? blob(12);
        this.arcLayer.addChild(view);
        this.arcViews.set(arc.cub, view);
      }
      if (!view) continue;
      const y0 = surface(arc.begin);
      view.position.set(arc.from + (bx - arc.from) * k, y0 + (by - y0) * k - Math.sin(Math.PI * k) * this.cfg.sizes.arcHeight);
    }
  }

  addHomeCub() {
    const n = this.home.children.length;
    const cub = this.sprite(this.tex.cubPeek, this.cfg.sizes.homeCub) ?? blob(10);
    // Beside the father, five to a row, spaced by their own size.
    const { father, homeCub } = this.cfg.sizes;
    cub.position.set(this.cfg.burrow[0] * R.FIELD_WIDTH + father / 2 + (n % 5) * homeCub * 0.65,
      this.cfg.burrow[1] * R.FIELD_HEIGHT + homeCub * 0.4 + Math.floor(n / 5) * homeCub * 0.4);
    this.home.addChild(cub);
  }

  drawMother(surface) {
    const { state, cfg } = this;
    const W = R.FIELD_WIDTH;
    const topX = cfg.mother.x * W;
    // She stands on the stone, a little under the grass on its top (the art rises ~10 % above it).
    const topY = cfg.mother.top * R.FIELD_HEIGHT + 0.1 * (R.FIELD_HEIGHT - cfg.mother.top * R.FIELD_HEIGHT);
    const { trip, carrying, waiting, back, resting } = R.motherView(state);
    let x = topX;
    let y = topY;
    if (trip) {
      const mid = trip.begin + cfg.motherLeap;
      const k = state.t < mid ? (state.t - trip.begin) / Math.max(cfg.motherLeap, 1e-6) : 1 - (state.t - mid) / Math.max(cfg.motherReturn, 1e-6);
      // To the edge of the water and back, in a hop a third of her size high.
      x = topX + (W - cfg.sizes.mother / 4 - topX) * k;
      y = topY + (surface + 12 - topY) * k - Math.sin(Math.PI * k) * (cfg.sizes.mother / 3);
    }
    // A saved cub waits at the edge until she reaches it (the middle of her trip), then rides back with her.
    if (waiting !== this.waiting.children.length) {
      this.waiting.removeChildren().forEach((view) => view.destroy());
      for (let k = 0; k < waiting; k += 1) {
        const view = this.sprite(this.tex.cubBranch, cfg.branchLength) ?? blob(12);
        this.waiting.addChild(view);
      }
    }
    // Bunched at the edge (a few px apart), so a branch turning into a waiting cub doesn't jump back upstream.
    this.waiting.children.forEach((view, k) => {
      const x = W - cfg.branchLength / 2 - k * 12;
      view.position.set(x, surface + 10 - k * 4 + Math.sin(state.t * 3 + x * 0.05) * 2); // bobbing as the pieces do
    });
    this.motherWatch.visible = !resting;
    this.motherRest.visible = resting;
    for (const view of [this.motherWatch, this.motherRest]) view.position.set(x, y);
    this.motherCub.visible = carrying;
    this.motherCub.position.set(x - cfg.sizes.mother / 4, y - 10);
    // Cubs the mother brought back sit beside her.
    if (back !== this.motherBack) {
      this.motherBack = back;
      this.motherKids.removeChildren().forEach((view) => view.destroy());
      for (let k = 0; k < back; k += 1) {
        const cub = this.sprite(this.tex.cubPeek, this.cfg.sizes.motherCub) ?? blob(9);
        // On the rock's top in front of her (the rock is about her width there).
        cub.position.set(topX - cfg.sizes.mother * 0.3 + k * cfg.sizes.motherCub * 0.7, topY + 4);
        this.motherKids.addChild(cub);
      }
    }
  }

  effect(type, x) {
    const surface = this.surfaceY();
    const view = new Graphics();
    view.position.set(x, surface);
    this.effectLayer.addChild(view);
    this.effects.push({ view, age: 0, type });
  }

  drawEffects(dt) {
    for (const fx of [...this.effects]) {
      fx.age += dt;
      const k = fx.age / EFFECT_SECONDS;
      if (k >= 1) {
        fx.view.destroy();
        this.effects.splice(this.effects.indexOf(fx), 1);
        continue;
      }
      const color = fx.type === 'bump' ? 0xffe27a : 0xffffff;
      fx.view.clear().ellipse(0, 0, 20 + 40 * k, 6 + 10 * k).stroke({ color, width: 3, alpha: 1 - k });
    }
  }

  // ------------------------------------------------------------------ input ---

  handleKey(event) {
    resumeAudio();
    if (event.repeat) return;
    if (NOT_ATTACK_KEYS.includes(event.key)) return;
    if (event.key === ' ') event.preventDefault();
    this.tapQueued = true;
  }

  handlePointer() {
    this.tapQueued = true;
  }

  // ------------------------------------------------------------------- loop ---

  tick(ticker) {
    try {
      this.update(Math.min(0.1, ticker.deltaMS / 1000));
    } catch (error) {
      console.error('Minigame error — ending the round.', error);
      this.complete('failure');
    }
  }

  update(dt) {
    if (this.finished) return;
    const { width, height } = this.app.screen;
    if (!(width > 0 && height > 0)) return; // no screen yet (a hidden or collapsed canvas): nothing to lay out
    // Paused in portrait (the rotate hint covers the game, D15) and while the skip menu is open (a cub would float
    // away while a child reads it).
    if ((this.touch && height > width) || this.hud.skipMenuOpen()) {
      this.tapQueued = false; // no dive from a tap made while paused
      return;
    }
    const { state } = this;
    let left = dt;
    while (left > 1e-9 && !this.finished) {
      const h = Math.min(R.STEP, left);
      left -= h;
      R.step(state, h, { dive: this.tapQueued }); // step() dives only when canDive()
      this.tapQueued = false;
      for (const e of state.events) this.onEvent(e);
    }
    if (this.finished) return;
    this.drawEffects(dt);
    this.draw();
    const { score, status } = R.hudView(state);
    if (score !== this.lastScore) this.hud.setScore((this.lastScore = score));
    if (status !== this.lastStatus) this.hud.setStatus((this.lastStatus = status));
    if (R.finished(state)) this.complete(state.outcome);
  }

  onEvent(e) {
    const entry = this.sounds[R.EVENT_SOUNDS[e.type]];
    if (entry) playSound(sound(entry.src), entry.volume);
    if (e.type === 'dive') this.hud.hideInstructions();
    if (e.type === 'splash' || e.type === 'bump') this.effect(e.type, e.x);
  }

  complete(outcome) {
    if (this.finished) return;
    this.finished = true;
    this.app.ticker.remove(this.tick);
    keepAudioAwake(false);
    this.unbind();
    const { safe } = this.state; // complete() comes only from update(), after start() made the state
    const total = this.cfg.total;
    // The HUD shows its hits line only with all four numbers; the badger's template uses {hit} and {total}, and the
    // others are true too (the share saved; the goal is every cub).
    this.onComplete(outcome === 'victory' ? 'victory' : 'failure', {
      hits: safe, total, percent: Math.floor((100 * safe) / total), target: 100,
    });
  }

  unbind() {
    window.removeEventListener('keydown', this.handleKey);
    this.app.canvas.removeEventListener('pointerdown', this.handlePointer);
    this.app.canvas.removeEventListener('pointerup', resumeAudio);
  }

  destroy() {
    keepAudioAwake(false);
    this.finished = true;
    this.app.ticker.remove(this.tick);
    this.unbind();
    this.root.destroy({ children: true });
  }
}
