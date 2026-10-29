import { backgroundImage, resolveAssetPath } from './assetPath.js';

// A tap this soon after a page switch or the menu closing is taken as the rest of a double tap (D27).
export const TAP_GUARD_MS = 500;

export class UiController {
  constructor(elements) {
    this.elements = elements;
    this.choiceHandlers = [];
  }

  bindNavigation({ onBack, onMenu, onEndHome }) {
    this.elements.backButton?.addEventListener('click', onBack);
    this.elements.menuButton?.addEventListener('click', onMenu);
    this.elements.endCard.querySelector('#end-home').addEventListener('click', onEndHome);
    // A mouse press doesn't focus a top-bar button, so Space/Enter go on advancing the story afterwards
    // (a focused button would take them, D27). The click still fires.
    this.elements.root.querySelector('#top-controls').addEventListener('mousedown', (event) => event.preventDefault());
  }

  /** Main menu: Pokračovat, Nová hra (and its confirmation), plus the Nastavení and Galerie pages. */
  bindMenu({ onContinue, onNewGame, onConfirmNewGame, getEndScenes }) {
    const menu = this.elements.mainMenu;
    menu.querySelector('#menu-start').addEventListener('click', onContinue);
    menu.querySelector('#menu-new').addEventListener('click', onNewGame);
    menu.querySelectorAll('[data-page]').forEach((button) => {
      button.addEventListener('click', () => {
        if (button.dataset.page === 'gallery') this.showGallery(getEndScenes());
        this.showMenuPage(button.dataset.page, button);
      });
    });
    this.bindConfirm(onConfirmNewGame);
  }

  // "Ano" takes a tap only after TAP_GUARD_MS without any tap (opening the page counts as one): its page
  // replaces the main one at once, right where Nová hra was, so a double tap or a child mashing the button
  // would otherwise confirm (D27). Keyboard clicks (detail 0) always count. Ano is dimmed while it would
  // ignore a tap, and while a press that won't count is held.
  bindConfirm(onConfirm) {
    const page = this.elements.mainMenu.querySelector('#menu-confirm');
    const yes = page.querySelector('#menu-confirm-yes');
    const shown = () => this.elements.root.classList.contains('menu-open') && !page.classList.contains('hidden');
    const state = { lastTapAt: 0, tapCounts: false, tapPending: false, held: false, timer: 0 };
    const dimUntilQuiet = () => {
      yes.classList.add('waiting');
      clearTimeout(state.timer);
      state.timer = setTimeout(() => { if (!state.held) yes.classList.remove('waiting'); }, TAP_GUARD_MS);
    };
    this.armConfirm = () => {
      state.lastTapAt = performance.now();
      state.tapPending = false;
      state.held = false;
      dimUntilQuiet();
    };
    document.addEventListener('pointerdown', () => {
      if (!shown()) return;
      const now = performance.now();
      state.tapCounts = now - state.lastTapAt >= TAP_GUARD_MS;
      state.lastTapAt = now;
      state.tapPending = true;
      state.held = !state.tapCounts;
      dimUntilQuiet();
    }, true);
    // The end of a press, also one the browser cancels (a scroll, a system gesture).
    for (const type of ['pointerup', 'pointercancel']) {
      document.addEventListener(type, () => {
        if (!state.held) return;
        state.held = false;
        if (performance.now() - state.lastTapAt >= TAP_GUARD_MS) yes.classList.remove('waiting');
      }, true);
    }
    // Any click ends the press it belongs to (bubbling: after Ano's own handler has read it).
    document.addEventListener('click', () => { state.tapPending = false; });
    yes.addEventListener('click', (event) => {
      if (event.detail > 0) {
        // A click without a press of its own (assistive technology) is judged by its own time.
        const counts = state.tapPending ? state.tapCounts : performance.now() - state.lastTapAt >= TAP_GUARD_MS;
        if (!counts) return;
      }
      onConfirm();
    });
  }

  /**
   * Shows one menu page. A sub-page focuses its first button and remembers the button that opened it;
   * back on the main page, that button gets the focus again.
   */
  showMenuPage(name, opener = null) {
    const menu = this.elements.mainMenu;
    menu.querySelectorAll('.menu-page').forEach((page) => {
      page.classList.toggle('hidden', page.id !== `menu-${name}`);
    });
    if (name === 'main') {
      (this.pageOpener ?? menu.querySelector('#menu-main button:not(:disabled)'))?.focus();
      this.pageOpener = null;
      return;
    }
    this.pageOpener = opener;
    if (name === 'confirm') this.armConfirm?.();
    menu.querySelector(`#menu-${name} button`).focus();
  }

  showNewGameConfirm() {
    this.showMenuPage('confirm', this.elements.mainMenu.querySelector('#menu-new'));
  }

  /** The name of the menu page on show: main, confirm, settings or gallery. */
  menuPage() {
    return this.elements.mainMenu.querySelector('.menu-page:not(.hidden)')?.id.replace('menu-', '');
  }

  setContinueAvailable(isAvailable) {
    this.elements.mainMenu.querySelector('#menu-start').disabled = !isAvailable;
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

  /** The menu always opens on its main page, with the first enabled button focused. */
  showMenu(open) {
    this.elements.root.classList.toggle('menu-open', open);
    if (!open) return;
    this.pageOpener = null;
    this.showMenuPage('main');
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
