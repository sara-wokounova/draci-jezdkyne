# Feature workflow

Sára asked for this process for **every feature added to the game**. Follow it
step by step. Don't skip a round, and don't add extra rounds.

Two loops. The plan loop ends with Sára's confirmation, and nothing is implemented
before that. The implementation loop ends when a review round reports only low
findings.

## Severity

Every finding from a disprover or reviewer gets one of these:

- **high**: breaks a requirement, breaks play for normal users, loses progress or
  data, or is a security problem.
- **medium**: a real bug in a less common path (a device, a race, Back, Menu or Nová hra
  in an odd spot), or a maintainability problem that will cause the next bug.
- **low**: cosmetic, theoretical, or style.

A finding needs evidence: a repro, a `file:line`, or a concrete scenario. "Could be
cleaner" without a consequence is low.

## Phase 1: Plan (no repo changes)

1. **Research.** Read the code paths and the assets involved. Prototypes and spikes
   go in `C:\tmp\claude`, never the repo.
2. **Write the plan** to `C:\tmp\claude\plans\<feature>.md`. It covers:
   - the request, quoted verbatim;
   - what the player sees, scene by scene or step by step;
   - the files that change and the story/config format changes;
   - the decisions it implies (future `decisions.md` entries);
   - the **test plan**: every new code path and the check that covers it;
   - risks, what is out of scope, and open questions for Sára.
3. **Independent disprover.** Start a fresh subagent. Give it the request verbatim,
   the plan file, and pointers to the code. Don't give it my reasoning. It tries
   to break the plan: missed requirements, wrong assumptions about the code or
   assets, untestable steps, cases nobody thought of. It reports findings by
   severity.
4. **Fix every finding** in the plan, low ones included.
5. **Repeat 3–4** until a round reports only low findings. Fix those and stop
   looping. Don't run another round after an all-low round.
6. **Present the plan to Sára and wait.** Implement only after she confirms. If
   she changes the plan, update it and go back to step 3 for the changed parts.

## Phase 2: Implement (after confirmation)

1. **Implement the confirmed plan, with tests covering every new code path.**
   Record decisions in `decisions.md` and issues in `issues.md` as usual.
2. **Run the tests and `npm run build`.** Fix until everything passes.
3. **Independent review panel.** Start three fresh subagents in parallel, one per
   lens. Each gets the request, the confirmed plan and the diff from the commit
   before the feature started (`git diff <that commit>`), but not my conclusions.
   - **Correctness:** requirements met; races; Back, the menu and new games; phones
     (the D14 layout, rotation, fullscreen); reloads mid-feature; old saves.
   - **Security:** untrusted content reaching `innerHTML`; paths and URLs built
     from story data; localStorage parsing; new dependencies; anything fetched
     from elsewhere.
   - **Maintainability:** matches the surrounding code; no speculative
     abstraction; config over magic numbers where tuning is expected; docs
     (`CLAUDE.md`, `story.md`, `decisions.md`, `issues.md`) updated.
4. **Fix every finding** and rerun the tests and the build.
5. **Repeat 3–4** until a round reports only low findings. Fix those, rerun the
   tests, and finish. No further panel after an all-low round.
6. **Report:** what changed, test results, what was left out and why.

Standing rules still apply. Don't commit or push unless asked (a push to `main`
deploys). Once something is pushed, D11 applies: it isn't done until it has been
tested on the live site.

## Tests

The automated checks are Playwright scripts that drive the installed Chrome. They
currently live **outside the repo**, in `C:\tmp\claude`:

| script | covers |
|---|---|
| `mobile-check/mobile.mjs [local\|live\|<url>] [viewport…]` | the main suite on 5 viewports: layout (D14), rotate hint, fullscreen, menu, settings, autoread, music continuity, failed image loads, end card, gallery, the minigame (incl. battle.mp3 during the round, forest_ground after the win); the main menu (Pokračovat disabled on a fresh save, Nová hra), the Nová hra confirmation on every viewport, the scene's track under the in-game menu (D27). `local` starts its own Vite server. |
| `mobile-check/menu.mjs <url>` (`ONLY=`) | the menu (D27): fresh visit and no-progress saves (start scene, broken JSON, a removed scene, an ending: Pokračovat disabled, Nová hra focused, a script click on it does nothing); a save with progress, and away from the start with no history; Back waits 500 ms after the menu closes; the confirmation (Ne, Ano, settings and gallery kept, back on the main page after Ano); Ano's tap guard (a click at 100 ms, mashing every 250 ms, a long press, quiet 800 ms, keyboard Enter at once, an assistive click by its own time, a double tap on touch, a press the browser cancels); a held Enter on the keyboard-focused Menu (pressed once); the Menu button and Esc (main page, sub-pages, focus, held Esc, Tab → Menu → Enter, the startup menu); top-bar buttons and Space (a click on Back, a press dragged off); the end card (Esc, Pokračovat closes it, Nová hra without asking); after an ending; autoread under the menu; a double-click on Pokračovat (no advance, no choice under it at 960x540); minigame scenes (starts at once with its picture held back, a typo in the outcome, a rejecting render, a throwing clean-up) |
| `mobile-check/menu-mutate.mjs [name]` | fail-before for D27: breaks one guard at a time in the `C:\tmp\claude\menu-impl` copy (served on 5310) and runs the check that must catch it (28 mutations) |
| `mobile-check/chrome-music.mjs <url>` | music when the browser blocks sound until the first activating input (simulated, with Firefox's activation rules: headless browsers never block). Seven cases: menu click; Tab first (asserts silence after the Tab), then a click; Nová hra first; Enter on the focused Nová hra first; a click on the disabled Pokračovat (no input, D27), then Nová hra; village save with Pokračovat first; village save with a menu click, then Pokračovat. Each asserts no `play()` before the first activating input and exactly one *audible* track at the end |
| `mobile-check/robustness.mjs <url>` (`ONLY=<part of a check name>` runs one) | Every check enters the game through Pokračovat (refusing a disabled one) or Nová hra (D27). Checks: odd saves (clamped volume, string `autoRead`, broken/`null`/array JSON); storage that throws; story text that looks like markup (gallery, minigame top bar); a bad music key (no track created); a hidden page (nothing plays, resumes where it paused); hidden while a track loads / while it starts / when a track becomes due; a stopped track restarting on a same-key scene (and hidden and shown after that restart); the dropped menu track (no stray stream); gallery thumbnails (a regression guard: the old code passed too); the muted pool; a fade-out after hiding mid fade-in; odd story values (object as a music key or background path); hidden before the first tap; odd story text (gallery, end card); one reused generated fallback texture per size; hidden and shown again inside a new track's play lock (it still plays); odd HUD labels and title (defaults, skip still works); paths with a tab/newline/CR between leading slashes (no request to another host); battle music (D25: battle.mp3 on the minigame, loops back to its start through Howler's seek); resume (D26): a retry continues where it was left, a second one further, a reload and a new game start over, other tracks start over, a visit where it never started keeps the position, a new game while the track still plays (not stored again), keeps playing (stored) or is revived after the switch (stored), a resumed start while hidden, hidden and shown while a resumed start buffers at its position (one copy, not two), bad `resumeMusic` values (incl. non-lists and odd items, warnings) |
| `mobile-check/minigame-roza.mjs <url>` (`ONLY=`) | the minigame (D23, D24), mostly with the ticker stopped and `game.tick()` stepped by hand: Róza's fly strip, size and flap order; art below the HUD bar on 3 landscape viewports; the eye stays put across sheet switches; the attack (shot on the fire frame, from the mouth, fireball frames and rotation); long ticks; hit and impact; leaving before the fire frame; portrait pause; each strip missing; flying left; the round end (win in the middle of the shot loop, impacts, a half-played attack, skip while loading with a CDP listener check, retry, a malformed config going to `onFailure`); firing rules (Róza/Emma one shot at a time, Anna's ⅓ refire, 3-arrow cap, early-removed arrow, round waits for shots, no attack while off the screen, no hit on a beaver off the screen); no beaver at (0, 0) and parallel sheet loading; shots removed only when fully off-screen (also Emma's zigzag at the edge); odd config values (frame names, huge frame counts, malformed anchors, fps / flight-count / `refireAfter` typos), the README example config, and the `tick()` backstop; no requests for missing sprites; screenshots and a frame sequence. Every check also fails on a logged "Minigame error" |
| `as-test/sprites.test.mjs` (run from the repo; `CLEANER=`, `ONLY=force\|skip\|pack\|art`) | `removeCheckerboard.mjs --force` byte-identical to the old cleaner (taken from git, `757f054`) on 28 PNGs; a default run skips transparent PNGs; the strips regenerate pixel-identical to the committed ones (and to the prototype references in `C:\tmp\claude\sprites\v3`/`v6`, if still there); frame counts, anchors, `bodyWidth` and `mouth` in DEFAULTS match the packer's output; neither a folder run, a junction nor a hard link writes into `art/` (on a fake repo copy); `packFrames.mjs` refuses a wrong anchor count, a point off its frame, a `null` anchors file and factor 9, writing nothing |
| `ff/ff-minigame.mjs <url>` | the installed Firefox (puppeteer-core), **asserts**: no beaver at (0, 0) while delayed sheets load, Róza on `roza_fly.png`, a tap fires a fireball, Anna reaches 3 arrows (her part with game time stepped by hand) |
| `as-test/battle.test.mjs [repo]` (needs ffmpeg/ffprobe) | battle.mp3 = both songs' length, 128 kbps stream, rebuilt by the ffmpeg command taken from CLAUDE.md; originals in `art/music/`; the story plays it on `beaver_battle` |
| `ff/ff-battle.mjs <url>` | the installed Firefox, **asserts**: battle.mp3 plays on the minigame (its element actually advancing), its duration is 298.9 s ± 0.1 (Howler's loop timer depends on it), it loops back to the start. D26: a retry resumes where it was left, at ~60 s and at ~250 s (past the first buffered range). Run the `ff/` scripts one at a time (several automated Firefox instances at once stall each other), and in Firefox poll with `page.evaluate`: with Firefox's default autoplay setting and puppeteer's `page.waitForFunction` polling, Firefox paused the element at ~0 s while Howler said "playing" in 4 of 5 runs (traced to a dropped user activation, autoplay turning "allowed-muted") — D22's bug, induced by the test. `ff-battle.mjs` sets `media.autoplay.default: 0`, which is what makes it reliable; the `page.evaluate` polling is extra insurance. Puppeteer-driven Firefox can't test activation; `ff-autoplay.mjs` does that |
| `as-test/autosave.test.mjs [repoOrCopy]` | `AutoSave.load()` in node with a fake `localStorage`: per-setting type check and volume clamp |
| `mobile-check/ff-autoplay.mjs <url>` | the real Firefox with its default autoplay policy, not automated: no track may start before the first input (D22). Works on the live URL too (proxies http or https, keeps the sub-path) |
| `mobile-check/music-race.mjs <url>` | switching away while the new track is still at volume 0; switching away while play() is still starting (the replaced track stays silent); a quick Back and a two-hop Back inside the fade-out revive the same track; a slow background render still ends on the right track (music before the render, D21); mashing: no replaced track may survive (D22) |
| `mobile-check/playthrough.mjs`, `stress.mjs` | play-throughs; rapid taps, Back and resizes (`stress.mjs` asserts, `playthrough.mjs` only prints); a new game is Menu → Nová hra → Ano (D27) |
| `ff/ff.mjs`, `ff/ff-music.mjs` | the installed Firefox via puppeteer-core (args `-wait-for-browser -no-remote`). They print but **don't assert**: manual inspection only |

A new check must be shown to **fail on the code before the fix**, or it doesn't prove anything. For
a committed fix, serve the old commit (`git archive <commit> | tar -x -C <dir>`, link `node_modules`,
`npx vite --port <port>` there). For an uncommitted fix, or one of several overlapping fixes, copy
the working tree (`git ls-files -co --exclude-standard | tar -cf - -T - | tar -xf - -C <dir>`), revert
just that fix in the copy, and serve it the same way. Give the copy its own Vite cache
(`cacheDir: '.vite-cache'` in the copy's `vite.config.js`): the linked `node_modules/.vite` is shared
with the repo's dev server. Where two guards protect the same thing on purpose (a comment says so), revert them
together. Checks that only guard behaviour the old code already had are allowed, but say so.

New code paths get new checks in these scripts, usually `mobile.mjs`. Whether the
suite should move into the repo (e.g. `tests/` with `playwright-core` as a
devDependency) is open: ask Sára before moving it.
