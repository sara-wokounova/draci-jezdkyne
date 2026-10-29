export class InputController {
  constructor({ root, onAdvance, onChoiceNumber, onBack, onEscape }) {
    this.root = root;
    this.onAdvance = onAdvance;
    this.onChoiceNumber = onChoiceNumber;
    this.onBack = onBack;
    this.onEscape = onEscape;
  }

  connect() {
    this.root.addEventListener('pointerup', (event) => {
      if (event.target.closest('button')) return;
      this.onAdvance();
    });

    // D12/D13: on phones every tap outside fullscreen asks for fullscreen, then a landscape lock.
    // On document so taps on #rotate-hint (outside the root) count. Browsers may refuse; ignore that.
    if (matchMedia('(pointer: coarse)').matches) {
      document.addEventListener('pointerup', () => {
        const page = document.documentElement;
        if (document.fullscreenElement || !page.requestFullscreen) return;
        page.requestFullscreen()
          .then(() => screen.orientation?.lock?.('landscape'))
          .catch(() => {});
      });
    }

    window.addEventListener('keydown', (event) => {
      // Esc opens and closes the menu, also over the end card. Held down, it would toggle on every repeat.
      if (event.key === 'Escape') {
        if (!event.repeat) this.onEscape();
        return;
      }

      // A held key presses a focused button once: its repeats would open the menu and close it again
      // (Enter on Menu, then on the focused Pokračovat), then go on into the story.
      if (event.repeat && event.target.closest?.('button')) {
        event.preventDefault();
        return;
      }

      // Let Space/Enter press the focused menu, end-card or top-bar button.
      if (event.target.closest?.('#main-menu, #end-card')) return;
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
  }
}
