import { TAP_GUARD_MS } from './uiController.js';

/** D12/D13: on phones every tap outside fullscreen asks for fullscreen, then a landscape lock. On document so
 *  taps on #rotate-hint (outside the root) count. Browsers may refuse; ignore that. (The play-test page too.) */
export function fullscreenOnTap() {
  if (!matchMedia('(pointer: coarse)').matches) return;
  document.addEventListener('pointerup', () => {
    const page = document.documentElement;
    if (document.fullscreenElement || !page.requestFullscreen) return;
    page.requestFullscreen()
      .then(() => screen.orientation?.lock?.('landscape'))
      .catch(() => {});
  });
}

export class InputController {
  constructor({ root, onAdvance, onChoiceNumber, onBack, onEscape, choiceGuard = null }) {
    this.root = root;
    this.choiceGuard = choiceGuard; // the choice panel's guard (D37): every key press counts as input
    this.onAdvance = onAdvance;
    this.onChoiceNumber = onChoiceNumber;
    this.onBack = onBack;
    this.onEscape = onEscape;
    this.heldFromButton = new Set(); // keys whose press landed on a button, until their keyup
    this.lastKeyAt = -Infinity; // the last keydown, repeats included (as choiceGuard and guardTaps count keys)
    // After a minigame, Back by key (presses and repeats) waits for a fresh press after TAP_GUARD_MS of key quiet (D45): a
    // lost round with `loseResult: false` goes straight on, and a ← or Backspace held or mashed from the round would step
    // Back through the story (Back restores the memory: half-days and events undone).
    this.backWaitsForQuiet = false;
  }

  connect() {
    this.root.addEventListener('pointerup', (event) => {
      if (event.target.closest('button')) return;
      this.onAdvance();
    });

    fullscreenOnTap();

    window.addEventListener('keydown', (event) => {
      const choiceReady = this.choiceGuard?.noteKey() ?? true;
      // The first fresh press after TAP_GUARD_MS without any keydown ends the wait (a held key's repeats are keys too: a
      // key held through the round and let go, then mashed, still waits, D45).
      const now = performance.now();
      if (!event.repeat && now - this.lastKeyAt >= TAP_GUARD_MS) this.backWaitsForQuiet = false;
      this.lastKeyAt = now;
      // Esc opens and closes the menu, also over the end card. Held down, it would toggle on every repeat.
      if (event.key === 'Escape') {
        if (!event.repeat) this.onEscape();
        return;
      }

      // A held key presses a focused button once: its repeats would open the menu and close it again
      // (Enter on Menu, then on the focused Pokračovat), then go on into the story, also once the button
      // it pressed is gone (the menu closed, the minigame's result dismissed: D33).
      const onButton = Boolean(event.target.closest?.('button'));
      if (!event.repeat) {
        if (onButton) this.heldFromButton.add(event.key);
        else this.heldFromButton.delete(event.key);
      }
      if (event.repeat && (onButton || this.heldFromButton.has(event.key))) {
        event.preventDefault();
        return;
      }

      const back = event.key === 'Backspace' || event.key === 'ArrowLeft';
      // (Not in the menu: its sliders and select step on arrows.)
      if (back && this.backWaitsForQuiet && !event.target.closest?.('#main-menu')) {
        event.preventDefault();
        return;
      }

      // Back works on the end card too (it focuses "Zpět na začátek"; a no-line ending opens it by itself, D37).
      if (back && event.target.closest?.('#end-card')) {
        event.preventDefault();
        this.onBack();
        return;
      }

      // Let Space/Enter press the focused menu, end-card, minigame-result or top-bar button.
      if (event.target.closest?.('#main-menu, #end-card, .mg-result')) return;
      const onTopButton = Boolean(event.target.closest?.('#top-controls button'));

      if ((event.key === ' ' || event.key === 'Enter') && !onTopButton) {
        event.preventDefault();
        this.onAdvance();
      }

      if (back) {
        event.preventDefault();
        this.onBack();
      }

      // A number picks only when the choices had been quiet for TAP_GUARD_MS before it, and never by a repeat (D37).
      if (/^[1-9]$/.test(event.key) && choiceReady && !event.repeat) {
        this.onChoiceNumber(Number(event.key) - 1);
      }
    });
    window.addEventListener('keyup', (event) => this.heldFromButton.delete(event.key));
  }

  /** A minigame ended: Back by key waits for a press after TAP_GUARD_MS of key quiet (D45). */
  holdBackUntilQuiet() {
    this.backWaitsForQuiet = true;
  }
}
