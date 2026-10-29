import './styles/main.css';
import { startVisualNovel } from './engine/startVisualNovel.js';

startVisualNovel({
  pixiHost: document.querySelector('#pixi-host'),
  storyUrl: `${import.meta.env.BASE_URL}story/story.json`,
  ui: {
    speakerName: document.querySelector('#speaker-name'),
    dialogueText: document.querySelector('#dialogue-text'),
    choicePanel: document.querySelector('#choice-panel'),
    saveStatus: document.querySelector('#save-status'),
    backButton: document.querySelector('#back-button'),
    menuButton: document.querySelector('#menu-button'),
    endCard: document.querySelector('#end-card'),
    mainMenu: document.querySelector('#main-menu'),
    root: document.querySelector('#game-root'),
  },
}).catch((error) => {
  console.error(error);
  document.querySelector('#dialogue-text').textContent =
    'The visual novel failed to load. Open the browser console for details.';
});
