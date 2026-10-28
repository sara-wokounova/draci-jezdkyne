export class InputController {
  constructor({ root, onAdvance, onChoiceNumber, onBack, onRestart }) {
    this.root = root;
    this.onAdvance = onAdvance;
    this.onChoiceNumber = onChoiceNumber;
    this.onBack = onBack;
    this.onRestart = onRestart;
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
      // Let Space/Enter press the focused menu or end-card button.
      if (event.target.closest?.('#main-menu, #end-card')) return;

      if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault();
        this.onAdvance();
      }

      if (event.key === 'Backspace' || event.key === 'ArrowLeft') {
        event.preventDefault();
        this.onBack();
      }

      if (event.key.toLowerCase() === 'r') {
        event.preventDefault();
        this.onRestart();
      }

      if (/^[1-9]$/.test(event.key)) {
        this.onChoiceNumber(Number(event.key) - 1);
      }
    });
  }
}
