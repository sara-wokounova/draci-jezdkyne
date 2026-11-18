// The wisent's song (D46) on the play-test page: the page (the level select, the URL, the link, the latency line, no
// music), the config passed to the game, the HUD, the field, the stars', the replay button's and the words' geometry on
// phones, the input (touch, the digit keys by key position, the replay button and R), the words' light, the round (an
// echo, no automatic replay after taps, a mistake, a shout, the charge and the quiet before its result, a win), the audio (a tap's tone in its own task, the voices offline, the routing into Howler's master gain, the effects
// slider, a suspended context, a replaced one, the page's first Howl at load, the audio session), the art (only two
// textures awaited, each missing), the pauses, a skip while loading, errors (D24). The rules: tests/zubrRules.test.mjs.
//   node tests/browser/zubr.test.mjs <base url>   (ONLY=<part of a check name>; SHOTS=<folder> for screenshots;
//   base url default http://localhost:5173/). Needs a running server (npm run dev: the offline voices check imports
//   the module from the dev server and skips elsewhere) and the installed Chrome.
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';

const base = process.argv[2] ?? 'http://localhost:5173/';
const ONLY = process.env.ONLY;
const SHOTS = process.env.SHOTS;
const browser = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
let failures = 0;

// Records every oscillator start (its `when`, the context's time, and whether it ran inside a pointerdown's task) and
// every connect of a gain node, before the page's own scripts run.
const RECORDER = () => {
  window.__osc = [];
  window.__inPointerTask = false;
  document.addEventListener('pointerdown', () => {
    window.__inPointerTask = true;
    setTimeout(() => { window.__inPointerTask = false; }, 0);
  }, true);
  const start = AudioScheduledSourceNode.prototype.start;
  AudioScheduledSourceNode.prototype.start = function (when = 0, ...rest) {
    if (this instanceof OscillatorNode) window.__osc.push({ when, now: this.context.currentTime, inPointer: window.__inPointerTask, freq: this.frequency.value });
    return start.call(this, when, ...rest);
  };
  window.__connects = [];
  const connect = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (target, ...rest) {
    window.__connects.push({ from: this, to: target });
    return connect.call(this, target, ...rest);
  };
};

async function check(name, fn, viewport = { width: 1280, height: 720 }, options = {}) {
  if (ONLY && !name.includes(ONLY)) return;
  const { allowErrors, init, ...contextOptions } = options;
  const context = await browser.newContext({ viewport, ...contextOptions });
  const page = await context.newPage();
  await page.addInitScript(RECORDER);
  if (init) await page.addInitScript(init);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.location().url.endsWith('/favicon.ico') && !(allowErrors && allowErrors.test(m.text()))) errors.push(m.text());
  });
  try {
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
async function open(page, query = '') {
  await page.goto(`${base}playtest.html?game=zubr${query}`);
  await page.waitForFunction(() => window.__vn && document.querySelector('#pt-link')?.value);
}
/** Opens the page and starts a round; resolves once the round's state exists. */
async function startRound(page, query = '') {
  await open(page, query);
  await page.click('#pt-play');
  await page.waitForFunction(() => window.__vn?.minigames?.activeGame?.state);
}
const game = (page, fn, arg) => page.evaluate(([f, a]) => {
  const g = window.__vn.minigames.activeGame;
  // eslint-disable-next-line no-new-func
  return new Function('g', 'a', `return (${f})(g, a);`)(g, a);
}, [fn.toString(), arg]);
const phase = (page) => game(page, (g) => g?.state?.phase ?? null);
/** Where the round is (for a timeout's message); null when there is no round. */
const roundAt = (page) => page.evaluate(() => {
  const g = window.__vn?.minigames?.activeGame;
  return g && { phase: g.state?.phase, t: g.state?.t, mistakes: g.state?.mistakes, finished: g.finished, waiting: g.waitingForAudio, ctx: g.output?.context?.state };
}).catch(() => null);
/** Waits for a phase; on a timeout the error says where the round was. */
const waitPhase = (page, p, timeout = 20000) => page.waitForFunction((x) => window.__vn?.minigames?.activeGame?.state?.phase === x, p, { timeout })
  .catch(async (error) => { throw new Error(`waiting for ${p}: ${error.message.split('\n')[0]} at ${JSON.stringify(await roundAt(page))}`); });
/** The step's notes (stars) of the running round. */
const stepStars = (page) => game(page, (g) => g.cfg.steps[g.state.step].flatMap((p) => g.cfg.phrases[p].map(([s]) => s)));
const KEYS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'];
/** Echoes the current step by key, 0.45 s a note, once the echo is open. */
async function echoStep(page) {
  await waitPhase(page, 'echo');
  for (const star of await stepStars(page)) {
    await page.keyboard.press(KEYS[star]);
    await page.waitForTimeout(450);
  }
}
/** A star's centre on the screen (CSS px). */
const starOnScreen = (page, i) => game(page, (g, k) => {
  const p = g.starPoint(k);
  const rect = g.app.canvas.getBoundingClientRect();
  const sx = rect.width / g.app.screen.width;
  return { x: rect.left + (g.root.position.x + p.x * g.root.scale.x) * sx, y: rect.top + (g.root.position.y + p.y * g.root.scale.y) * sx, r: g.cfg.hitRadius * g.root.scale.x * sx };
}, i);
/** The round straight to its finale's end (the rules' own fields): the song sung, the result follows. */
async function toVictory(page) {
  await waitPhase(page, 'demo');
  await game(page, (g) => Object.assign(g.state, { step: g.cfg.steps.length - 1, done: g.cfg.steps.length - 1, phase: 'success', phaseT: g.cfg.successSeconds - 0.01 }));
  await game(page, (g) => { g.state.done = g.cfg.steps.length; });
  await waitPhase(page, 'finale');
  await game(page, (g) => { g.state.phaseT = g.state.timeline.length - 0.1; });
}
/** Mistakes until the charge: a key on a star that can't be right, once per echo. */
async function toCharge(page) {
  for (let i = 0; i < 10; i += 1) {
    await page.waitForFunction(() => ['echo', 'charge', 'hold'].includes(window.__vn?.minigames?.activeGame?.state?.phase), null, { timeout: 30000 })
      .catch(async (error) => { throw new Error(`toCharge: ${error.message.split('\n')[0]} at ${JSON.stringify(await roundAt(page))}`); });
    if (await phase(page) !== 'echo') return;
    const wrong = await game(page, (g) => {
      const notes = g.cfg.steps[g.state.step].flatMap((p) => g.cfg.phrases[p].map(([s]) => s));
      return [0, 1, 2, 3, 4].find((s) => s !== notes[0] && !g.state.timeline.notes.some((n) => n.star === s));
    });
    await page.keyboard.press(KEYS[wrong]);
    await page.waitForTimeout(50);
  }
  const at = await roundAt(page);
  if (!['charge', 'hold'].includes(at?.phase)) throw new Error(`toCharge: no charge after 10 wrong keys: ${JSON.stringify(at)}`);
}
const listenersOf = async (page, cdp, scripts) => {
  const out = [];
  for (const expression of ['window', 'document', "document.querySelector('#pixi-host canvas')"]) {
    const { result } = await cdp.send('Runtime.evaluate', { expression });
    const { listeners: list } = await cdp.send('DOMDebugger.getEventListeners', { objectId: result.objectId });
    for (const l of list) if ((scripts.get(l.scriptId) ?? '').includes('zubrMelody')) out.push(`${expression} ${l.type}`);
  }
  return out;
};
async function cdpListeners(page) {
  const cdp = await page.context().newCDPSession(page);
  const scripts = new Map();
  cdp.on('Debugger.scriptParsed', (s) => scripts.set(s.scriptId, s.url));
  await cdp.send('Debugger.enable');
  return () => listenersOf(page, cdp, scripts);
}

// --- the page --------------------------------------------------------------------------------------------------------
await check('page: heading, the level select, 9 sliders, the link with game=zubr&level=, the latency line, no music', async (page) => {
  await open(page);
  assert.equal(await page.title(), 'Zkušební píseň pro zubra');
  assert.equal(await page.textContent('#pt-heading'), 'Zkušební píseň pro zubra');
  assert.equal(await page.getAttribute('#pt-switch [data-game=zubr]', 'aria-current'), 'page');
  assert.equal(await page.locator('#pt-sliders input[type=range]').count(), 9);
  assert.equal(await page.isVisible('#pt-level'), true);
  assert.equal(await page.inputValue('#pt-level'), 'normal');
  assert.equal(await page.isVisible('#pt-latency'), true);
  assert.equal(await page.isVisible('#pt-field-note'), false);
  const link = await page.inputValue('#pt-link');
  assert.match(link, /playtest\.html\?game=zubr&level=normal&mistakes=3&red=0&echoLead=/);
  assert.match(link, /&beat=0\.4$/);
  assert.doesNotMatch(link, /steps=|stallReplay=|replay=/);
  assert.doesNotMatch(link, /field=/);
  assert.equal(await page.evaluate(() => Object.keys(window.__vn.audio.musicAssets).length), 0, 'a music track on the page');
  // The other pages keep no level select.
  await page.goto(`${base}playtest.html?game=jezevci`);
  await page.waitForFunction(() => document.querySelector('#pt-link')?.value);
  assert.equal(await page.isVisible('#pt-level'), false);
  assert.doesNotMatch(await page.inputValue('#pt-link'), /level=/);
  assert.equal(await page.isVisible('#pt-latency'), false);
});
await check('page: a level change rewrites the address in place (per-level sliders to its defaults, the rest kept); a link opens on its level', async (page) => {
  await open(page);
  await page.locator('input[name=burst]').fill('4');
  await page.locator('input[name=burst]').dispatchEvent('change');
  await page.selectOption('#pt-level', 'hard');
  assert.match(page.url(), /\?game=zubr&level=hard&mistakes=1&red=0&.*burst=4&/);
  assert.equal(await page.inputValue('input[name=mistakes]'), '1');
  assert.equal(await page.inputValue('input[name=burst]'), '4', 'a value that isn\'t per level stays');
  await page.selectOption('#pt-level', 'easy');
  assert.match(page.url(), /level=easy&mistakes=6&red=0&/);
  await open(page, '&level=hard&mistakes=4');
  assert.equal(await page.inputValue('#pt-level'), 'hard');
  assert.equal(await page.inputValue('input[name=mistakes]'), '4', 'the link\'s own value over the level\'s default');
  await open(page, '&level=easy&red=1');
  assert.equal(await page.inputValue('input[name=mistakes]'), '6', 'the level\'s default where the link says nothing');
  await open(page, '&level=nonsense');
  assert.equal(await page.inputValue('#pt-level'), 'normal');
});
await check('URL in: the values in the game\'s config, the level as the difficulty', async (page) => {
  await startRound(page, '&level=hard&mistakes=2&red=1&echoLead=0.3&followLag=0.8&anticipate=0.1&restartPause=3&burst=4&calm=2.5&beat=0.5');
  const cfg = await game(page, (g) => g.cfg);
  assert.equal(cfg.level, 'hard');
  assert.deepEqual([cfg.mistakes, cfg.rubinka, cfg.hintAfter], [2, 1, 20]);
  assert.deepEqual([cfg.echoLead, cfg.followLag, cfg.anticipate, cfg.restartPause], [0.3, 0.8, 0.1, 3]);
  assert.deepEqual([cfg.voice.burst, cfg.voice.calm, cfg.beat], [4, 2.5, 0.5]);
  assert.deepEqual(cfg.steps, [[0], [1], [2], [3]]);
  assert.equal(await page.textContent('.mg-score'), 'Píseň: 0 z 4');
  assert.equal(await page.textContent('.mg-status'), 'Zubr funí: 0 z 2');
});
await check('HUD: the title, score, status and the instructions (hidden after the first success)', async (page) => {
  await startRound(page);
  assert.equal(await page.textContent('.mg-title'), 'Píseň proti kletbám'); // SONG in zubrMelody.js
  assert.equal(await page.textContent('.mg-score'), 'Píseň: 0 z 4');
  assert.equal(await page.textContent('.mg-status'), 'Zubr funí: 0 z 3');
  assert.match(await page.textContent('.mg-instructions'), /Pomalu a potichu!/);
  await echoStep(page);
  await waitPhase(page, 'success');
  assert.equal(await page.isVisible('.mg-instructions'), false);
  await page.waitForFunction(() => document.querySelector('.mg-score').textContent === 'Píseň: 1 z 4');
});

// --- geometry --------------------------------------------------------------------------------------------------------
for (const viewport of [{ width: 568, height: 270 }, { width: 640, height: 360 }, { width: 1280, height: 720 }]) {
  await check(`geometry ${viewport.width}×${viewport.height}: the field on the background's rectangle; the stars ≥ 44 CSS px, under the HUD, apart, clear of the wisent; the meter clear; the replay button and the words clear of them`, async (page) => {
    await startRound(page);
    await waitPhase(page, 'demo');
    await page.waitForFunction(() => window.__vn.minigames.activeGame.wordsView.visible);
    const g = await game(page, (x) => {
      const scale = x.root.scale.x;
      const toCss = (fx, fy) => ({ x: x.root.position.x + fx * scale, y: x.root.position.y + fy * scale });
      const stars = x.cfg.stars.map((_, i) => x.starPoint(i));
      const body = x.zubrBody.getBounds();
      const roza = x.rozaView.getBounds();
      const meterX = x.cfg.meter[0] * 1066.24;
      return {
        screen: { w: x.app.screen.width, h: x.app.screen.height }, scale, pos: { x: x.root.position.x, y: x.root.position.y },
        stars, hit: x.cfg.hitRadius, backing: x.cfg.sizes.backing, lit: x.starViews[0].halo.getLocalBounds().width / 2,
        hud: x.hud.coveredTop(), body: { x: body.x, y: body.y, w: body.width, h: body.height },
        roza: { x: roza.x, y: roza.y, w: roza.width, h: roza.height },
        meter: { ...toCss(meterX - 30, x.cfg.meter[1] * 600 - x.cfg.sizes.meterHeight - 3), w: 60 * scale, h: (x.cfg.sizes.meterHeight + 6) * scale },
        pill: (() => { const r = document.querySelector('.mg-instructions').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })(),
        button: x.replayPoint(),
        label: (() => { const b = x.replayLabel.getBounds(); return { x: b.x, y: b.y, w: b.width, h: b.height }; })(),
        words: (() => { const b = x.wordsView.getBounds(); return { x: b.x, y: b.y, w: b.width, h: b.height }; })(),
        wordSize: x.cfg.sizes.words * scale,
      };
    });
    // The field: the background's contain rectangle, 600 game px tall.
    const fit = Math.min(g.screen.w / 1672, g.screen.h / 941);
    assert.ok(Math.abs(g.scale - (941 * fit) / 600) < 1e-6, 'the field\'s scale');
    assert.ok(Math.abs(g.pos.x - (g.screen.w - 1672 * fit) / 2) < 0.5 && Math.abs(g.pos.y - (g.screen.h - 941 * fit) / 2) < 0.5, 'the field\'s place');
    const css = (p) => ({ x: g.pos.x + p.x * g.scale, y: g.pos.y + p.y * g.scale });
    g.stars.forEach((p, i) => {
      assert.ok(2 * g.hit * g.scale >= 44, `star ${i}: its hit circle ${2 * g.hit * g.scale} CSS px across`);
      // The hit circle's top below the HUD bar (the stars move down under a tall bar, by 60 game px at most: then a
      // two-line bar may cover a few px, accepted).
      assert.ok(css(p).y - g.hit * g.scale >= g.hud - 0.5 || g.scale * 60 < g.hud - (css(p).y - g.hit * g.scale), `star ${i} under the HUD bar`);
      assert.ok(p.x - g.hit >= 0 && p.x + g.hit <= 1066.25 && p.y + g.hit <= 600, `star ${i} inside the field`);
      g.stars.forEach((q, j) => { if (j > i) assert.ok(Math.hypot(p.x - q.x, p.y - q.y) >= 2 * g.hit, `stars ${i} and ${j} overlap`); });
      const c = css(p);
      const reach = Math.max(g.backing, g.lit) * g.scale;
      const b = g.body;
      const overlaps = c.x + reach > b.x && c.x - reach < b.x + b.w && c.y + reach > b.y && c.y - reach < b.y + b.h;
      assert.ok(!overlaps, `star ${i}'s disc or halo over the wisent`);
    });
    const boxes = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    assert.ok(!boxes(g.meter, g.pill), 'the meter under the instructions pill');
    assert.ok(!g.stars.some((p) => { const c = css(p); return boxes(g.meter, { x: c.x - g.hit * g.scale, y: c.y - g.hit * g.scale, w: 2 * g.hit * g.scale, h: 2 * g.hit * g.scale }); }), 'the meter under a star');
    assert.ok(!boxes(g.meter, g.body), 'the meter over the wisent');
    // The replay button: its hit circle ≥ 44 CSS px, inside the field, under the HUD bar with its label; neither over a
    // star's hit circle, the meter, the words or the pill. The words: ≥ 14 CSS px, clear of the stars, the meter, the
    // pill, the wisent's body box and Róza.
    const circle = (c, r) => ({ x: c.x - r, y: c.y - r, w: 2 * r, h: 2 * r });
    const button = circle(css(g.button), g.hit * g.scale);
    assert.ok(2 * g.hit * g.scale >= 44, `the button's hit circle ${2 * g.hit * g.scale} CSS px across`);
    assert.ok(g.button.x - g.hit >= 0 && g.button.y + g.hit <= 600, 'the button inside the field');
    assert.ok(g.label.y >= g.hud - 0.5 && g.label.x >= g.pos.x - 0.5, `the label under the HUD bar (${g.label.y} < ${g.hud})`);
    const starCircles = g.stars.map((p) => circle(css(p), g.hit * g.scale));
    for (const [name, box] of [['the button', button], ['its label', g.label], ['the words', g.words]]) {
      starCircles.forEach((s, i) => assert.ok(!boxes(box, s), `${name} over star ${i}`));
      assert.ok(!boxes(box, g.meter), `${name} over the meter`);
      assert.ok(!boxes(box, g.pill), `${name} under the instructions pill`);
    }
    assert.ok(!boxes(button, g.words) && !boxes(g.label, g.words), 'the button over the words');
    assert.ok(!boxes(g.words, g.roza), 'the words over Róza');
    assert.ok(g.words.x >= g.body.x + g.body.w - 0.5 || !boxes(g.words, g.body), 'the words over the wisent');
    assert.ok(g.wordSize >= 14, `the words ${g.wordSize} CSS px`);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/zubr-${viewport.width}.png` });
  }, viewport);
}

// --- input -----------------------------------------------------------------------------------------------------------
await check('input: a touch tap on a star (640×360) taps it', async (page) => {
  await startRound(page);
  await waitPhase(page, 'demo');
  const p = await starOnScreen(page, 3);
  await page.touchscreen.tap(p.x + p.r * 0.6, p.y);
  await page.waitForFunction(() => window.__vn.minigames.activeGame.state.lastTap.star === 3);
  await page.touchscreen.tap(5, 5); // nowhere near a star: nothing
  assert.equal(await game(page, (g) => g.state.lastTap.star), 3);
}, { width: 640, height: 360 }, { hasTouch: true, isMobile: true });
await check('input: Digit1–5 and Numpad1–5 by key position (also with a Czech layout\'s characters); repeats and modifiers ignored', async (page) => {
  await startRound(page);
  await waitPhase(page, 'demo');
  for (let i = 0; i < 5; i += 1) {
    await game(page, (g) => { g.state.lastTap = { star: -1, t: -Infinity }; g.state.voice = 0; });
    await page.keyboard.press(KEYS[i]);
    assert.equal(await game(page, (g) => g.state.lastTap.star), i, KEYS[i]);
    await game(page, (g) => { g.state.lastTap = { star: -1, t: -Infinity }; g.state.voice = 0; });
    await page.keyboard.press(`Numpad${i + 1}`);
    assert.equal(await game(page, (g) => g.state.lastTap.star), i, `Numpad${i + 1}`);
  }
  // The Czech row: Digit3 types "š".
  await game(page, (g) => { g.state.lastTap = { star: -1, t: -Infinity }; g.state.voice = 0; });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit3', key: 'š' })));
  assert.equal(await game(page, (g) => g.state.lastTap.star), 2, 'Digit3 with key "š"');
  await game(page, (g) => { g.state.lastTap = { star: -1, t: -Infinity }; });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit2', key: 'ě', repeat: true })));
  assert.equal(await game(page, (g) => g.state.lastTap.star), -1, 'a repeat');
  for (const mod of ['ctrlKey', 'altKey', 'metaKey']) {
    await page.evaluate((m) => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit4', key: '4', [m]: true })), mod);
    assert.equal(await game(page, (g) => g.state.lastTap.star), -1, `Digit4 with ${mod}`);
  }
});

/** The replay button's centre on the screen (CSS px). */
const buttonOnScreen = (page) => game(page, (g) => {
  const p = g.replayPoint();
  const rect = g.app.canvas.getBoundingClientRect();
  const sx = rect.width / g.app.screen.width;
  return { x: rect.left + (g.root.position.x + p.x * g.root.scale.x) * sx, y: rect.top + (g.root.position.y + p.y * g.root.scale.y) * sx };
});
/** Waits for the echo with Róza's demo over (the replay button enabled). */
const waitReplayable = (page) => page.waitForFunction(() => {
  const s = window.__vn.minigames.activeGame?.state;
  return s?.phase === 'echo' && s.echoT0 + s.phaseT >= s.timeline.end;
}, null, { timeout: 20000 });
await check('replay button: dimmed while Róza sings (a tap on it does nothing); enabled after; a click and R sing the step again, free, and hide the instructions; repeats and modifiers ignored', async (page) => {
  await startRound(page);
  await waitPhase(page, 'demo');
  assert.ok(await game(page, (g) => g.replayButton.alpha < 0.5), 'dimmed in the demo');
  const b = await buttonOnScreen(page);
  await page.mouse.click(b.x, b.y);
  assert.equal(await phase(page), 'demo');
  assert.equal(await game(page, (g) => g.state.lastTap.star), -1, 'no star tapped');
  // The echo is open while her held note still sounds: still dimmed, a tap on it still nothing.
  await page.waitForFunction(() => { const s = window.__vn.minigames.activeGame.state; return s.phase === 'echo' && s.echoT0 + s.phaseT < s.timeline.end - 0.3; });
  await page.mouse.click(b.x, b.y);
  assert.equal(await phase(page), 'echo', 'a tap while her held note sounds');
  assert.ok(await game(page, (g) => g.replayButton.alpha < 0.5), 'dimmed while her held note sounds');
  await waitReplayable(page);
  assert.ok(await game(page, (g) => g.replayButton.alpha > 0.9), 'enabled after the demo');
  const stars = await stepStars(page);
  await page.keyboard.press(KEYS[stars[0]]);
  await page.mouse.click(b.x, b.y);
  assert.equal(await phase(page), 'demo', 'the click sings the step again');
  assert.deepEqual(await game(page, (g) => [g.state.step, g.state.mistakes]), [0, 0]);
  assert.equal(await page.isVisible('.mg-instructions'), false, 'the player\'s replay hides the instructions');
  // The label is part of the button.
  await waitReplayable(page);
  const label = await game(page, (g) => { const r = g.app.canvas.getBoundingClientRect(); const l = g.replayLabel.getBounds(); const sx = r.width / g.app.screen.width; return { x: r.left + (l.x + l.width / 2) * sx, y: r.top + (l.y + l.height / 2) * sx }; });
  await page.mouse.click(label.x, label.y);
  assert.equal(await phase(page), 'demo', 'a click on the label');
  await waitReplayable(page);
  for (const mod of ['ctrlKey', 'altKey', 'metaKey', 'repeat']) {
    await page.evaluate((m) => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyR', key: 'r', [m]: true })), mod);
    assert.equal(await phase(page), 'echo', `R with ${mod}`);
  }
  await page.keyboard.press('KeyR');
  assert.equal(await phase(page), 'demo', 'R');
  assert.equal(await game(page, (g) => g.state.mistakes), 0);
});
await check('replay button: a touch tap on it at 568×270; disabled in a snort and in the hold', async (page) => {
  await startRound(page);
  await waitReplayable(page);
  const b = await buttonOnScreen(page);
  await page.touchscreen.tap(b.x, b.y);
  assert.equal(await phase(page), 'demo');
  await waitPhase(page, 'echo');
  const wrong = await game(page, (g) => [0, 1, 2, 3, 4].find((s) => !g.state.timeline.notes.some((n) => n.star === s)));
  await page.keyboard.press(KEYS[wrong]);
  assert.equal(await phase(page), 'snort');
  await page.touchscreen.tap(b.x, b.y);
  assert.equal(await phase(page), 'snort', 'in a snort');
  assert.ok(await game(page, (g) => g.replayButton.alpha < 0.5), 'dimmed in a snort');
  await toCharge(page);
  await waitPhase(page, 'hold', 30000);
  await page.keyboard.press('KeyR');
  assert.equal(await phase(page), 'hold', 'in the hold');
}, { width: 568, height: 270 }, { hasTouch: true, isMobile: true });
await check('replay button: nothing replays by itself (Sára), before a tap or after; the button pulses after the quiet, a tap ends it', async (page) => {
  await startRound(page);
  await game(page, (g) => { g.cfg.hintAfter = 3; });
  // No tap at all: the pulse after 3 s of the echo, never a replay.
  await waitPhase(page, 'echo');
  await page.waitForFunction(() => window.__vn.minigames.activeGame.replayPulse.getLocalBounds().width > 0, null, { timeout: 8000 });
  await page.waitForTimeout(2000);
  assert.equal(await phase(page), 'echo', 'no automatic replay without a tap');
  await page.keyboard.press('KeyR');
  await waitReplayable(page);
  const stars = await stepStars(page);
  await page.keyboard.press(KEYS[stars[0]]);
  await page.waitForTimeout(400);
  await page.keyboard.press(KEYS[stars[1]]);
  await page.waitForTimeout(1500);
  assert.equal(await game(page, (g) => g.replayPulse.getLocalBounds().width), 0, 'no pulse yet');
  await page.waitForFunction(() => window.__vn.minigames.activeGame.replayPulse.getLocalBounds().width > 0, null, { timeout: 4000 });
  await page.waitForTimeout(2000);
  assert.equal(await phase(page), 'echo', 'still the echo: no automatic replay after taps');
  await page.keyboard.press(KEYS[stars[2]]);
  await page.waitForTimeout(100);
  assert.equal(await game(page, (g) => g.replayPulse.getLocalBounds().width), 0, 'a tap ends the pulse');
});
await check('words: the line Róza sings, her syllable gold; in the echo the echoed syllables white, the next underlined; faded out at a charge', async (page) => {
  await startRound(page);
  await waitPhase(page, 'demo');
  await page.waitForFunction(() => window.__vn.minigames.activeGame.wordsView.visible);
  const texts = await game(page, (g) => g.wordTexts.map((x) => x.text));
  assert.deepEqual(texts, ['Ci', 'zí', 'pí', 'seň', 'ztrá', 'cí', 'moc,']);
  await page.waitForFunction(() => window.__vn.minigames.activeGame.wordTexts.some((x) => x.style.fill === 0xf0e442), null, { timeout: 3000 });
  assert.equal(await game(page, (g) => g.wordTexts.filter((x) => x.style.fill === 0xf0e442).length), 1, 'one gold syllable');
  await waitReplayable(page);
  const stars = await stepStars(page);
  await page.keyboard.press(KEYS[stars[0]]);
  await page.waitForTimeout(400);
  await page.keyboard.press(KEYS[stars[1]]);
  await page.waitForTimeout(50);
  assert.deepEqual(await game(page, (g) => g.wordTexts.map((x) => x.style.fill === 0xffffff && x.alpha === 1)), [true, true, false, false, false, false, false]);
  assert.ok(await game(page, (g) => { const u = g.underline.getLocalBounds(); const n = g.wordTexts[2]; return u.width > 0 && Math.abs(u.x - n.x) < 1 && Math.abs(u.width - n.width) < 1; }), 'the next syllable underlined');
  await toCharge(page);
  // At the charge they fade out with the stars (0.6 s), then stay hidden.
  await page.waitForFunction(() => { const g = window.__vn.minigames.activeGame; return g.state.phase === 'charge' && g.wordsView.visible && g.wordsView.alpha < 1; }, null, { timeout: 3000 });
  await page.waitForFunction(() => !window.__vn.minigames.activeGame.wordsView.visible, null, { timeout: 5000 });
});

// --- the round -------------------------------------------------------------------------------------------------------
await check('round: a right echo → success; a wrong star → a snort and the same step again; four taps at once → a shout', async (page) => {
  await startRound(page);
  await echoStep(page);
  await waitPhase(page, 'success');
  assert.equal(await game(page, (g) => g.state.done), 1);
  await waitPhase(page, 'echo');
  const step = await game(page, (g) => g.state.step);
  const wrong = await game(page, (g) => {
    const notes = g.cfg.steps[g.state.step].flatMap((p) => g.cfg.phrases[p].map(([s]) => s));
    return [0, 1, 2, 3, 4].find((s) => s !== notes[0] && !g.state.timeline.notes.some((n) => n.star === s));
  });
  await page.keyboard.press(KEYS[wrong]);
  assert.equal(await phase(page), 'snort');
  await page.waitForFunction(() => document.querySelector('.mg-status').textContent === 'Zubr funí: 1 z 3');
  await waitPhase(page, 'demo');
  assert.equal(await game(page, (g) => g.state.step), step);
  // Four taps at once on four stars (in the demo): a shout, the burst shown, a mistake.
  for (const k of [0, 1, 3, 4]) await page.keyboard.press(KEYS[k]);
  assert.equal(await game(page, (g) => g.state.mistakes), 2);
  assert.equal(await game(page, (g) => g.state.shouts), 1);
  await page.waitForFunction(() => { // the burst drawn on the meter
    const g = window.__vn.minigames.activeGame;
    return g.fx.shout > -Infinity && g.burst.getLocalBounds().width > 0;
  }, null, { timeout: 2000 });
});
await check('round: three mistakes → the charge (Bezzubka rises), held while input goes on, then "Zubr se rozzlobil" after 1.5 s of quiet', async (page) => {
  await startRound(page);
  await toCharge(page);
  assert.equal(await phase(page), 'charge');
  await page.waitForFunction(() => window.__vn.minigames.activeGame.dragonView);
  assert.equal(await game(page, (g) => g.rozaView.visible), false, 'one Róza at a time');
  // A key every 0.7 s through the charge and 2 s past it: the result waits.
  const until = Date.now() + 2200 + 2000;
  let quietFrom = 0;
  while (Date.now() < until) {
    await page.keyboard.press('KeyX');
    quietFrom = Date.now();
    await page.waitForTimeout(700);
    assert.equal(await page.isVisible('.mg-result'), false, 'the result while input goes on');
  }
  assert.equal(await phase(page), 'hold');
  assert.ok(await game(page, (g) => g.ring.getLocalBounds().width > 0));
  await page.waitForSelector('.mg-result:not(.hidden)', { timeout: 5000 });
  assert.ok(Date.now() - quietFrom >= 1300, `the result after ${Date.now() - quietFrom} ms of quiet`);
  assert.equal(await page.textContent('.mg-result-title'), 'Zubr se rozzlobil');
});
await check('round: a win → "Píseň dozpívána", "Píseň: 4 z 4", no score line', async (page) => {
  await startRound(page);
  await toVictory(page);
  await page.waitForSelector('.mg-result:not(.hidden)', { timeout: 5000 });
  assert.equal(await page.textContent('.mg-result-title'), 'Píseň dozpívána');
  assert.equal(await page.textContent('.mg-result-hits'), 'Píseň: 4 z 4');
  assert.equal(await page.textContent('.mg-result-score'), '');
});

// --- audio -----------------------------------------------------------------------------------------------------------
await check('audio: a trusted tap starts its tone inside the pointerdown task, at the context\'s current time', async (page) => {
  await startRound(page);
  await waitPhase(page, 'demo');
  await page.waitForFunction(() => window.Howler.ctx.state === 'running');
  const p = await starOnScreen(page, 1);
  const before = await page.evaluate(() => window.__osc.length);
  await page.mouse.click(p.x, p.y);
  const taps = (await page.evaluate((n) => window.__osc.slice(n), before)).filter((o) => Math.abs(o.freq - 329.63) < 0.5);
  assert.ok(taps.length > 0, 'no oscillator for the tapped star');
  assert.ok(taps[0].inPointer, 'the tone started outside the pointerdown task');
  assert.ok(Math.abs(taps[0].when - taps[0].now) < 1e-6, `when ${taps[0].when} vs now ${taps[0].now}`);
});
await check('audio: the voices feed a gain node into Howler\'s master gain (the limiter and the hidden page\'s mute behind it)', async (page) => {
  await startRound(page);
  await waitPhase(page, 'demo');
  const ok = await page.evaluate(() => {
    const out = window.__connects.filter((c) => c.to === window.Howler.masterGain).map((c) => c.from);
    return out.some((node) => node instanceof GainNode && window.__connects.some((c) => c.to === node));
  });
  assert.ok(ok, 'no gain node with inputs connected to Howler.masterGain');
  assert.ok(!(await page.evaluate(() => window.__connects.some((c) => c.to === window.Howler.ctx.destination && c.from instanceof GainNode && c.from !== window.Howler.masterGain))), 'a gain node straight to the destination');
});
await check('audio: the effects slider at 0 → the tones\' bus at 0; the round still plays to its result', async (page) => {
  await page.goto(`${base}playtest.html?game=zubr`);
  await page.evaluate(() => localStorage.setItem('vn:draci-jezdkyne-z-vlpu:autosave2', JSON.stringify({ settings: { effectsVolume: 0, musicVolume: 0.75 } })));
  await startRound(page);
  await waitPhase(page, 'demo');
  assert.equal(await game(page, (g) => g.voices && g.audioCtx === window.Howler.ctx), true);
  const gain = await game(page, (g) => g.output.gain.value);
  assert.equal(gain, 0);
  await toVictory(page);
  await page.waitForSelector('.mg-result:not(.hidden)', { timeout: 5000 });
});
await check('audio: no tone while the context is suspended; the next pointerup resumes it; a demo start resumes it too', async (page) => {
  await startRound(page);
  // Into the demo's notes (its first note waits for a running context, taps ignored meanwhile).
  await page.waitForFunction(() => window.__vn?.minigames?.activeGame?.state?.phase === 'demo' && window.__vn.minigames.activeGame.state.cursor > 1);
  await page.evaluate(() => window.Howler.ctx.suspend());
  await page.waitForFunction(() => window.Howler.ctx.state === 'suspended');
  const before = await page.evaluate(() => window.__osc.length);
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit2' }))); // no resume of its own here? keydown resumes:
  // keydown resumes the context, but the tone is decided before that resolves: not played late.
  assert.equal(await page.evaluate((n) => window.__osc.slice(n).filter((o) => Math.abs(o.freq - 329.63) < 0.5).length, before), 0, 'a tone while suspended');
  await page.waitForFunction(() => window.Howler.ctx.state === 'running');
  await page.evaluate(() => window.Howler.ctx.suspend());
  await page.waitForFunction(() => window.Howler.ctx.state === 'suspended');
  const p = await starOnScreen(page, 0);
  await page.mouse.click(p.x, p.y); // its pointerup resumes
  await page.waitForFunction(() => window.Howler.ctx.state === 'running', null, { timeout: 3000 });
  // A demo start resumes a suspended context (sticky activation) and its notes sound.
  await waitPhase(page, 'echo');
  await page.evaluate(() => window.Howler.ctx.suspend());
  await page.waitForFunction(() => window.Howler.ctx.state === 'suspended');
  const n = await page.evaluate(() => window.__osc.length);
  await game(page, (g) => Object.assign(g.state, { phase: 'snort', phaseT: g.cfg.snortSeconds - 0.01 }));
  await waitPhase(page, 'demo');
  await page.waitForFunction(() => window.Howler.ctx.state === 'running', null, { timeout: 3000 });
  await page.waitForFunction((k) => window.__osc.length > k, n, { timeout: 3000 }).catch(() => assert.fail('no demo note after the resume'));
});
await check('audio: a replaced Howler context rebuilds the tones\' output on the new one', async (page) => {
  await startRound(page);
  await waitPhase(page, 'demo');
  await page.evaluate(() => {
    const ctx = new AudioContext();
    const master = ctx.createGain();
    master.connect(ctx.destination);
    window.Howler.ctx = ctx;
    window.Howler.masterGain = master;
  });
  await page.waitForFunction(() => window.__vn.minigames.activeGame.audioCtx === window.Howler.ctx);
  assert.ok(await page.evaluate(() => window.__connects.some((c) => c.to === window.Howler.masterGain && c.from instanceof GainNode)), 'the output on the new context');
});
await check('audio: the page\'s first Howl at load (before the Hrát click), so the click resumes the live context', async (page) => {
  await open(page);
  assert.ok(await page.evaluate(() => window.Howler._howls.length > 0), 'no Howl at the page\'s load');
  const ctx = await page.evaluateHandle(() => window.Howler.ctx);
  await page.click('#pt-play');
  await page.waitForFunction(() => window.__vn?.minigames?.activeGame?.state);
  assert.ok(await page.evaluate((c) => window.Howler.ctx === c && window.__vn.minigames.activeGame.audioCtx === c, ctx));
});
await check('audio: the audio session playback during the round where it exists (tones heard on a silenced iPhone), as before after it', async (page) => {
  await open(page);
  assert.equal(await page.evaluate(() => navigator.audioSession.type), 'auto', 'changed before the round');
  await page.click('#pt-play');
  await page.waitForFunction(() => window.__vn?.minigames?.activeGame?.state);
  assert.equal(await page.evaluate(() => navigator.audioSession.type), 'playback');
  // A hidden page (a locked phone) gives the session back; the round takes it again on return.
  const visibility = (hidden) => page.evaluate((h) => {
    Object.defineProperty(document, 'hidden', { value: h, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
  await visibility(true);
  assert.equal(await page.evaluate(() => navigator.audioSession.type), 'auto', 'kept while hidden');
  await visibility(false);
  assert.equal(await page.evaluate(() => navigator.audioSession.type), 'playback', 'not taken again on return');
  await toVictory(page);
  await page.waitForSelector('.mg-result:not(.hidden)', { timeout: 5000 });
  assert.equal(await page.evaluate(() => navigator.audioSession.type), 'playback', 'restored under the result (the shimmer still rings)');
  await page.waitForTimeout(600);
  await page.click('.mg-result-continue');
  await page.waitForSelector('#pt-panel:not([hidden])');
  assert.equal(await page.evaluate(() => navigator.audioSession.type), 'auto', 'not restored after the round');
},undefined, { init: () => { Object.defineProperty(navigator, 'audioSession', { value: { type: 'auto' }, configurable: true }); } });
await check('audio: the latency line after a round', async (page) => {
  await startRound(page);
  await page.waitForFunction(() => /Zpoždění zvuku: (\d+ ms|nehlášeno)/.test(document.querySelector('#pt-latency').textContent), null, { timeout: 5000 });
});
await check('audio: a hidden page mutes Howler (the tones go through its master gain)', async (page) => {
  await startRound(page);
  await waitPhase(page, 'demo');
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  assert.equal(await page.evaluate(() => window.Howler._muted), true);
});
await check('audio: the voices offline: a note ≈ −14 dBFS RMS, the red tone within 3 dB, six voices ≤ 0.75 after the bus, a new note on a key cuts the last', async (page) => {
  await open(page);
  const imported = await page.evaluate(async () => {
    try {
      await import('/src/engine/minigames/zubrTones.js');
      return true;
    } catch {
      return false;
    }
  });
  if (!imported) return console.log('skip the offline voices (the module isn\'t served: not the dev server)');
  const r = await page.evaluate(async () => {
    const { createVoices } = await import('/src/engine/minigames/zubrTones.js');
    const { SOFT_CLIP_KNEE, SOFT_CLIP_CEILING, EFFECT_MIX } = await import('/src/engine/sfx.js');
    const rate = 48000;
    const render = async (seconds, play, busGain = 1) => {
      const ctx = new OfflineAudioContext(1, rate * seconds, rate);
      const bus = ctx.createGain();
      bus.gain.value = busGain;
      bus.connect(ctx.destination);
      play(createVoices(ctx, bus), ctx);
      return (await ctx.startRendering()).getChannelData(0);
    };
    const rms = (d, from, to) => {
      let s = 0;
      for (let i = from; i < to; i += 1) s += d[i] * d[i];
      return 10 * Math.log10(s / (to - from));
    };
    const note = await render(2, (v) => v.play('a', 440, 1.2));
    const red = await render(2, (v) => v.red(440, 1.2));
    const tones = [293.66, 329.63, 392, 440, 493.88];
    // A masher's stack (the plan's worst case: all five stars ringing and a red tone): a tap on each star every 0.25 s
    // (the calm meter's limit for long), the red tone with the last; and all six at the same instant.
    const stack = async (gap) => {
      const ctx = new OfflineAudioContext(1, rate * 2, rate);
      const bus = ctx.createGain();
      bus.gain.value = EFFECT_MIX * 0.75;
      bus.connect(ctx.destination);
      const v = createVoices(ctx, bus);
      tones.forEach((f, i) => {
        const go = () => { v.play(`p${i}`, f, 0.4, 0.008); if (i === 4) v.red(392, 0.2); };
        if (i === 0 || gap === 0) go();
        else ctx.suspend(i * gap).then(() => { go(); ctx.resume(); });
      });
      const data = (await ctx.startRendering()).getChannelData(0);
      let p = 0;
      for (const x of data) p = Math.max(p, Math.abs(x));
      return p;
    };
    const room = SOFT_CLIP_CEILING - SOFT_CLIP_KNEE;
    const curve = (x) => (x <= SOFT_CLIP_KNEE ? x : SOFT_CLIP_KNEE + room * Math.tanh((x - SOFT_CLIP_KNEE) / room));
    const peak = await stack((128 * 94) / rate); // suspend() lands on render quanta: 94 × 128 samples ≈ 0.25 s
    const squeezed = curve(peak);
    const together = await stack(0);
    // A cut: a second note on the same key 0.3 s in; the first note (1 kHz, held to 0.9 s) is gone by 0.6 s.
    const ctx = new OfflineAudioContext(1, rate, rate);
    const v = createVoices(ctx, ctx.destination);
    v.play('a', 1000, 0.9);
    ctx.suspend((128 * 112) / rate).then(() => { v.play('a', 300, 0.1); ctx.resume(); }); // ≈ 0.3 s on a render quantum
    const rendered = (await ctx.startRendering()).getChannelData(0);
    const tone = (d, f, from, to) => { // the level of frequency f between from and to s (Goertzel)
      const k = 2 * Math.cos((2 * Math.PI * f) / rate);
      let s1 = 0;
      let s2 = 0;
      for (let i = Math.round(from * rate); i < Math.round(to * rate); i += 1) [s1, s2] = [d[i] + k * s1 - s2, s1];
      return 10 * Math.log10((s1 * s1 + s2 * s2 - k * s1 * s2) / ((to - from) * rate) ** 2 + 1e-20);
    };
    return { note: rms(note, 0, rate * 1.2), red: rms(red, 0, rate * 1.2), peak, squeezed, together, togetherOut: curve(together),
      ceiling: SOFT_CLIP_CEILING, cutBefore: tone(rendered, 1000, 0.1, 0.28), cutTail: tone(rendered, 1000, 0.6, 0.85) };
  });
  console.log(`info a note ${r.note.toFixed(1)} dBFS RMS, the red tone ${r.red.toFixed(1)}; a masher's six voices peak ${r.peak.toFixed(3)} after the bus (${r.squeezed.toFixed(3)} after the limiter's curve); all six at once ${r.together.toFixed(3)} (${r.togetherOut.toFixed(3)})`);
  assert.ok(r.togetherOut <= r.ceiling + 1e-6, 'past the limiter\'s ceiling');
  assert.ok(Math.abs(r.note + 14) <= 1.5, `a note at ${r.note.toFixed(1)} dBFS`);
  assert.ok(Math.abs(r.red - r.note) <= 3, `the red tone ${r.red.toFixed(1)} dBFS`);
  assert.ok(r.peak <= 0.75, `six voices peak ${r.peak}`);
  assert.ok(r.cutBefore - r.cutTail > 60, `the cut note still sounds (1 kHz at ${r.cutBefore.toFixed(1)} dB before the cut, ${r.cutTail.toFixed(1)} dB at 0.6–0.85 s)`);
});

// --- art, pauses, skip, errors ---------------------------------------------------------------------------------------
await check('art: only the wisent and Róza singing are awaited (her other poses and Bezzubka held back: the round runs)', async (page) => {
  await page.route(/roza_(neutral|happy|nervous)\.png|roza_fly\.png/, () => { /* never answered */ });
  await startRound(page);
  await waitPhase(page, 'demo');
  assert.ok(await game(page, (g) => g.rozaView.texture === g.tex.rozaTalking && !g.tex.rozaNeutral));
});
for (const [what, pattern] of [['the wisent', /zubr_neutral\.png/], ['Róza\'s poses', /roza_\w+\.png/], ['Bezzubka', /roza_fly\.png/]]) {
  await check(`art: ${what} missing → placeholders, the round plays to its result`, async (page) => {
    await page.route(pattern, (route) => route.fulfill({ status: 404, body: '' }));
    await startRound(page);
    await toCharge(page);
    await page.waitForSelector('.mg-result:not(.hidden)', { timeout: 10000 });
  }, undefined, { allowErrors: /404|Failed to load/ });
}
await check('pauses: portrait on a touch device and the open skip menu stop the clock and ignore taps', async (page) => {
  await startRound(page);
  await waitPhase(page, 'demo');
  await page.click('.mg-skip-btn');
  const t0 = await game(page, (g) => g.state.t);
  await page.waitForTimeout(400);
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit1' })));
  assert.equal(await game(page, (g) => g.state.t), t0, 'time passed with the skip menu open');
  assert.equal(await game(page, (g) => g.state.lastTap.star), -1, 'a tap with the skip menu open');
  await page.click('.mg-skip-cancel');
  await page.setViewportSize({ width: 360, height: 640 });
  await page.waitForTimeout(200);
  const t1 = await game(page, (g) => g.state.t);
  await page.waitForTimeout(400);
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit1' })));
  assert.equal(await game(page, (g) => g.state.t), t1, 'time passed in portrait');
  assert.equal(await game(page, (g) => g.state.lastTap.star), -1, 'a tap in portrait');
}, { width: 640, height: 360 }, { hasTouch: true, isMobile: true });
await check('skip while loading: no listener and no ticker left', async (page) => {
  const held = [];
  let released = false;
  await page.route(/zubr_neutral\.png/, (route) => { if (released) route.continue(); else held.push(route); });
  await open(page);
  const listeners = await cdpListeners(page);
  await page.waitForTimeout(1500);
  const tickerBefore = await page.evaluate(() => window.__vn.stage.app.ticker.count);
  await page.evaluate(() => {
    const registry = window.__vn.minigames.registry;
    const entry = registry.get('zubrMelody');
    registry.set('zubrMelody', { ...entry, factory: (context) => {
      const g = entry.factory(context);
      const start = g.start.bind(g);
      g.start = () => (window.__started = start());
      return g;
    } });
  });
  await page.click('#pt-play');
  for (let i = 0; i < 100 && held.length === 0; i += 1) await page.waitForTimeout(50);
  assert.ok(held.length > 0, 'set-up: the wisent was never requested');
  await page.click('.mg-skip-btn');
  await page.click('.mg-skip-win');
  await page.waitForSelector('#pt-panel:not([hidden])');
  released = true;
  for (const route of held.splice(0)) await route.continue();
  await page.evaluate(() => window.__started);
  await page.waitForTimeout(300);
  assert.deepEqual(await listeners(), [], 'listeners left by the skipped game');
  assert.equal(await page.evaluate(() => window.__vn.stage.app.ticker.count), tickerBefore, 'a ticker listener left');
});
await check('after a lost round: the hold\'s document listeners are gone', async (page) => {
  await open(page);
  const listeners = await cdpListeners(page);
  await page.click('#pt-play');
  await page.waitForFunction(() => window.__vn?.minigames?.activeGame?.state);
  assert.ok((await listeners()).includes('document pointerdown'), 'set-up: no document listener during the round');
  await toCharge(page);
  await page.waitForSelector('.mg-result:not(.hidden)', { timeout: 10000 });
  assert.deepEqual(await listeners(), [], 'listeners left after the round');
});
await check('errors (D24): a throw in a tick ends the round as lost, also during the hold; a throw in a tap too', async (page) => {
  await startRound(page);
  await waitPhase(page, 'demo');
  await game(page, (g) => { g.cfg.zubr.eyes = null; }); // the next draw throws
  await page.waitForSelector('.mg-result:not(.hidden)', { timeout: 3000 });
  assert.equal(await page.textContent('.mg-result-title'), 'Zubr se rozzlobil');
  await page.waitForTimeout(600);
  await page.click('.mg-result-continue');
  await page.waitForSelector('#pt-panel:not([hidden])');
  // During the hold, with input going on: at once.
  await page.waitForTimeout(700);
  await page.click('#pt-play');
  await page.waitForFunction(() => window.__vn?.minigames?.activeGame?.state);
  await toCharge(page);
  await waitPhase(page, 'hold', 30000);
  const keys = setInterval(() => page.keyboard.press('KeyX').catch(() => {}), 300);
  await game(page, (g) => { g.cfg.zubr.eyes = null; });
  try {
    await page.waitForSelector('.mg-result:not(.hidden)', { timeout: 1000 });
  } finally {
    clearInterval(keys);
  }
  await page.waitForTimeout(600);
  await page.click('.mg-result-continue');
  await page.waitForSelector('#pt-panel:not([hidden])');
  await page.waitForTimeout(700);
  await page.click('#pt-play');
  await page.waitForFunction(() => window.__vn?.minigames?.activeGame?.state);
  await waitPhase(page, 'demo');
  await game(page, (g) => { g.state.voice = NaN; g.state.lastTap = null; }); // the next tap throws
  await page.keyboard.press('Digit1');
  await page.waitForSelector('.mg-result:not(.hidden)', { timeout: 3000 });
}, undefined, { allowErrors: /Minigame error/ });
await check('screenshots (with SHOTS): the stars at 568×270 and 1280×720, also as deuteranopia', async (page) => {
  if (!SHOTS) return;
  for (const [w, h] of [[568, 270], [1280, 720]]) {
    await page.setViewportSize({ width: w, height: h });
    await startRound(page);
    await waitPhase(page, 'demo');
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${SHOTS}/zubr-stars-${w}.png` });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setEmulatedVisionDeficiency', { type: 'deuteranopia' });
    await page.screenshot({ path: `${SHOTS}/zubr-stars-${w}-deuteranopia.png` });
    await cdp.send('Emulation.setEmulatedVisionDeficiency', { type: 'protanopia' });
    await page.screenshot({ path: `${SHOTS}/zubr-stars-${w}-protanopia.png` });
    await cdp.send('Emulation.setEmulatedVisionDeficiency', { type: 'none' });
  }
});
await browser.close();
process.exit(failures ? 1 : 0);
