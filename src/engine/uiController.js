import { backgroundImage, resolveAssetPath } from './assetPath.js';

// A tap this soon after a page switch, the menu closing or a minigame's end is taken as the rest of a double tap (D27, D33).
export const TAP_GUARD_MS = 500;

/**
 * A button that takes a tap only after TAP_GUARD_MS without any tap (arming it counts as one), dimmed (`waiting`)
 * while it would ignore one, and while a press that won't count is held (D27). A click without a press of its own
 * (assistive technology) is judged by its own time. Keyboard clicks (`detail` 0) always count, unless `keys`:
 * then a key press is judged like a tap and its repeats re-arm the wait without changing their press's verdict
 * (the result's Pokračovat, focused while the player may still be pressing attack keys, D33), and a key press gives the
 * button back the focus (a click elsewhere took it).
 * `shown()` says whether the button is on show; presses elsewhere in the page count only then.
 */
export function guardTaps(button, { shown, onPress, keys = false }) {
  const state = { lastTapAt: 0, tapCounts: false, tapPending: false, keyCounts: false, keyPending: false, held: false, timer: 0 };
  const quiet = () => performance.now() - state.lastTapAt >= TAP_GUARD_MS;
  const dimUntilQuiet = () => {
    button.classList.add('waiting');
    clearTimeout(state.timer);
    state.timer = setTimeout(() => { if (!state.held) button.classList.remove('waiting'); }, TAP_GUARD_MS);
  };
  const listeners = [
    ['pointerdown', () => {
      if (!shown()) return;
      state.tapCounts = quiet();
      state.lastTapAt = performance.now();
      state.tapPending = true;
      state.held = !state.tapCounts;
      dimUntilQuiet();
    }, true],
    // The end of a press, also one the browser cancels (a scroll, a system gesture).
    ...['pointerup', 'pointercancel'].map((type) => [type, () => {
      if (!state.held) return;
      state.held = false;
      if (quiet()) button.classList.remove('waiting');
    }, true]),
    // Any click ends the press it belongs to (bubbling: after the button's own handler has read it).
    ['click', () => {
      state.tapPending = false;
      state.keyPending = false;
    }, false],
  ];
  if (keys) {
    listeners.push(['keydown', (event) => {
      if (!shown()) return;
      if (document.activeElement !== button) button.focus();
      if (!event.repeat) {
        state.keyCounts = quiet();
        state.keyPending = true;
        state.held = !state.keyCounts; // dimmed while held, also with the system's key repeat off
      }
      state.lastTapAt = performance.now();
      dimUntilQuiet();
    }, true]);
    // Space clicks on its keyup, after this listener: the press stays pending until that click has read it.
    listeners.push(['keyup', () => {
      setTimeout(() => { state.keyPending = false; });
      if (!state.held) return;
      state.held = false;
      if (quiet()) button.classList.remove('waiting');
    }, true]);
  }
  for (const [type, listener, capture] of listeners) document.addEventListener(type, listener, capture);
  button.addEventListener('click', (event) => {
    let counts = true;
    if (event.detail > 0) counts = state.tapPending ? state.tapCounts : quiet();
    else if (keys) counts = state.keyPending ? state.keyCounts : quiet();
    if (counts) onPress();
  });
  return {
    arm() {
      state.lastTapAt = performance.now();
      state.tapPending = false;
      state.keyPending = false;
      state.held = false;
      dimUntilQuiet();
    },
    dispose() {
      clearTimeout(state.timer);
      for (const [type, listener, capture] of listeners) document.removeEventListener(type, listener, capture);
    },
  };
}

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
  // would otherwise confirm (D27).
  bindConfirm(onConfirm) {
    const page = this.elements.mainMenu.querySelector('#menu-confirm');
    const shown = () => this.elements.root.classList.contains('menu-open') && !page.classList.contains('hidden');
    this.armConfirm = guardTaps(page.querySelector('#menu-confirm-yes'), { shown, onPress: onConfirm }).arm;
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
    if (name === 'settings') this.onSettingsOpen?.();
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

  /**
   * Nastavení page controls. onChange gets only the changed setting; onOpen runs when the page is shown,
   * onEffectsSet when the effects slider is let go (for its test sound).
   */
  bindSettings(settings, { onChange, onOpen, onEffectsSet }) {
    const music = this.elements.mainMenu.querySelector('#setting-music');
    const effects = this.elements.mainMenu.querySelector('#setting-effects');
    const autoRead = this.elements.mainMenu.querySelector('#setting-autoread');
    const difficulty = this.elements.mainMenu.querySelector('#setting-difficulty');
    music.value = Math.round(settings.musicVolume * 100);
    effects.value = Math.round(settings.effectsVolume * 100);
    autoRead.checked = settings.autoRead;
    difficulty.value = settings.difficulty;
    music.addEventListener('input', () => onChange({ musicVolume: music.value / 100 }));
    effects.addEventListener('input', () => onChange({ effectsVolume: effects.value / 100 }));
    effects.addEventListener('change', onEffectsSet);
    autoRead.addEventListener('change', () => onChange({ autoRead: autoRead.checked }));
    difficulty.addEventListener('change', () => onChange({ difficulty: difficulty.value }));
    this.onSettingsOpen = onOpen;
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
