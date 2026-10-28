import { Assets, Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import { AtmosphereEffects } from './effects/atmosphereEffects.js';

export class VisualRenderer {
  constructor(stage, story) {
    this.stage = stage;
    this.story = story;
    this.effects = new AtmosphereEffects(stage.app, stage.layers.effects, stage.layers.overlay);
  }

  /**
   * Preloads only the assets needed for the given scene and the next few
   * reachable scenes (following `next` and `choices`). This keeps the upcoming
   * "pages" warm in the PixiJS Assets cache without loading the whole story.
   *
   * @param {object} scene The scene to start the lookahead from.
   * @param {number} [lookahead=3] How many scenes ahead to walk.
   */
  async preloadFrom(scene, lookahead = 3) {
    if (!scene) return;

    const scenes = collectReachableScenes(this.story, scene, lookahead);
    const paths = collectAssetPathsForScenes(this.story, scenes);

    if (paths.length === 0) return;

    await Assets.load(paths);
  }

  async render(scene) {
    // A newer render (next scene, resize, phone going fullscreen) makes this one stale:
    // after every await, a stale render stops instead of adding its sprites (D17).
    const token = (this.renderToken = (this.renderToken ?? 0) + 1);

    clear(this.stage.layers.background);
    clear(this.stage.layers.characters);
    clear(this.stage.layers.overlay);
    this.effects.stop();

    await this.drawBackground(scene.background, token);
    await this.drawCharacters(scene.characters ?? [], token);
    if (token === this.renderToken) this.effects.start(scene.effects ?? []);
  }

  async drawBackground(background, token) {
    const { width, height } = this.stage.app.screen;

    const imageSource = background?.src ?? (background?.type === 'image' ? background?.preset : null);

    if (background?.type === 'image' && imageSource) {
      // A failed load (404, server gone, offline) gets a generated background like a missing
      // character gets a placeholder (D7), instead of rejecting and losing the whole scene.
      const texture = await Assets.load(resolveAssetPath(imageSource)).catch((error) => {
        console.warn(`Could not load background "${imageSource}". Falling back to a generated one.`, error);
      });
      if (token !== this.renderToken) return;

      if (texture) {
        const sprite = new Sprite(texture);

        contain(sprite, width, height);

        this.stage.layers.background.addChild(sprite);
        return;
      }
    }

    const texture = createBackgroundTexture(width, height, background?.preset ?? 'sunset_forest');
    const sprite = new Sprite(texture);

    sprite.width = width;
    sprite.height = height;

    this.stage.layers.background.addChild(sprite);
  }

  async drawCharacters(sceneCharacters, token) {
    const { width, height } = this.stage.app.screen;

    for (const entry of sceneCharacters) {
      const character = this.story.characters[entry.id];
      const avatar = await createCharacterSprite(character, entry.pose ?? 'neutral');
      if (token !== this.renderToken) return;
      const target = positionFor(entry.position, width, height);

      avatar.x = target.x;
      avatar.y = target.y;
      avatar.alpha = entry.alpha ?? 1;

      scaleCharacter(avatar, width, height, target);

      this.stage.layers.characters.addChild(avatar);
    }
  }
}

function clear(container) {
  container.removeChildren().forEach((child) => child.destroy({ children: true }));
}

async function createCharacterSprite(character = {}, pose = 'neutral') {
  const source = character.sprites?.[pose] ?? character.sprites?.neutral;

  if (!source) {
    return createPlaceholderCharacter(character, pose);
  }

  try {
    const texture = await Assets.load(resolveAssetPath(source));
    const sprite = new Sprite(texture);

    sprite.anchor.set(0.5, 1);

    return sprite;
  } catch (error) {
    console.warn(`Could not load sprite "${source}". Falling back to placeholder.`, error);
    return createPlaceholderCharacter(character, pose);
  }
}

function collectReachableScenes(story, startScene, lookahead) {
  const collected = new Map([[startScene.id, startScene]]);
  let frontier = [startScene];

  for (let depth = 0; depth < lookahead && frontier.length > 0; depth += 1) {
    const nextFrontier = [];

    for (const scene of frontier) {
      const nextIds = [];
      if (scene.next) nextIds.push(scene.next);
      for (const choice of scene.choices ?? []) {
        if (choice.next) nextIds.push(choice.next);
      }

      for (const id of nextIds) {
        if (collected.has(id) || !story.hasScene(id)) continue;
        const next = story.getScene(id);
        collected.set(id, next);
        nextFrontier.push(next);
      }
    }

    frontier = nextFrontier;
  }

  return [...collected.values()];
}

function collectAssetPathsForScenes(story, scenes) {
  const paths = new Set();

  for (const scene of scenes) {
    const background = scene?.background;
    const imageSource = background?.src ?? (background?.type === 'image' ? background?.preset : null);
    if (imageSource) paths.add(resolveAssetPath(imageSource));

    for (const entry of scene?.characters ?? []) {
      const character = story.characters?.[entry.id];
      const pose = entry.pose ?? 'neutral';
      const source = character?.sprites?.[pose] ?? character?.sprites?.neutral;
      if (source) paths.add(resolveAssetPath(source));
    }
  }

  return [...paths];
}

function resolveAssetPath(path) {
  if (/^(https?:)?\/\//.test(path)) {
    return path;
  }

  const base = import.meta.env.BASE_URL ?? './';
  const cleanBase = base.endsWith('/') ? base : `${base}/`;
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;

  return `${cleanBase}${cleanPath}`;
}

function scaleCharacter(sprite, width, height, target) {
  const maxHeight = height * target.heightRatio;
  const maxWidth = width * target.widthRatio;

  const textureWidth = sprite.texture?.width ?? sprite.width;
  const textureHeight = sprite.texture?.height ?? sprite.height;

  const scale = Math.min(
      maxHeight / textureHeight,
      maxWidth / textureWidth,
  );

  sprite.scale.set(Number.isFinite(scale) ? scale : 1);
}

function contain(sprite, width, height) {
  // Scale so the entire image fits inside the screen (letter-/pillar-boxed),
  // centered. Leftover space is filled by the stage's black background.
  const scale = Math.min(
      width / sprite.texture.width,
      height / sprite.texture.height,
  );

  sprite.anchor.set(0.5);
  sprite.scale.set(scale);
  sprite.x = width / 2;
  sprite.y = height / 2;
}

function createBackgroundTexture(width, height, preset) {
  const canvas = document.createElement('canvas');

  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));

  const context = canvas.getContext('2d');

  drawSky(context, canvas, preset);
  drawForest(context, canvas);
  drawVignette(context, canvas);

  return Texture.from(canvas);
}

function drawSky(context, canvas) {
  const sky = context.createLinearGradient(0, 0, canvas.width, canvas.height);

  sky.addColorStop(0, '#6b7fa3');
  sky.addColorStop(0.34, '#d99c55');
  sky.addColorStop(0.68, '#3d4e41');
  sky.addColorStop(1, '#111719');

  context.fillStyle = sky;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const sun = context.createRadialGradient(
      canvas.width * 0.82,
      canvas.height * 0.22,
      0,
      canvas.width * 0.82,
      canvas.height * 0.22,
      canvas.width * 0.42,
  );

  sun.addColorStop(0, 'rgba(255, 236, 174, 0.95)');
  sun.addColorStop(0.42, 'rgba(242, 166, 82, 0.25)');
  sun.addColorStop(1, 'rgba(242, 166, 82, 0)');

  context.fillStyle = sun;
  context.fillRect(0, 0, canvas.width, canvas.height);
}

function drawForest(context, canvas) {
  const baseY = canvas.height * 0.55;

  for (let layer = 0; layer < 5; layer += 1) {
    const y = baseY + layer * canvas.height * 0.08;
    const treeWidth = canvas.width / (30 + layer * 8);

    context.fillStyle = `rgba(${16 + layer * 8}, ${46 + layer * 9}, ${31 + layer * 4}, ${0.42 + layer * 0.09})`;

    for (let x = -treeWidth; x < canvas.width + treeWidth; x += treeWidth * 0.72) {
      const h = canvas.height * (0.18 + Math.random() * 0.16 + layer * 0.03);

      context.beginPath();
      context.moveTo(x, y + h);
      context.lineTo(x + treeWidth * 0.5, y - h);
      context.lineTo(x + treeWidth, y + h);
      context.closePath();
      context.fill();
    }
  }
}

function drawVignette(context, canvas) {
  const vignette = context.createRadialGradient(
      canvas.width * 0.5,
      canvas.height * 0.45,
      canvas.width * 0.2,
      canvas.width * 0.5,
      canvas.height * 0.45,
      canvas.width * 0.78,
  );

  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(0,0,0,0.56)');

  context.fillStyle = vignette;
  context.fillRect(0, 0, canvas.width, canvas.height);
}

function createPlaceholderCharacter(character = {}, pose = 'neutral') {
  const root = new Container();
  const color = parseHexColor(character.color ?? '#d8b27c');

  const shadow = new Graphics();
  shadow.ellipse(0, 168, 82, 22).fill({ color: 0x000000, alpha: 0.28 });
  root.addChild(shadow);

  const body = new Graphics();
  body.roundRect(-62, -86, 124, 240, 18).fill({ color, alpha: 0.86 });
  body.roundRect(-48, -56, 96, 72, 14).fill({ color: 0xf0e0bd, alpha: 0.88 });
  body.rect(-46, -40, 92, 12).fill({ color: 0x9d3f2f, alpha: 0.75 });
  body.rect(-7, -86, 14, 240).fill({ color: 0x5d3527, alpha: 0.55 });
  root.addChild(body);

  const head = new Graphics();
  head.circle(0, -125, 43).fill({ color: 0xf0d4b5 });
  head.circle(-14, -131, 4).fill({ color: 0x2f3b48 });
  head.circle(14, -131, 4).fill({ color: 0x2f3b48 });
  head.roundRect(-13, -111, 26, pose === 'happy' ? 8 : 4, 4).fill({ color: 0x8a4b3a, alpha: 0.76 });
  root.addChild(head);

  const hair = new Graphics();
  hair.roundRect(-45, -170, 90, 55, 25).fill({ color: parseHexColor(character.hair ?? '#6c4b35') });
  root.addChildAt(hair, 2);

  const label = new Text({
    text: character.displayName ?? 'Character',
    style: {
      fill: 0xfff1ce,
      fontFamily: 'Georgia',
      fontSize: 24,
      align: 'center',
    },
  });

  label.anchor.set(0.5, 0);
  label.y = 182;
  root.addChild(label);

  root.pivot.set(0, 182);

  return root;
}

function positionFor(position, width, height) {
  const bottomY = height * 0.98;

  const positions = {
    left: {
      x: width * 0.25,
      y: bottomY,
      heightRatio: 0.72,
      widthRatio: 0.28,
    },
    center: {
      x: width * 0.5,
      y: bottomY,
      heightRatio: 0.82,
      widthRatio: 0.34,
    },
    right: {
      x: width * 0.75,
      y: bottomY,
      heightRatio: 0.72,
      widthRatio: 0.28,
    },
  };

  return positions[position] ?? positions.center;
}

function parseHexColor(value) {
  return Number.parseInt(value.replace('#', ''), 16);
}