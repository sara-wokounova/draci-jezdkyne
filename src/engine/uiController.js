import { backgroundImage, resolveAssetPath } from './assetPath.js';

// A tap this soon after a page switch, the menu closing or a minigame's end is taken as the rest of a double tap (D27, D33).
export const TAP_GUARD_MS = 500;

// The pointers down right now, for both guards: a finger already down when a guarded button or the choices appear (autoread,
// an end card opening by itself, a round ending) is a press that won't count, however long it is held (D37). Its click,
// if it gives one, comes within this long of its lift; after that the refused press is dropped (an Android long press
// gives no click, and an assistive click later must not inherit its verdict).
const LIFT_CLICK_MS = 1000;
const downPointers = new Map(); // pointerId → pointerType
if (typeof document !== 'undefined') {
  document.addEventListener('pointerdown', (event) => {
    // A primary pointer goes down only when no other pointer of its type is: any left over lost its pointerup.
    if (event.isPrimary) for (const [id, type] of downPointers) if (type === event.pointerType) downPointers.delete(id);
    downPointers.set(event.pointerId, event.pointerType);
  }, true);
  for (const type of ['pointerup', 'pointercancel']) {
    document.addEventListener(type, (event) => downPointers.delete(event.pointerId), true);
  }
  // A lost pointerup (the window lost focus mid-press) mustn't leave a pointer down for good.
  window.addEventListener('blur', () => downPointers.clear());
  document.addEventListener('visibilitychange', () => { if (document.hidden) downPointers.clear(); });
}

/**
 * A button that takes a tap only after TAP_GUARD_MS without any tap (arming it counts as one), dimmed (`waiting`)
 * while it would ignore one, and while a press that won't count is held (D27). A click without a press of its own
 * (assistive technology) is judged by its own time. Keyboard clicks (`detail` 0) always count, unless `keys`:
 * then a key press is judged like a tap and its repeats re-arm the wait without changing their press's verdict
 * (the result's Pokračovat, focused while the player may still be pressing attack keys, D33), and a key press gives the
 * button back the focus when a click elsewhere took it, but not from another button (Tab to the top bar on the end
 * card, D37).
 * `shown()` says whether the button is on show; presses elsewhere in the page count only then.
 * createChoiceGuard below keeps the same press rules for the choice panel: a change to one usually belongs in both.
 */
export function guardTaps(button, { shown, onPress, keys = false }) {
  const state = { lastTapAt: 0, tapCounts: false, tapPending: false, keyCounts: false, keyPending: false, held: false, timer: 0, drop: 0 };
  const quiet = () => performance.now() - state.lastTapAt >= TAP_GUARD_MS;
  const dimUntilQuiet = () => {
    button.classList.add('waiting');
    clearTimeout(state.timer);
    state.timer = setTimeout(() => { if (!state.held) button.classList.remove('waiting'); }, TAP_GUARD_MS);
  };
  const listeners = [
    ['pointerdown', () => {
      if (!shown()) return;
      clearTimeout(state.drop);
      state.tapCounts = quiet();
      state.lastTapAt = performance.now();
      state.tapPending = true;
      state.held = !state.tapCounts;
      dimUntilQuiet();
    }, true],
    // The end of a press, also one the browser cancels (a scroll, a system gesture).
    // Multi-touch isn't told apart (Chrome gives a held finger no click once another touched), as in createChoiceGuard.
    ...['pointerup', 'pointercancel'].map((type) => [type, () => {
      if (state.tapPending && !state.tapCounts) {
        clearTimeout(state.drop);
        state.drop = setTimeout(() => { state.tapPending = false; }, LIFT_CLICK_MS);
      }
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
      if (document.activeElement !== button && !document.activeElement?.closest?.('button')) button.focus();
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
      state.tapPending = downPointers.size > 0; // a finger already down: its lift's click won't count
      state.tapCounts = false;
      state.keyPending = false;
      state.held = state.tapPending;
      clearTimeout(state.drop);
      dimUntilQuiet();
    },
    dispose() {
      clearTimeout(state.timer);
      clearTimeout(state.drop);
      for (const [type, listener, capture] of listeners) document.removeEventListener(type, listener, capture);
    },
  };
}

/**
 * The choice panel's one guard (D37, D27's rule): a choice counts only after TAP_GUARD_MS without any input, counted
 * from the choices being shown. Created once with the UI, never rebuilt. A click is judged by its press (guardTaps'
 * rule, no pointer ids: iOS Safari gives a touch's click the mouse's id): a press begun after the show by whether it
 * was quiet then; no such press (assistive technology, the tap that showed the choices) by the time of the click.
 * `waiting` dims the buttons while a tap would be ignored, and while a press that won't count is held.
 * guardTaps above keeps the same press rules for single buttons: a change to one usually belongs in both.
 */
function createChoiceGuard(panel) {
  const state = { lastShown: -Infinity, lastInput: -Infinity, lastKey: -Infinity, press: null, held: false, timer: 0, drop: 0 };
  const now = () => performance.now();
  const ready = () => now() - state.lastInput >= TAP_GUARD_MS;
  const retime = () => {
    clearTimeout(state.timer);
    const wait = state.lastInput + TAP_GUARD_MS - now();
    if (wait > 0 || state.held) panel.classList.add('waiting');
    if (wait > 0) state.timer = setTimeout(retime, wait);
    else if (!state.held) panel.classList.remove('waiting');
  };
  const guard = {
    onChoice: null,
    shown(onChoice) {
      guard.onChoice = onChoice;
      state.lastShown = state.lastInput = now();
      // A finger already down when the choices appear (autoread showed them) is a press that won't count, however long
      // it is held. (The tap that shows them is out of downPointers by then: the module's capture pointerup listener runs
      // before the story's pointerup.)
      state.press = downPointers.size > 0 ? { at: state.lastShown, ready: false, before: state.lastShown } : null;
      state.held = downPointers.size > 0;
      clearTimeout(state.drop);
      retime();
    },
    /** Every key press (inputController); returns whether the guard was ready before it. */
    noteKey() {
      const wasReady = ready();
      state.lastInput = state.lastKey = now();
      retime();
      return wasReady;
    },
  };
  document.addEventListener('pointerdown', () => {
    clearTimeout(state.drop);
    const wasReady = ready();
    state.press = { at: now(), ready: wasReady, before: state.lastInput };
    state.lastInput = now();
    if (!wasReady) {
      state.held = true;
      retime();
    }
  }, true);
  document.addEventListener('pointerup', () => {
    if (!state.held) return;
    state.held = false;
    retime();
    const { press } = state;
    if (press && !press.ready) {
      clearTimeout(state.drop);
      state.drop = setTimeout(() => { if (state.press === press) state.press = null; }, LIFT_CLICK_MS);
    }
  }, true);
  // A touch scroll of the phone panel isn't a tap: the clock goes back (a show or a key during the press stays).
  document.addEventListener('pointercancel', () => {
    if (state.press) state.lastInput = Math.max(state.press.before, state.lastShown, state.lastKey);
    state.press = null;
    state.held = false;
    retime();
  }, true);
  panel.addEventListener('click', (event) => {
    const button = event.target.closest?.('.choice-button');
    if (!button) return;
    const { press } = state;
    const counts = press && press.at >= state.lastShown ? press.ready : ready();
    state.press = null;
    if (counts) guard.onChoice?.(Number(button.dataset.index));
    else retime();
  });
  // Any other click ends its press; a ready press whose click picked nothing dims the panel now.
  document.addEventListener('click', () => {
    if (state.press?.ready) retime();
    state.press = null;
  });
  return guard;
}

export class UiController {
  constructor(elements) {
    this.elements = elements;
    this.choices = [];
    this.choiceGuard = createChoiceGuard(elements.choicePanel);
    this.choiceList = elements.choicePanel.querySelector('.choice-list');
    this.choiceHeading = elements.choicePanel.querySelector('.choice-heading');
    // The centred choices end above the dialogue panel, which grows with its text and moves with the window.
    const dialoguePanel = elements.root.querySelector('#dialogue-panel');
    const measure = () => {
      const top = dialoguePanel.getBoundingClientRect().top;
      const bottom = elements.root.getBoundingClientRect().bottom;
      elements.root.style.setProperty('--dialogue-top', `${Math.max(0, bottom - top) + 12}px`);
    };
    new ResizeObserver(measure).observe(dialoguePanel);
    window.addEventListener('resize', measure);
  }

  bindNavigation({ onBack, onMenu, onEndHome }) {
    this.elements.backButton?.addEventListener('click', onBack);
    this.elements.menuButton?.addEventListener('click', onMenu);
    // The tap that opens the end card, or a mashing child's next ones, must not press "Zpět na začátek" (D37).
    const root = this.elements.root;
    this.endGuard = guardTaps(this.elements.endCard.querySelector('#end-home'), {
      shown: () => root.classList.contains('end-open'), onPress: onEndHome, keys: true,
    });
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

  /** End card over an end scene (KONEC, good/bad, explanation). Pass null to hide it. Never opens under the menu. */
  showEnd(end) {
    const card = this.elements.endCard;
    if (end && this.elements.root.classList.contains('menu-open')) return;
    this.elements.root.classList.toggle('end-open', Boolean(end));
    if (!end) return;

    const kind = card.querySelector('#end-kind');
    const title = storyText(end.title);
    kind.textContent = title ? `${endLabel(end)}: ${title}` : endLabel(end);
    kind.classList.toggle('good', Boolean(end.good));
    card.querySelector('#end-text').textContent = storyText(end.text);
    card.querySelector('#end-home').focus();
    this.endGuard.arm();
  }

  /** The speaker's display name; a literal speaker ("Velký bobr") as written. */
  speakerName(line, characters) {
    const speaker = line?.speaker;
    const character = typeof speaker === 'string' && Object.hasOwn(characters, speaker) ? characters[speaker] : null;
    return storyText(character?.displayName ?? speaker);
  }

  /** A line's speaker and text; a null line (no visible line) shows an empty dialogue. */
  showDialogue(line, characters) {
    this.elements.speakerName.textContent = this.speakerName(line, characters);
    this.elements.dialogueText.textContent = storyText(line?.text);
  }

  /**
   * The choices (whole choice objects; onChoice gets the picked one), centred with `center` (D37). `line`: the
   * line shown with them, { speakerName, text } or null, repeated as the phone panel's heading.
   */
  showChoices(choices, onChoice, { center = false, line = null } = {}) {
    this.choices = choices;
    this.choiceList.replaceChildren();
    this.elements.choicePanel.classList.toggle('hidden', choices.length === 0);
    this.elements.root.classList.toggle('choices-center', center && choices.length > 0);
    this.choiceList.classList.toggle('many', choices.length > 3);
    const text = storyText(line?.text);
    this.choiceHeading.classList.toggle('hidden', !text);
    this.choiceHeading.querySelector('strong').textContent = text ? storyText(line.speakerName) : '';
    this.choiceHeading.querySelector('span').textContent = text;

    choices.forEach((choice, index) => {
      const button = document.createElement('button');
      button.className = 'choice-button';
      button.type = 'button';
      button.dataset.index = index;
      button.textContent = `${index + 1}. ${storyText(choice.text)}`;
      this.choiceList.appendChild(button);
    });
    if (choices.length > 0) this.choiceGuard.shown((index) => onChoice(this.choices[index]));
  }

  /** A number key (inputController has asked the guard): the index-th shown choice. */
  pickChoice(index) {
    if (index < this.choices.length) this.choiceGuard.onChoice?.(index);
  }

  /** Whether the end card is open. */
  endOpen() {
    return this.elements.root.classList.contains('end-open');
  }

  hasOpenChoices() {
    return this.choices.length > 0;
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

/** Story text as text: anything that isn't a string (a typo in the story files) shows as nothing. */
export function storyText(value) {
  return typeof value === 'string' ? value : '';
}

function endLabel(end) {
  return end.good ? 'Dobrý konec' : 'Špatný konec';
}
