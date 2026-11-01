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
  constructor({ root, onAdvance, onChoiceNumber, onBack, onEscape }) {
    this.root = root;
    this.onAdvance = onAdvance;
    this.onChoiceNumber = onChoiceNumber;
    this.onBack = onBack;
    this.onEscape = onEscape;
    this.heldFromButton = new Set(); // keys whose press landed on a button, until their keyup
  }

  connect() {
    this.root.addEventListener('pointerup', (event) => {
      if (event.target.closest('button')) return;
      this.onAdvance();
    });

    fullscreenOnTap();

    window.addEventListener('keydown', (event) => {
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

      // Let Space/Enter press the focused menu, end-card, minigame-result or top-bar button.
      if (event.target.closest?.('#main-menu, #end-card, .mg-result')) return;
      const onTopButton = Boolean(event.target.closest?.('#top-controls button'));

      if ((event.key === ' ' || event.key === 'Enter') && !onTopButton) {
        event.preventDefault();
        this.onAdvance();
      }

      if (event.key === 'Backspace' || event.key === 'ArrowLeft') {
        event.preventDefault();
        this.onBack();
      }

      if (/^[1-9]$/.test(event.key)) {
        this.onChoiceNumber(Number(event.key) - 1);
      }
    });
    window.addEventListener('keyup', (event) => this.heldFromButton.delete(event.key));
  }
}
