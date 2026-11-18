// The wisent's song in the story (D46): hory_zubr's new lines → the minigame (hory_zubr_zpev, no music) → the win
// (hory_zubr_pomoc: zubr, melodie) or, with no result dialog, the lose screen (hory_zubr_prohra: a retry, or giving up
// the half-day), held until the input is quiet; the return visit's own lines, Back. The game itself:
// tests/browser/zubr.test.mjs.
//   node tests/browser/zubrStory.test.mjs <base url>   (ONLY=<part of a check name>; base url default http://localhost:5173/)
// Needs a running server (npm run dev, npm run preview, or the live site) and the installed Chrome. Each check seeds a
// save on hory_zubr's line 5 (its last line before D46) and routes lokace-hory.json to give the round its config.
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';

const base = process.argv[2] ?? 'http://localhost:5173/';
const ONLY = process.env.ONLY;
const SAVE_KEY = 'vn:draci-jezdkyne-z-vlpu:autosave2';
const browser = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
let failures = 0;
// A round lost on the first shout (four keys at once), its intro short.
const LOSE = { mistakes: 1, introGap: 0.05, introTail: 0.05 };

async function check(name, fn, { viewport = { width: 1280, height: 720 }, config = LOSE, memory = { pul: 1, hory_zubr: 1 },
  at = ['hory_zubr', 5], settings = {}, allowErrors, hasTouch = false,
  history = [{ sceneId: 'a2_kam', line: 0, memory: { pul: 0 } }] } = {}) {
  if (ONLY && !name.includes(ONLY)) return;
  const context = await browser.newContext({ viewport, hasTouch, isMobile: hasTouch });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.location().url.endsWith('/favicon.ico') && !(allowErrors && allowErrors.test(m.text()))) errors.push(m.text());
  });
  const save = {
    currentSceneId: at[0], currentLine: at[1], memory, history, readSceneIds: [], endings: [],
    settings: { musicVolume: 75, effectsVolume: 75, autoRead: false, difficulty: 'normal', ...settings },
  };
  await page.addInitScript(([key, value]) => {
    if (sessionStorage.getItem('seeded')) return;
    localStorage.setItem(key, value);
    sessionStorage.setItem('seeded', '1');
  }, [SAVE_KEY, JSON.stringify(save)]);
  await page.route('**/story/lokace-hory.json', async (route) => {
    const response = await route.fetch();
    const part = await response.json();
    const game = part.scenes.find((s) => s.id === 'hory_zubr_zpev'); // (absent before D46: the checks fail)
    if (game && config) game.minigame.config = config;
    await route.fulfill({ response, json: part });
  });
  try {
    await page.goto(base);
    await page.waitForSelector('#menu-start:not([disabled])');
    await page.click('#menu-start');
    await page.waitForTimeout(600); // the 500 ms the story waits after the menu closes (D27)
    await fn(page);
    assert.deepEqual(errors, [], 'console errors');
    console.log(`ok   ${name}`);
  } catch (error) {
    failures += 1;
    console.log(`FAIL ${name}\n     ${String(error.message).split('\n').join('\n     ')}`);
  } finally {
    await context.close();
  }
}
const where = (page) => page.evaluate(() => ({ scene: window.__vn.sceneId, line: window.__vn.line, memory: { ...window.__vn.memory } }));
const memoryOf = async (page) => (await where(page)).memory;
const tap = (page) => page.mouse.click(page.viewportSize().width / 2, page.viewportSize().height * 0.3);
const waitScene = (page, id, timeout = 20000) => page.waitForFunction((s) => window.__vn.sceneId === s, id, { timeout });
const choiceTexts = (page) => page.$$eval('#choice-panel:not(.hidden) .choice-button', (b) => b.map((x) => x.textContent));
async function pick(page, text) {
  await page.waitForFunction(() => !document.querySelector('#choice-panel').classList.contains('waiting'));
  await page.locator('#choice-panel .choice-button', { hasText: text }).click();
}
/** Taps through hory_zubr's lines into the round; returns the lines shown. */
async function toRound(page) {
  const lines = [];
  for (let i = 0; i < 25; i += 1) {
    const w = await where(page);
    if (w.scene !== 'hory_zubr') break;
    lines.push(w.line);
    await tap(page);
    await page.waitForFunction(([l, s]) => window.__vn.line !== l || window.__vn.sceneId !== s, [w.line, w.scene]);
  }
  await page.waitForFunction(() => window.__vn?.minigames?.activeGame?.state);
  return lines;
}
/** Four keys at once in the demo: a shout, the one mistake LOSE allows, the charge. */
async function shout(page) {
  await page.waitForFunction(() => window.__vn?.minigames?.activeGame?.state?.phase === 'demo');
  for (const k of ['Digit1', 'Digit2', 'Digit4', 'Digit5']) await page.keyboard.press(k);
}
async function loseRound(page) {
  await toRound(page);
  await shout(page);
  await waitScene(page, 'hory_zubr_prohra');
}

await check('story: the first visit\'s new lines (6–8, 10–13 without the grove), a tap into the round: its HUD, no music', async (page) => {
  const lines = await toRound(page);
  assert.deepEqual(lines, [5, 6, 7, 8, 10, 11, 12, 13]);
  assert.equal(await page.evaluate(() => window.__vn.minigames.activeGame.constructor.name), 'ZubrMelodyMinigame');
  assert.equal(await page.textContent('.mg-title'), 'Píseň proti kletbám'); // SONG in zubrMelody.js
  assert.equal(await page.evaluate(() => window.__vn.audio.currentKey), null, 'a music track in the round');
  assert.equal(await page.evaluate(() => window.__vn.sceneId), 'hory_zubr_zpev');
});
await check('story: after the grove (haj_zeme) Anna remembers Triglav: line 9 instead of 6–8', async (page) => {
  assert.deepEqual(await toRound(page), [5, 9, 10, 11, 12, 13]);
}, { memory: { pul: 3, hory_zubr: 1, haj_zeme: 1 } });
await check('story: Těžká in Nastavení reaches the round (no mistake allowed: the status "Bez chyby!")', async (page) => {
  await toRound(page);
  await page.waitForFunction(() => window.__vn?.minigames?.activeGame?.state?.phase === 'demo');
  assert.deepEqual(await page.evaluate(() => [window.__vn.minigames.activeGame.cfg.level, window.__vn.minigames.activeGame.cfg.mistakes]), ['hard', 1]);
  assert.equal(await page.textContent('.mg-status'), 'Bez chyby!');
}, { settings: { difficulty: 'hard' }, config: {} });
await check('story: skip → Vyhrát wins the helper (hory_zubr_pomoc: zubr, melodie)', async (page) => {
  await toRound(page);
  await page.click('.mg-skip-btn');
  await page.click('.mg-skip-win');
  await waitScene(page, 'hory_zubr_pomoc');
  const m = await memoryOf(page);
  assert.equal(m.zubr, 1);
  assert.equal(m.melodie, 1);
  assert.match(await page.textContent('#dialogue-text'), /^Poslední tón odplul/);
});
await check('story: the effects slider moved in Nastavení after a round sets the song\'s bus (its gain into Howler\'s master gain)', async (page) => {
  await toRound(page);
  await page.evaluate(() => { window.__bus = window.__vn.minigames.activeGame.output; });
  assert.ok(await page.evaluate(() => window.__bus instanceof GainNode), 'set-up: no bus');
  await page.click('.mg-skip-btn');
  await page.click('.mg-skip-win');
  await waitScene(page, 'hory_zubr_pomoc');
  await page.click('#menu-button');
  await page.click('#menu-main [data-page="settings"]');
  await page.locator('#setting-effects').fill('40');
  await page.locator('#setting-effects').dispatchEvent('input');
  assert.ok(Math.abs(await page.evaluate(() => window.__bus.gain.value) - 0.7 * 0.4) < 1e-6, 'the bus didn\'t follow the slider');
});
await check('story: a real loss shows no dialog: the lose screen (no line, two centred numbered choices, the wisent)', async (page) => {
  await toRound(page);
  await page.evaluate(() => {
    window.__resultSeen = false;
    new MutationObserver(() => { if (document.querySelector('.mg-result:not(.hidden)')) window.__resultSeen = true; })
      .observe(document.body, { subtree: true, childList: true, attributes: true });
  });
  await shout(page);
  await waitScene(page, 'hory_zubr_prohra');
  assert.equal(await page.evaluate(() => window.__resultSeen), false, 'the result dialog showed');
  assert.deepEqual(await choiceTexts(page), ['1. Zkusit to znovu.', '2. Odletět a vrátit se později.']);
  assert.equal(await page.evaluate(() => document.querySelector('#game-root').classList.contains('choices-center')), true);
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('#dialogue-panel')).visibility), 'hidden');
  assert.deepEqual(await page.evaluate(() => window.__vn.stage.layers.characters.children.length), 1, 'the wisent on the lose screen');
});
await check('story: keys and touch taps every 0.7 s through the round\'s end hold it until 1.5 s of quiet; the first tap 0.3 s after the panel is refused', async (page) => {
  await toRound(page);
  await shout(page);
  await page.waitForFunction(() => window.__vn?.minigames?.activeGame?.state?.phase === 'charge');
  const until = Date.now() + 2200 + 2500;
  while (Date.now() < until) {
    await page.touchscreen.tap(100, 100);
    await page.keyboard.press('KeyX');
    await page.waitForTimeout(700);
    assert.equal(await page.evaluate(() => window.__vn.sceneId), 'hory_zubr_zpev', 'the lose screen while input goes on');
  }
  assert.equal(await page.evaluate(() => window.__vn?.minigames?.activeGame?.state?.phase), 'hold');
  await waitScene(page, 'hory_zubr_prohra', 5000);
  // A regression guard (D37's 500 ms already refuses it): a tap 0.3 s after the panel appears picks nothing.
  await page.waitForTimeout(300);
  await page.locator('#choice-panel .choice-button', { hasText: 'Odletět' }).click({ force: true });
  await page.waitForTimeout(200);
  assert.equal(await page.evaluate(() => window.__vn.sceneId), 'hory_zubr_prohra');
}, { hasTouch: true });
await check('story: 2 after a 2 s pause gives up; Back undoes it (the lose screen, the event played, pul as before)', async (page) => {
  await loseRound(page);
  await page.waitForTimeout(2000);
  await page.keyboard.press('Digit2');
  await waitScene(page, 'a2_kam', 3000);
  const m = await memoryOf(page);
  assert.equal(m.pul, 1);
  assert.equal(m.hory_zubr, undefined);
  assert.equal(m.zubr_prohra, 1);
  await page.waitForTimeout(600);
  await page.click('#back-button');
  await waitScene(page, 'hory_zubr_prohra', 3000);
  const back = await memoryOf(page);
  assert.equal(back.hory_zubr, 1);
  assert.equal(back.zubr_prohra, undefined);
  assert.equal(back.pul, 1);
});
await check('story: retry → the round again; Back after two losses shows the lose screen once', async (page) => {
  await loseRound(page);
  await pick(page, 'Zkusit to znovu.');
  await page.waitForFunction(() => window.__vn?.minigames?.activeGame?.state);
  await shout(page);
  await waitScene(page, 'hory_zubr_prohra');
  await page.waitForTimeout(600);
  await page.click('#back-button');
  await page.waitForFunction(() => window.__vn.sceneId !== 'hory_zubr_prohra', null, { timeout: 3000 });
  assert.equal(await page.evaluate(() => window.__vn.sceneId), 'hory_zubr', 'Back went to the lose screen again');
});
await check('story: giving up → the hub, the half-day spent; the mountains offer the wisent again with lines 14–17 only', async (page) => {
  await loseRound(page);
  await pick(page, 'Odletět a vrátit se později.');
  await waitScene(page, 'a2_kam', 3000);
  assert.ok((await choiceTexts(page)).some((t) => t.includes('Do hor')));
  await pick(page, 'Do hor');
  await waitScene(page, 'hory_zubr', 3000);
  const back = await where(page);
  assert.equal(back.line, 14);
  assert.equal(back.memory.pul, 2);
  const lines = await toRound(page);
  assert.deepEqual(lines, [14, 15, 16, 17]);
});
const SFX = 'assets/minigames/dragon-attack/sfx/';
// Three existing files standing in for the sounds Sára picks (each event's own file, to count them apart).
const SOUNDS = { snort: `${SFX}fireball_hit.mp3`, charge: `${SFX}beaver_cry.mp3`, clear: `${SFX}emma_hit.mp3` };
/** Counts Howl plays by file (Howler is a global on the page). */
const countPlays = (page) => page.evaluate(() => {
  window.__plays = {};
  const play = window.Howl.prototype.play;
  window.Howl.prototype.play = function (...args) {
    const src = String(this._src).split('/').pop();
    window.__plays[src] = (window.__plays[src] ?? 0) + 1;
    return play.apply(this, args);
  };
});
await check('sounds: a mistake plays the snort; the last one only the charge\'s sound (not the snort too); a won song the shimmer (stand-in files)', async (page) => {
  await countPlays(page);
  await toRound(page);
  await page.waitForFunction(() => window.Howl && Object.values(window.Howler._howls).filter((h) => h.state() === 'loaded').length >= 3, null, { timeout: 10000 });
  await shout(page); // the first of two mistakes: a snort
  await page.waitForFunction(() => window.__vn.minigames.activeGame?.state?.phase === 'snort');
  assert.deepEqual(await page.evaluate(() => window.__plays), { 'fireball_hit.mp3': 1 }, 'the snort');
  await shout(page); // the second: the charge
  await waitScene(page, 'hory_zubr_prohra');
  const lost = await page.evaluate(() => window.__plays);
  assert.equal(lost['fireball_hit.mp3'], 1, `no snort with the charge: ${JSON.stringify(lost)}`);
  assert.equal(lost['beaver_cry.mp3'], 1, `the charge: ${JSON.stringify(lost)}`);
  assert.equal(lost['emma_hit.mp3'], undefined, 'the shimmer on a loss');
  await page.waitForFunction(() => !document.querySelector('#choice-panel').classList.contains('waiting'));
  await page.locator('#choice-panel .choice-button', { hasText: 'Zkusit to znovu.' }).click();
  await page.waitForFunction(() => window.__vn?.minigames?.activeGame?.state?.phase === 'demo');
  // Straight to the finale's end (the rules' own fields): the song sung, the shimmer.
  await page.evaluate(() => {
    const g = window.__vn.minigames.activeGame;
    Object.assign(g.state, { step: g.cfg.steps.length - 1, done: g.cfg.steps.length, phase: 'success', phaseT: g.cfg.successSeconds - 0.01 });
  });
  await page.waitForFunction(() => window.__vn.minigames.activeGame?.state?.phase === 'finale');
  await page.evaluate(() => { const g = window.__vn.minigames.activeGame; g.state.phaseT = g.state.timeline.length - 0.1; });
  await page.waitForSelector('.mg-result:not(.hidden)', { timeout: 5000 });
  assert.equal(await page.evaluate(() => window.__plays['emma_hit.mp3']), 1, 'the shimmer');
}, { config: { ...LOSE, mistakes: 2, sounds: SOUNDS } });
await check('sounds: every sound 404 → the round still plays to its result', async (page) => {
  await page.route('**/dragon-attack/sfx/*.mp3', (route) => route.fulfill({ status: 404, body: '' }));
  await loseRound(page);
}, { config: { ...LOSE, sounds: SOUNDS }, allowErrors: /404|Failed to load|Sound failed/ });
await browser.close();
process.exit(failures ? 1 : 0);
