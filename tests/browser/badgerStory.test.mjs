// The badger cubs rescue in the story (D45): reka_jezevec → the minigame → the win (reka_jezevec_pomoc) or, with no
// result dialog, the lose screen (reka_jezevec_prohra: a retry, or giving up the half-day); the lose screen without a
// dialogue box; Back, reloads, the return visit, the six sounds. The game itself: tests/browser/badger.test.mjs.
//   node tests/browser/badgerStory.test.mjs <base url>   (ONLY=<part of a check name>; base url default http://localhost:5173/)
// Needs a running server (npm run dev, npm run preview, or the live site) and the installed Chrome. Each check seeds a
// save on reka_jezevec's last line and routes lokace-reka.json to give the round its config.
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:5173/';
const ONLY = process.env.ONLY;
const SHOTS = process.env.SHOTS; // a folder for the lose screen's screenshots (optional)
const SAVE_KEY = 'vn:draci-jezdkyne-z-vlpu:autosave2';
const browser = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
let failures = 0;
// A round that never floods by itself (the checks put the pieces they need on the river) and one lost at once.
const QUIET = { firstFlood: 60, logs: [] };
const LOSE = { motherSaves: 0, currentSpeed: 300, firstFlood: 0.5, logs: [] };
const SFX = 'assets/minigames/dragon-attack/sfx/';
// Six existing files standing in for the sounds Sára picks (each event's own file, to count them apart).
const SOUNDS = { dive: `${SFX}bezzubka_shot.mp3`, splash: `${SFX}fireball_hit.mp3`, bump: `${SFX}log_land.mp3`,
  caught: `${SFX}beaver_cry.mp3`, mother: `${SFX}emma_hit.mp3`, lost: `${SFX}anna_hit.mp3` };

/**
 * A fresh page with a save on reka_jezevec's last line (day 1's afternoon: the router then goes to the hub), the
 * minigame scene's config replaced by `config` (`edit` changes the dam's file further), entered through Pokračovat.
 */
async function check(name, fn, { viewport = { width: 1280, height: 720 }, config = QUIET, memory = { pul: 1, reka_jezevec: 1 },
  at = ['reka_jezevec', 7], settings = {}, allowErrors, edit, hasTouch = false,
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
    currentSceneId: at[0], currentLine: at[1], memory,
    history,
    readSceneIds: [], endings: [], settings: { musicVolume: 75, effectsVolume: 75, autoRead: false, difficulty: 'normal', ...settings },
  };
  // Seeded once per page (a reload keeps what the game saved).
  await page.addInitScript(([key, value]) => {
    if (sessionStorage.getItem('seeded')) return;
    localStorage.setItem(key, value);
    sessionStorage.setItem('seeded', '1');
  }, [SAVE_KEY, JSON.stringify(save)]);
  await page.route('**/story/lokace-reka.json', async (route) => {
    const response = await route.fetch();
    const part = await response.json();
    const game = part.scenes.find((s) => s.id === 'reka_jezevec_zachrana'); // (absent before D45: the checks fail)
    if (game) game.minigame.config = config;
    edit?.(part);
    await route.fulfill({ response, json: part });
  });
  try {
    await page.goto(base);
    await enter(page);
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
/** Pokračovat on the main menu, then the 500 ms the story waits after the menu closes (D27). */
async function enter(page) {
  await page.waitForSelector('#menu-start:not([disabled])');
  await page.click('#menu-start');
  await page.waitForFunction(() => !document.querySelector('#main-menu') || document.querySelector('#main-menu').classList.contains('hidden')
    || getComputedStyle(document.querySelector('#main-menu')).display === 'none');
  await page.waitForTimeout(600);
}
const where = (page) => page.evaluate(() => ({ scene: window.__vn.sceneId, line: window.__vn.line, memory: { ...window.__vn.memory } }));
const memoryOf = async (page) => (await where(page)).memory;
/** A tap on the picture (above the dialogue), as a player advances. */
const tap = (page) => page.mouse.click(page.viewportSize().width / 2, page.viewportSize().height * 0.3);
async function startRound(page) {
  await tap(page);
  await page.waitForFunction(() => window.__vn.minigames.activeGame?.state);
}
const waitScene = (page, id, timeout = 20000) => page.waitForFunction((s) => window.__vn.sceneId === s, id, { timeout });
/** Records whether the minigame's result dialog ever shows. */
const watchResult = (page) => page.evaluate(() => {
  window.__resultSeen = false;
  new MutationObserver(() => {
    if (document.querySelector('.mg-result:not(.hidden)')) window.__resultSeen = true;
  }).observe(document.body, { subtree: true, childList: true, attributes: true });
});
/** The skip menu: Přeskočit, then Vyhrát or Prohrát. */
async function skip(page, win) {
  await page.click('.mg-skip-btn');
  await page.click(win ? '.mg-skip-win' : '.mg-skip-lose');
}
const choiceTexts = (page) => page.$$eval('#choice-panel:not(.hidden) .choice-button', (b) => b.map((x) => x.textContent.replace(/^\d+\. /, ''))); // without the key number
/** A choice by its text, once the choice guard lets taps through (500 ms of quiet, D37). */
async function pick(page, text) {
  await page.waitForFunction(() => !document.querySelector('#choice-panel').classList.contains('waiting'));
  await page.locator('#choice-panel .choice-button', { hasText: text }).click();
}
async function loseRound(page) {
  await startRound(page);
  await waitScene(page, 'reka_jezevec_prohra');
}
/** Waits until the flying dragon can dive over the field; `under` puts a piece under its claws first. */
async function dive(page, under = null) {
  await page.waitForFunction(() => {
    const g = window.__vn.minigames.activeGame;
    const x = g.state.dragon.x + g.state.catch[g.state.dragon.index % g.state.catch.length].dx;
    return g.state.dragon.phase === 'fly' && x > 100 && x < g.state.W - 100 && g.state.t >= g.state.dragon.cooldownUntil;
  });
  await page.evaluate((kind) => {
    const s = window.__vn.minigames.activeGame.state;
    const x = s.dragon.x + s.catch[s.dragon.index % s.catch.length].dx;
    if (kind === 'branch') {
      const cub = s.cubs.find((c) => c.status === 'hole');
      cub.status = 'float';
      s.pieces.push({ id: `test${cub.id}`, kind: 'branch', x, speed: 0, cub: cub.id, held: false });
    } else if (kind === 'log') s.pieces.push({ id: 'testlog', kind: 'log', x, speed: 0, cub: null, held: false });
  }, under);
  await page.keyboard.press('Space');
  await page.waitForFunction(() => window.__vn.minigames.activeGame.state.dragon.phase === 'up');
  await page.waitForFunction(() => window.__vn.minigames.activeGame.state.dragon.phase === 'fly');
}
/** A cub's branch at the river's right edge: the mother saves it while she can, else it floats away (the loss). */
const toTheEdge = (page) => page.evaluate(() => {
  const s = window.__vn.minigames.activeGame.state;
  const cub = s.cubs.find((c) => c.status === 'hole');
  cub.status = 'float';
  s.pieces.push({ id: `edge${cub.id}`, kind: 'branch', x: s.W - s.cfg.branchLength / 2 - 1, speed: 60, cub: cub.id, held: false });
});
/** The lose screen as planned: two centred choices, no line, no dialogue box, the panel down to the box's bottom. */
async function assertLoseScreen(page) {
  await page.waitForFunction(() => !document.querySelector('#choice-panel').classList.contains('waiting'));
  assert.deepEqual(await choiceTexts(page), ['Zkusit to znovu.', 'Odletět a vrátit se později.']);
  const look = await page.evaluate(() => {
    const panel = document.querySelector('#choice-panel').getBoundingClientRect();
    return {
      text: document.querySelector('#dialogue-text').textContent,
      dialogue: getComputedStyle(document.querySelector('#dialogue-panel')).visibility,
      center: document.querySelector('#game-root').classList.contains('choices-center'),
      heading: document.querySelector('.choice-heading')?.textContent.trim() ?? '',
      gap: innerHeight - panel.bottom,
      inside: [...document.querySelectorAll('#choice-panel .choice-button')].every((b) => {
        const r = b.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth && b.contains(hit);
      }),
    };
  });
  assert.equal(look.text, '', 'no line');
  assert.equal(look.dialogue, 'hidden', 'no empty dialogue box');
  assert.equal(look.center, true, 'centred choices');
  assert.equal(look.heading, '', 'no heading');
  assert.ok(look.gap <= 60, `the panel ends ${look.gap} px above the bottom (the hidden box's bottom: at most 3rem + the inset)`);
  assert.ok(look.inside, 'every choice inside the window and not covered');
}

await check('story: a tap on reka_jezevec\'s last line starts the badger rescue on its own background', async (page) => {
  assert.deepEqual(await where(page), { scene: 'reka_jezevec', line: 7, memory: { pul: 1, reka_jezevec: 1 } });
  await startRound(page);
  assert.equal(await page.evaluate(() => window.__vn.sceneId), 'reka_jezevec_zachrana');
  assert.equal(await page.textContent('.mg-title'), 'Záchrana jezevčat');
  assert.equal(await page.textContent('.mg-score'), 'V bezpečí: 0 z 9');
  assert.equal(await page.evaluate(() => window.__vn.minigames.activeGame.cfg.currentSpeed), 70);
  assert.equal(await page.evaluate(() => window.__vn.audio.currentKey), 'zachrana');
});
await check('story: Lehká in Nastavení reaches the round (current 50)', async (page) => {
  await startRound(page);
  assert.equal(await page.evaluate(() => window.__vn.minigames.activeGame.cfg.currentSpeed), 50);
}, { settings: { difficulty: 'easy' } });
await check('story: skip → Vyhrát wins the helper (reka_jezevec_pomoc, jezevci)', async (page) => {
  await startRound(page);
  await skip(page, true);
  await waitScene(page, 'reka_jezevec_pomoc');
  assert.equal((await memoryOf(page)).jezevci, 1);
});
await check('story: a real win shows Vítězství! and Pokračovat goes on to reka_jezevec_pomoc', async (page) => {
  await startRound(page);
  await page.evaluate(() => {
    const s = window.__vn.minigames.activeGame.state;
    s.cubs.slice(1).forEach((c) => { c.status = 'caught'; });
    s.safe = s.cubs.length - 1;
  });
  await dive(page, 'branch');
  await page.waitForSelector('.mg-result:not(.hidden)', { timeout: 5000 });
  assert.equal(await page.textContent('.mg-result-title'), 'Vítězství!');
  await page.waitForTimeout(700);
  await page.click('.mg-result-continue');
  await waitScene(page, 'reka_jezevec_pomoc');
  assert.equal((await memoryOf(page)).jezevci, 1);
});
await check('story: a real loss shows no result dialog and goes on to the lose screen (1280×720)', async (page) => {
  await startRound(page);
  await watchResult(page);
  const before = await page.evaluate(() => { window.__roundTrack = window.__vn.audio.currentTrack; return window.__vn.audio.currentKey; });
  assert.equal(before, 'zachrana');
  await waitScene(page, 'reka_jezevec_prohra');
  assert.equal(await page.evaluate(() => window.__resultSeen), false, 'the result dialog showed');
  assert.equal(await page.evaluate(() => window.__vn.audio.currentTrack === window.__roundTrack), true, 'the music track changed');
  await assertLoseScreen(page);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/lose-1280x720.png` });
  const m = await memoryOf(page);
  assert.equal(m.pul, 1);
  assert.equal(m.jezevci, undefined);
}, { config: LOSE });
await check('story: the lose screen at 568×270 and 640×360 (touch): choices inside the window, no box, no heading', async (page) => {
  await loseRound(page);
  await assertLoseScreen(page);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/lose-568x270.png` });
  await page.setViewportSize({ width: 640, height: 360 });
  await page.waitForTimeout(200);
  await assertLoseScreen(page);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/lose-640x360.png` });
}, { config: LOSE, viewport: { width: 568, height: 270 }, hasTouch: true });
await check('story: skip → Prohrát goes to the lose screen at once', async (page) => {
  await startRound(page);
  await watchResult(page);
  await skip(page, false);
  await waitScene(page, 'reka_jezevec_prohra', 3000);
  assert.equal(await page.evaluate(() => window.__resultSeen), false);
  await assertLoseScreen(page);
});
/**
 * ← or Backspace through a lost round, `held` (one press, then repeats every 50 ms) or mashed (a press every 150 ms),
 * on until 1.5 s after the lose screen: the story never steps Back (D45). Then, after 600 ms of quiet, one press goes
 * Back as ever.
 */
async function backThroughLoss(page, key, held, { thenMash = false } = {}) {
  await startRound(page);
  let shownAt = null;
  if (held) await page.keyboard.down(key);
  let mashing = false;
  for (let i = 0; i < 400; i += 1) {
    if (held && !mashing) await page.keyboard.down(key); // a repeat (Playwright: repeat true while the key is down)
    else await page.keyboard.press(key);
    await page.waitForTimeout(held && !mashing ? 50 : 150);
    const scene = await page.evaluate(() => window.__vn.sceneId);
    if (scene !== 'reka_jezevec_zachrana' && scene !== 'reka_jezevec_prohra') {
      if (held && !mashing) await page.keyboard.up(key);
      throw new Error(`the ${held ? 'held' : 'mashed'} ${key} stepped Back to ${scene}`);
    }
    if (scene === 'reka_jezevec_prohra') shownAt ??= Date.now();
    if (thenMash && !mashing && shownAt !== null) { // let go once the lose screen shows, then mash
      await page.keyboard.up(key);
      mashing = true;
    }
    if (shownAt !== null && Date.now() - shownAt > 1500) break;
  }
  if (held && !mashing) await page.keyboard.up(key);
  assert.ok(shownAt !== null, 'set-up: the round was never lost');
  assert.equal((await memoryOf(page)).reka_jezevec, 1);
  await page.waitForTimeout(600);
  await page.keyboard.press(key);
  await page.waitForFunction(() => window.__vn.sceneId === 'reka_jezevec', null, { timeout: 2000 });
}
for (const key of ['ArrowLeft', 'Backspace']) {
  for (const held of [true, false]) {
    await check(`story: ${held ? 'holding' : 'mashing'} ${key === 'ArrowLeft' ? '←' : 'Backspace'} through a loss never steps Back; after 600 ms of quiet it does`,
      (page) => backThroughLoss(page, key, held), { config: LOSE });
  }
}
await check('story: holding ← through the round, then mashing it on the lose screen, never steps Back', (page) =>
  backThroughLoss(page, 'ArrowLeft', true, { thenMash: true }), { config: LOSE });
await check('story: a held ← in the story still repeats (more than one step Back), also after a lost round', async (page) => {
  await backThroughLoss(page, 'ArrowLeft', false);
  assert.equal(await page.evaluate(() => window.__vn.line), 7);
  await page.waitForTimeout(600);
  await page.keyboard.down('ArrowLeft'); // reka_jezevec line 7 → line 6
  for (let i = 0; i < 6; i += 1) {
    await page.waitForTimeout(60);
    await page.keyboard.down('ArrowLeft'); // repeats: on to line 5 …, then the hub
  }
  await page.keyboard.up('ArrowLeft');
  const at = await where(page);
  assert.ok(at.scene === 'a2_kam' || at.line <= 5, `a held ← stepped only once (at ${at.scene} line ${at.line})`);
}, { config: LOSE, history: [{ sceneId: 'a2_kam', line: 0, memory: { pul: 0 } },
  ...[5, 6].map((line) => ({ sceneId: 'reka_jezevec', line, memory: { pul: 1, reka_jezevec: 1 } }))] });
await check('story: tapping, mashing Space, Enter and 2 through the round\'s end picks no choice', async (page) => {
  await startRound(page);
  const mash = page.evaluate(() => new Promise((resolve) => {
    // From the page: keys and taps every 60 ms for 3 s after the round ends (2 would pick the give-up). The taps keep
    // the choice guard busy; the guard's key handling on its own is D37's checks' (mobile-check/lines.mjs).
    let since = null;
    const id = setInterval(() => {
      if (window.__vn.sceneId === 'reka_jezevec_prohra') since ??= performance.now();
      for (const key of [' ', 'Enter', '2']) {
        window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
        window.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }));
      }
      const root = document.querySelector('#game-root');
      root.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 640, clientY: 300 }));
      root.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: 640, clientY: 300 }));
      if (since !== null && performance.now() - since > 3000) { clearInterval(id); resolve(); }
    }, 60);
  }));
  // Real keys too, held down through the end.
  await page.keyboard.down('2');
  await mash;
  await page.keyboard.up('2');
  assert.equal(await page.evaluate(() => window.__vn.sceneId), 'reka_jezevec_prohra');
  assert.equal((await memoryOf(page)).reka_jezevec, 1, 'the give-up was picked');
}, { config: LOSE });
await check('story: a reload on the lose screen shows its two choices and no dialogue box', async (page) => {
  await loseRound(page);
  await page.reload();
  await enter(page);
  assert.equal(await page.evaluate(() => window.__vn.sceneId), 'reka_jezevec_prohra');
  await assertLoseScreen(page);
}, { config: LOSE });
await check('story: retry → the round again; Back after two losses shows the lose screen once', async (page) => {
  await loseRound(page);
  await pick(page, 'Zkusit to znovu.');
  await page.waitForFunction(() => window.__vn.minigames.activeGame?.state);
  assert.equal(await page.evaluate(() => window.__vn.sceneId), 'reka_jezevec_zachrana');
  await waitScene(page, 'reka_jezevec_prohra');
  await page.waitForTimeout(600);
  await page.click('#back-button');
  await page.waitForFunction(() => window.__vn.sceneId === 'reka_jezevec');
  assert.equal(await page.evaluate(() => window.__vn.line), 7);
}, { config: LOSE });
await check('story: lose → retry → win → Back lands on the lose screen with the memory before the win', async (page) => {
  await loseRound(page);
  // The retry wins: the routed config is fixed for the page, so the second round is won by the skip menu.
  await pick(page, 'Zkusit to znovu.');
  await page.waitForFunction(() => window.__vn.minigames.activeGame?.state);
  await skip(page, true);
  await waitScene(page, 'reka_jezevec_pomoc');
  await page.waitForTimeout(600);
  await page.click('#back-button');
  await waitScene(page, 'reka_jezevec_prohra', 3000);
  const m = await memoryOf(page);
  assert.equal(m.jezevci, undefined);
  assert.equal(m.reka_jezevec, 1);
}, { config: LOSE });
await check('story: giving up → the hub, the event offered again (lines 8–10), the half-day spent; Back un-does it', async (page) => {
  await loseRound(page);
  await pick(page, 'Odletět a vrátit se později.');
  await waitScene(page, 'a2_kam', 3000);
  const m = await memoryOf(page);
  assert.equal(m.pul, 1);
  assert.equal(m.reka_jezevec, undefined);
  assert.equal(m.jezevci_prohra, 1);
  assert.equal(m.jezevci, undefined);
  assert.ok((await choiceTexts(page)).includes('K přehradě'));
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('#dialogue-panel')).visibility), 'visible');
  // Back from the hub: the lose screen, the event played again in that memory.
  await page.waitForTimeout(600);
  await page.click('#back-button');
  await waitScene(page, 'reka_jezevec_prohra', 3000);
  assert.equal((await memoryOf(page)).reka_jezevec, 1);
  await pick(page, 'Odletět a vrátit se později.');
  await waitScene(page, 'a2_kam', 3000);
  // The dam picks the badger again (Math.random stubbed: the first of the two events) and shows the return's lines.
  await page.evaluate(() => { Math.random = () => 0; });
  await pick(page, 'K přehradě');
  await waitScene(page, 'reka_jezevec', 3000);
  const back = await where(page);
  assert.equal(back.line, 8);
  assert.equal(back.memory.pul, 2);
  assert.match(await page.textContent('#dialogue-text'), /^Řeka byla zase o kus výš/);
}, { config: LOSE });
await check('story: giving up on the last half-day goes on to the evening (a2_vecer3)', async (page) => {
  await loseRound(page);
  await pick(page, 'Odletět a vrátit se později.');
  await waitScene(page, 'a2_vecer3', 3000);
}, { config: LOSE, memory: { pul: 6, reka_jezevec: 1, rano2: 1, rano3: 1 } });
await check('story: a reload during the round runs the round again', async (page) => {
  await startRound(page);
  await page.reload();
  await page.waitForSelector('#menu-start:not([disabled])');
  await page.click('#menu-start');
  await page.waitForFunction(() => window.__vn.minigames.activeGame?.state);
  assert.equal(await page.evaluate(() => window.__vn.sceneId), 'reka_jezevec_zachrana');
});
await check('story: an error in a tick (D24) goes silently to the lose screen, nothing left running', async (page) => {
  const tickerBefore = await page.evaluate(() => window.__vn.stage.app.ticker.count);
  await startRound(page);
  await watchResult(page);
  await page.evaluate(() => {
    window.__game = window.__vn.minigames.activeGame; // run() forgets it once it settles
    window.__game.state.pieces = null; // step() throws on its next tick
  });
  await waitScene(page, 'reka_jezevec_prohra', 5000);
  assert.equal(await page.evaluate(() => window.__resultSeen), false);
  assert.equal(await page.evaluate(() => window.__game.finished), true);
  assert.equal(await page.evaluate(() => window.__vn.stage.app.ticker.count), tickerBefore);
}, { allowErrors: /Minigame error/ });
await check('sounds: each of the six plays once on its event (dive, splash, caught, bump, mother, lost)', async (page) => {
  await page.evaluate(() => {
    window.__plays = [];
    const play = window.Howl.prototype.play;
    window.Howl.prototype.play = function (...args) {
      if (this._src.includes('/sfx/')) window.__plays.push(this._src.replace(/^.*\//, ''));
      return play.apply(this, args);
    };
  });
  await startRound(page);
  await page.waitForFunction(() => window.Howler.ctx?.state === 'running'
    && window.Howler._howls.filter((h) => h._src.includes('/sfx/')).every((h) => h.state() === 'loaded'), null, { timeout: 10000 });
  const plays = () => page.evaluate(() => [...window.__plays].sort());
  await dive(page);
  await page.waitForFunction(() => window.__plays.length >= 2);
  assert.deepEqual(await plays(), ['bezzubka_shot.mp3', 'fireball_hit.mp3']);
  await dive(page, 'branch');
  await dive(page, 'log');
  await page.waitForFunction(() => window.__plays.length >= 6);
  assert.deepEqual(await plays(), ['beaver_cry.mp3', 'bezzubka_shot.mp3', 'bezzubka_shot.mp3', 'bezzubka_shot.mp3',
    'fireball_hit.mp3', 'log_land.mp3']);
  await toTheEdge(page);
  await page.waitForFunction(() => window.__plays.includes('emma_hit.mp3'));
  await page.waitForFunction(() => window.__vn.minigames.activeGame.state.mother.busyUntil < window.__vn.minigames.activeGame.state.t);
  await toTheEdge(page);
  await waitScene(page, 'reka_jezevec_prohra', 10000);
  assert.deepEqual(await plays(), ['anna_hit.mp3', 'beaver_cry.mp3', 'bezzubka_shot.mp3', 'bezzubka_shot.mp3',
    'bezzubka_shot.mp3', 'emma_hit.mp3', 'fireball_hit.mp3', 'log_land.mp3']);
}, { config: { ...QUIET, motherSaves: 1, sounds: SOUNDS } });
await check('sounds: every sound file 404 → the round still plays to its result', async (page) => {
  await page.route('**/sfx/*.mp3', (route) => route.fulfill({ status: 404 }));
  await startRound(page);
  await dive(page);
  await toTheEdge(page);
  await waitScene(page, 'reka_jezevec_prohra', 10000);
}, { config: { ...QUIET, motherSaves: 0, sounds: SOUNDS }, allowErrors: /404|sounds\.|Failed to load|decod/i });

await browser.close();
if (SHOTS) console.log(`screenshots in ${SHOTS} (${fs.readdirSync(SHOTS).length} files)`);
process.exit(failures ? 1 : 0);
