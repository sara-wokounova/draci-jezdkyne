/**
 * DOM overlay shown on top of the Pixi canvas while a minigame is running.
 *
 * Responsibilities:
 *  - Show a small top bar with the minigame title, live score and status.
 *  - Offer a "skip" button that lets the player bypass the minigame and pick
 *    the outcome (victory or failure) manually.
 *  - Show a result screen (victory / failure) with a continue button.
 *
 * The HUD is intentionally framework-free (plain DOM) so it matches the rest of
 * the engine's UI layer, which is also plain DOM on top of the Pixi canvas.
 */
import { storyText } from '../uiController.js';

export class MinigameHud {
  /**
   * @param {HTMLElement} root The game root element to attach the overlay to.
   * @param {object} options
   * @param {string} [options.title] Title shown in the HUD top bar.
   * @param {boolean} [options.allowSkip=true] Whether the skip button is shown.
   * @param {string} [options.instructions] Helper text shown at the bottom.
   * @param {object} [options.labels] Localizable strings.
   */
  constructor(root, options = {}) {
    this.root = root;
    this.skipHandler = null;

    const labels = {
      score: 'Skóre',
      skip: 'Přeskočit',
      skipPrompt: 'Přeskočit minihru a zvolit výsledek:',
      win: 'Vyhrát',
      lose: 'Prohrát',
      cancel: 'Zpět',
      resultWin: 'Vítězství!',
      resultLose: 'Porážka',
      continue: 'Pokračovat',
      instructions: 'Klikni, klepni nebo zmáčkni klávesu pro útok!',
    };
    // Labels from the story override the defaults only with text (a typo must not break the HUD).
    for (const [name, value] of Object.entries(options.labels ?? {})) {
      if (typeof value === 'string' && Object.hasOwn(labels, name)) labels[name] = value;
    }
    this.labels = labels;

    const el = document.createElement('div');
    el.className = 'minigame-hud';
    el.innerHTML = `
      <div class="mg-topbar glass-panel">
        <span class="mg-title"></span>
        <span class="mg-stats">
          <span class="mg-score"></span>
          <span class="mg-status"></span>
        </span>
        ${options.allowSkip === false ? '' : '<button class="mg-skip-btn control-button" type="button"></button>'}
      </div>

      <div class="mg-skip-menu glass-panel hidden" role="dialog" aria-modal="true">
        <p class="mg-skip-prompt"></p>
        <div class="mg-skip-actions">
          <button class="mg-skip-win choice-button" type="button" data-outcome="victory"></button>
          <button class="mg-skip-lose choice-button" type="button" data-outcome="failure"></button>
          <button class="mg-skip-cancel control-button" type="button"></button>
        </div>
      </div>

      <div class="mg-result glass-panel hidden" role="dialog" aria-modal="true">
        <h2 class="mg-result-title"></h2>
        <p class="mg-result-score"></p>
        <button class="mg-result-continue choice-button" type="button"></button>
      </div>

      <p class="mg-instructions"></p>
    `;
    // Title, labels and instructions come from story.json: text, never markup.
    const texts = {
      '.mg-title': storyText(options.title),
      '.mg-score': `${labels.score}: 0`,
      '.mg-skip-btn': labels.skip,
      '.mg-skip-prompt': labels.skipPrompt,
      '.mg-skip-win': labels.win,
      '.mg-skip-lose': labels.lose,
      '.mg-skip-cancel': labels.cancel,
      '.mg-result-continue': labels.continue,
      '.mg-instructions': typeof options.instructions === 'string' ? options.instructions : labels.instructions,
    };
    for (const [selector, text] of Object.entries(texts)) {
      const target = el.querySelector(selector);
      if (target) target.textContent = text;
    }

    this.el = el;
    this.scoreEl = el.querySelector('.mg-score');
    this.statusEl = el.querySelector('.mg-status');
    this.skipBtn = el.querySelector('.mg-skip-btn');
    this.skipMenu = el.querySelector('.mg-skip-menu');
    this.resultEl = el.querySelector('.mg-result');
    this.resultTitle = el.querySelector('.mg-result-title');
    this.resultScore = el.querySelector('.mg-result-score');
    this.resultContinue = el.querySelector('.mg-result-continue');
    this.instructionsEl = el.querySelector('.mg-instructions');

    this.skipBtn?.addEventListener('click', () => this.toggleSkipMenu(true));
    el.querySelector('.mg-skip-cancel')?.addEventListener('click', () => this.toggleSkipMenu(false));
    el.querySelectorAll('.mg-skip-menu [data-outcome]').forEach((button) => {
      button.addEventListener('click', () => this.skipHandler?.(button.dataset.outcome));
    });

    root.appendChild(el);
  }

  /** Register a callback fired when the player skips and chooses an outcome. */
  onSkip(handler) {
    this.skipHandler = handler;
  }

  toggleSkipMenu(open) {
    this.skipMenu.classList.toggle('hidden', !open);
  }

  setScore(value) {
    if (this.scoreEl) this.scoreEl.textContent = `${this.labels.score}: ${value}`;
  }

  setStatus(text) {
    if (this.statusEl) this.statusEl.textContent = text ?? '';
  }

  /** Screen px from the top that the top bar covers; games keep key action below it (D15). */
  coveredTop() {
    return this.el.querySelector('.mg-topbar').getBoundingClientRect().bottom;
  }

  setInstructions(text) {
    if (this.instructionsEl) this.instructionsEl.textContent = text ?? '';
  }

  hideInstructions() {
    this.instructionsEl?.classList.add('hidden');
  }

  /**
   * Show the win/lose result screen.
   * @param {'victory'|'failure'} outcome
   * @param {object} [details]
   * @param {number} [details.score]
   * @param {function} onContinue Called when the player presses continue.
   */
  showResult(outcome, details, onContinue) {
    const isVictory = outcome === 'victory';
    this.toggleSkipMenu(false);
    this.hideInstructions();

    this.el.classList.toggle('mg-result-victory', isVictory);
    this.el.classList.toggle('mg-result-failure', !isVictory);

    this.resultTitle.textContent = isVictory ? this.labels.resultWin : this.labels.resultLose;
    this.resultScore.textContent =
      typeof details?.score === 'number' ? `${this.labels.score}: ${details.score}` : '';

    this.resultEl.classList.remove('hidden');
    this.resultContinue.focus?.();
    this.resultContinue.onclick = () => onContinue?.();
  }

  destroy() {
    this.el.remove();
  }
}

