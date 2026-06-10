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

    window.addEventListener('keydown', (event) => {
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
