// The badger cubs rescue (D42) on the play-test page: the switch, the URL, the config passed to the game, a catch, a
// win, a loss, the HUD texts, a phone tap. The rules themselves are checked in node (tests/badgerRules.test.mjs).
//   node tests/browser/badger.test.mjs <base url>   (ONLY=<part of a check name>; base url default http://localhost:5173/)
// Needs a running server (npm run dev, npm run preview, or the live site) and the installed Chrome.
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';

const base = process.argv[2] ?? 'http://localhost:5173/';
const ONLY = process.env.ONLY;
const browser = await chromium.launch({ channel: 'chrome' });
let failures = 0;

async function check(name, fn, viewport = { width: 1280, height: 720 }, options = {}) {
  if (ONLY && !name.includes(ONLY)) return;
  const { allowErrors, ...contextOptions } = options;
  const context = await browser.newContext({ viewport, ...contextOptions });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    // (the site has no favicon: Chrome's request for it 404s on every page)
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
const game = (page) => page.evaluate(() => {
  const g = window.__vn.minigames.activeGame;
  return g?.state ? { t: g.state.t, safe: g.state.safe, total: g.cfg.total, phase: g.state.dragon.phase, cfg: g.cfg } : null;
});
/** Loads the play-test page and waits until its script has built the panel (on the live site that comes after `load`). */
async function open(page, url) {
  await page.goto(url);
  await page.waitForFunction(() => window.__vn && document.querySelector('#pt-link')?.value);
}
async function startRound(page, query = '') {
  await open(page, `${base}playtest.html?game=jezevci${query}`);
  await page.click('#pt-play');
  await page.waitForFunction(() => window.__vn.minigames.activeGame?.state);
}
/** A branch with a cub right under the flying dragon's claws, still; then a tap. */
async function catchOne(page, key = 'Space') {
  await page.waitForFunction(() => {
    const g = window.__vn.minigames.activeGame;
    const x = g.state.dragon.x + g.state.catch[g.state.dragon.index % g.state.catch.length].dx;
    return g.state.dragon.phase === 'fly' && x > 100 && x < g.state.W - 100 && g.state.t >= g.state.dragon.cooldownUntil;
  });
  await page.evaluate(() => {
    const g = window.__vn.minigames.activeGame;
    const s = g.state;
    const cub = s.cubs.find((c) => c.status === 'hole');
    cub.status = 'float';
    const x = s.dragon.x + s.catch[s.dragon.index % s.catch.length].dx;
    s.pieces.push({ id: `test${cub.id}`, kind: 'branch', x, speed: 0, cub: cub.id, held: false });
  });
  await page.keyboard.press(key);
  await page.waitForFunction(() => window.__vn.minigames.activeGame.state.dragon.phase === 'up');
}

await check('page: the switch, heading, sliders, link without field=, defaults link', async (page) => {
  await open(page, `${base}playtest.html?game=jezevci`);
  assert.equal(await page.title(), 'Zkušební záchrana jezevčat');
  assert.equal(await page.textContent('#pt-heading'), 'Zkušební záchrana jezevčat');
  assert.equal(await page.locator('#pt-sliders input[type=range]').count(), 13);
  assert.equal(await page.getAttribute('#pt-switch [data-game=jezevci]', 'aria-current'), 'page');
  assert.equal(await page.getAttribute('#pt-switch [data-game=beavers]', 'aria-current'), null);
  assert.equal(await page.isVisible('#pt-field-note'), false);
  assert.equal(await page.getAttribute('#pt-defaults', 'href'), 'playtest.html?game=jezevci');
  const link = await page.inputValue('#pt-link');
  assert.match(link, /playtest\.html\?game=jezevci&cubs=7&current=60&mother=1&/);
  assert.doesNotMatch(link, /field=/);
  assert.match(page.url(), /\?game=jezevci&cubs=7/);
});
await check('page: the beaver page without game is as before (switch on Bobři, field= in the link)', async (page) => {
  await open(page, `${base}playtest.html?count=40`);
  assert.equal(await page.title(), 'Zkušební nálet na bobry');
  assert.equal(await page.getAttribute('#pt-switch [data-game=beavers]', 'aria-current'), 'page');
  assert.equal(await page.isVisible('#pt-field-note'), true);
  assert.equal(await page.getAttribute('#pt-defaults', 'href'), 'playtest.html');
  const link = await page.inputValue('#pt-link');
  assert.match(link, /playtest\.html\?count=40&/);
  assert.match(link, /&field=\d+x\d+$/);
  assert.doesNotMatch(link, /game=/);
  assert.equal(await page.locator('#pt-sliders input[type=range]').count(), 15);
  await open(page, `${base}playtest.html?game=nonsense&count=40`); // an unknown game: the beavers
  assert.equal(await page.title(), 'Zkušební nálet na bobry');
});
await check('URL in: the sliders, 9 cubs, the values in the game config; a slider change keeps game=', async (page) => {
  await startRound(page, '&cubs=9&current=100&mother=0&branch=120&reach=20&dive=0.5&miss=2&rozaFly=400&firstFlood=3&floodGap=4&cubGap=1');
  const { cfg } = await game(page);
  assert.deepEqual(cfg.holeCubs, [1, 1, 2, 2, 3]);
  assert.equal(cfg.total, 9);
  assert.equal(cfg.currentSpeed, 100);
  assert.equal(cfg.motherSaves, 0);
  assert.equal(cfg.branchLength, 120);
  assert.equal(cfg.reach, 20);
  assert.equal(cfg.dive.down, 0.5);
  assert.equal(cfg.dive.up, 0.5);
  assert.equal(cfg.dive.missCooldown, 2);
  assert.equal(cfg.dragons[0].speed, 400);
  assert.equal(cfg.firstFlood, 3);
  assert.equal(cfg.floodGap, 4);
  assert.equal(cfg.cubGap, 1);
  assert.equal(await page.textContent('.mg-score'), 'V bezpečí: 0 z 9');
  assert.equal(await page.textContent('.mg-status'), 'Zachraň všechna!');
  // cubs=8 rounds to the slider's step: 7 or 9.
  await open(page, `${base}playtest.html?game=jezevci&cubs=8`);
  assert.equal(await page.inputValue('input[name=cubs]'), '9'); // the range's step of 2 from 7: 8 rounds up
  await page.locator('input[name=current]').fill('80');
  await page.locator('input[name=current]').dispatchEvent('change');
  assert.match(page.url(), /\?game=jezevci&.*current=80/);
});
await check('round: the HUD at the start, the instructions hide after the first dive, a catch counts', async (page) => {
  await startRound(page);
  assert.equal(await page.textContent('.mg-title'), 'Záchrana jezevčat');
  assert.equal(await page.textContent('.mg-score'), 'V bezpečí: 0 z 7');
  assert.equal(await page.textContent('.mg-status'), 'Máma pomůže: 1×');
  assert.match(await page.textContent('.mg-instructions'), /drak skočí pro jezevče/);
  assert.equal(await page.isVisible('.mg-instructions'), true);
  await catchOne(page);
  await page.waitForFunction(() => window.__vn.minigames.activeGame.state.safe === 1);
  assert.equal(await page.isVisible('.mg-instructions'), false);
  await page.waitForFunction(() => document.querySelector('.mg-score').textContent === 'V bezpečí: 1 z 7');
  // The cub flies to the father, then sits at the new burrow.
  await page.waitForFunction(() => window.__vn.minigames.activeGame.home.children.length === 1, null, { timeout: 5000 });
});
await check('round: a win shows Vítězství! and the cubs line; Pokračovat brings the panel back', async (page) => {
  await startRound(page);
  await page.evaluate(() => {
    const s = window.__vn.minigames.activeGame.state;
    s.cubs.slice(1).forEach((c) => { c.status = 'caught'; });
    s.safe = s.cubs.length - 1;
  });
  await catchOne(page);
  await page.waitForSelector('.mg-result:not(.hidden)', { timeout: 5000 });
  assert.equal(await page.textContent('.mg-result-title'), 'Vítězství!');
  assert.equal(await page.textContent('.mg-result-hits'), 'V bezpečí: 7 z 7');
  assert.equal(await page.textContent('.mg-result-score'), '');
  await page.waitForTimeout(700);
  await page.click('.mg-result-continue');
  await page.waitForSelector('#pt-panel:not([hidden])');
});
await check('round: with no mother and a fast current the first cub floats away: Jezevče odplavalo', async (page) => {
  await startRound(page, '&mother=0&current=150&firstFlood=2');
  await page.waitForSelector('.mg-result:not(.hidden)', { timeout: 20000 });
  assert.equal(await page.textContent('.mg-result-title'), 'Jezevče odplavalo');
  assert.equal(await page.textContent('.mg-result-hits'), 'V bezpečí: 0 z 7');
});
await check('round: the mother saves one, rests after it, and the status follows her picture', async (page) => {
  await startRound(page, '&current=150&firstFlood=2');
  await page.waitForFunction(() => window.__vn.minigames.activeGame.state.mother.saves === 0, null, { timeout: 20000 });
  // While she leaps for the cub the HUD still says she helps and doesn't count it; once she is back (and rests) it
  // says she can't, and the cub counts.
  assert.equal(await page.textContent('.mg-status'), 'Máma pomůže: 1×');
  assert.equal(await page.textContent('.mg-score'), 'V bezpečí: 0 z 7');
  await page.waitForFunction(() => window.__vn.minigames.activeGame?.motherRest?.visible, null, { timeout: 5000 });
  await page.waitForFunction(() => document.querySelector('.mg-status').textContent === 'Máma už nemůže', null, { timeout: 2000 });
  assert.equal(await page.textContent('.mg-score'), 'V bezpečí: 1 z 7');
});
await check('round: skip while loading leaves no ticker and no listeners', async (page) => {
  // The art held until after the skip; then start() carries on after its await and must stop there.
  const held = [];
  let released = false;
  await page.route('**/badger-rescue/**', (route) => { if (released) route.continue(); else held.push(route); });
  await open(page, `${base}playtest.html?game=jezevci`);
  const cdp = await page.context().newCDPSession(page);
  const scripts = new Map();
  cdp.on('Debugger.scriptParsed', (s) => scripts.set(s.scriptId, s.url));
  await cdp.send('Debugger.enable');
  const listeners = async () => {
    const out = [];
    for (const expression of ['window', "document.querySelector('#pixi-host canvas')"]) {
      const { result } = await cdp.send('Runtime.evaluate', { expression });
      const { listeners: list } = await cdp.send('DOMDebugger.getEventListeners', { objectId: result.objectId });
      for (const l of list) if ((scripts.get(l.scriptId) ?? '').includes('badgerRescue')) out.push(`${expression} ${l.type}`);
    }
    return out;
  };
  // The page adds a ticker listener of its own shortly after loading: count once it has settled.
  await page.waitForFunction(() => window.__vn);
  await page.waitForTimeout(1500);
  const tickerBefore = await page.evaluate(() => window.__vn.stage.app.ticker.count);
  // Keep the promise of the game's start(), to wait for exactly that.
  await page.evaluate(() => {
    const registry = window.__vn.minigames.registry;
    const entry = registry.get('badgerRescue');
    registry.set('badgerRescue', { ...entry, factory: (context) => {
      const game = entry.factory(context);
      const start = game.start.bind(game);
      game.start = () => (window.__started = start());
      return game;
    } });
  });
  await page.click('#pt-play');
  for (let i = 0; i < 100 && held.length === 0; i += 1) await page.waitForTimeout(50);
  assert.ok(held.length > 0, 'set-up: no badger art was requested');
  await page.click('.mg-skip-btn');
  await page.click('.mg-skip-win');
  await page.waitForSelector('#pt-panel:not([hidden])');
  released = true;
  for (const route of held.splice(0)) await route.continue();
  const settled = await page.evaluate(() => Promise.race([
    Promise.resolve(window.__started).then(() => true, () => true),
    new Promise((res) => setTimeout(() => res(false), 20000)),
  ]));
  assert.ok(settled, 'set-up: start() never settled');
  await page.waitForTimeout(300);
  assert.deepEqual(await listeners(), [], 'listeners left by the skipped game');
  assert.equal(await page.evaluate(() => window.__vn.stage.app.ticker.count), tickerBefore, 'a ticker listener left');
  assert.equal(await page.evaluate(() => window.__vn.minigames.activeGame), null);
  assert.equal(await page.evaluate(() => window.__vn.stage.layers.minigame.children.length), 0);
});
await check('phone: a tap dives (640×360, touch)', async (page) => {
  await startRound(page);
  await page.waitForFunction(() => {
    const g = window.__vn.minigames.activeGame;
    const x = g.state.dragon.x + g.state.catch[g.state.dragon.index % g.state.catch.length].dx;
    return g.state.dragon.phase === 'fly' && x > 50 && x < g.state.W - 50;
  });
  await page.touchscreen.tap(320, 200);
  await page.waitForFunction(() => ['down', 'up'].includes(window.__vn.minigames.activeGame.state.dragon.phase));
}, { width: 640, height: 360 }, { hasTouch: true, isMobile: true });
await check("dive: each dragon's drawn claws sit on the rules' catch point at the water, tilted nose-down", async (page) => {
  await startRound(page);
  const results = await page.evaluate(() => {
    window.__vn.stage.app.ticker.stop();
    const g = window.__vn.minigames.activeGame;
    const s = g.state;
    const cfg = g.cfg;
    const out = [];
    for (let i = 0; i < 3; i += 1) {
      s.dragon.index = i;
      s.dragon.x = 500;
      s.dragon.phase = 'down';
      s.dragon.phaseT = cfg.dive.down; // the bottom of the dive
      g.draw();
      const view = g.dragonView;
      const cp = cfg.dragons[i].catchPoint; // strip px from the anchor = the sprite's local coordinates
      const p = g.root.toLocal(view.toGlobal({ x: cp[0], y: cp[1] }));
      out.push({ i, x: p.x, y: p.y, wantX: s.dragon.x + s.catch[i].dx, wantY: g.surfaceY() + g.constructor.CLAW_DEPTH, rotation: view.rotation,
        frame: view.texture === g.strips[i].frames[cfg.dragons[i].diveFrame] });
    }
    return out;
  });
  for (const r of results) {
    assert.ok(Math.abs(r.x - r.wantX) < 2 && Math.abs(r.y - r.wantY) < 2,
      `dragon ${r.i}: claws drawn at (${r.x.toFixed(1)}, ${r.y.toFixed(1)}), the rules catch at (${r.wantX.toFixed(1)}, ${r.wantY.toFixed(1)})`);
    assert.ok(r.rotation < -0.1, `dragon ${r.i}: rotation ${r.rotation} (mirrored art: negative dips the nose)`);
    assert.ok(r.frame, `dragon ${r.i}: not on its diveFrame`);
  }
});
await check('labels: a scene\'s text labels win over the game\'s own, anything else is dropped', async (page) => {
  await open(page, `${base}playtest.html?game=jezevci`);
  await page.waitForFunction(() => window.__vn);
  await page.evaluate(() => {
    window.__vn.minigames.run({ type: 'badgerRescue', title: 'T', config: { motherSaves: { normal: 0 }, currentSpeed: { normal: 150 }, firstFlood: 2 },
      labels: { score: 'Doma', resultLose: 5, resultHits: null } }, { difficulty: 'normal' });
  });
  await page.waitForFunction(() => document.querySelector('.mg-score')?.textContent === 'Doma: 0 z 7');
  await page.waitForSelector('.mg-result:not(.hidden)', { timeout: 20000 });
  assert.equal(await page.textContent('.mg-result-title'), 'Jezevče odplavalo', 'a non-text scene label replaced the game\'s');
  assert.equal(await page.textContent('.mg-result-hits'), 'V bezpečí: 0 z 7');
});
await check('skip menu: the round pauses while it is open, and goes on after Zrušit', async (page) => {
  await startRound(page);
  await page.click('.mg-skip-btn');
  const t0 = (await game(page)).t;
  await page.keyboard.press('Space'); // a tap meanwhile never dives
  await page.waitForTimeout(800);
  const paused = await game(page);
  assert.equal(paused.t, t0, 'time passed with the skip menu open');
  assert.equal(paused.phase, 'fly');
  await page.click('.mg-skip-cancel');
  await page.waitForFunction((t) => window.__vn.minigames.activeGame.state.t > t + 0.3, t0);
  assert.equal((await game(page)).phase, 'fly', 'the tap made while paused dived afterwards');
});
await check('flightY: a big value in a story config still flies above the dive bottom', async (page) => {
  await open(page, `${base}playtest.html?game=jezevci`);
  await page.waitForFunction(() => window.__vn);
  await page.evaluate(() => {
    window.__vn.minigames.run({ type: 'badgerRescue', title: 'T', config: { flightY: 0.95 } }, { difficulty: 'normal' });
  });
  await page.waitForFunction(() => window.__vn.minigames.activeGame?.state?.dragon.phase === 'fly' && window.__vn.minigames.activeGame.state.t > 0.2);
  const r = await page.evaluate(() => {
    const g = window.__vn.minigames.activeGame;
    const off = g.state.catch[g.state.dragon.index % g.state.catch.length];
    return { y: g.dragonView.position.y, bottom: g.surfaceY() - off.dy + g.constructor.CLAW_DEPTH };
  });
  assert.ok(r.y <= r.bottom - 39, `the flight line ${r.y.toFixed(1)} is not above the dive's bottom ${r.bottom.toFixed(1)}`);
});
await check('art missing: every badger sprite and fly strip 404 → placeholders, the round plays to its result', async (page) => {
  await page.route('**/minigames/badger-rescue/**', (route) => route.fulfill({ status: 404 }));
  await page.route('**/minigames/dragon-attack/*_fly.png', (route) => route.fulfill({ status: 404 }));
  await startRound(page, '&mother=0&current=150&firstFlood=2');
  await catchOne(page); // a dive with the vector dragon
  await page.waitForFunction(() => window.__vn.minigames.activeGame.state.safe === 1);
  await page.waitForSelector('.mg-result:not(.hidden)', { timeout: 20000 });
  assert.equal(await page.textContent('.mg-result-title'), 'Jezevče odplavalo');
}, undefined, { allowErrors: /404/ }); // the art it answers with 404
await check('portrait on a touch device: the round pauses, a tap made then never dives', async (page) => {
  await startRound(page);
  await page.setViewportSize({ width: 360, height: 640 });
  await page.waitForTimeout(300);
  const t0 = await page.evaluate(() => window.__vn.minigames.activeGame.state.t);
  await page.keyboard.press('Space'); // a key while paused (a tap can't reach the canvas under the rotate hint)
  await page.waitForTimeout(700);
  const paused = await page.evaluate(() => ({ t: window.__vn.minigames.activeGame.state.t, phase: window.__vn.minigames.activeGame.state.dragon.phase }));
  assert.ok(Math.abs(paused.t - t0) < 1e-9, `the round ran on in portrait (${t0} → ${paused.t})`);
  // The dragon over the river and free to dive, so a leftover tap would show.
  await page.evaluate(() => { const d = window.__vn.minigames.activeGame.state.dragon; d.index = 0; d.phase = 'fly'; d.x = 600; d.cooldownUntil = 0; });
  await page.setViewportSize({ width: 640, height: 360 });
  await page.waitForTimeout(400);
  const after = await page.evaluate(() => ({ t: window.__vn.minigames.activeGame.state.t, phase: window.__vn.minigames.activeGame.state.dragon.phase }));
  assert.ok(after.t > paused.t, 'the round did not go on in landscape');
  assert.equal(after.phase, 'fly', 'the key pressed in portrait dived after the rotation');
}, { width: 640, height: 360 }, { hasTouch: true, isMobile: true });
await check('an error in a tick ends the round as lost (D24), with nothing left running', async (page) => {
  await startRound(page);
  await page.evaluate(() => { window.__vn.minigames.activeGame.state.pieces = null; }); // step() throws on its next tick
  await page.waitForSelector('.mg-result:not(.hidden)', { timeout: 5000 });
  assert.equal(await page.textContent('.mg-result-title'), 'Jezevče odplavalo');
  assert.equal(await page.evaluate(() => window.__vn.minigames.activeGame.finished), true);
}, undefined, { allowErrors: /Minigame error/ });
await check('568×270: the dragon flies below the HUD bar', async (page) => {
  await startRound(page);
  await page.waitForFunction(() => {
    const g = window.__vn.minigames.activeGame;
    return g.state.dragon.phase === 'fly' && g.state.dragon.x < g.state.W - 150 && g.state.dragon.x > 150;
  });
  const r = await page.evaluate(() => {
    const g = window.__vn.minigames.activeGame;
    const top = g.dragonView.getBounds().minY;
    return { top, bar: document.querySelector('.mg-topbar').getBoundingClientRect().bottom };
  });
  assert.ok(r.top >= r.bar - 1, `the dragon's top ${r.top.toFixed(1)} is under the bar's bottom ${r.bar.toFixed(1)}`);
}, { width: 568, height: 270 }, { hasTouch: true, isMobile: true });
await check('field: the game root fits the background contain rectangle at 1280×720 and 1000×800', async (page) => {
  for (const [w, h] of [[1280, 720], [1000, 800]]) {
    await page.setViewportSize({ width: w, height: h });
    if (w === 1280) await startRound(page);
    await page.waitForTimeout(300);
    const r = await page.evaluate(() => {
      const root = window.__vn.minigames.activeGame.root;
      return { x: root.position.x, y: root.position.y, s: root.scale.x };
    });
    const fit = Math.min(w / 1672, h / 941);
    assert.ok(Math.abs(r.x - (w - 1672 * fit) / 2) < 1, `${w}x${h} x ${r.x}`);
    assert.ok(Math.abs(r.y - (h - 941 * fit) / 2) < 1, `${w}x${h} y ${r.y}`);
    assert.ok(Math.abs(r.s - (941 * fit) / 600) < 1e-6, `${w}x${h} scale ${r.s}`);
  }
});

await browser.close();
process.exit(failures ? 1 : 0);
