export class UiController {
  constructor(elements) {
    this.elements = elements;
    this.choiceHandlers = [];
  }

  bindNavigation({ onBack, onRestart }) {
    this.elements.backButton?.addEventListener('click', onBack);
    this.elements.restartButton?.addEventListener('click', onRestart);
  }

  showDialogue(scene, characters) {
    const character = characters[scene.speaker];
    this.elements.speakerName.textContent = character?.displayName ?? scene.speaker ?? '';
    this.elements.dialogueText.textContent = scene.text ?? '';
  }

  showChoices(choices, onChoice) {
    this.choiceHandlers = choices.map((choice) => () => onChoice(choice.next));
    this.elements.choicePanel.innerHTML = '';
    this.elements.choicePanel.classList.toggle('hidden', choices.length === 0);

    choices.forEach((choice, index) => {
      const button = document.createElement('button');
      button.className = 'choice-button';
      button.type = 'button';
      button.textContent = `${index + 1}. ${choice.text}`;
      button.addEventListener('click', this.choiceHandlers[index]);
      this.elements.choicePanel.appendChild(button);
    });
  }

  pickChoice(index) {
    this.choiceHandlers[index]?.();
  }

  hasOpenChoices() {
    return this.choiceHandlers.length > 0;
  }

  setBackAvailable(isAvailable) {
    if (this.elements.backButton) {
      this.elements.backButton.disabled = !isAvailable;
    }
  }

  showSaveStatus(message) {
    this.elements.saveStatus.textContent = message;
  }
}
