import { Assets, Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import { AtmosphereEffects } from './effects/atmosphereEffects.js';
import { backgroundImage, resolveAssetPath } from './assetPath.js';
import { characterRaise, characterScale, isFraction, isNamedPosition, positionFraction } from './storyFlow.js';

const MIN_HEIGHT = 0.1; // a capped creature never shrinks below this share of the screen height
// The placeholder (D7) in its local units, measured from createPlaceholderCharacter's shapes (change both together): its
// body from hair top to body bottom, and the pivot (feet) to hair top.
const PLACEHOLDER_BODY = 324;
const PLACEHOLDER_REACH = 352;
const PLACEHOLDER_WIDTH = 124; // its body's width (createPlaceholderCharacter)
const RIDER_ASPECT = 1.5; // a rider sprite's height / width (1024×1536)

export class VisualRenderer {
  constructor(stage, story) {
    this.stage = stage;
    this.story = story;
    this.effects = new AtmosphereEffects(stage.app, stage.layers.effects, stage.layers.overlay);
  }

  /**
   * Warms the PixiJS Assets cache for the given positions ({ background, characters }: a scene's background and the
   * stage at a line), so the next few taps feel instant without loading the whole story (D8, D37).
   */
  async preload(items) {
    const paths = new Set();
    for (const { background, characters } of items) {
      const imageSource = backgroundImage(background);
      if (imageSource) paths.add(resolveAssetPath(imageSource));
      for (const entry of Array.isArray(characters) ? characters : []) {
        if (!entry || typeof entry !== 'object') continue; // a malformed stage entry (the lint warns) doesn't stop the rest
        const source = spriteSource(this.characterFor(entry), entry.pose ?? 'neutral');
        if (source) paths.add(resolveAssetPath(source));
      }
    }
    if (paths.size > 0) await Assets.load([...paths]);
  }

  /**
   * Draws the scene's background and effects with the given stage (the characters on stage at the line shown).
   * `topLimit`: the top controls' bottom in screen px; a scaled or raised sprite's top stays below it (0: no cap).
   */
  async render(scene, characters = scene.characters ?? [], { topLimit = 0 } = {}) {
    // A newer render (next line, resize, phone going fullscreen) makes this one stale:
    // after every await, a stale render stops instead of adding its sprites (D17).
    const token = (this.renderToken = (this.renderToken ?? 0) + 1);

    clear(this.stage.layers.background);
    clear(this.stage.layers.characters);
    clear(this.stage.layers.overlay);
    this.effects.stop();

    await this.drawBackground(scene.background, token);
    await this.drawCharacters(Array.isArray(characters) ? characters : [], token, topLimit);
    if (token === this.renderToken) this.effects.start(scene.effects ?? []);
  }

  characterFor(entry) {
    const characters = this.story.characters ?? {};
    return entry && Object.hasOwn(characters, entry.id) ? characters[entry.id] : undefined;
  }

  async drawBackground(background, token) {
    const { width, height } = this.stage.app.screen;

    const imageSource = backgroundImage(background);

    if (imageSource) {
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

    // One generated texture per screen size and preset, reused by every render at that size. Each is
    // a screen-sized canvas; making a new one per render kept them all (D20 sends every failed
    // background here). The previous one is destroyed: render() has already cleared its sprite.
    const preset = background?.preset ?? 'sunset_forest';
    const key = `${Math.round(width)}x${Math.round(height)}:${preset}`;
    if (this.generated?.key !== key) {
      this.generated?.texture.destroy(true);
      this.generated = { key, texture: createBackgroundTexture(width, height, preset) };
    }
    const sprite = new Sprite(this.generated.texture);

    sprite.width = width;
    sprite.height = height;

    this.stage.layers.background.addChild(sprite);
  }

  async drawCharacters(stage, token, topLimit) {
    const { width, height } = this.stage.app.screen;

    for (const entry of stage) {
      if (!entry || typeof entry !== 'object') continue;
      const character = this.characterFor(entry);
      const avatar = await createCharacterSprite(character, entry.pose ?? 'neutral');
      if (token !== this.renderToken) return;
      placeCharacter(avatar, character ?? {}, entry, width, height, topLimit);
      avatar.alpha = entry.alpha ?? 1;
      this.stage.layers.characters.addChild(avatar);
    }
  }
}

/**
 * Size and place a sprite (D37). Characters without `scale` keep the old fit at left/center/right (the side box at
 * a numeric position); with `scale` the sprite is `scale` rider heights tall whatever its texture's shape, the
 * rider height being R = min(0.72·H, 0.42·W). `raise` lifts the feet that many rider heights. A scaled or raised
 * sprite's top stays below `topLimit` (never under 10 % of the height); a scaled one's x stays on the screen.
 */
function placeCharacter(avatar, character, entry, width, height, topLimit) {
  const named = isNamedPosition(entry.position) ? entry.position : null;
  const numeric = isFraction(entry.position);
  // A named position its own box; a number the side box (a rider's); none or a bad one the centre's, as before.
  const box = positionFor(named ?? (numeric ? 'left' : 'center'), width, height);
  const x = named ? box.x : width * positionFraction(entry.position);
  const scale = characterScale(character);
  const raise = characterRaise(character);
  // The rider height R: a 2:3 rider fitted into the side box (the riders' own fit at left/right).
  const side = positionFor('left', width, height);
  const riderHeight = Math.min(side.heightRatio * height, side.widthRatio * width * RIDER_ASPECT);
  const feetY = side.y - raise * riderHeight;
  const placeholder = avatar.isPlaceholder === true;
  const reach = placeholder ? PLACEHOLDER_REACH / PLACEHOLDER_BODY : 1; // feet to top, per unit of drawn height

  avatar.x = x;
  avatar.y = feetY;
  const unit = placeholder ? PLACEHOLDER_BODY : avatar.texture.height;
  if (scale === null) {
    scaleCharacter(avatar, width, height, box);
  } else {
    avatar.scale.set((scale * riderHeight) / unit);
  }
  if (scale !== null || raise > 0) {
    const drawn = unit * avatar.scale.y * reach;
    const room = Math.max(feetY - topLimit, MIN_HEIGHT * height);
    if (drawn > room) avatar.scale.set(avatar.scale.y * (room / drawn));
  }
  if (scale !== null) {
    const half = (placeholder ? PLACEHOLDER_WIDTH : avatar.texture.width) * avatar.scale.x / 2;
    avatar.x = half * 2 > width ? width / 2 : Math.min(Math.max(avatar.x, half), width - half);
  }
  const sign = entry.flip === true ? -1 : 1;
  avatar.scale.x = Math.abs(avatar.scale.x) * sign; // after the sizing, whose scale.set would undo it
  if (placeholder) {
    // The name label keeps its reading direction, and on a scaled placeholder its normal size.
    const k = scale === null ? 1 : Math.abs(avatar.scale.y);
    avatar.nameLabel.scale.set(scale === null ? sign : sign / k, scale === null ? 1 : 1 / k);
  }
}

function clear(container) {
  container.removeChildren().forEach((child) => child.destroy({ children: true }));
}

function spriteSource(character, pose) {
  const sprites = character?.sprites;
  if (!sprites || typeof sprites !== 'object') return undefined;
  return (Object.hasOwn(sprites, pose) ? sprites[pose] : undefined) ?? (Object.hasOwn(sprites, 'neutral') ? sprites.neutral : undefined);
}

async function createCharacterSprite(character = {}, pose = 'neutral') {
  const source = spriteSource(character, pose);
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

  return Texture.from(canvas, true); // skipCache: the renderer owns and destroys it
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

  root.pivot.set(0, 182); // PLACEHOLDER_BODY / _REACH / _WIDTH at the top are measured from these shapes
  root.isPlaceholder = true;
  root.nameLabel = label;

  return root;
}

function positionFor(position, width, height) {
  const bottomY = height * 0.98;

  const positions = {
    left: {
      x: width * positionFraction('left'),
      y: bottomY,
      heightRatio: 0.72,
      widthRatio: 0.28,
    },
    center: {
      x: width * positionFraction('center'),
      y: bottomY,
      heightRatio: 0.82,
      widthRatio: 0.34,
    },
    right: {
      x: width * positionFraction('right'),
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