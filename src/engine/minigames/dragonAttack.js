import { Assets, Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js';
import { resolveAssetPath } from '../assetPath.js';
import { EFFECT_MIX, keepAudioAwake, playSound, resumeAudio, sound } from '../sfx.js';

/**
 * Dragon attack minigame.
 *
 * Three dragons fly, one after another, above a line of moving beavers. A key
 * press, mouse click or screen touch makes the dragon in flight attack. Each
 * dragon has its own attack (launch angle, speed and gravity) and may have
 * `maxShots` of its own shots in the air at once; after a launch it waits
 * `refireAfter` × that shot's on-screen time before the next one; it attacks
 * only while its shot would start on the screen. Each dragon flies a
 * configurable number of flights.
 *
 * Win: every beaver has been hit.
 * Lose: all flights are used up, no shot is in the air, no beaver is still in its hit, and beavers remain.
 *
 * Every number is configurable via the `config` object (see {@link DEFAULTS}).
 * Anything you omit falls back to the default. Art is optional: if a sprite or
 * animation strip is missing the entity is drawn with a simple vector
 * placeholder, so the minigame is fully playable before the art is dropped in.
 */
const DEFAULTS = {
  // Screens shorter than this scale the whole game down uniformly, so every px
  // number below is in game pixels (D15).
  designHeight: 600,

  // Optional dedicated background for the minigame. If null, whatever the scene
  // already rendered (e.g. the dam background) stays visible behind the action.
  background: { sprite: 'assets/minigames/dragon-attack/background.png' },

  beavers: {
    count: 7,
    radius: 38, // collision radius in px
    laneY: 0.84, // vertical position as a fraction of screen height
    speed: 90, // walking speed in px/second
    direction: 1, // 1 = moving right, -1 = moving left
    spacingPx: 150, // gap between beavers along the lane
    startXRatio: 0.08, // first beaver x as a fraction of screen width
    bobAmplitude: 10, // vertical bob in px while walking
    bobSpeed: 2.4, // bob cycles per second (radians/sec multiplier)

    // Sprite-sheet animation. Each beaver loads its own sheet via `sheetPattern`
    // where `{n}` is replaced with 1..count (beaver1_frames.png … beaver7_frames.png,
    // made by scripts/cleanBeavers.mjs, D31). The sheet is a `columns` x `rows`
    // grid; the frame index lists below pick which cells belong to each animation
    // (0-based, left-to-right, top-to-bottom):
    //   walk   — looping walk cycle (top row)
    //   hit    — played once when struck; the log drops when its first frame ends
    //   log    — a single static "log on the ground" frame, left where the log landed
    //   scurry — looping run played while fleeing off-screen
    sheetPattern: 'assets/minigames/dragon-attack/beaver{n}_frames.png',
    sheet: {
      columns: 6,
      rows: 2,
      padding: 50, // px of the sheet added on each side of every cell; spriteWidth is a cell's width without it
      walk: [0, 1, 2, 3, 4, 5],
      hit: [7, 6], // the log falls, then the startled beaver beside it (Sára)
      log: [8],
      scurry: [9, 10, 11],
    },
    walkFps: 8,
    hitFps: 10,
    scurryFps: 14,
    scurrySpeed: 360, // px/second while fleeing
    // Which way a struck beaver flees: 'walk' (keep walking direction),
    // 'nearestEdge', 'left' or 'right'.
    scurryDirection: 'walk',
    flipForScurry: false, // mirror the sprite to face the scurry direction
    dropLogOnHit: true, // leave the "log" frame where the log landed
    // The cry on every hit, whoever shot (D29), its 150 ms delay as silence in its file; the log when it lands (D31).
    sounds: {
      cry: { src: 'assets/minigames/dragon-attack/sfx/beaver_cry.mp3', volume: EFFECT_MIX },
      log: { src: 'assets/minigames/dragon-attack/sfx/log_land.mp3', volume: EFFECT_MIX }, // only when a log drops
    },
    spriteWidth: null, // on-screen width in px; defaults to radius * 2.4

    // Fallbacks used only when no sprite sheet is available.
    sprite: null,
    color: '#7a5230',
  },

  // One entry per dragon. The list length is the number of distinct dragons.
  //
  // Each attack supports:
  //   pattern: 'ballistic' (angle + speed + gravity) or 'zigzag' (descends
  //            straight while weaving sideways).
  //   launchFrom: 'center' | 'head' | 'tail' — where the shot spawns relative
  //            to the dragon's travel direction (launchOffset px from the
  //            centre). A dragon with `animation.launchPoint` and its fly strip
  //            launches from that point in its art instead.
  //   angleDeg: 0 = straight down; positive bends toward travel direction;
  //            values > 90 launch upward first (for arcing shots).
  //   maxShots: own shots in the air at once (default 1).
  //   refireAfter: after a launch, wait this fraction of that shot's on-screen
  //            time before the next one (default 0: as soon as maxShots allows).
  //   sound / hitSound: played when the shot launches / hits a beaver (D29):
  //            { src, volume 0–1 }, a bare path (volume EFFECT_MIX, 0.7) or null for none.
  //
  // A dragon's `animation` (optional) uses strips made by scripts/packFrames.mjs:
  // one row of equal frames, the art facing right, `anchor` = the dragon's eye
  // as fractions of a frame. Sizes are in strip px; `launchPoint` (where the shot leaves on the
  // launch frame: Róza's mouth, Anna's tail tip) is relative to the anchor.
  // DEFAULTS is the source of truth for every value. A custom `dragons` list replaces it
  // wholesale and must give every field a dragon uses (README); the `?? n` fallbacks in the code
  // only cover the optional ones (art, firing rules, sizes), not e.g. `color` or `speed`.
  dragons: [
    {
      // Róza: a fast, direct flame that travels slightly ahead of her and dips.
      name: 'Róza',
      color: '#d6462f',
      sprite: null, // a single image instead of `animation`
      width: 200, // on screen; with `animation` the scale is width / animation.bodyWidth
      height: 96, // only for the fallbacks (vector, or a single-image sprite)
      flightY: 0.16, // fraction of screen height
      speed: 320, // horizontal flight speed in px/second
      entryFrom: 'left', // 'left' or 'right'
      animation: {
        fly: { src: 'assets/minigames/dragon-attack/roza_fly.png', frames: 6, anchor: [0.866, 0.608] },
        attack: { src: 'assets/minigames/dragon-attack/roza_attack.png', frames: 6, anchor: [0.725, 0.564] },
        bodyWidth: 290, // dragon width in strip px (median of the fly frames)
        flyFrames: [0, 3, 1, 2, 4, 2, 1, 3], // wings up → down → up
        flyFps: 12,
        attackFrames: [1, 2, 3, 4, 5], // mouth opens, fire breath
        attackFps: 24,
        launchFrame: 3, // strip frame (one of attackFrames) on which the shot leaves: the fire
        launchPoint: [5, 14], // the mouth (source ≈ [1250, 623] on roze_attack.png's fire frame, eye [1240, 595])
      },
      attack: {
        pattern: 'ballistic',
        launchFrom: 'head', // only without the fly strip (the vector fallback)
        speed: 720, // launch speed in px/second
        angleDeg: 16, // slightly ahead, mostly forward and a touch down
        gravity: 140, // gentle dip
        radius: 22,
        color: '#ff7b3d',
        maxShots: 1,
        refireAfter: 0,
        sound: { src: 'assets/minigames/dragon-attack/sfx/bezzubka_shot.mp3', volume: EFFECT_MIX },
        // also Nastavení's test sound (TEST_SOUND_SRC in sfx.js)
        hitSound: { src: 'assets/minigames/dragon-attack/sfx/fireball_hit.mp3', volume: EFFECT_MIX },
        sprite: null,
        animation: {
          src: 'assets/minigames/dragon-attack/roza_fireball.png',
          frames: 5,
          anchor: [0.672, 0.644], // the white-hot head
          scale: 0.6,
          fps: 14,
          flightFrames: [0, 1, 2, 3], // burst → ball → comet, then held
          impactFrame: 4, // dissipating flame at the contact point
          impactMs: 300,
          artAngleDeg: 35, // direction the comet points in the art
        },
      },
    },
    {
      // Emma: a flash that drops straight down while zig-zagging side to side.
      name: 'Emma',
      color: '#e0a33a',
      sprite: null,
      width: 150,
      height: 96,
      flightY: 0.26,
      speed: 380,
      entryFrom: 'right',
      attack: {
        pattern: 'zigzag',
        launchFrom: 'head', // the lightning leaves her mouth (Sára)
        speed: 380, // downward descent speed
        gravity: 0, // constant fall so the zig-zag stays even
        zigzagAmplitude: 70, // sideways reach in px
        zigzagFrequency: 9, // weave speed (radians/second)
        radius: 24,
        color: '#ffe27a',
        maxShots: 1,
        refireAfter: 0,
        sound: { src: 'assets/minigames/dragon-attack/sfx/emma_shot.mp3', volume: EFFECT_MIX },
        hitSound: { src: 'assets/minigames/dragon-attack/sfx/emma_hit.mp3', volume: EFFECT_MIX },
        sprite: null,
      },
    },
    {
      // Anna: flicks a thorn from her tail that arcs up-and-back, then down.
      name: 'Anna',
      color: '#3aa0e0',
      sprite: null,
      width: 200,
      height: 96,
      flightY: 0.21, // below ~1070 px tall the HUD clamp (her raised wings) sets her height instead (D30)
      speed: 300,
      entryFrom: 'left',
      animation: {
        fly: { src: 'assets/minigames/dragon-attack/anna_fly.png', frames: 6, anchor: [0.907, 0.549] },
        attack: { src: 'assets/minigames/dragon-attack/anna_attack.png', frames: 6, anchor: [0.915, 0.613] },
        bodyWidth: 200,
        // Sára's cycle 0-1-2-3-4-3-2-1 started on frame 1, whose tail matches the flick's last frame.
        flyFrames: [1, 2, 3, 4, 3, 2, 1, 0],
        flyFps: 12,
        attackFrames: [0, 1, 2, 3, 4, 5], // the tail flick (drawn at the fly strip's scale)
        attackFps: 30, // quick (Sára)
        launchFrame: 3, // tail straight back
        launchPoint: [-156, -12], // the tail tip (source ≈ [1138, 385] on anna_attack.png's frame 3, eye [1450, 409])
      },
      attack: {
        pattern: 'ballistic',
        launchFrom: 'tail', // only without the fly strip (the vector fallback)
        speed: 430,
        angleDeg: -120, // launches backward and upward → gravity arcs it down
        gravity: 760, // heavy pull for a pronounced arc
        radius: 16, // around the thorn's tip
        color: '#5ad0ff',
        maxShots: 3,
        refireAfter: 1 / 3, // up to three thorns in the air
        sound: { src: 'assets/minigames/dragon-attack/sfx/anna_shot.mp3', volume: EFFECT_MIX },
        hitSound: { src: 'assets/minigames/dragon-attack/sfx/anna_hit.mp3', volume: EFFECT_MIX },
        sprite: null,
        animation: {
          src: 'assets/minigames/dragon-attack/anna_thorn.png',
          frames: 6,
          anchor: [0.974, 0.589], // the tip
          scale: 0.45,
          fps: 8,
          flightFrames: [0, 1, 2, 3, 4, 5, 4, 3, 2, 1], // the glow pulses
          loop: true, // the flight frames repeat (without it the last one is held)
          artAngleDeg: 3, // the thorn points slightly down in the art
        },
      },
    },
  ],

  flightsPerDragon: 5,
  flightGapMs: 450, // pause between consecutive flights
  // 'roundRobin' => d1,d2,d3,d1,d2,d3,...  'sequential' => d1,d1,...,d2,d2,...
  flightOrder: 'roundRobin',

  score: {
    perHit: 100,
    winBonus: 500,
    remainingFlightBonus: 50, // awarded per unused flight on victory
  },

  input: {
    keyboard: true,
    pointer: true, // covers mouse + touch via pointer events
  },

  labels: {
    status: 'Bobři: {alive}/{total} · Nálet: {flight}/{flights} · {dragon}',
  },
};

const MAX_SHOT_SECONDS = 10; // no shot stays longer, whatever its path
const MAX_BEAVERS = 50; // a typo in beavers.count must not start thousands of sheet loads at once
const MAX_FLIGHTS_PER_DRAGON = 100; // nor may flightsPerDragon build a queue of billions
const MAX_FLIGHT_SECONDS = 30; // a flight ends by then even if the dragon never reaches the edge
const MAX_HIT_SECONDS = 5; // a hit beaver runs by then even with a tiny hitFps (a lost round waits for it, D31)

export class DragonAttackMinigame {
  /**
   * @param {object} context
   * @param {import('pixi.js').Application} context.app
   * @param {import('pixi.js').Container} context.layer The dedicated minigame layer.
   * @param {object} context.config Partial config overriding {@link DEFAULTS}.
   * @param {import('./minigameHud.js').MinigameHud} context.hud
   * @param {(outcome: 'victory'|'failure', details: object) => void} context.onComplete
   */
  constructor({ app, layer, config, hud, onComplete }) {
    this.app = app;
    this.layer = layer;
    this.hud = hud;
    this.onComplete = onComplete;
    this.config = mergeConfig(DEFAULTS, config ?? {});

    this.root = new Container();
    this.logLayer = new Container();
    this.beaverLayer = new Container();
    this.dragonLayer = new Container();
    this.projectileLayer = new Container();

    this.beavers = [];
    this.flightQueue = [];
    this.queueIndex = 0;
    this.currentDragon = null;
    this.projectiles = [];
    this.impacts = [];
    // Firing state per dragon for this round. Never on the dragon's config: for `config: {}`
    // that is DEFAULTS.dragons itself and would carry into the next round (a retry).
    this.fire = this.config.dragons.map(() => ({ lastLaunchAt: -Infinity, lastAirtime: 0 }));
    // Sounds, normalised here and never written into the config (as `fire`).
    const beaverSounds = isPlainObject(this.config.beavers.sounds) ? this.config.beavers.sounds : {};
    this.sounds = {
      shot: this.config.dragons.map((dragon, i) => soundEntry(dragon.attack?.sound, `dragons[${i}].attack.sound`)),
      hit: this.config.dragons.map((dragon, i) => soundEntry(dragon.attack?.hitSound, `dragons[${i}].attack.hitSound`)),
      cry: soundEntry(beaverSounds.cry, 'beavers.sounds.cry'),
      log: soundEntry(beaverSounds.log, 'beavers.sounds.log'),
    };
    this.playedThisTick = new Set(); // sound files, so two hits on one tick play each file once
    this.score = 0;
    this.time = 0;
    this.elapsedSinceFlight = 0;
    this.state = 'idle'; // 'flying' | 'gap' | 'done'
    this.finished = false;
    this.touch = matchMedia('(pointer: coarse)').matches;

    this.tick = this.tick.bind(this);
    this.handleKey = this.handleKey.bind(this);
    this.handlePointer = this.handlePointer.bind(this);
  }

  async start() {
    this.layer.addChild(this.root);
    this.root.addChild(this.logLayer, this.beaverLayer, this.dragonLayer, this.projectileLayer);

    // The click that starts or retries the round may wake a suspended AudioContext (never awaited: D29), which then
    // stays awake until the round ends. The sounds start loading here but are never waited for: one still loading
    // is just skipped.
    keepAudioAwake(true);
    resumeAudio();
    const { shot, hit, cry, log } = this.sounds;
    for (const entry of [...shot, ...hit, cry, log]) {
      if (entry) sound(entry.src);
    }

    // Everything loads at once (the beaver sheets too), and nothing touches the scene before
    // this single await.
    const cfg = this.config;
    const [background, beaverTexture, beaverFrames, dragonArt] = await Promise.all([
      tryLoadTexture(cfg.background?.sprite),
      tryLoadTexture(cfg.beavers.sprite),
      Promise.all(Array.from({ length: Math.min(cfg.beavers.count, MAX_BEAVERS) }, (_, index) => this.loadBeaverFrames(cfg.beavers, index))),
      Promise.all(cfg.dragons.map(loadDragonArt)),
    ]);
    // Skipped while loading: destroy() has already run.
    if (this.finished) return;

    if (background) {
      this.background = new Sprite(background);
      this.background.anchor.set(0.5);
      this.root.addChildAt(this.background, 0);
    }
    this.dragonArt = dragonArt;
    this.spawnBeavers(beaverFrames, beaverTexture);
    this.buildFlightQueue();
    this.bindInput();
    this.updateHud();
    this.startNextFlight();

    this.app.ticker.add(this.tick);
  }

  // ---------------------------------------------------------------- setup ---

  /** Scales the game to the screen and returns the play area in game pixels (D15).
   *  Called every tick, so resizes and rotations need no extra handling. */
  layout() {
    const { width, height } = this.app.screen;
    const scale = Math.min(1, height / positive(this.config.designHeight, 600));
    const size = { width: width / scale, height: height / scale, top: this.hud.coveredTop() / scale };
    this.root.scale.set(scale);
    if (this.background) {
      const { texture } = this.background;
      this.background.scale.set(Math.max(size.width / texture.width, size.height / texture.height));
      this.background.position.set(size.width / 2, size.height / 2);
    }
    return size;
  }

  spawnBeavers(beaverFrames, singleTexture) {
    const cfg = this.config.beavers;
    const { width, height } = this.layout();

    beaverFrames.forEach((frames, index) => {
      let view;
      if (frames) {
        view = new Sprite(frames.walk[0] ?? Texture.WHITE);
        view.anchor.set(0.5);
        view.scale.set(frames.displayScale);
      } else if (singleTexture) {
        view = makeTexturedSprite(singleTexture, cfg.radius * 2);
      } else {
        view = createBeaverGraphic(cfg.radius, cfg.color);
      }

      const beaver = {
        view,
        frames,
        alive: true,
        state: 'walk',
        frameIndex: 0,
        frameTimer: 0,
        scurryDir: cfg.direction,
        phase: Math.random() * Math.PI * 2,
        x: width * cfg.startXRatio + index * cfg.spacingPx,
      };
      // In its lane from the start, never at (0, 0) until the first tick.
      view.position.set(beaver.x, height * cfg.laneY);

      this.beaverLayer.addChild(view);
      this.beavers.push(beaver);
    });
  }

  /**
   * Loads a beaver's sprite sheet and slices it into the named animation frame
   * groups. Returns null if there is no sheet (so the caller can fall back to a
   * single image or a vector placeholder).
   */
  async loadBeaverFrames(cfg, index) {
    if (!cfg.sheetPattern || !cfg.sheet) return null;

    const path = cfg.sheetPattern.replace('{n}', String(index + 1));
    const base = await tryLoadTexture(path);
    if (!base) return null;

    const { columns, rows } = cfg.sheet;
    const frameWidth = base.width / columns;
    const frameHeight = base.height / rows;
    const source = base.source;

    const frameAt = (cellIndex) => {
      const col = cellIndex % columns;
      const row = Math.floor(cellIndex / columns);
      return new Texture({
        source,
        frame: new Rectangle(col * frameWidth, row * frameHeight, frameWidth, frameHeight),
      });
    };

    const targetWidth = cfg.spriteWidth ?? cfg.radius * 2.4;
    // The cell's padding: 0 up to a quarter of the frame, else the default, itself only where it fits a quarter (a
    // typo like 100, or 50 inherited by a narrow custom sheet, would make the beavers enormous; D24).
    const fits = (value) => Number.isFinite(value) && value >= 0 && value <= frameWidth / 4;
    const fallback = DEFAULTS.beavers.sheet.padding;
    const padding = fits(cfg.sheet.padding) ? cfg.sheet.padding : fits(fallback) ? fallback : 0;

    return {
      walk: (cfg.sheet.walk ?? []).map(frameAt),
      hit: (cfg.sheet.hit ?? []).map(frameAt),
      log: (cfg.sheet.log ?? []).map(frameAt),
      scurry: (cfg.sheet.scurry ?? []).map(frameAt),
      frameWidth,
      frameHeight,
      displayScale: targetWidth / (frameWidth - 2 * padding),
    };
  }

  buildFlightQueue() {
    const dragonCount = this.config.dragons.length;
    const perDragon = Math.min(this.config.flightsPerDragon, MAX_FLIGHTS_PER_DRAGON);
    const queue = [];

    if (this.config.flightOrder === 'sequential') {
      for (let d = 0; d < dragonCount; d += 1) {
        for (let f = 0; f < perDragon; f += 1) queue.push(d);
      }
    } else {
      for (let f = 0; f < perDragon; f += 1) {
        for (let d = 0; d < dragonCount; d += 1) queue.push(d);
      }
    }

    this.flightQueue = queue;
  }

  // ---------------------------------------------------------------- input ---

  bindInput() {
    if (this.config.input.keyboard) {
      window.addEventListener('keydown', this.handleKey);
    }
    if (this.config.input.pointer) {
      // Bind to the canvas so HUD button clicks don't trigger an attack.
      this.app.canvas.addEventListener('pointerdown', this.handlePointer);
      // A touch's pointerdown is no user activation; its pointerup is (for resuming the audio).
      this.app.canvas.addEventListener('pointerup', resumeAudio);
    }
  }

  unbindInput() {
    window.removeEventListener('keydown', this.handleKey);
    this.app.canvas.removeEventListener('pointerdown', this.handlePointer);
    this.app.canvas.removeEventListener('pointerup', resumeAudio);
  }

  handleKey(event) {
    resumeAudio();
    if (event.repeat) return;
    // Ignore pure modifier keys; everything else counts as an attack.
    if (['Shift', 'Control', 'Alt', 'Meta', 'Tab', 'Escape'].includes(event.key)) return;
    if (event.key === ' ') event.preventDefault();
    this.attack();
  }

  handlePointer() {
    this.attack();
  }

  // ----------------------------------------------------------- game logic ---

  /** The dragon in flight attacks if its firing rules allow (see DEFAULTS.dragons). */
  attack() {
    if (this.finished) return;
    if (this.state !== 'flying' || !this.currentDragon) return;
    const dragon = this.currentDragon;
    if (!this.canFire(dragon)) return;
    this.hud.hideInstructions(); // the player has got it (a tap that does nothing keeps the hint)

    if (dragon.art.breath) {
      // The attack animation launches the shot on its launch frame (animateDragon).
      dragon.attackTime = 0;
      dragon.launched = false;
      showFrame(dragon.view, dragon.art.breath, dragon.config.animation.attackFrames?.[0] ?? 0);
    } else {
      this.launchProjectile(dragon);
    }
  }

  canFire(dragon) {
    const attack = dragon.config.attack;
    const fire = this.fire[dragon.index];
    const inAir = this.projectiles.filter((shot) => shot.dragonIndex === dragon.index).length;
    if (inAir >= Math.max(1, Math.floor(positive(attack.maxShots, 1)))) return false;
    if (dragon.attackTime !== null && !dragon.launched) return false; // its shot hasn't left yet
    // Not while the shot would start off the screen (the dragon entering or leaving, Anna's tail),
    // judged where it will be on the launch frame: it would fall unseen and, with maxShots 1, block
    // the next taps for its whole airtime; or the attack would play with no shot.
    if (!this.launchOrigin(dragon, dragon.art.breath ? secondsToFire(dragon) : 0).onScreen) return false;
    // Counted from the last launch, not from that shot's age: a shot that left early (a
    // resize) must not lock the dragon out.
    return this.time - fire.lastLaunchAt >= refireAfter(attack) * fire.lastAirtime;
  }

  /** Where the dragon's shot starts now, or `ahead` seconds of flight from now. */
  launchOrigin(dragon, ahead = 0) {
    const attack = dragon.config.attack;
    const dir = dragon.direction;
    const point = dragon.config.animation?.launchPoint;
    let x = dragon.view.x + dragon.config.speed * dir * ahead;
    let y = dragon.view.y;
    // Two finite numbers, like the anchors (a typo would make every shot NaN, or none fire): else launchFrom.
    if (dragon.art.fly && Array.isArray(point) && point.length === 2 && point.every(Number.isFinite)) {
      // From the launch point in the art (strip px from the eye, mirrored with the direction).
      x += point[0] * dragon.scale * dir;
      y += point[1] * dragon.scale;
    } else {
      // Spawn point: head is ahead of travel, tail is behind it.
      const dragonWidth = dragon.config.width ?? 150;
      const offset = attack.launchOffset ?? dragonWidth * 0.4;
      if (attack.launchFrom === 'head') x += dir * offset;
      else if (attack.launchFrom === 'tail') x -= dir * offset;
    }
    return { x, y, onScreen: x >= 0 && x <= this.layout().width };
  }

  launchProjectile(dragon) {
    const attack = dragon.config.attack;
    const dir = dragon.direction;
    const pattern = attack.pattern ?? 'ballistic';
    const { x: originX, y: originY, onScreen } = this.launchOrigin(dragon);
    // A shot that would start off the screen (its launch point moved past the edge while the attack
    // played) is lost, like one whose dragon left before the launch frame.
    if (!onScreen) return;

    let vx;
    let vy;
    if (pattern === 'zigzag') {
      // Falls straight down (gravity may add to vy); horizontal motion is the
      // weave applied in updateProjectile.
      vx = 0;
      vy = attack.speed;
    } else {
      const angle = (attack.angleDeg * Math.PI) / 180;
      vx = Math.sin(angle) * attack.speed * dir;
      vy = Math.cos(angle) * attack.speed;
    }

    const strip = dragon.art.shot;
    let view;
    if (strip) {
      view = new Sprite();
      const scale = attack.animation.scale ?? 1;
      view.scale.set(scale * dir, scale); // flying left mirrors the art
    } else if (dragon.art.shotTexture) {
      view = makeTexturedSprite(dragon.art.shotTexture, attack.radius * 2);
    } else {
      view = createProjectileGraphic(attack.radius, attack.color);
    }
    view.x = originX;
    view.y = originY;
    this.projectileLayer.addChild(view);

    const shot = {
      dragonIndex: dragon.index,
      view,
      strip, // the shot's animation strip (Róza's fireball, Anna's thorn), or null
      animation: attack.animation,
      dir,
      radius: attack.radius,
      x: originX,
      y: originY,
      baseX: originX,
      vx,
      vy,
      gravity: attack.gravity ?? 0,
      pattern,
      age: 0,
      fresh: true, // launched this tick: not moved until the next one
      zigzagAmplitude: attack.zigzagAmplitude ?? 50,
      zigzagFrequency: attack.zigzagFrequency ?? 8,
    };
    shot.airtime = this.airtime(shot);
    if (strip) orientStrip(shot);
    this.projectiles.push(shot);

    const fire = this.fire[dragon.index];
    fire.lastLaunchAt = this.time;
    fire.lastAirtime = shot.airtime;
    this.playEffect(this.sounds.shot[dragon.index]);
  }

  /** Plays a sound entry, each file at most once per tick (two beavers hit at once: one hit, one cry). The set is
   *  cleared at the top of update(), so a shot fired by a tap between ticks counts with the tick before it. */
  playEffect(entry) {
    if (!entry || this.playedThisTick.has(entry.src)) return;
    this.playedThisTick.add(entry.src);
    playSound(sound(entry.src), entry.volume);
  }

  /** Seconds the shot needs to leave the screen if it hits nothing: the same motion as
   *  updateProjectile, stepped at 60 fps (so it fits every pattern and screen size). */
  airtime(shot) {
    const { width, height } = this.layout();
    const probe = { ...shot };
    const dt = 1 / 60;
    let time = 0;
    while (time < MAX_SHOT_SECONDS && !isOffScreen(probe, width, height)) {
      probe.age += dt;
      moveShot(probe, dt);
      time += dt;
    }
    return time;
  }

  startNextFlight() {
    if (this.queueIndex >= this.flightQueue.length) {
      this.state = 'done';
      this.maybeFinish();
      return;
    }

    const size = this.layout();
    const dragonIndex = this.flightQueue[this.queueIndex];
    this.queueIndex += 1;

    const config = this.config.dragons[dragonIndex];
    const fromLeft = config.entryFrom !== 'right';
    const direction = fromLeft ? 1 : -1;
    const margin = (config.width ?? 150) * 0.75;

    const art = this.dragonArt[dragonIndex];
    let view;
    let scale = 1;
    if (art.fly) {
      view = new Sprite();
      showFrame(view, art.fly, config.animation.flyFrames?.[0] ?? 0);
      scale = (config.width ?? 150) / positive(config.animation.bodyWidth, art.fly.width);
      view.scale.set(scale * direction, scale); // the art faces right
    } else if (art.texture) {
      view = makeTexturedSprite(art.texture, config.width ?? 150, config.height ?? 96);
    } else {
      view = createDragonGraphic(config.width ?? 150, config.height ?? 96, config.color, direction);
    }

    this.currentDragon = {
      config,
      index: dragonIndex,
      view,
      direction,
      art,
      scale,
      age: 0, // seconds since the flight began
      flyTime: 0,
      attackTime: null, // seconds into the attack animation while it plays
      launched: false,
    };

    view.x = fromLeft ? -margin : size.width + margin;
    view.y = flightY(this.currentDragon, size);
    this.dragonLayer.addChild(view);

    this.state = 'flying';
    this.elapsedSinceFlight = 0;
    this.updateHud();
  }

  /** The ticker listener. A throw here would stop the ticker for good and freeze the game under
   *  the HUD (with `allowSkip: false` for good): an unexpected error ends the round as lost. */
  tick(ticker) {
    try {
      this.update(ticker);
    } catch (error) {
      console.error('Minigame error — ending the round.', error);
      this.fail();
    }
  }

  update(ticker) {
    this.playedThisTick.clear();
    // Paused while #rotate-hint covers the game (portrait phone, D13), so no flights
    // are lost. Reads app.screen, which Pixi updates a frame after a rotation, so no
    // tick ever runs on a stale portrait-sized screen.
    const screen = this.app.screen;
    if (this.finished || (this.touch && screen.height >= screen.width)) return;

    const dt = ticker.deltaMS / 1000;
    const size = this.layout();
    const { width, height } = size;
    this.time += dt;

    this.updateBeavers(dt, width, height);
    // The round can end in the middle of a tick (the last beaver ran off, a winning hit).
    // complete() has removed the shots and impacts then: touching them would throw, and a
    // throw in a ticker listener stops the ticker for good.
    if (this.finished) return;

    if (this.state === 'flying') {
      this.updateDragon(dt, size);
    } else if (this.state === 'gap') {
      this.elapsedSinceFlight += dt;
      if (this.elapsedSinceFlight * 1000 >= nonNegative(this.config.flightGapMs, 450)) {
        this.startNextFlight();
      }
    }

    for (const shot of this.projectiles.slice()) {
      this.updateProjectile(shot, dt, width, height);
      if (this.finished) return;
    }
    for (const impact of this.impacts.slice()) {
      impact.age += dt;
      impact.view.alpha = Math.max(0, 1 - impact.age / impact.duration);
      if (impact.age >= impact.duration) {
        impact.view.destroy();
        this.impacts.splice(this.impacts.indexOf(impact), 1);
      }
    }
  }

  updateBeavers(dt, width, height) {
    const cfg = this.config.beavers;
    const laneY = height * cfg.laneY;
    const margin = Math.max(cfg.radius * 2, cfg.spriteWidth ?? cfg.radius * 2.4);
    const walkers = () => this.beavers.filter((b) => b.state === 'walk').map((b) => b.x);

    for (const beaver of this.beavers) {
      switch (beaver.state) {
        case 'walk': {
          beaver.x += cfg.speed * cfg.direction * dt;
          // Off the far edge: re-enter behind the last walker, at least spacingPx back,
          // so beavers never stack, even on narrow screens or after a resize (D15).
          if (cfg.direction > 0 && beaver.x > width + margin) {
            beaver.x = Math.min(-margin, Math.min(...walkers()) - cfg.spacingPx);
          }
          if (cfg.direction < 0 && beaver.x < -margin) {
            beaver.x = Math.max(width + margin, Math.max(...walkers()) + cfg.spacingPx);
          }
          beaver.view.x = beaver.x;
          beaver.view.y = laneY + Math.sin(this.time * cfg.bobSpeed + beaver.phase) * cfg.bobAmplitude;
          this.stepAnimation(beaver, beaver.frames?.walk, cfg.walkFps, true, dt);
          break;
        }

        case 'hit': {
          beaver.view.x = beaver.x;
          beaver.view.y = laneY;
          const done = this.stepAnimation(beaver, beaver.frames?.hit, cfg.hitFps, false, dt);
          if (beaver.frameIndex > 0) this.landLog(beaver); // the falling-log frame is over
          beaver.hitTime += dt;
          if (done || !beaver.frames?.hit?.length || beaver.hitTime >= MAX_HIT_SECONDS) {
            this.setBeaverState(beaver, 'scurry');
            this.maybeFinish(); // a lost round waits for beavers in their hit
          }
          break;
        }

        case 'scurry': {
          beaver.x += beaver.scurryDir * cfg.scurrySpeed * dt;
          beaver.view.x = beaver.x;
          beaver.view.y = laneY;
          this.stepAnimation(beaver, beaver.frames?.scurry, cfg.scurryFps, true, dt);
          if (beaver.x < -margin || beaver.x > width + margin) {
            this.setBeaverState(beaver, 'gone');
            beaver.view.visible = false;
            this.maybeFinish();
          }
          break;
        }

        default:
          break; // 'gone' — nothing to do
      }
    }
  }

  /**
   * Advances a frame-by-frame animation on a beaver. Returns true on the tick a
   * non-looping animation reaches its final frame.
   */
  stepAnimation(beaver, frames, fps, loop, dt) {
    if (!frames || frames.length === 0) return false;
    // fps <= 0 (a typo) would never advance: a one-shot animation (the hit) counts as done at once, so
    // the beaver still runs off and the round can end.
    if (!(fps > 0)) return !loop;

    beaver.frameTimer += dt;
    const frameDuration = 1 / fps;
    // Every whole frame due this tick at once: a huge fps (a typo) must not spin a loop.
    const steps = Math.floor(beaver.frameTimer / frameDuration);
    beaver.frameTimer -= steps * frameDuration;
    let completed = false;
    if (loop) {
      beaver.frameIndex = (beaver.frameIndex + steps) % frames.length;
    } else if (beaver.frameIndex + steps >= frames.length) {
      beaver.frameIndex = frames.length - 1;
      completed = true;
    } else {
      beaver.frameIndex += steps;
    }

    beaver.view.texture = frames[beaver.frameIndex];
    return completed;
  }

  setBeaverState(beaver, state) {
    beaver.state = state;
    beaver.frameIndex = 0;
    beaver.frameTimer = 0;

    const frames = beaver.frames;
    if (frames) {
      const firstFrame = frames[state]?.[0];
      if (firstFrame) beaver.view.texture = firstFrame;
    }

    if (state === 'scurry') {
      this.landLog(beaver); // no hit frames, or one: the log lands as the beaver runs
      beaver.scurryDir = this.computeScurryDir(beaver);
      if (this.config.beavers.flipForScurry) {
        beaver.view.scale.x = Math.abs(beaver.view.scale.x) * beaver.scurryDir;
      }
    }
  }

  computeScurryDir(beaver) {
    const cfg = this.config.beavers;
    switch (cfg.scurryDirection) {
      case 'left':
        return -1;
      case 'right':
        return 1;
      case 'nearestEdge':
        return beaver.x < this.layout().width / 2 ? -1 : 1;
      case 'walk':
      default:
        return cfg.direction;
    }
  }

  /** The log decided at the hit (`dropsLog`) lands: the lying log and its sound, once per beaver. */
  landLog(beaver) {
    if (!beaver.dropsLog) return; // decided at the hit: dropLogOnHit and a log frame
    beaver.dropsLog = false;
    this.dropLog(beaver);
    this.playEffect(this.sounds.log);
  }

  /** Leaves the "log" frame where the beaver was hit. */
  dropLog(beaver) {
    const frames = beaver.frames;
    const log = new Sprite(frames.log[0]);
    log.anchor.set(0.5);
    log.scale.set(frames.displayScale);
    log.x = beaver.x;
    log.y = this.layout().height * this.config.beavers.laneY;
    this.logLayer.addChild(log);
  }

  updateDragon(dt, size) {
    const dragon = this.currentDragon;
    dragon.age += dt;
    dragon.view.x += dragon.config.speed * dragon.direction * dt;
    dragon.view.y = flightY(dragon, size);
    this.animateDragon(dragon, dt);

    // Leaving before the attack's launch frame loses that shot.
    const margin = (dragon.config.width ?? 150);
    // Or after MAX_FLIGHT_SECONDS: a speed typo (0, negative, text) would never reach the edge.
    const exited = dragon.age >= MAX_FLIGHT_SECONDS
      || (dragon.direction > 0 ? dragon.view.x > size.width + margin : dragon.view.x < -margin);

    if (exited) {
      dragon.view.destroy();
      this.currentDragon = null;
      this.state = 'gap';
      this.elapsedSinceFlight = 0;
    }
  }

  /** Flaps the wings, or plays the attack and launches its shot on the launch frame. Time only
   *  moves in tick(), so the portrait pause also pauses an attack. */
  animateDragon(dragon, dt) {
    const { fly, breath } = dragon.art;
    if (!fly) return;
    const animation = dragon.config.animation;

    if (dragon.attackTime !== null) {
      dragon.attackTime += dt;
      const frames = animation.attackFrames ?? [];
      const step = Math.floor(dragon.attackTime * positive(animation.attackFps, 24));
      if (step < frames.length) {
        showFrame(dragon.view, breath, frames[step]);
        // >= : a long tick can skip the launch frame.
        if (!dragon.launched && step >= Math.max(0, frames.indexOf(animation.launchFrame))) {
          dragon.launched = true;
          this.launchProjectile(dragon);
        }
        return;
      }
      if (!dragon.launched) {
        dragon.launched = true;
        this.launchProjectile(dragon);
      }
      endAttack(dragon);
      return;
    }
    dragon.flyTime += dt;
    const frames = animation.flyFrames ?? [0];
    showFrame(dragon.view, fly, frames[Math.floor(dragon.flyTime * positive(animation.flyFps, 12)) % frames.length]);
  }

  updateProjectile(shot, dt, width, height) {
    if (shot.fresh) { // first drawn where it leaves, not a tick's flight past it
      shot.fresh = false;
      return;
    }
    shot.age += dt;
    moveShot(shot, dt);
    shot.view.x = shot.x;
    shot.view.y = shot.y;
    if (shot.strip) orientStrip(shot);

    // Collision against living beavers, but only ones on the screen (a beaver past the edge,
    // waiting to walk back in, can't be hit unseen).
    const cfg = this.config.beavers;
    const half = (cfg.spriteWidth ?? cfg.radius * 2.4) / 2;
    for (const beaver of this.beavers) {
      if (!beaver.alive || beaver.x < -half || beaver.x > width + half) continue;
      const dx = beaver.x - shot.x;
      const dy = beaver.view.y - shot.y;
      const reach = shot.radius + cfg.radius;
      if (dx * dx + dy * dy <= reach * reach) {
        this.playEffect(this.sounds.hit[shot.dragonIndex]);
        // Before the hit is scored: a winning hit ends the round, and complete() must find it.
        this.addImpact(shot, beaver);
        this.eliminateBeaver(beaver);
        this.removeShot(shot);
        return;
      }
    }

    // Off-screen -> the shot is spent. So is one flying longer than any real shot could (a config
    // typo can make its position NaN, and the round only ends once every shot has resolved).
    if (isOffScreen(shot, width, height) || shot.age >= MAX_SHOT_SECONDS) this.removeShot(shot);
  }

  /** The shot strip's impact frame (Róza's dissipating flame) where it touched the beaver; fades out in tick(). */
  addImpact(shot, beaver) {
    const animation = shot.animation;
    if (!shot.strip || animation.impactFrame == null) return;

    const view = new Sprite();
    showFrame(view, shot.strip, animation.impactFrame);
    view.scale.copyFrom(shot.view.scale);
    // On the line between the centres, at the edge of the shot's collision circle.
    const share = shot.radius / (shot.radius + this.config.beavers.radius);
    view.position.set(shot.x + (beaver.x - shot.x) * share, shot.y + (beaver.view.y - shot.y) * share);
    this.projectileLayer.addChild(view);
    this.impacts.push({ view, age: 0, duration: positive(animation.impactMs, 300) / 1000 });
  }

  eliminateBeaver(beaver) {
    if (!beaver.alive) return;

    // The beaver is "eliminated" for scoring/win purposes the moment it is hit,
    // but it visually reels and scurries off-screen before it is fully gone.
    beaver.alive = false;
    this.score += this.config.score.perHit;
    this.updateHud();

    const canAnimate = beaver.frames && (beaver.frames.hit?.length || beaver.frames.scurry?.length);
    this.playEffect(this.sounds.cry);
    if (canAnimate) {
      // Decided now, dropped when the falling-log frame ends or the beaver starts to run (landLog): the lying log
      // and its sound at the landing (D31).
      beaver.dropsLog = Boolean(this.config.beavers.dropLogOnHit && beaver.frames.log?.length);
      beaver.hitTime = 0;
      this.setBeaverState(beaver, beaver.frames.hit?.length ? 'hit' : 'scurry');
    } else {
      beaver.view.visible = false;
      this.setBeaverState(beaver, 'gone');
    }

    this.maybeFinish();
  }

  removeShot(shot) {
    const index = this.projectiles.indexOf(shot);
    if (index === -1) return; // already cleared by complete()
    this.projectiles.splice(index, 1);
    shot.view.destroy();
    this.maybeFinish();
  }

  /**
   * Settles the round once it is decided:
   *  - Victory only after every struck beaver has fully scurried off-screen, so
   *    the flee animation always plays out before the result screen.
   *  - Failure once the flights run out, every shot has resolved, no beaver is
   *    still in its hit (its log lands first), and at least one beaver was never hit.
   */
  maybeFinish() {
    if (this.finished) return;

    if (this.beavers.every((b) => b.state === 'gone')) {
      this.win();
      return;
    }

    const allHit = this.beavers.every((b) => !b.alive);
    const inHit = this.beavers.some((b) => b.state === 'hit');
    if (this.state === 'done' && this.projectiles.length === 0 && !allHit && !inHit) {
      this.fail();
    }
  }

  // ------------------------------------------------------------- outcomes ---

  win() {
    if (this.finished) return;
    const remainingFlights = Math.max(0, this.flightQueue.length - this.queueIndex);
    this.score += this.config.score.winBonus;
    this.score += remainingFlights * this.config.score.remainingFlightBonus;
    this.updateHud();
    this.complete('victory');
  }

  fail() {
    this.complete('failure');
  }

  complete(outcome) {
    if (this.finished) return;
    this.finished = true;
    this.app.ticker.remove(this.tick);
    keepAudioAwake(false);
    this.unbindInput();
    // Nothing may hang frozen under the result dialog: shots, impacts, a half-played attack.
    // tick()'s loops run over copies of these arrays, so they stop on `finished`, not on emptiness.
    for (const item of [...this.projectiles, ...this.impacts]) item.view.destroy();
    this.projectiles = [];
    this.impacts = [];
    if (this.currentDragon && this.currentDragon.attackTime !== null) endAttack(this.currentDragon);
    this.onComplete(outcome, { score: this.score });
  }

  // ----------------------------------------------------------------- hud ---

  updateHud() {
    this.hud.setScore(this.score);

    const total = this.beavers.length;
    const alive = this.beavers.filter((b) => b.alive).length;
    const flight = Math.min(this.queueIndex, this.flightQueue.length);
    const dragonName = this.currentDragon?.config.name ?? '—';

    const status = this.config.labels.status
      .replace('{alive}', String(alive))
      .replace('{total}', String(total))
      .replace('{flight}', String(flight))
      .replace('{flights}', String(this.flightQueue.length))
      .replace('{dragon}', dragonName);

    this.hud.setStatus(status);
  }

  // ------------------------------------------------------------- cleanup ---

  destroy() {
    keepAudioAwake(false); // first: nothing below may keep the audio from sleeping for the rest of the page
    this.finished = true;
    this.app.ticker.remove(this.tick);
    this.unbindInput();
    this.root.destroy({ children: true });
  }
}

// ============================================================ helpers =======

function mergeConfig(defaults, override) {
  // Arrays are replaced wholesale (so a custom `dragons` list fully overrides
  // the defaults); plain objects are merged deeply.
  if (Array.isArray(defaults)) {
    return Array.isArray(override) ? override.map((item) => item) : defaults;
  }
  if (isPlainObject(defaults) && isPlainObject(override)) {
    const result = { ...defaults };
    for (const key of Object.keys(override)) {
      result[key] = mergeConfig(defaults[key], override[key]);
    }
    return result;
  }
  return override === undefined ? defaults : override;
}

/** Dragon y in game px: `flightY` of the height, but never behind the HUD top bar (D15).
 *  Animated art keeps its real extent above the eye (the attack strip's included) below it. */
function flightY(dragon, size) {
  const { fly, breath } = dragon.art;
  const above = fly
    ? Math.max(...[fly, breath].filter(Boolean).map((strip) => strip.anchor[1] * strip.height * dragon.scale))
    : (dragon.config.height ?? 96) / 2;
  return Math.max(size.height * dragon.config.flightY, size.top + above);
}

/** A dragon's art: a single image, animation strips, its shot's image or strip. Each piece is
 *  optional and falls back on its own; the attack strip needs the fly strip (its anchor). */
async function loadDragonArt(dragon) {
  const [texture, shotTexture, fly, breath, shot] = await Promise.all([
    tryLoadTexture(dragon.sprite),
    tryLoadTexture(dragon.attack?.sprite),
    loadStrip(dragon.animation?.fly),
    loadStrip(dragon.animation?.attack), // `breath` below: `attack` alone means the shot elsewhere
    loadStrip(dragon.attack?.animation),
  ]);
  return { texture, shotTexture, fly, breath: fly ? breath : null, shot };
}

/** A one-row strip of `frames` equal frames, or null. */
async function loadStrip(spec) {
  const base = await tryLoadTexture(spec?.src);
  if (!base) return null;
  // At least 1 px per frame, so a typo (2e6) can't allocate millions of textures.
  const count = Math.min(base.width, Math.max(1, Math.floor(spec.frames) || 1));
  const width = base.width / count;
  return {
    frames: Array.from({ length: count }, (_, index) => new Texture({
      source: base.source,
      frame: new Rectangle(index * width, 0, width, base.height),
    })),
    // Two finite fractions, or the centre (a typo would make every position NaN).
    anchor: Array.isArray(spec.anchor) && spec.anchor.length === 2 && spec.anchor.every(Number.isFinite)
      ? spec.anchor
      : [0.5, 0.5],
    width,
    height: base.height,
  };
}

/** Shows a strip's frame. Sets the anchor too: Pixi's texture setter ignores the texture's
 *  own anchor, and the strips' anchors differ, so the eye would jump on every switch. */
function showFrame(view, strip, index) {
  // Integers only: a config typo like "length" must not reach the texture setter (it would throw
  // in the ticker and freeze the game).
  view.texture = (Number.isInteger(index) && strip.frames[index]) || strip.frames[0];
  view.anchor.set(strip.anchor[0], strip.anchor[1]);
}

/** A positive number from the config, or the fallback (a typo like 0, -5 or "three" would stop an
 *  animation or a cap for good). */
function positive(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function nonNegative(value, fallback) {
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

/** Seconds from a tap to the launch frame of the dragon's attack animation. */
function secondsToFire(dragon) {
  const animation = dragon.config.animation;
  return Math.max(0, (animation.attackFrames ?? []).indexOf(animation.launchFrame)) / positive(animation.attackFps, 24);
}

/** The fraction of the last shot's airtime to wait before the next one; not a number ("1/3" typed as
 *  text) counts as 0. */
function refireAfter(attack) {
  return Number.isFinite(attack.refireAfter) ? attack.refireAfter : 0;
}

/** Back to flapping from the cycle's first frame (Róza: wings up, like her attack frames; Anna: the tail as the
 *  flick ends). */
function endAttack(dragon) {
  dragon.attackTime = null;
  dragon.flyTime = 0;
  showFrame(dragon.view, dragon.art.fly, dragon.config.animation.flyFrames?.[0] ?? 0);
}

function moveShot(shot, dt) {
  shot.vy += shot.gravity * dt;
  if (shot.pattern === 'zigzag') {
    shot.baseX += shot.vx * dt; // vx is 0 by default, so the column stays put
    shot.y += shot.vy * dt;
    shot.x = shot.baseX + Math.sin(shot.age * shot.zigzagFrequency) * shot.zigzagAmplitude;
  } else {
    shot.x += shot.vx * dt;
    shot.y += shot.vy * dt;
  }
}

/** Gone only once all of it has left the screen (a strip shot's whole tail, in any rotation). */
function isOffScreen(shot, width, height) {
  let reach = 50;
  if (shot.strip) {
    const [ax, ay] = shot.strip.anchor;
    reach = Math.hypot(Math.max(ax, 1 - ax) * shot.strip.width, Math.max(ay, 1 - ay) * shot.strip.height)
      * Math.abs(shot.view.scale.y);
  }
  // A zigzag shot swings back: judge its column, widened by the swing, not where the weave has it now.
  const zigzag = shot.pattern === 'zigzag';
  const x = zigzag ? shot.baseX : shot.x;
  const side = reach + (zigzag ? shot.zigzagAmplitude : 0);
  return x < -side || x > width + side || shot.y > height + reach;
}

/** A strip shot's frame for its age (the last flight frame held, or with `loop` the frames repeated) and its
 *  rotation along its path. */
function orientStrip(shot) {
  const animation = shot.animation;
  const frames = animation.flightFrames ?? [0];
  const step = Math.floor(shot.age * positive(animation.fps, 14));
  showFrame(shot.view, shot.strip, frames[animation.loop === true ? step % frames.length : Math.min(step, frames.length - 1)]);
  const art = ((animation.artAngleDeg ?? 0) * Math.PI) / 180;
  // Mirrored (flying left), the art points the other way: 180° − its angle.
  shot.view.rotation = Math.atan2(shot.vy, shot.vx) - (shot.dir > 0 ? art : Math.PI - art);
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** A sound from the config as { src, volume }, or null: `{ src, volume }`, a bare path or null (none). Left out
 *  means silent; anything without a path warns (a typo). The volume is clamped to 0–1, else EFFECT_MIX. */
function soundEntry(entry, name) {
  if (entry === undefined || entry === null) return null;
  const src = typeof entry === 'string' ? entry : isPlainObject(entry) ? entry.src : undefined;
  if (typeof src !== 'string') {
    console.warn('Minigame sound without a path:', name);
    return null;
  }
  const volume = Number.isFinite(entry.volume) ? Math.min(1, Math.max(0, entry.volume)) : EFFECT_MIX;
  return { src, volume };
}

async function tryLoadTexture(src) {
  if (!src) return null;
  try {
    return await Assets.load(resolveAssetPath(src));
  } catch (error) {
    console.warn(`Minigame sprite failed to load: ${src}`, error);
    return null;
  }
}

function makeTexturedSprite(texture, targetWidth, targetHeight) {
  const sprite = new Sprite(texture);
  sprite.anchor.set(0.5);
  const scaleX = targetWidth / texture.width;
  const scaleY = targetHeight ? targetHeight / texture.height : scaleX;
  sprite.scale.set(scaleX, scaleY);
  return sprite;
}

function createBeaverGraphic(radius, color) {
  const g = new Graphics();
  const fill = parseHexColor(color);
  // Body
  g.ellipse(0, 0, radius, radius * 0.9).fill({ color: fill });
  // Belly
  g.ellipse(0, radius * 0.2, radius * 0.55, radius * 0.5).fill({ color: 0xf0d9b5, alpha: 0.9 });
  // Ears
  g.circle(-radius * 0.55, -radius * 0.6, radius * 0.22).fill({ color: fill });
  g.circle(radius * 0.55, -radius * 0.6, radius * 0.22).fill({ color: fill });
  // Eyes
  g.circle(-radius * 0.25, -radius * 0.2, radius * 0.1).fill({ color: 0x2a1c12 });
  g.circle(radius * 0.25, -radius * 0.2, radius * 0.1).fill({ color: 0x2a1c12 });
  // Teeth
  g.rect(-radius * 0.12, radius * 0.25, radius * 0.24, radius * 0.28).fill({ color: 0xfff8e8 });
  return g;
}

function createDragonGraphic(width, height, color, direction) {
  const g = new Graphics();
  const fill = parseHexColor(color);
  const w = width / 2;
  const h = height / 2;
  // Body
  g.ellipse(0, 0, w * 0.6, h * 0.55).fill({ color: fill });
  // Wings
  g.moveTo(0, -h * 0.1)
    .lineTo(-w * 0.5, -h)
    .lineTo(-w * 0.1, -h * 0.2)
    .closePath()
    .fill({ color: fill, alpha: 0.85 });
  g.moveTo(0, -h * 0.1)
    .lineTo(w * 0.5, -h)
    .lineTo(w * 0.1, -h * 0.2)
    .closePath()
    .fill({ color: fill, alpha: 0.85 });
  // Head + tail along travel direction
  g.ellipse(direction * w * 0.7, -h * 0.1, w * 0.28, h * 0.32).fill({ color: fill });
  g.moveTo(-direction * w * 0.6, 0)
    .lineTo(-direction * w, h * 0.3)
    .lineTo(-direction * w * 0.55, h * 0.18)
    .closePath()
    .fill({ color: fill });
  // Eye
  g.circle(direction * w * 0.78, -h * 0.18, h * 0.08).fill({ color: 0x121212 });
  return g;
}

function createProjectileGraphic(radius, color) {
  const g = new Graphics();
  const fill = parseHexColor(color);
  g.circle(0, 0, radius * 1.4).fill({ color: fill, alpha: 0.25 });
  g.circle(0, 0, radius).fill({ color: fill });
  g.circle(0, 0, radius * 0.5).fill({ color: 0xffffff, alpha: 0.8 });
  return g;
}

function parseHexColor(value) {
  if (typeof value === 'number') return value;
  return Number.parseInt(String(value).replace('#', ''), 16);
}
