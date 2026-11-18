import { MinigameHud } from './minigameHud.js';
import { DragonAttackMinigame } from './dragonAttack.js';
import { BadgerRescueMinigame, HUD_TEXTS as BADGER_HUD } from './badgerRescue.js';
import { ZubrMelodyMinigame, HUD_TEXTS as ZUBR_HUD } from './zubrMelody.js';

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
 *   3. Reference it from a scene in the story files (public/story/) (see {@link MinigameManager#run}).
 *   A throw in its constructor or start() already ends in 'failure'; its own ticker
 *   listener must catch errors itself and end the round (D24), as DragonAttackMinigame#tick does.
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
    this.register('badgerRescue', (context) => new BadgerRescueMinigame(context), BADGER_HUD);
    this.register('zubrMelody', (context) => new ZubrMelodyMinigame(context), ZUBR_HUD);
  }

  /**
   * Register a minigame factory under a type name.
   * @param {string} type
   * @param {(context: object) => { start: Function, destroy: Function }} factory
   * @param {{ title?: string, labels?: object }} [hudTexts] The game's own HUD title and labels (`instructions` among
   *   them); a scene's `title`, `labels` and `instructions` still override them (D42, D46).
   */
  register(type, factory, hudTexts) {
    this.registry.set(type, { factory, hudTexts: hudTexts ?? {} });
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
   *   "loseResult": false,  // optional: a lost round goes on at once, without the result dialog (D45)
   *   "onVictory": "scene_id_when_won",
   *   "onFailure": "scene_id_when_lost",
   *   "config": { ...minigame specific numbers... }
   * }
   * ```
   *
   * @param {object} spec
   * @param {{ difficulty?: string }} [options] From Nastavení (D33).
   * @returns {Promise<'victory'|'failure'>}
   */
  async run(spec, options = {}) {
    const { factory, hudTexts: texts } = this.registry.get(spec.type) ?? {};

    if (!factory) {
      console.warn(`Unknown minigame type "${spec.type}" — defaulting to failure.`);
      return 'failure';
    }

    this.root.classList.add('minigame-active');

    const hud = new MinigameHud(this.root, {
      title: typeof spec.title === 'string' ? spec.title : texts.title, // the game's own (D46: the song's name in one place)
      allowSkip: spec.allowSkip !== false,
      instructions: spec.instructions, // the HUD takes text only, else its labels.instructions
      // A scene's labels win where they are text (anything else would drop the game's own label for the HUD's default).
      labels: { ...texts.labels, ...Object.fromEntries(Object.entries(spec.labels ?? {}).filter(([, v]) => typeof v === 'string')) },
    });

    const outcome = await new Promise((resolve) => {
      let settled = false;
      const settle = (result) => {
        if (settled) return;
        settled = true;
        resolve(result);
      };

      // Skipping resolves immediately with the chosen outcome.
      hud.onSkip((result) => settle(result));

      // One chain, so a constructor that throws (a malformed config) and a start() that throws or
      // rejects all end in 'failure' instead of leaving the player stuck in the HUD.
      Promise.resolve()
        .then(() => {
          this.activeGame = factory({
            app: this.stage.app,
            layer: this.stage.layers.minigame,
            config: spec.config ?? {},
            hud,
            difficulty: options.difficulty,
            // The game reports its natural end here; we show the result screen and
            // only settle once the player presses continue (a loss with `loseResult: false` at once, D45).
            onComplete: (result, details) => {
              if (result !== 'victory' && spec.loseResult === false) settle(result);
              else hud.showResult(result, details, () => settle(result));
            },
          });
          return this.activeGame.start();
        })
        .catch((error) => {
          console.error('Minigame failed to start — defaulting to failure.', error);
          settle('failure');
        });
    });

    // A clean-up that throws must not leave the HUD up and the top bar hidden: a phone has no Esc (D27).
    try {
      this.activeGame?.destroy();
    } catch (error) {
      console.error('Minigame cleanup failed.', error);
      this.stage.layers.minigame.removeChildren(); // its sprites would stay above every later scene
    }
    this.activeGame = null;
    hud.destroy();
    this.root.classList.remove('minigame-active');

    return outcome === 'victory' ? 'victory' : 'failure';
  }
}

