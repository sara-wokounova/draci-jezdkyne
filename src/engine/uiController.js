import { backgroundImage, resolveAssetPath } from './assetPath.js';

export class UiController {
  constructor(elements) {
    this.elements = elements;
    this.choiceHandlers = [];
  }

  bindNavigation({ onBack, onRestart, onEndHome }) {
    this.elements.backButton?.addEventListener('click', onBack);
    this.elements.restartButton?.addEventListener('click', onRestart);
    this.elements.endCard.querySelector('#end-home').addEventListener('click', onEndHome);
  }

  /** Main menu: Start, plus the Nastavení and Galerie pages (buttons with data-page). */
  bindMenu({ onStart, getEndScenes }) {
    const menu = this.elements.mainMenu;
    menu.querySelector('#menu-start').addEventListener('click', onStart);
    menu.querySelectorAll('[data-page]').forEach((button) => {
      button.addEventListener('click', () => {
        if (button.dataset.page === 'gallery') this.showGallery(getEndScenes());
        menu.querySelectorAll('.menu-page').forEach((page) => {
          page.classList.toggle('hidden', page.id !== `menu-${button.dataset.page}`);
        });
      });
    });
  }

  /** Nastavení page controls; onChange gets only the changed setting. */
  bindSettings(settings, onChange) {
    const music = this.elements.mainMenu.querySelector('#setting-music');
    const autoRead = this.elements.mainMenu.querySelector('#setting-autoread');
    music.value = Math.round(settings.musicVolume * 100);
    autoRead.checked = settings.autoRead;
    music.addEventListener('input', () => onChange({ musicVolume: music.value / 100 }));
    autoRead.addEventListener('change', () => onChange({ autoRead: autoRead.checked }));
  }

  showMenu(open) {
    this.elements.root.classList.toggle('menu-open', open);
    if (open) this.elements.mainMenu.querySelector('#menu-start').focus();
  }

  showGallery(endScenes) {
    const list = this.elements.mainMenu.querySelector('#gallery-list');
    list.innerHTML = endScenes.length ? '' : '<li>Zatím žádný konec.</li>';
    for (const { background, end } of endScenes) {
      // Story text goes in as text, never as markup.
      const item = document.createElement('li');
      item.innerHTML = `
        <img alt="" loading="lazy" />
        <div>
          <strong></strong>
          <span class="end-kind"></span>
          <p></p>
        </div>`;
      const image = item.querySelector('img');
      const imageSource = backgroundImage(background);
      if (imageSource) image.src = resolveAssetPath(imageSource);
      else image.remove();
      item.querySelector('strong').textContent = storyText(end.title);
      const kind = item.querySelector('.end-kind');
      kind.textContent = endLabel(end);
      kind.classList.toggle('good', Boolean(end.good));
      item.querySelector('p').textContent = storyText(end.text);
      list.appendChild(item);
    }
  }

  /** End card over an end scene (KONEC, good/bad, explanation). Pass null to hide it. */
  showEnd(end) {
    const card = this.elements.endCard;
    this.elements.root.classList.toggle('end-open', Boolean(end));
    if (!end) return;

    const kind = card.querySelector('#end-kind');
    const title = storyText(end.title);
    kind.textContent = title ? `${endLabel(end)}: ${title}` : endLabel(end);
    kind.classList.toggle('good', Boolean(end.good));
    card.querySelector('#end-text').textContent = storyText(end.text);
    card.querySelector('#end-home').focus();
  }

  showDialogue(scene, characters) {
    const character = characters[scene.speaker];
    this.elements.speakerName.textContent = storyText(character?.displayName ?? scene.speaker);
    this.elements.dialogueText.textContent = storyText(scene.text);
  }

  showChoices(choices, onChoice) {
    this.choiceHandlers = choices.map((choice) => () => onChoice(choice.next));
    this.elements.choicePanel.innerHTML = '';
    this.elements.choicePanel.classList.toggle('hidden', choices.length === 0);

    choices.forEach((choice, index) => {
      const button = document.createElement('button');
      button.className = 'choice-button';
      button.type = 'button';
      button.textContent = `${index + 1}. ${storyText(choice.text)}`;
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

/** Story text as text: anything that isn't a string (a typo in story.json) shows as nothing. */
export function storyText(value) {
  return typeof value === 'string' ? value : '';
}

function endLabel(end) {
  return end.good ? 'Dobrý konec' : 'Špatný konec';
}
