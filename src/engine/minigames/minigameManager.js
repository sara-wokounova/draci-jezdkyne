import { MinigameHud } from './minigameHud.js';
import { DragonAttackMinigame } from './dragonAttack.js';

/**
 * Manages the registry of available minigames and runs them as part of the
 * story flow.
 *
 * A minigame always resolves to one of two outcomes: `'victory'` or
 * `'failure'`. The player can also skip a minigame and pick the outcome
 * manually via the HUD.
 *
 * Adding a new minigame:
 *   1. Implement a class with `start()` and `destroy()` methods (see
 *      {@link DragonAttackMinigame} for the contract).
 *   2. Register it: `manager.register('myGame', (ctx) => new MyGame(ctx));`
 *   3. Reference it from a scene in story.json (see {@link MinigameManager#run}).
 */
export class MinigameManager {
  /**
   * @param {{ app: import('pixi.js').Application, layers: object }} stage
   * @param {{ root: HTMLElement }} options
   */
  constructor(stage, { root }) {
    this.stage = stage;
    this.root = root;
    this.registry = new Map();
    this.activeGame = null;

    // Built-in minigames.
    this.register('dragonAttack', (context) => new DragonAttackMinigame(context));
  }

  /**
   * Register a minigame factory under a type name.
   * @param {string} type
   * @param {(context: object) => { start: Function, destroy: Function }} factory
   */
  register(type, factory) {
    this.registry.set(type, factory);
  }

  isRegistered(type) {
    return this.registry.has(type);
  }

  /**
   * Run a minigame and resolve with its outcome.
   *
   * Expected `spec` shape (typically read from a scene's `minigame` field):
   * ```
   * {
   *   "type": "dragonAttack",
   *   "title": "Dračí nálet",
   *   "allowSkip": true,
   *   "onVictory": "scene_id_when_won",
   *   "onFailure": "scene_id_when_lost",
   *   "config": { ...minigame specific numbers... }
   * }
   * ```
   *
   * @param {object} spec
   * @returns {Promise<'victory'|'failure'>}
   */
  async run(spec) {
    const factory = this.registry.get(spec.type);

    if (!factory) {
      console.warn(`Unknown minigame type "${spec.type}" — defaulting to failure.`);
      return 'failure';
    }

    this.root.classList.add('minigame-active');

    const hud = new MinigameHud(this.root, {
      title: spec.title,
      allowSkip: spec.allowSkip !== false,
      instructions: spec.instructions,
      labels: spec.labels,
    });

    const outcome = await new Promise((resolve) => {
      let settled = false;
      const settle = (result) => {
        if (settled) return;
        settled = true;
        resolve(result);
      };

      const game = factory({
        app: this.stage.app,
        layer: this.stage.layers.minigame,
        config: spec.config ?? {},
        hud,
        // The game reports its natural end here; we show the result screen and
        // only settle once the player presses continue.
        onComplete: (result, details) => {
          hud.showResult(result, details, () => settle(result));
        },
      });

      // Skipping resolves immediately with the chosen outcome.
      hud.onSkip((result) => settle(result));

      this.activeGame = game;
      Promise.resolve(game.start()).catch((error) => {
        console.error('Minigame failed to start — defaulting to failure.', error);
        settle('failure');
      });
    });

    this.activeGame?.destroy();
    this.activeGame = null;
    hud.destroy();
    this.root.classList.remove('minigame-active');

    return outcome === 'victory' ? 'victory' : 'failure';
  }
}

