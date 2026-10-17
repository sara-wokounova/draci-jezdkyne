import { Assets, Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js';

/**
 * Dragon attack minigame.
 *
 * Three dragons fly, one after another, above a line of moving beavers. Each
 * flight the player gets exactly one attack, triggered by a key press, mouse
 * click or screen touch. Each dragon has its own attack (launch angle, speed
 * and gravity), and each dragon flies a configurable number of flights.
 *
 * Win: every beaver has been hit.
 * Lose: all flights are used up and beavers remain.
 *
 * Every number is configurable via the `config` object (see {@link DEFAULTS}).
 * Anything you omit falls back to the default. Sprites are optional: if a
 * sprite path is missing the entity is drawn with a simple vector placeholder,
 * so the minigame is fully playable before the art is dropped in.
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
    // where `{n}` is replaced with 1..count (beaver1.png … beaver7.png). The
    // sheet is a `columns` x `rows` grid; the frame index lists below pick which
    // cells belong to each animation (0-based, left-to-right, top-to-bottom):
    //   walk   — looping walk cycle (top row)
    //   hit    — played once when struck
    //   log    — a single static "log on the ground" frame, dropped on hit
    //   scurry — looping run played while fleeing off-screen
    sheetPattern: 'assets/minigames/dragon-attack/beaver{n}.png',
    sheet: {
      columns: 6,
      rows: 2,
      walk: [0, 1, 2, 3, 4, 5],
      hit: [6, 7],
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
    dropLogOnHit: true, // leave the "log" frame where the beaver was hit
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
  //            to the dragon's travel direction.
  //   angleDeg: 0 = straight down; positive bends toward travel direction;
  //            values > 90 launch upward first (for arcing shots).
  dragons: [
    {
      // Róza: a fast, direct flame that travels slightly ahead of her and dips.
      name: 'Róza',
      color: '#d6462f',
      sprite: 'assets/minigames/dragon-attack/dragon_roza.png',
      width: 150,
      height: 96,
      flightY: 0.16, // fraction of screen height
      speed: 320, // horizontal flight speed in px/second
      entryFrom: 'left', // 'left' or 'right'
      attack: {
        pattern: 'ballistic',
        launchFrom: 'head',
        speed: 720, // launch speed in px/second
        angleDeg: 16, // slightly ahead, mostly forward and a touch down
        gravity: 140, // gentle dip
        radius: 22,
        color: '#ff7b3d',
        sprite: 'assets/minigames/dragon-attack/flame_roza.png',
      },
    },
    {
      // Emma: a flash that drops straight down while zig-zagging side to side.
      name: 'Emma',
      color: '#e0a33a',
      sprite: 'assets/minigames/dragon-attack/dragon_emma.png',
      width: 150,
      height: 96,
      flightY: 0.26,
      speed: 380,
      entryFrom: 'right',
      attack: {
        pattern: 'zigzag',
        launchFrom: 'center',
        speed: 380, // downward descent speed
        gravity: 0, // constant fall so the zig-zag stays even
        zigzagAmplitude: 70, // sideways reach in px
        zigzagFrequency: 9, // weave speed (radians/second)
        radius: 24,
        color: '#ffe27a',
        sprite: 'assets/minigames/dragon-attack/flash_emma.png',
      },
    },
    {
      // Anna: fires an arrow from her tail that arcs up-and-back, then down.
      name: 'Anna',
      color: '#3aa0e0',
      sprite: 'assets/minigames/dragon-attack/dragon_anna.png',
      width: 150,
      height: 96,
      flightY: 0.21,
      speed: 300,
      entryFrom: 'left',
      attack: {
        pattern: 'ballistic',
        launchFrom: 'tail',
        speed: 430,
        angleDeg: -120, // launches backward and upward → gravity arcs it down
        gravity: 760, // heavy pull for a pronounced arc
        radius: 16,
        color: '#5ad0ff',
        sprite: 'assets/minigames/dragon-attack/arrow_anna.png',
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
    this.projectile = { active: false };
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

    await this.loadBackground();
    await this.loadDragonTextures();
    await this.spawnBeavers();
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
    const scale = Math.min(1, height / this.config.designHeight);
    const size = { width: width / scale, height: height / scale, top: this.hud.coveredTop() / scale };
    this.root.scale.set(scale);
    if (this.background) {
      const { texture } = this.background;
      this.background.scale.set(Math.max(size.width / texture.width, size.height / texture.height));
      this.background.position.set(size.width / 2, size.height / 2);
    }
    return size;
  }

  async loadBackground() {
    const src = this.config.background?.sprite;
    if (!src) return;

    try {
      const texture = await Assets.load(resolveAssetPath(src));
      const sprite = new Sprite(texture);
      sprite.anchor.set(0.5);
      this.background = sprite;
      this.root.addChildAt(sprite, 0);
      this.layout();
    } catch (error) {
      console.warn('Minigame background failed to load — skipping.', error);
    }
  }

  async loadDragonTextures() {
    this.dragonTextures = await Promise.all(
      this.config.dragons.map((dragon) => tryLoadTexture(dragon.sprite)),
    );
    this.attackTextures = await Promise.all(
      this.config.dragons.map((dragon) => tryLoadTexture(dragon.attack?.sprite)),
    );
  }

  async spawnBeavers() {
    const cfg = this.config.beavers;
    const { width } = this.layout();
    const singleTexture = await tryLoadTexture(cfg.sprite);

    for (let index = 0; index < cfg.count; index += 1) {
      const frames = await this.loadBeaverFrames(cfg, index);

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

      this.beaverLayer.addChild(view);
      this.beavers.push(beaver);
    }
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

    return {
      walk: (cfg.sheet.walk ?? []).map(frameAt),
      hit: (cfg.sheet.hit ?? []).map(frameAt),
      log: (cfg.sheet.log ?? []).map(frameAt),
      scurry: (cfg.sheet.scurry ?? []).map(frameAt),
      frameWidth,
      frameHeight,
      displayScale: targetWidth / frameWidth,
    };
  }

  buildFlightQueue() {
    const dragonCount = this.config.dragons.length;
    const perDragon = this.config.flightsPerDragon;
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
    }
  }

  unbindInput() {
    window.removeEventListener('keydown', this.handleKey);
    this.app.canvas.removeEventListener('pointerdown', this.handlePointer);
  }

  handleKey(event) {
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

  attack() {
    if (this.finished) return;
    if (this.state !== 'flying' || !this.currentDragon) return;
    if (this.currentDragon.hasAttacked) return;
    if (this.projectile.active) return; // a previous shot is still in flight

    this.currentDragon.hasAttacked = true;
    this.launchProjectile(this.currentDragon);
  }

  launchProjectile(dragon) {
    const attack = dragon.config.attack;
    const dir = dragon.direction;
    const pattern = attack.pattern ?? 'ballistic';

    // Spawn point: head is ahead of travel, tail is behind it.
    const dragonWidth = dragon.config.width ?? 150;
    const offset = attack.launchOffset ?? dragonWidth * 0.4;
    let originX = dragon.view.x;
    if (attack.launchFrom === 'head') originX += dir * offset;
    else if (attack.launchFrom === 'tail') originX -= dir * offset;
    const originY = dragon.view.y;

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

    const view = dragon.attackTexture
      ? makeTexturedSprite(dragon.attackTexture, attack.radius * 2)
      : createProjectileGraphic(attack.radius, attack.color);
    view.x = originX;
    view.y = originY;
    this.projectileLayer.addChild(view);

    this.projectile = {
      active: true,
      view,
      radius: attack.radius,
      x: originX,
      y: originY,
      baseX: originX,
      vx,
      vy,
      gravity: attack.gravity ?? 0,
      pattern,
      age: 0,
      zigzagAmplitude: attack.zigzagAmplitude ?? 50,
      zigzagFrequency: attack.zigzagFrequency ?? 8,
    };
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

    const texture = this.dragonTextures?.[dragonIndex];
    const view = texture
      ? makeTexturedSprite(texture, config.width ?? 150, config.height ?? 96)
      : createDragonGraphic(config.width ?? 150, config.height ?? 96, config.color, direction);

    view.x = fromLeft ? -margin : size.width + margin;
    view.y = flightY(config, size);

    this.dragonLayer.addChild(view);

    this.currentDragon = {
      config,
      index: dragonIndex,
      view,
      direction,
      hasAttacked: false,
      attackTexture: this.attackTextures?.[dragonIndex] ?? null,
    };

    this.state = 'flying';
    this.elapsedSinceFlight = 0;
    this.updateHud();
  }

  tick(ticker) {
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

    if (this.state === 'flying') {
      this.updateDragon(dt, size);
    } else if (this.state === 'gap') {
      this.elapsedSinceFlight += dt;
      if (this.elapsedSinceFlight * 1000 >= this.config.flightGapMs) {
        this.startNextFlight();
      }
    }

    if (this.projectile.active) this.updateProjectile(dt, width, height);
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
          if (done || !beaver.frames?.hit?.length) this.setBeaverState(beaver, 'scurry');
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

    beaver.frameTimer += dt;
    const frameDuration = 1 / fps;
    let completed = false;

    while (beaver.frameTimer >= frameDuration) {
      beaver.frameTimer -= frameDuration;
      beaver.frameIndex += 1;
      if (beaver.frameIndex >= frames.length) {
        if (loop) {
          beaver.frameIndex = 0;
        } else {
          beaver.frameIndex = frames.length - 1;
          completed = true;
          break;
        }
      }
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

  dropLog(beaver) {
    const frames = beaver.frames;
    if (!frames?.log?.length) return;

    const log = new Sprite(frames.log[0]);
    log.anchor.set(0.5);
    log.scale.set(frames.displayScale);
    log.x = beaver.x;
    log.y = this.layout().height * this.config.beavers.laneY;
    this.logLayer.addChild(log);
  }

  updateDragon(dt, size) {
    const dragon = this.currentDragon;
    dragon.view.x += dragon.config.speed * dragon.direction * dt;
    dragon.view.y = flightY(dragon.config, size);

    const margin = (dragon.config.width ?? 150);
    const exited =
      dragon.direction > 0 ? dragon.view.x > size.width + margin : dragon.view.x < -margin;

    if (exited) {
      dragon.view.destroy();
      this.currentDragon = null;
      this.state = 'gap';
      this.elapsedSinceFlight = 0;
    }
  }

  updateProjectile(dt, width, height) {
    const p = this.projectile;
    p.age += dt;
    p.vy += p.gravity * dt;

    if (p.pattern === 'zigzag') {
      p.baseX += p.vx * dt; // vx is 0 by default, so the column stays put
      p.y += p.vy * dt;
      p.x = p.baseX + Math.sin(p.age * p.zigzagFrequency) * p.zigzagAmplitude;
    } else {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }

    p.view.x = p.x;
    p.view.y = p.y;

    // Collision against living beavers.
    for (const beaver of this.beavers) {
      if (!beaver.alive) continue;
      const dx = beaver.x - p.x;
      const dy = beaver.view.y - p.y;
      const reach = p.radius + this.config.beavers.radius;
      if (dx * dx + dy * dy <= reach * reach) {
        this.eliminateBeaver(beaver);
        this.deactivateProjectile();
        return;
      }
    }

    // Off-screen -> the shot is spent.
    const off = p.x < -50 || p.x > width + 50 || p.y > height + 50;
    if (off) this.deactivateProjectile();
  }

  eliminateBeaver(beaver) {
    if (!beaver.alive) return;

    // The beaver is "eliminated" for scoring/win purposes the moment it is hit,
    // but it visually reels and scurries off-screen before it is fully gone.
    beaver.alive = false;
    this.score += this.config.score.perHit;
    this.updateHud();

    const canAnimate = beaver.frames && (beaver.frames.hit?.length || beaver.frames.scurry?.length);
    if (canAnimate) {
      if (this.config.beavers.dropLogOnHit) this.dropLog(beaver);
      this.setBeaverState(beaver, beaver.frames.hit?.length ? 'hit' : 'scurry');
    } else {
      beaver.view.visible = false;
      this.setBeaverState(beaver, 'gone');
    }

    this.maybeFinish();
  }

  deactivateProjectile() {
    this.projectile.view?.destroy();
    this.projectile = { active: false };
    this.maybeFinish();
  }

  /**
   * Settles the round once it is decided:
   *  - Victory only after every struck beaver has fully scurried off-screen, so
   *    the flee animation always plays out before the result screen.
   *  - Failure once the flights run out, the last shot has resolved, and at
   *    least one beaver was never hit.
   */
  maybeFinish() {
    if (this.finished) return;

    if (this.beavers.every((b) => b.state === 'gone')) {
      this.win();
      return;
    }

    const allHit = this.beavers.every((b) => !b.alive);
    if (this.state === 'done' && !this.projectile.active && !allHit) {
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
    this.unbindInput();
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

/** Dragon y in game px: `flightY` of the height, but never behind the HUD top bar (D15). */
function flightY(dragon, size) {
  return Math.max(size.height * dragon.flightY, size.top + (dragon.height ?? 96) / 2);
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
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

function resolveAssetPath(path) {
  if (/^(https?:)?\/\//.test(path)) return path;
  const base = import.meta.env.BASE_URL ?? './';
  const cleanBase = base.endsWith('/') ? base : `${base}/`;
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  return `${cleanBase}${cleanPath}`;
}






