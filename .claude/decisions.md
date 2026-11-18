# Decision log

Append new entries at the bottom. Don't edit old ones — add a new entry that
supersedes them (`Supersedes: D3`). Entries D1–D10 were reconstructed from the
code and git history on 2026-10-17; their reasons are inferred, not recorded at
the time.

Template:

```
## Dn — Title (YYYY-MM-DD) — Accepted | Superseded by Dm
Decision: what we do.
Why: the reason / alternatives rejected.
Consequences: what this forces or rules out.
```

## D1 — Plain JS + Vite, no UI framework (2026-06-11) — Accepted
Decision: vanilla ES modules bundled by Vite; PixiJS v8 for the scene, Howler for audio.
Why: small project, no build complexity, static hosting.
Consequences: UI is hand-written DOM in `uiController.js` / `minigameHud.js`.

## D2 — DOM UI layered over a Pixi canvas (2026-06-11) — Accepted
Decision: backgrounds, characters, effects and minigame gameplay render in Pixi;
dialogue, choices, buttons and the minigame HUD are absolutely-positioned DOM.
Why: crisp text, accessible buttons, CSS styling.
Consequences: layout of the two systems is independent — panels can cover the
art (see mobile issues). Pixi does not know where the panels are.

## D3 — The story is one runtime-fetched JSON file (2026-06-11) — Accepted
Decision: `public/story/story.json`, fetched at startup, not imported.
Why: write the story without touching code; edit and refresh.
Consequences: no compile-time check of scene links — broken `next` ids only
fail when the player reaches them.

## D4 — Relative asset paths + `base: './'` (2026-06-11) — Accepted
Decision: all asset paths are `assets/...` without a leading slash.
Why: the game is served from `/draci-jezdkyne/`, not the domain root.

## D5 — Backgrounds are contain-fit (letterboxed) (2026-06-11) — Accepted
Decision: the whole background image is always visible; leftover space is black.
Why: AI-painted scenes have important content near the edges.
Consequences: in portrait phone orientation the image is a small strip.
(The dragonAttack minigame background uses cover-fit instead.)

## D6 — Autosave to localStorage on every scene (2026-06-11) — Accepted
Decision: key `vn:<storyId>:autosave` stores current scene, back-history and
`readSceneIds` (reserved for a future "skip read text" feature).
Consequences: renaming the story `id` resets everyone's progress.

## D7 — Missing art falls back to vector placeholders (2026-06-11) — Accepted
Decision: characters, dragons, beavers and projectiles draw simple shapes when
their sprite is missing or fails to load.
Why: playable before art exists.

## D8 — Preload only 3 scenes ahead (2026-06-17) — Accepted
Decision: after each scene, preload assets of scenes reachable within 3 steps.
Why: images are large (2–3 MB); loading the whole story up front is too slow.

## D9 — Minigames: registry, binary outcome, skippable (2026-10-17) — Accepted
Decision: minigames register by `type` in `MinigameManager`; each resolves to
`victory` or `failure`; the player may skip and pick the outcome (unless
`allowSkip: false`); the minigame scene is excluded from back-history; config
deep-merges over DEFAULTS, arrays replace wholesale.
Why: kids must never get stuck on a game; outcomes map cleanly to story branches.

## D10 — Deploy via GitHub Actions on push to main (2026-06-11) — Accepted
Decision: CI builds with Node 20 and publishes `dist/` to GitHub Pages.
Consequences: every imported file and referenced asset must be committed.

## D11 — Nothing is done until it's tested on the live site (2026-10-17) — Accepted
Decision: a feature, bug fix or any other change counts as done only after it
has been deployed and tested on https://sara-wokounova.github.io/draci-jezdkyne/.
Local testing (dev server, preview build) is required too, but it isn't enough.
Why: decided by Sára. The live build differs from local (base path, committed vs
untracked files, CI build). The broken `50cf1d8` deploy shipped exactly because
local looked fine.
Consequences: finishing a task means commit → push → wait for the Pages deploy
→ run the checks against the live URL → only then report done. Until then the
honest status is "verified locally, not yet live".

## D12 — Phones play fullscreen (2026-10-17) — Accepted
Decision: on touch devices (`pointer: coarse`) a tap requests fullscreen
(the first tap, and again on the next tap if the player has left fullscreen).
Desktop never goes fullscreen on its own. iPhone Safari has no element
Fullscreen API, so on iPhone the URL bar only goes away when the game is added
to the home screen: a web app manifest (`display: fullscreen`) plus
`apple-mobile-web-app-capable` covers that.
Why: decided by Sára — the browser URL bar takes too much of a phone screen.

## D13 — Landscape-only on phones (2026-10-17) — Accepted
Decision: once fullscreen, lock the orientation to landscape
(`screen.orientation.lock('landscape')`, works on Android). Where it can't be
locked (iPhone, or before the first tap), portrait shows a full-screen
`#rotate-hint` overlay asking the player to turn the phone. The overlay blocks
the game. There is no portrait layout.
Why: decided by Sára. The 16:9 art plus dialogue needs the width, and one phone layout is easier to keep working.
Consequences: tablets held in portrait also see the overlay (coarse pointer) —
revisit if that matters. Supersedes the portrait part of D5's consequences.

## D14 — Phone layout = one short-landscape layout (2026-10-17) — Accepted
Decision: `@media (orientation: landscape) and (max-height: 500px)` at the end of
`main.css`. The dialogue is a compact strip at the bottom (16px text, `#save-status`
hidden). On choice scenes the dialogue takes the left half and the choices the right
half (switched by `#game-root:has(#choice-panel:not(.hidden))`), and the continue hint
is hidden there. `viewport-fit=cover` + `env(safe-area-inset-*)` keep text clear of
notches and the home indicator. The root height is `100dvh` (after a `100%` fallback).
`text-size-adjust: 100%` stops iOS enlarging text after a rotation. Character and
background fit (`visualRenderer.js`) are unchanged.
Why: on a ~390px-tall screen the desktop sizes filled the screen. The layout keys on
height, not pointer, so short desktop windows get it too, and 1440x900 never does.
Rejected: choices above the dialogue (covers faces, leaves under 50% of the picture
at 640x360), fitting the background above the panel (tiny picture), moving
characters in JS. With the compact strip, heads are already 100% visible.
Consequences: needs `:has()` (Chrome 105 / Safari 15.4 / Firefox 121). Without it the
choices overlap the right half of the dialogue. A much longer choice-scene text grows
the left panel toward the top controls. The tightest case is 640x360
`dam_with_beavers_choice` at ~56% of the background visible (limit 50%). The rules
must stay below the `.mg-*`, `#top-controls` and `max-width: 720px` rules (same
specificity, later wins).

## D15 — Minigame scales with screen height (2026-10-17) — Accepted
Decision: `dragonAttack` scales its root container by `min(1, height / designHeight)`
with `designHeight: 600` in DEFAULTS. Every px number in the config is in game pixels.
`layout()` runs every tick, so resizes and rotations need no extra code. A beaver
walking off the far edge re-enters behind the last walker, at least `spacingPx` back,
instead of snapping to a fixed spot. Beavers that start or end up past the edge on a
narrow screen queue up off-screen and walk in.
Dragons fly at `flightY` of the height but never higher than the bottom of the HUD
top bar (`MinigameHud.coveredTop()`). On a touch device the game pauses while
`app.screen` is portrait (that is when `#rotate-hint` covers it).
Why: all DEFAULTS were desktop pixels. On a 360px-tall screen everything was about
twice as big and fast relative to the screen, beavers spawned off-screen all snapped
to the same x and stacked, and Róza's dragon flew behind the HUD. Scaling the root
scales sizes, speeds and physics together, so the game plays the same. 600 rather
than 720, so laptop viewports (about 625–660px tall) stay at scale 1. The plan's
"wrap by lane length" kept the spacing only while the width was constant. It broke
(gap 28px < radius 38) when the world got narrower: after a rotation (Pixi applies
the new size a frame late) or when going fullscreen (a taller screen means a
narrower world). The pause reads `app.screen`, not `matchMedia`, for the same
reason. The plan's other piece, capping spacing at `width / count`, was dropped.
A reload on the minigame scene in portrait would have packed the beavers 56px apart
(91px sprites) for the whole round, and re-entry alone already prevents stacking.
Consequences: desktop at 600px tall or more is unchanged. A future minigame that uses
pointer positions must divide by `root.scale`. On short screens the three dragons
fly at nearly the same height, because they are pushed below the HUD.

## D16 — Fullscreen and rotate-hint wiring (2026-10-17) — Accepted
Decision: `#rotate-hint` is static HTML outside `#game-root`, shown only by CSS
`(orientation: portrait) and (pointer: coarse)`, with z-index 10 (above the HUD). It
adds a second line telling the player to switch off the rotation lock (iPhone).
`InputController.connect()` adds one `document` pointerup listener, but only when
`(pointer: coarse)` matches at startup. The listener skips if already fullscreen,
calls `documentElement.requestFullscreen()`, then `screen.orientation.lock('landscape')`
after that resolves, and swallows every rejection. It uses the unprefixed API only.
A minimal `public/manifest.webmanifest` (relative `start_url`/`scope`,
`display: fullscreen`, `orientation: landscape`, no icons or service worker) is
linked as `/manifest.webmanifest`. Vite (`base: './'`) rewrites the link to `./`.
Why: being outside the root keeps taps on the overlay from advancing the story, and
the listener on `document` still sees them. Android needs fullscreen before `lock()`.
Desktop never registers the listener.
Consequences: old iPads (before iPadOS 16.4) only have `webkitRequestFullscreen` and
skip fullscreen. A device whose pointer type changes after load keeps its startup
behaviour. `public/manifest.webmanifest` must be committed, or the link 404s on Pages.

## D17 — Stale scene renders are dropped (2026-10-17) — Accepted
Decision: `VisualRenderer.render()` takes a token. After every await, a render whose
token is no longer the latest returns instead of adding sprites or starting effects.
Why: the first tap on an Android phone both advances the story and goes fullscreen.
Going fullscreen resizes the page, so a second render starts while the first is
still loading sprites, and both added a character (a ghost offset by ~50px). The
token is the smallest fix where every caller (advance, Back, resize) routes through.
Consequences: a superseded render may leave its layers partly drawn until the latest
render finishes. That is fine, because the latest one cleared them first.

## D18 — Endings, main menu and gallery (2026-10-28) — Accepted
Decision: a scene becomes an ending by adding `"end": { "good", "title", "text" }`.
It shows like any scene; the next tap opens a centred `#end-card` (KONEC, "Dobrý/Špatný
konec: title", text, "Zpět na začátek") and hides the dialogue. The button resets the
progress to `start` (like Restart) and opens the main menu. The game opens on
`#main-menu` (Start, Nastavení, Galerie) drawn over the saved scene; Start continues
from the autosave, which after an ending is the story start. Galerie lists the `end`
scenes found in the autosave's `readSceneIds`, with the background as a thumbnail.
Nastavení is an empty page for now.
Why: asked for by Sára. Reusing `readSceneIds` (D6) needs no new save data and it
already survives Restart. Showing the end card one tap after the scene keeps the
scene's last line readable on phones, where a centred card and the bottom strip
overlap. The menu only draws the saved scene, because `showScene` would start a
saved minigame behind it.
Consequences: an ending counts as found as soon as its scene is shown, even if the
player goes Back before the card. Renaming the story `id` also empties the gallery.
Gallery thumbnails are the full ~3.3 MB backgrounds (lazy-loaded). While the menu is
open, `menuOpen` blocks story input the same way `minigameActive` does; Space/Enter
inside the menu or end card are left to the focused button.

## D19 — Nastavení: music volume and autoread (2026-10-28) — Accepted
Supersedes: the "Nastavení is an empty page" part of D18.
Decision: Nastavení has a "Hlasitost hudby" range (0–100, step 5, default 75) that sets
the Howler master volume, and an "Automaticky pokračovat" checkbox (autoread, default
off). Both are stored in the autosave as `settings` and survive restarts. With
autoread on, a scene advances by itself `2000 + 70 ms × text length` after it has
rendered (constants at the top of `startVisualNovel.js`). It goes through `advance()`,
so it stops at choices, never runs during the menu or a minigame, and on an `end`
scene it opens the end card. Any scene change cancels the pending timer.
Why: asked for by Sára. "Autoread" is taken as the usual VN auto-advance, not
reading the text aloud. One fixed speed instead of a speed slider: nobody has tried
it with kids yet. Native `<input type="range">` / checkbox, styled with `accent-color`.
Consequences: there is no music yet, so the volume is verified only through
`Howler.volume()`. The label says "Automaticky pokračovat" because "Automatické čtení"
reads like text-to-speech.

## D20 — A failed background never blanks the scene; the menu preloads (2026-10-28) — Accepted
Decision: when a background image fails to load, `drawBackground` draws the generated
background (the D7 fallback that characters already had) and the scene's characters
still draw. The main menu preloads the next 3 scenes from the saved one (D8), as the
startup did before D18.
Why: user-reported "black screen after the first scene, stick figures instead of
sprites" (2026-10-28). Reproduced by making every image request fail after the page
had loaded, as when the dev server behind an open tab stops. A failed background made
`render()` reject, which blanked the scene and skipped its characters. D18's menu had
dropped the startup preload, so more of the first scenes hit the failure.
Consequences: a missing or unreachable background shows the generated sunset forest,
not black. Nothing can show art the server doesn't deliver: a reload with the server
running is still the fix for that case.

## D21 — Background music per scene (2026-10-28) — Accepted
Decision: `story.assets.music` maps keys to mp3 files, a scene's `music` names a key, and
the top-level `menuMusic` plays on the main menu. The same key on the next scene (or on
the menu) keeps the track playing from where it is. A different key fades the old track
out (350 ms) and starts the new one. A scene without `music` is silent. Tracks stream
as HTML5 audio (`html5: true`). Music starts before the scene's images load. The menu
track waits for the first tap or key (browser autoplay rules), using Howler's `unlock`.
"Zpět na začátek" resets to the start without showing the start scene.
Why: asked for by Sára. Village scenes use village_day and the flying scenes use
dragon_flight. Silence without `music` makes Back into a non-village scene stop the
village track. Streaming: each mp3 is ~3.7 MB, and Web Audio would download and decode
all of it (about 40 MB of memory) before a note plays. Starting before the render
means a slow, superseded render can't start the old scene's track after the new one,
and on Start, play() still runs inside the click. Skipping the start scene on the way
to the menu keeps the ending's village_day playing into the menu, instead of cutting
to dragon_flight and restarting village_day.
Consequences: iOS ignores the volume of HTML5 audio, so the volume slider and the
fades do nothing on iPhone (use the hardware buttons). A track that never started (still
loading, or blocked) is dropped at once instead of faded. Going back to a scene whose
track was switched away starts it from the beginning.

## D22 — Music starts after the page's first input (2026-10-28) — Accepted
Supersedes: D21's "the menu track waits for the first tap … using Howler's `unlock`",
its claim that play() runs inside the Start click (Howler queues play() until the mp3 can
play, so it never did), and (within a fade-out) its "going back to a scene whose track was
switched away starts it from the beginning".
Decision: `AudioManager` starts no track before the page has seen its first click, tap
(touchend) or key that the browser counts as user activation. Tab, arrows, Escape or a
touch that scrolls don't count: when `navigator.userActivation.hasBeenActive` is still
false, it keeps waiting. The track waiting at that moment (usually the menu's) starts
after that event has been fully handled, on a 0 ms timer. Every track fades in from
Howler's `play` event, not right after `play()`. A track being replaced is unloaded on a
timer (`FADE_OUT_MS + UNLOAD_MARGIN_MS`) after its fade-out starts, not on Howler's `fade` event. While
the page is hidden (a locked tablet, another app) Howler is muted and the track paused;
on return it unmutes and plays the track again unless it is still playing. Muting
matters because Howler can't run a `pause()` while a `play()` is still loading or
starting (it queues it), and resuming only a stopped track avoids a second copy. A track
whose `play()` is still starting counts as playing, so when the page comes back inside that
moment, the hide's queued `pause()` stops it only once it has started: it is played again
after its `play` event if it is then stopped. Every new
track re-applies the mute state (`Howler.mute(document.hidden)`): its `<audio>` element can
come from Howler's pool still muted after an unload on a hidden page, and `Howler.mute(false)`
only reaches tracks that existed when the page came back. A track due while hidden
(autoread moving on in a background tab) waits for the page. A scene with the same key
restarts a track that has stopped (a play() the browser refused) instead of leaving it
silent. Going back to a track that is still fading out (within `FADE_OUT_MS + UNLOAD_MARGIN_MS`, also
across several quick hops: every fading track is kept by key) fades that same track back
in rather than starting a second copy from 0:00 over it. Hiding the page sets a track
that has started to its target volume, so a fade-out after a hide in the middle of its
fade-in fades instead of cutting (Howler's `pause()` finishes the sound's fade but not the
track's own volume); a track that hasn't started stays at 0, so it still fades in. A start
that waited for the first input is dropped when its track is replaced: Howler would still
play the unloaded track, unseen, at volume 0. A music key must name a string path in `assets.music`;
anything else (a typo, an inherited name like `toString`) is a warning and silence.
Why: the disprover found that Firefox's default policy ("allowed-muted") lets a track at
volume 0 start, then pauses it for good once the fade-in raises the volume. Howler never
notices, so the menu, and a village save, stayed silent in Firefox until a scene changed
the track. Waiting for the input avoids the browser rule instead of reacting to it.
The 0 ms timer exists because Howler's own unlock is a listener on that same first event,
and it reloads every audio element that hasn't played yet (not `_unlocked`), aborting a
play() started just before it ("interrupted by a new load request"). On touch devices
Howler already unlocks on touchstart, before our touchend; the timer is harmless there.
`navigator.userActivation` is only used to
reject non-activating inputs: automated Chrome reports `hasBeenActive` as true on a fresh
load, so on its own it can't decide that sound is allowed. On an already loaded track,
Howler queues a `fade()` called right after `play()` behind its play lock and never runs
it, so the waiting menu track played at volume 0 (found by the review panel). Howler
never fires `fade` for a 0 → 0 fade, so switching tracks while the fade-in was still at
0 left the old track looping silently forever.
Consequences: before the first input there is no sound at all, even where the browser
would allow it. A tap made while the page is still loading (before `AudioManager`
exists) isn't seen, so the menu music waits for one more tap. It isn't started at once
when the browser reports earlier activation, because Howler's unlock would still run on
the next input and reload a track that is still loading. Browsers without
`navigator.userActivation` (Firefox before 120, Safari before 16.4) treat any first key as
activation, so a first Tab there can leave the menu silent until a tap or a scene with
another track; the same-key restart covers the next scene with that key. A Howler console
warning ("HTML5 Audio pool exhausted") on startup is expected and harmless.

## D23 — Róza's minigame art, firing rules and a clean round end (2026-10-28) — Accepted
Supersedes: D15's "never higher than the bottom of the HUD top bar" measured with `height / 2`
(now the art's real extent above its eye, see below).
Decision: Róza's dragon, attack and fireball come from three hand-painted sheets kept in
`art/minigames/dragon-attack/` (in git, not deployed). They are cleaned with
`removeCheckerboard.mjs --enclosed` (dragon) or `--glow` (fireball) and packed by
`scripts/packFrames.mjs` into one-row strips with equal frames, every frame aligned on an
anchor: the dragon's eye (hand-measured per frame, `*.anchors.json`) or the fireball's
white-hot core. The config takes the strip's frame count and anchor. `showFrame()` is the
only place that changes a frame, and it sets the anchor too. The dragon flaps
`[0, 3, 1, 2, 4, 2, 1, 3]` at 12 fps, ~200 game px wide. A tap plays attack frames 1–5 at
24 fps, and the shot leaves from the mouth on frame 3 (fire). Then the dragon flaps again
from the top of the stroke. The fireball keeps the pre-D23 path (Sára: keep the angle). It
shows frames 0→3, then holds, rotated along its velocity. A hit shows the dissipating flame
at the contact point. A shot is removed only when all of it is off-screen. Each strip falls
back on its own. Without the fly strip, the vector dragon also ignores the attack strip,
since it has no anchor.
The flight-height clamp uses the art's real extent above the eye (both strips) instead of
`height / 2`.
Firing rules per dragon: `attack.maxShots` own shots in the air (Róza and Emma 1, Anna 3),
and after a launch `attack.refireAfter` × that shot's on-screen time (Anna ⅓). That time is
computed at launch by stepping the same motion code. The firing state lives on the game per
round (`this.fire`), never on the config. A round is lost only when the flights are over,
no shot is in the air, and beavers remain. A dragon attacks only while its shot would start on
the screen (Róza's mouth, a vector dragon's head, Anna's tail), judged where that will be when
the shot actually leaves (Róza's fire frame, 83 ms after the tap): a shot fired from off-screen
fell unseen and, with `maxShots` 1, blocked the next taps for its whole airtime, and a breath
with no fireball looked broken. So a tap either fires a visible shot or does nothing. (A shot
whose start has still left the screen by the fire frame, e.g. after a resize, is lost.) A new
shot is first drawn where it leaves: the tick that launches it doesn't move it. Shots only hit
beavers that are on the screen. A zigzag shot is judged off-screen by its column widened by its
swing, not by where the weave has it.
`start()` loads everything with one `Promise.all` (background, strips, all 7 beaver sheets)
and touches the scene only after that single await. It stops there if a skip already
destroyed the game. Beavers get their lane position when created. `complete()` removes
shots, impacts and a half-played attack. `tick()` stops as soon as the round has ended.
Errors and odd config values are handled as D24 says.
Emma's and Anna's sprite paths are `null`, since those files never existed.
`removeCheckerboard.mjs` takes a file or a folder. It skips PNGs that already have
transparency, unless `--force`. It rejects unknown flags. Neither script writes into `art/`:
both compare real paths (links, junctions and short names resolved; case-insensitive on
Windows), the cleaner for every file it would touch, so a folder run or a junction can't get
in, and both refuse to write a file that has other names (a hard link into `art/`). `art/` holds the only copies of the originals and the hand-measured anchors.
Why: asked for by Sára ("use roze_attack.png, roza_move.png and beska_projektil.png as
sprites for the first dragon attack", plus her firing rules). The source sheets have a
baked checkerboard, overlapping and unregistered frames. Slicing them in a grid made the
dragon jump and leaked a neighbour's flame into a frame. The eye anchor keeps the head
still across the two sheets. Without the anchor in `showFrame` the dragon would jump
~36 game px on every attack, because Pixi 8's texture setter ignores the texture's own
anchor. A shot leaving on the fire frame lines up with the breath. The Firefox report
("sprite in the top-left corner, then the red stick") was the beavers at (0, 0) while their
sheets loaded one after another, plus Róza's art not existing yet. Firing state on the
config would have leaked into a retry, because `mergeConfig` returns `DEFAULTS.dragons`
itself. The skip guard and the tick/complete guards fix throws: a throw in a ticker listener
stops that ticker for good (D24). Re-running the cleaner on a packed strip turned it into an
opaque box (its transparent pixels are RGB 0, so the edge fill never starts), hence the skip.
Consequences: more shots per flight make the round easier (intended). Tune with
`maxShots` / `refireAfter`. Near the left edge Anna's backward arrows leave in under a
second, so the ⅓ rule rarely lets a third one out there. To change Róza's art, edit the
originals in `art/` and regenerate (CLAUDE.md → Assets). `--enclosed` can erase neutral
grey-white art (eye whites), so it is opt-in. The minigame `background.png` still 404s
(issue P2). Code that changes a strip sprite's frame must set the anchor with it, as
`showFrame()` in `dragonAttack.js` does.

## D24 — Minigames fail safe on errors and odd config (2026-10-29) — Accepted
Decision: no error and no config typo may leave the player stuck in a minigame or freeze it.
`MinigameManager.run()` runs the game's constructor and `start()` in one promise chain: if
either throws or rejects (a malformed `minigame.config`, a start-up that breaks), it logs
"Minigame failed to start" and goes to `onFailure`. Inside `dragonAttack`, `tick()` catches any
error, logs "Minigame error" and ends the round as lost. No shot stays in the air longer than
`MAX_SHOT_SECONDS` (10, the same cap as the airtime calculation), and no flight lasts longer than
`MAX_FLIGHT_SECONDS` (30: a dragon `speed` typo would never reach the edge). Config values are normalised
where they enter: strip anchors (two finite fractions, else the centre), frame indices
(integers only), frame counts (at most one per pixel of width), `beavers.count` (at most
`MAX_BEAVERS`, 50), `flightsPerDragon` (at most `MAX_FLIGHTS_PER_DRAGON`, 100), `refireAfter`
(not a number → 0), `flightGapMs` (not a number ≥ 0 → 450), `designHeight` (not a positive
number → 600), `maxShots` (a whole number ≥ 1, else 1), the strip fps, `impactMs` and
`bodyWidth` (not a positive number → the default: 24 / 12 / 14 fps, 300 ms, the strip's frame width) and the beaver animation fps (≤ 0 never spins: a looping
animation stands still, a one-shot one counts as done; any fps advances by whole frames at
once).
Why: found by the review panels while D23 was built. A throw in a Pixi ticker listener stops
that ticker for good, so the game froze under the HUD; with `allowSkip: false` there was no
way out, and a constructor that threw before the skip button was wired locked the HUD the
same way. A NaN position kept a shot in the air for ever, and the round only ends once every
shot has resolved. A negative fps or a huge flight count hung the page in a loop the error
backstop can't catch, because nothing throws. The story file is written by its author, so
these are typos, not attacks, but a child can't get out of a stuck minigame.
Consequences: a bug picks the failure branch instead of freezing (the lesser evil; the log
says so). A custom `dragons` list must still give every field a dragon uses (README): the
normalisation covers the optional fields and the loop-prone numbers, not e.g. `color` (a
missing one fails the start, which then goes to `onFailure`). A new minigame gets the
manager's half for free; its own ticker listener needs the same backstop.

## D25 — Battle music: two songs joined into one looping file (2026-10-29) — Accepted
Decision: the minigame scene `beaver_battle` plays `battle` (`assets/music/battle.mp3`): Sára's
battle_01 (146.3 s) followed by battle_02 (152.6 s), joined and encoded once at 128 kbps CBR
(298.9 s, 4.8 MB) with the ffmpeg command in CLAUDE.md, and looped like any track (D21, D22).
The originals live in `art/music/` (kept in git, not deployed). `river_dam` plays forest_ground.
Why: Sára asked for battle_01 and battle_02 "one after another … for as long as the minigame
runs". A playlist engine in `AudioManager` (an item chain on Howler's `end` event) was planned
through five disprover rounds and dropped for its moving parts: the next song would start outside
a tap (a phone may refuse it), a gap while it loads, revive and retry corner cases, a dozen tests.
One file needs no code at all. 128 kbps (Sára's choice over 192): Firefox downloads a whole HTML5
track at once, next to the minigame's ~12 MB of beaver sheets (Chrome buffers ~3 MiB either way);
plenty for game music on a phone. `-fflags +bitexact` keeps the ffmpeg version out of the file.
Consequences: a round lasts ~80 s and every attempt starts at 0:00, so battle_02 (from 2:26) is
practically never heard in one attempt. Sára asked for the music to resume where the last
attempt stopped (2026-10-29): planned separately, not built yet (issues.md). Changing
either song means re-running the command. The joined file loses the originals' C2PA provenance
metadata (it is bound to the original audio; the originals keep it); the SynthID watermark is in
the audio itself (whether it survives the re-encode is not checked). Firefox's loop gap is ~0.4–0.6 s, as for every track there (issue P3).

## D26 — Listed music tracks resume where they were left (2026-10-29) — Accepted
Supersedes: D21's "going back to a scene whose track was switched away starts it from the
beginning", for the keys listed in `resumeMusic`; D25's "every attempt starts at 0:00".
Decision: the story's top-level `"resumeMusic": ["battle"]` lists music keys whose position is
remembered. When such a track is switched away while playing, `AudioManager` stores its
position (`seek()`, the moment the switch starts, before the fade-out); the next time the key
starts afresh, the new track is sought there before its first `play()`. A track that never
started (still loading, or waiting for the first input) doesn't overwrite the stored position.
Positions live in memory only: a reload starts every track over, and a new game (Nová hra,
"Zpět na začátek", `resetToStart()`) calls `forgetPositions()`. That also covers a listed track still
playing at that moment: the new game's first scene switches away from it, and that switch stores nothing
(unless the new game keeps the same track playing). A revive inside the fade-out (D22) keeps the same
track, as before. Every `play()` goes through `playTrack()`, with the id of the track's one sound: a bare
`play()` while a resumed start buffers (Howler's play lock held, the sound still paused) starts a second
copy, and a bare `play()` of an ended sound gives it a new id. `resumeMusic` must be an array
(anything else counts as empty); an item that isn't a key of `assets.music` logs a warning.
Why: Sára chose "resume where it stopped" for the battle music: a round lasts ~80 s, battle.mp3
299 s (D25), so starting each attempt at 0:00 would never reach battle_02. A list of keys keeps
every other track as it was (a return to the village still starts village_day over); a flag
inside `assets.music` would have turned its string values into objects (D22's key check).
Consequences: a resumed start buffers at the new position first: in Chrome on a slow link ~3–4 s
instead of ~1 s. The new-game rule for a track still playing has no story path while only `battle` is
listed (no menu during a minigame, D27); it stays as the rule for any listed key that plays outside one. iOS behaviour after the seek is unverified (issue P3). A switch in the few
milliseconds while Howler restarts the loop at 0:00 (it may buffer there too) stores nothing, so the
next visit resumes at the older position; theoretical, once per 299 s of play. A position in the last
~0.65 s of the file (about 0.2 % of retries) loops back to 0:00 during the fade-in: Howler ends that
fade for the sound but not for the track's own volume, so the music jumps up at the loop point and the
next switch starts its fade-out lower (rough, never silent). A new game marks only the track playing then:
a listed track still fading out from an earlier switch, if revived within its fade-out (D22), would bring
the old game's position along (theoretical: no story path reaches a listed key that fast after a reset).

## D27 — Main menu: Pokračovat / Nová hra; a Menu button in the game (2026-10-29) — Accepted
Supersedes: D18's "Start continues from the autosave" and its Restart (and the R key) as the way to a new
game: now Nová hra.
Decision: the main menu has Pokračovat (the old Start, still `#menu-start`: the saved scene with its Back
history), Nová hra, Nastavení, Galerie. Pokračovat is disabled unless there is an active game session: the game
was started in this page visit (and not reset by "Zpět na začátek" since), or the save holds progress — its
resolved scene is not an ending and either isn't the story's start or has Back history. Nová hra resets progress
as Restart did (settings and the gallery stay; music positions are forgotten, D26); with progress to lose it
first opens a confirmation page ("Začít novou hru? Rozehraná hra se ztratí.", Ne first and focused, then Ano).
Ano takes a tap or click only after 500 ms (`TAP_GUARD_MS`) without any tap, counted from the page opening and
from every pointerdown while it shows; keyboard clicks always count; a click without a press of its own
(assistive technology) is judged by its own time; Ano is dimmed while it would ignore a tap, and while a press
that won't count is held. The top bar's Restart (and R) is replaced by "Menu", which opens the menu over the
game; so does Esc, on the end card too. In the menu, Esc on a sub-page goes back to the main page, and on the
main page of a menu opened from the game back to the game; the startup menu ignores it; a held Esc doesn't
repeat. The menu always opens on its main page with the first enabled button focused; a sub-page focuses its
first button, and going back refocuses the button that opened it. The in-game menu keeps the scene's music and
Pokračovat continues it; the startup menu and "Zpět na začátek" play the menu music. No menu during a minigame
(its skip button is the way out). Story input (taps, choices, number keys, Back) waits 500 ms after the menu
closes. Enter/Space on a focused top-bar button press it, and a mouse press doesn't focus those buttons. A
minigame scene starts its minigame without awaiting its render (the render goes on behind it; a rejection logs
"Scene render failed"); `MinigameManager.run()` removes the HUD, `minigame-active` and the minigame layer's
sprites even when the game's `destroy()` throws; Back is enabled again as soon as the minigame ends. A held key presses a focused button only once
(its repeats are dropped), and Ano also stops being dimmed when the browser cancels a press.
Why: asked for by Sára ("split Start in menu into Nová hra and Pokračovat. Disable Pokračovat when there is no
active game session. Add escape to main menu into game screen - at the top where is restart - name the option
"Menu""), with her answers: Nová hra asks first, Menu replaces Restart and R, the in-game menu keeps the scene's
music, an ending is no progress. The confirmation replaces the main page at once with Ano right below where Nová
hra was (0.5 px on desktop; on Android the first tap's fullscreen resize moves the page ~28 px), so a double tap
or a child mashing the button would otherwise wipe the save: no layout keeps Ano away. The guard after the menu
closes stops the second tap of a double tap on Pokračovat from skipping a line or picking the choice under the
button. Not awaiting a minigame scene's render leaves no moment in which Back, Menu or Esc can reach that scene
before the HUD (Back or R during a slow render used to start the minigame over another scene), and a stalled
render can't freeze the start. A throwing clean-up left the HUD up and the top bar hidden: on a phone, with no
Esc, stuck. R with no confirmation would have stayed an invisible, instant progress wipe. A mouse press that
focused Back made Chrome treat the next key as keyboard focus, so Space pressed Back again.
Consequences: a save left on an ending opens with Pokračovat disabled (Back from the ending into the other
branch is gone for it), while that ending is drawn behind the menu. A mouse click on the disabled Pokračovat is
no first input (D22: no click event), but a tap on it is (touch events), so on a phone it starts the menu music.
Menu on the end card, then Pokračovat, shows the end scene with the card closed; the next tap reopens it. With a
stalled render the battle plays over a black backdrop until the picture arrives (the minigame has no background
of its own yet, issue P2). On a minigame scene left by a story typo in `onVictory`/`onFailure`, Pokračovat runs
the minigame again, as on a saved minigame scene; Back and Nová hra are the ways on. A clean-up that throws
part-way may leave that game's own listeners live (theoretical). In fullscreen (phones) the browser takes Esc to
leave fullscreen; the Menu button is the way there.

## D28 — Commit messages are written in the past tense (2026-10-29) — Accepted
Decision: every commit message says what was changed, in the past tense, starting with the verb:
"Added a new scene with fire ants." (Sára's example), "Fixed …", "Changed …", "Removed …". The body, when
there is one, keeps the same style.
Why: decided by Sára.
Consequences: applies to every commit from now on. Earlier commits keep their wording (history is not
rewritten).

## D29 — Sound effects in the minigame; music 9 dB quieter; two volume sliders (2026-10-29) — Accepted
Supersedes: D19's single "Hlasitost hudby" master slider (Howler's master volume) and the 0.75 track volume it scaled
(`TRACK_VOLUME` in audioManager.js), D25's battle.mp3 command (now with `volume=-9dB`).
Decision: the dragonAttack minigame plays sound effects: each dragon's shot when it really launches (Bezzubka's
fireball, Emma's lightning, Anna's thorn; a lost shot is silent) and that shot's hit sound, plus the beaver's cry and,
when a log drops, the log sound on every hit, whoever shot. The cry and the log start with 150 and 250 ms of silence
in their files (Sára's stagger), so all three start on the hit tick. A file plays at most once per game tick (two
beavers hit at once: one hit, one cry, one log). Emma's lightning leaves her head (`launchFrom: 'head'`). Effects are
Web Audio Howls, one per file for the page (`src/engine/sfx.js`), created before the round's single await and never
awaited; one plays only when loaded, still on Web Audio and with the AudioContext running, so a file that loads late
or a suspended context never plays anything late; without Web Audio there are none; nothing there throws. Howler's
auto-suspend (30 s after the last sound) is off while a round runs and on again when it ends or is skipped (its timer
armed again then, as Howler arms it only when a sound ends), so the
context never falls asleep mid-round; while the page is hidden mid-round (a phone locked: the round can't end) it is on
as usual; the round's start, its keydown and the canvas pointerup still resume a context
the system suspended (an interruption), never awaited (an interrupted iOS context resumes only when the interruption
ends), and set Howler's own state to running. Every effect is at 0.7 (`EFFECT_MIX`) × the effects slider; config per sound: `{ src, volume }`, a
bare path or `null` (README). Nastavení has two sliders: "Hlasitost hudby" sets the music track's own volume (default
75) and "Hlasitost efektů" the effects' (default 75); Howler's master stays at 1. Letting go of the effects slider
plays a test sound (the fireball hit), one at a time, after resuming the context, only while Nastavení is still open.
Every music file is 9 dB quieter, made from its original in `art/music/` by `scripts/build-music.sh`; the effects by
`scripts/build-sfx.sh` (scripts, not commands in CLAUDE.md as the plan had it: the review panel kept finding ways to
hide a line in a doc block that the tests checked and a reader would paste). A fade that
would change nothing is a plain `volume()`, a fade-in is tracked by time, and a settings change touches the music only
when the music volume changed; during Howler's play lock (its loop restart, a show after a hide) the music slider waits
for the track's `play` event (Howler would queue the change and never run it), and a plain level is set with two
`volume()` calls (with a fade still running, Howler's first one only stops it and leaves the sound on the fade's
target, which the next loop restart plays). Saved settings are not migrated: a saved music volume stays the number it is; only a
save from before this with the music at 0 (then the master: it silenced everything) gets the effects at 0 too.
Why: asked for by Sára ("generate sounds for the bezzubka's projectile being shot, it hitting the beaver, beaver
crying out loud and beaver dropping the wood", the cry and log "on every hit", Emma's lightning and Anna's thorn, "add
effects volume as slider into settings", "set the default background music level to half"), with her picks from the
listening page (shot a1 without its pause, cry b, log a, Emma c/c, Anna a/b, all at one mix, staggered 150/250 ms).
The sounds came from Runway's sound-effect tool (AI-generated); the raw picks stay in `art/minigames/dragon-attack/sfx/`.
Web Audio, not HTML5 like the music: short clips must start at once and overlap, and iPhone ignores HTML5 volume.
Levelled by loudness (RMS −14 dBFS), not peak: by peak the clicks sat 17 dB under the battle music. 9 dB on the files
rather than a lower slider default: on iPhone and iPad the HTML5 music ignores every volume, so only the file level
reaches it; 6 dB would have left the music as loud as the effects there, about the balance Sára rejected. With the
0.75 track factor gone, the default sounds as Sára chose ("35", a touch under half). No settings migration: a saved
0.75 (nearly every save, the old default) is the new default by itself, and any other saved value plays quieter, in
the direction asked for. Never awaiting the resume: on iOS an interrupted context's resume stays pending. No auto-suspend during a round
(found by the review panel, against the plan's "no autoSuspend change"): Howler's 30 s timer, armed by the Nastavení
test sound or an earlier round, could suspend the context mid-round, and the shot that woke it was silent. Howler's
state is set after our resume because Howler otherwise queues every play behind a resume of its own.
Consequences: on computers the shots and hits sit 5–6 dB over the music at the defaults, on iPhone and iPad 2.6–3.6 dB
(the log drop just under it). Mashing Bezzubka's shot on a phone (a new shot as soon as the last one hit, 0.45 s
apart) peaks at about +0.5 dBFS at the default effects level: a few samples clip for a moment (cosmetic; Sára's
equal mix wins; a 1280×720 window stays at −0.6). The deployed music loses the C2PA provenance it carried (the
originals keep it). The music files keep their names, so for up to ~10 minutes after a deploy (Pages' cache) a browser
can mix new code with old cached music (2.5 dB louder than before) or an old open tab can stream the new files much
quieter until a reload; the live check (D11) runs after a hard reload. An old tab open during the deploy writes
settings without `effectsVolume`; the new code uses the default. A tall window means longer flights and so a longer
wait between the shot and the hit (the world only scales down, D15). The minigame's sounds play the moment a shot
launches, so a later change to when a dragon launches (Anna's tail flick) moves its sound with it. After the system
suspended the audio mid-round (a phone locked and unlocked), the shot whose tap wakes it again is silent (the resume
takes ~180 ms; later ones play). Sounds that use the same file share one volume (the last one played sets it); in the
defaults only Bezzubka's hit and the Nastavení test sound share one (both at 0.7, never at once: no menu during a
round). Uses Howler 2.2.4 internals (`_webAudio`, `Howler.state`, `Howler._autoSuspend()`, its pending suspend
timer checking `autoSuspend` again; in audioManager.js `_playLock` and `volume()` stopping a fade on its target):
rerun minigame-roza.mjs 29d, 29e, 29h and robustness.mjs "sample:" and "sliders:" after a Howler upgrade. The Nastavení page scrolls on a very short screen (two sliders and a checkbox).

## D30 — Anna's minigame art: the tail flick and the thorn (2026-10-30) — Accepted
Supersedes: D23's `animation.mouth` (now `launchPoint`); Anna is no longer a vector placeholder (her `sprite` paths stay
`null`: she uses `animation`, as Róza does).
Decision: Anna's dragon, tail flick and thorn come from Sára's sheets `anna_move.png`, `anna_attack.png` and
`borinoha_projektil.png` in `art/minigames/dragon-attack/`, packed by D23's pipeline (factor 2) into `anna_fly.png`,
`anna_attack.png` and `anna_thorn.png`, every frame on a hand-checked anchor (`*.anchors.json`: the eye; for the thorn
its tip). The attack sheet is painted on pure black with no alpha: `removeCheckerboard.mjs --black` keys it (near-black
regions touching the edge, and enclosed ones of 600+ px such as the gaps the curled tail encloses, become transparent;
smaller dark spots like pupils stay; a 2 px band next to them is un-blended against black); `--black` refuses
`--enclosed` and `--glow`. Anna is 200 game px wide like Róza and flaps `[1, 2, 3, 4, 3, 2, 1, 0]` at 12 fps (Sára's
cycle 0-1-2-3-4-3-2-1 started on frame 1, whose tail matches the flick's last frame, so she resumes there). A tap plays
the flick, all 6 frames at 30 fps (0.2 s), drawn at the fly strip's scale; the thorn leaves the tail tip on frame 3 (tail
straight back, 0.1 s after the tap). The thorn is drawn at 0.45, anchored on its tip (where the hit circle, radius 16,
is), turned along its velocity every tick (`artAngleDeg: 3`: the art points slightly down), its frames `[0 … 5 … 1]` at
8 fps, looped: a shot animation's new `loop` repeats the flight frames instead of holding the last one. `animation.mouth`
is renamed `launchPoint` (Róza's mouth, Anna's tail tip), used only as two finite numbers like the anchors (else the
`launchFrom` fallback). Her firing rules stay (D23). `--black` takes one file, and refuses a sheet that already has
any transparency, even with `--force` (its alpha would be lost). Both scripts also refuse a UNC path
(`\\localhost\C$\…`): it names a file in `art/` without starting with its path (a gap in D23's guard, found by the
review panel). Each strip falls back on its own
(D7, D23): without the fly strip the vector dragon (now 200 wide) shoots at the tap from 80 px behind its centre; without
only the attack strip she flaps on and the thorn leaves at the tap from `launchPoint`; without the thorn strip, the vector
arrow.
Why: asked for by Sára ("Can you change animation for anna from stick to these sprites", the tail movement "quite
quick"), with her answers on the preview: cycle B; 30 fps ("start with that and we can adjust later"); the attack art at
its own size (at 1.37, matched to the dragon's head, "dragon and anna become bigger for the attack"); the thorn's frames
back and forth at 8 fps; the dragon as big as Róza's; the thorn turned with its curve ("its point always going along with
the curve"); key the black rather than re-export; keep 200 wide and fly lower; the thorn at 0.45 after seeing 0.35 in the
game. The tip anchor keeps the hit circle and the turn on the visible point (an anchor on the bright glow led it by ~100
game px). The attack sheet is drawn ~10–25 % smaller than the move sheet: at 1.0 the eye stays put and the figure changes
size for the 0.2 s of the flick (Sára judged it by eye). `launchPoint` because the shot leaves Anna's tail, not her mouth.
Consequences: her raised wings reach ~140 game px above her eye, so the D23 clamp puts her below Emma on every screen
under ~1070 px tall (her eye at 225 game px at 1280×720 instead of 151); her thorns start lower and land sooner, so the ⅓
wait is a little shorter (slightly easier). Each thorn leaves 0.1 s after its tap: three overlap ~0.3 s instead of
~0.5 s. A tap in the first 0.1 s of a flick does nothing (D23: no new attack before the shot has left); after it, the ⅓
wait outlasts the flick. The shot sound plays as the thorn leaves (to adjust by ear). `--black` would also key away dark
art touching the frame edge (used on this sheet only; the regeneration test checks the strip). The thorn's reach in
`isOffScreen` is its whole length from the tip: a falling thorn is removed ~80 px later than a centred one (harmless).
A faint haze (alpha < 10) around the move frames shows only on black, not on the daylight dam; and, as for every packed
strip, a frame's cell takes the neighbouring frame's faint pixels (alpha 1–40) inside its box (thorn frame 0 gets
~1500 px of frame 1's halo, mean alpha 12: invisible on daylight). Emma stays a
vector placeholder: her sheets (and a lightning strip, `beska_projektil.png`) are in `art/`, not planned yet.

## D31 — Clean beaver frames, the log at the landing, the effects' safety limiter (2026-10-31) — Accepted
Supersedes: D29's "the cry and the log start with 150 and 250 ms of silence … all three start on the hit tick" for the
log, its "(the log drop just under it)" and its accepted mashing clip ("+0.5 dBFS … cosmetic"); D23's "a round is lost
only when the flights are over, no shot is in the air, and beavers remain"; D24's normalisation list gains
`sheet.padding` and `MAX_HIT_SECONDS`.
Decision: the beaver frames are cut by their own pieces, not by the sheet's grid (as D23 does for Róza's sheets), and
keep the grid layout: `scripts/cleanBeavers.mjs` (fixed paths, no arguments) reads the 7 sheets now kept in
`art/minigames/dragon-attack/beaver{n}.png` (moved there with `git mv`), finds each sheet's 13 pieces (8-connected
blobs, in reading order) and gives them to frames by an explicit list (`0,1,2,3,4,5,6,7,7,8,9,10,11`: frame 7 is the
beaver and its falling log; no rule fits every sheet), puts each into a cell of the same 6×2 grid padded by 100 source
px a side at its offset from its old cell's centre, moves row 2 (hit, log, run) down onto the walkers' ground (the
sheet's `lift`: the walk frames' median bottom minus row 2's, 153–168 px) and frame 8's log under frame 7's falling log,
and halves the result into `public/assets/minigames/dragon-attack/beaver{n}_frames.png` (1326×544). All 7 sheets are
checked before anything is written; a sheet with another piece count or a piece that doesn't fit stops it. The game
reads `sheet.padding` (50 sheet px a side; `spriteWidth` is a cell's width without it), a number from 0 up to a
quarter of the frame width, else the default, itself only where it fits that quarter, else 0. The hit plays frames 7
then 6 (`hit: [7, 6]`: the log falls, then the startled beaver stands beside it); whether a log drops is still decided at
the hit (`dropLogOnHit`, a log frame), but the lying log and its sound come when the hit animation leaves its first
frame, or when the beaver starts to run if that comes first; a beaver runs at the latest `MAX_HIT_SECONDS` (5) after
its hit, whatever `hitFps` says (a D24 cap, like `MAX_FLIGHT_SECONDS`). The log's sound file is only its thud
(`log_land.mp3`: the creak trimmed, no delay, its gain kept at the 5.8 dB Sára heard). A lost round also waits for any
beaver still in its hit, and `maybeFinish` runs again when a beaver leaves it, so the log always lands and thuds before
the result. The minigame's hint pill hides once the round's first attack passes `canFire`. All the effects go through a
safety limiter in `sfx.js`: a WaveShaper (a soft clipper: y = x up to the knee 0.6, −4.4 dBFS, then a tanh towards the
ceiling 0.69, −3.2 dBFS; 4097 points, no oversampling) between Howler's master gain and the destination, set up after
`new Howl()` whenever Howler's context is not the one it was built on; on any error the master gain goes straight to the
destination again. `cleanBeavers.mjs` writes its outputs beside their targets and renames them over them, so a link at a
target is replaced, not written through (as the other two scripts refuse to write into `art/` through a link, D23, D30).
Why: asked for by Sára ("there is a little bit of the previous and next beaver… cut each sprite separately", "when the
log is lying on the ground … there is a little of the sprite it falling down left to it", "can you clean up these
sprtites?"), with her answers on the preview: halve the sheets, the hit B (the log falls first), the same ground, the
pill hidden after the first attack, the thud at the landing played by the game, a safety limiter rather than lower
levels ("nothing clips", then "leave room for the music", then "A: clean on computers"). The art crosses the grid's
borders (the carried logs, frame 7's log reaching into cell 8), so no grid cut is clean. A padded grid rather than
`packFrames.mjs`'s strip: the strip's anchor would differ per sheet (its cells fit each sheet's extents) while all 7
share one `sheet` config, and the beavers' anchor stays 0.5. New file names, because Pages caches files for ~10 minutes:
new code with an old `beaver{n}.png` would draw the beavers 1.66× too big, an old `log_drop.mp3` would thud at the wrong
moment. The limiter's ceiling sits 3.2 dB under full scale because the HTML5 music is mixed after it, by the browser:
the ceiling plus the battle track's true peak (−8.4 dBTP) at the default music volume stays ≤ −0.2 dBFS. No
oversampling: `4x` overshot the ceiling after its filter, added 4 ms and cost ~8× the CPU, for aliasing on ~10 ms of
every 4 s of mashing. Not a DynamicsCompressorNode: no parameters to tune (its makeup gain, its 6 ms look-ahead).
Consequences: the beavers stay their size (a cell 242 source px wide vs 241.33, 0.3 % smaller); a walking beaver's log
end now reaches ~60 game px ahead of its centre (frame 7's falling log ~80) while the "on the screen" test still uses
half the cell (45.6 px), so a beaver walking in shows its log ~0.15 s before it can be hit. `beaver6` frame 5 (and 5 px of
`beaver7`) are cut by the original sheet's own edge (needs new art). Downloads: 11.9 MB of beaver sheets → ~1.7 MB, ~88
→ ~40 MB of memory. The log lands up to ~7.5 game px lower, or on `beaver6` ~7 px higher, than it fell (subtle at 0.1 s
a frame). Its thud is heard ~124–141 ms after the hit at 60 fps (the landing plus its 24 ms onset), just before the cry
(151 ms); at 30 fps up to ~157 ms. A lost round can now end up to 0.2 s later (a beaver in its hit, often from Anna's
last thorns), and with a tiny `hitFps` typo at most `MAX_HIT_SECONDS` later. Beavers still running off-screen when a
round is lost freeze under the result dialog, as before (the last hit one on its first run frame, beside its log): waiting
for them too would hold the dialog ~1 s more.
The limiter squeezes the loudest milliseconds of a hit at the default level (above the knee for up to 4.2 ms, its peak
cut by up to 3.8 dB at 30–60 fps, 4.2 dB when a slow device lands the log later; phone mashing 41 ms per 2.7 s, up to
5.9 dB, 6.4 dB on a slow device); a single sound at the default level stays below the
knee, unchanged. With the music at file level (iPhone, iPad) or the music slider at 85 or more, effects + music can pass
full scale for a few ms (up to +0.6 dBFS; issue P3, accepted by Sára). For up to ~10 minutes after the deploy, a browser
with the old code cached asks for `beaver{n}.png`, now in `art/`: the vector beavers (D7) for that visit. `sfx.js` now
also relies on Howler's master gain going straight to the destination and on its one-time context reset inside the
page's first Howl: rerun minigame-roza.mjs 31f after a Howler upgrade.

## D32 — Emma's minigame art: five flight poses, the attack and the lightning (2026-10-31) — Accepted
Supersedes: D29's "Emma's lightning leaves her head" (`launchFrom: 'head'` is now only the fallback without her fly
strip; her shot sound plays on her attack's launch frame); D30's "Emma stays a vector placeholder" and its consequence
that Anna flies below Emma on screens under ~1070 px tall (Emma now flies below Anna); D31's squeeze budgets (4.5 and
6.5 dB, `sfx.test.mjs`'s budgets for D31's stacks) no longer cover Emma's sounds.
Decision: Emma's dragon, attack and lightning come from art in `art/minigames/dragon-attack/` through D23's pipeline.
Her five flight poses are separate pictures: `emma_flight_01.png` (up), `_03` (level) and `_04` (down) by Sára, `_02`
(half raised, "D") and `_03b` (half lowered, "K") made with Runway on her picks (nano-banana-pro from her 01 and 03, and
from her 03; cut out with birefnet-v2; the prompts in `emma_flight_runway.txt` beside them) and committed untouched, so
they keep their C2PA provenance (`caBX`, AI-generated content); `emma_flight.png` stays unused (Sára: some of its frames
show Emma over the wing). `scripts/packFrames.mjs` gains a frames list (`emma_fly.frames.json`: per picture its `src` in
the list's folder, its `anchor` = the dragon's eye and its `scale`): each picture is one frame (every pixel inside the
box of its pixels above alpha 40, widened by 2 px), resampled by its scale with an area filter in premultiplied space so
that its anchor lands on the top-left corner of the cell's anchor pixel (where sheet mode puts the anchor's pixel); a
malformed list is refused, writing nothing, and D23's `art/` guards hold for it; both forms now also refuse a link at
the output (a dangling one has no real path to compare) and, on Windows, a stream name (`art:x.png`, which lands on the
art folder itself). A pose's scale = its registration scale against 03 (head, neck and saddle by NCC: 01 0.78, D 0.348,
03 1, K 0.336, 04 0.96; checked on Emma's face) × 0.67, so Emma is as big in the flight as in the attack sheet packed at
factor 2. The attack anchors aren't hand-measured: Emma's face is found in each attack frame by NCC (03's face masked to
alpha > 200) and each anchor = the face + 03's face-to-eye offset (from its unrounded eye, 269.3, 136.8) × 1.34, printed
by `scripts/measureEmmaAnchors.mjs` (after a re-export of the attack sheet: re-run, its face guesses updated if the
frames moved), so Emma stays still while the dragon's head dips around her. Emma is 200 game px wide like Róza and Anna
and flaps `[2, 3, 4, 3, 2, 1, 0, 1]` (03 → K → 04 → K → 03 → D → 01 → D; in file names 03 → 03b → 04 → 03b → 03 → 02 →
01 → 02) at 12 fps on the dragon's eye, starting on 03, whose level wings match the attack. A tap plays attack frames
`[0, 1, 2, 3, 4, 5, 4, 3, 2, 1, 0]` at 24 fps (0.46 s: the mouth closes again, so the head doesn't jump back up to the
flap) drawn at the fly strip's scale, and the bolt leaves her open mouth (`launchPoint` [−3, 42] from frame 4's anchor)
on the first frame 4, 0.167 s after the tap, with her shot sound. The bolt (`emma_bolt.png`, from `beska_projektil.png`)
is anchored on its tip (the spark and the burst on their white-hot core), drawn at 0.7 (~100 game px), its frames `[1,
2, 3, 4, 3, 2]` looped at 12 fps, on Emma's zigzag (falling 380 px/s, ±70 px at 9 rad/s) with two engine changes: the
weave's first swing goes forward, the way the dragon flies (`moveShot`: the weave × the shot's direction), and a zigzag
shot strip is turned along its real path, the weave's sideways speed included (`orientStrip`), so the bolt leans up to
~59° from vertical in the middle of each swing; a hit shows the burst (frame 5) for 300 ms as painted. Her firing rules
stay (D23). Each strip falls back on its own (D7, D23).
Why: asked for by Sára ("Can you use runway to generate more flight sprites for emma? … This should be all sprites
needed for emma and her dragon for the minigame. Replace the stick with these sprites."), with her picks (D and K, after
rejecting A and B for a long braid with a red ribbon, and E, F and H for two or three wings) and her answers on the
preview: the same width as the others, the flap as proposed on the eye, Emma still while the head drops, the mouth
closing again, the launch on frame 4, Emma keeping her size, the art in `art/`, the limiter working harder accepted. The
lightning's look picked from a comparison page of four variants (variant "D", not the pose: "D is the best": turned with
its weave, the weave forward first; the page's other switches at their defaults: no spark first, the burst as painted,
size 0.70). No config key for either engine change: Emma is the only zigzag shooter. A frames list rather than a sheet:
no integer factor brings five pictures at five scales to one size, and a separate compose script would have been a third
copy of the `art/` guards. Emma's size kept ("matched") rather than the art's own: for Anna Sára turned down the option
that made her bigger for the attack (D30). Anchors on Emma's face: in the attack the dragon's eye moves with the dipping
head (5–39 game px), so eye anchors would make Emma drop. Frame 4: the first wide-open frame (frame 5's snout is cut by
the sheet's edge).
Consequences: Emma is drawn at 1.03 game px per strip px (Anna 1.0), a little softer than the preview. Her raised wings
(her fly cell reaches 154 strip px above the eye, 01's art ~148) put her below Anna on every screen (her eye at ~244
game px at 1280×720, Anna's 225). Bolts per missed flight, tapping as soon as allowed (measured; today's vector Emma in
brackets): 3 at 1280×720, 1366×768, 1920×1080, 1024×600 and on phones (844×390, 640×360, 640×300, 568×270) (3), only
just (the third at x 9–16) at 1470×830, 1536×864, 1600×900 (3); 2 at 1512×860, 1680×950, 1728×1000 (3); 2 at 1440×900
and in half-screen windows (960×947, 840×830, 864×770, 756×750, 683×650) (2); 1 at 800×1000 (2) and 768×1000 (1). Sára's
queued gameplay change retunes them. In 01 and 04 Emma sits ~12 and ~8 game px off where 03 has her, so she pops for one
flap frame each, and an attack started on 01 or 04 moves her by that on its first frame. At the launch the leaning bolt
lies from the mouth back across the dragon's neck, its glow reaching Emma's hands; at ~60 ms across the dragon's face;
from ~100 ms it swings ahead, under the chin (the preview's panel D drew its first frame straight down, one 16 ms
frame). On the screens where the third bolt of a flight leaves near the left edge (x 9–46), its first swing carries all
of it off the screen for ~0.1–0.2 s (its tip, the hit point, for ~0.2–0.3 s) before it swings back (as the first bolt
did at the right edge before). Any zigzag dragon flying left in a story config now swings forward first too (none does;
one flying right is unchanged). The weave's direction and the bolt's turn change neither the bolts per flight nor her
sound stacks (the launch rules, the fall and the airtime are the same). Without only the attack strip the bolt leaves
~43 game px under the fly eye (`launchPoint` is frame 4's). The attack art has no far wing (it vanishes for each 0.46 s
attack) and frame 5's snout is cut flat for its 42 ms (Sára's art; a re-export would fix both, issue P3); each attack
cell holds faint ghosts of its neighbours' halo (alpha ≤ 18, the class D30 accepted for the thorn). The limiter works
harder for Emma's sounds than D31's figures (accepted by Sára): measured in planning over Howler's start grid at 48 and
44.1 kHz, the worst cases found: a single hit cut by up to 5.1 dB (≤ 2.7 ms above the knee), fast tapping by 7.6 dB or
more, up to 43 ms per 6 shots; `sfx.test.mjs` prints her stacks without a budget (4.0 dB, 2.3 ms for a single hit;
5.0–5.5 dB, 26–33 ms per 6 shots at her 0.267 and 0.657 s flights); nothing passes the ceiling; the gameplay change
re-measures them. ~0.7 MB more to download. `emma_attack.png` in `public/` has the same name as its source in `art/` (as
Anna's). The head check on her poses accepts NCC ≥ 0.5 (01 reaches 0.54: its raised near wing crosses the window).

## D33 — The beaver line, win by share, difficulty in Nastavení, and a play-test page (2026-11-01) — Accepted
Supersedes: D23's and D31's lose rule (the flights out with beavers left: now judged by the share hit); D23's "near
the left edge Anna's backward arrows leave in under a second" (she flies left now); D30's Anna thorn numbers (430 /
−120°); D23's and D30's ⅓ for Anna's `refireAfter` (now 0.33); D32's Emma bolt speed (380 → 460), its bolts-per-flight
list and its lean (~59° → ~54°); D27's story guard after the menu (now also after a minigame) and its "a held key
presses a focused button only once" (now: its repeats never reach the story either); D19's and D29's settings list (+
`difficulty`); D16's listener (now `fullscreenOnTap()` in inputController.js, also on the play-test page); D15's
"beavers that start … past the edge on a narrow screen queue up off-screen" (now every beaver but the first does).
Decision: the dragonAttack minigame has 30 beavers (`beavers.count`) in one line 225 px apart (`spacingPx`, 1.5 × 150),
centre to centre: the first at `startXRatio` (0.08) of the width, the others queued behind it off the screen
(`x = width × startXRatio − i × spacingPx`; walking left mirrored: `width × (1 − startXRatio) + i × spacingPx`), so a new
beaver walks in every 225 px. D15's re-entry is unchanged: a beaver that walks off the far edge rejoins the back of the
line, at least 225 px behind the last walker, so nothing escapes and the beavers waiting off the screen stay 225 apart:
a hit beaver's gap is seen only while it crosses the screen (the beavers behind it don't hurry) and is gone the next
time round. All walkers share one speed, `speed × (1 + (speedUp − 1) × hits / beavers)` (`speedUp` 2: 1.8× once 24 of 30
are hit), and the walk animation runs at `walkFps × speed ÷ 90` (`WALK_DRAWN_AT`, a constant: the speed the sheets'
8 fps walk was drawn for, not the tunable `speed`; `speed: 0` still parks them). The 7 sheets are shared in turn (`sheetCount` 7: beaver i on sheet `i % 7 + 1`; Pixi loads each URL once).
A lying log stays `logSeconds` (3), fades out over `logFadeSeconds` (1) and is removed (`this.logs`; at the round's end
the logs stay as they are). All three dragons enter from the right (`entryFrom: 'right'`), in turns, 5 flights each
(15), as before. Emma's bolt falls at 460 px/s; Anna's thorn leaves at 300 px/s, −150° (gravity 760), so it lands ~200
px behind her launch point at 1280×720 instead of ~480 (Sára's "the thorn falling arch is too big"); her wait is 0.33 of
the last thorn's on-screen time. A round still ends when the flights are over, no shot is in the air and no beaver is
in its hit: victory if at least `needed = ⌈beavers × target / 100⌉` were hit (`beavers`: how many there
are, `count` capped at 50), else defeat; the target
is `winPercent[difficulty]` (`{ easy: 40, normal: 80, hard: 100 }`, whose keys are the levels; a story value that isn't a
number from 0 to 100, or a `winPercent` that isn't an object, gives that level's default). Hitting every beaver still wins at once with the
bonus per unused flight; reaching the goal early doesn't end the round (more hits, more score); a win by share gets the
same `winBonus`. The difficulty is a Nastavení setting, "Obtížnost minihry" (a `<select>`: Lehká / Normální / Těžká,
default Normální), saved with the others (`AutoSave` keeps only 'easy', 'normal' or 'hard') and passed to the game by
`MinigameManager.run(spec, { difficulty })`. The HUD status is "Zásahy: {hit} · {percent} % (cíl {target} %) · Nálet:
{flight}/{flights}" (the share rounded down, so it never shows the goal before it is reached; `{needed}` too; the old
placeholders still work); the result dialog adds "Zásahy: {hit} z {total} · {percent} % (cíl {target} %)"
(`labels.resultHits`, text), and the top bar hides while it shows. The result's Pokračovat uses Ano's tap guard (D27),
moved into `guardTaps(button, { shown, onPress, keys })` in uiController.js: with `keys` a key press is judged like a
tap (its repeats move the 500 ms on without changing their own press's verdict; a click without a press of its own is
judged by its own time), and the HUD disposes its listeners. Space and Enter now press the result's focused button
(`.mg-result` joins inputController's list). Story input waits `TAP_GUARD_MS` after a minigame ends, as after the menu
closes (`menuClosedAt` → `storyPausedAt`), and a key whose press landed on a button has its repeats dropped until its
keyup, wherever the focus is by then (each fresh press sets that key again). The play-test page: `playtest.html` at the
root (a third Vite entry; the game's relative asset paths need the page's folder, D4), handed out as `…/playtest/` (a
redirect page, `playtest/index.html`, another entry, that keeps the query). It draws the dam as the game does behind the
battle (`VisualRenderer`), plays the battle music for the whole visit at the game's saved volumes (read, never written),
and has 15 sliders in five groups (the beavers' count, spacing, speed, speed-up; the goal in % and the flights per
dragon; each dragon's flight and shot speed; Anna's thorn angle, gravity and wait, `annaWait`, % of the last thorn's
on-screen time). "Hrát" hides the panel and runs one round with those values (the game's title; `DEFAULTS` copied, never
written); back after it the panel is inert until 500 ms pass without a tap or key, then Hrát has the focus (without
scrolling). The URL is the only state: all 15 values written into it when a slider is let go (`change`, in a try/catch)
and into a read-only link field built from the sliders, which also carries `field=WxH` (the game's world in game px,
computed in the frame after a resize, information for Sára, never read back, never in the address bar); "Kopírovat
odkaz" copies it (else the field is selected for copying by hand); a link fills the sliders (missing, blank or not a
number: the default; 0 is a value; the slider clamps and rounds to its step itself). Nothing is sent anywhere.
`DEFAULTS` is exported for the page.
Why: asked for by Sára ("the thorn falling arch is too big …, there would be like thirty beavers. going from left in
steady intervals and you would win if you clear 80% of them on standard settings, 100% on hard settings, 40% on easy
settings. Settings for minigame toughness should be in menu. and where there is less beavers remaining, they would
speed up. all the dragons would fly in from the right … the distance between beavers 1.5 bigger … a test game, where I
can tweak some variables … in some subdirectory … With the slider"), with her answers on the plan: beavers come round
rather than escape (more beavers than shots: escapes would make a round unwinnable); "steady rate" = no gap where a hit
beaver was, and no hurrying to close one; a fixed number of flights; the speed-up counts hits only; dragon and shot
speeds as sliders, Emma's lightning a little faster; the HUD shows the hits and the share; logs fade; steady distance;
screens may play a little differently ("this is a minigame"); the flights slider kept for now; the texts fine; "keep it
for playtesting, but make it adjustable" (Emma's 460 and Anna's arc as starting values: their sliders, and Anna's wait
as one more, so her thorns per flight have a knob of their own). The choices made for her: the speed-up linear in the
share hit up to `speedUp` 2; the line behind the first rather than ahead (beavers walk in; ahead, 30 beavers would start
spread over 6500 px to the right and come round at once); D15's re-entry for the gap rather than a catch-up walk; the
dragon's name out of the HUD status (with it the top bar took two lines at 568×270: 52 → 63 px, which moves the dragons
down by D15's clamp); logs 3 s + 1 s; the top bar hidden under the result (the taller dialog covered 25 px of it and its
Přeskočit at 568×270). The result's guard: the round ends the moment the flights run out or the last beaver is hit,
often while a child is still tapping (or pressing keys: the HUD invites them, and the dialog focuses Pokračovat), and the
button sits mid-screen. Keyboard players were stuck on the result (Enter was cancelled during a minigame, Esc is too),
and a double tap or a held Enter on Pokračovat ran on into the story (`beaver_battle_win` … `_07` in ~1.2 s with Enter
working). Anna's 0.33 rather than ⅓: a slider can't hold 1/3, and the play-test's default must be the game's (with 1/3
the page's 0.33 gave a fast tapper one more thorn at the end of a flight at 1280×720). One goal slider instead of three
difficulties (a tester says "70 % felt right"; the page plays as "normal"). `playtest.html` at the root rather than in
the folder: one folder deeper every relative asset path breaks; a file in `public/` would be answered with the game's
index.html by Vite's dev server. The world kept as D15 has it (it only scales down): making a flight take the same time
on every screen (planned, then dropped) only swapped the width bias for a height bias.
Consequences: the game plays somewhat differently by screen, as it did (measured with the new defaults, a tap on every
10 ms tick, Róza / Emma / Anna per flight with the shot ending at the lane's centre / where a hit would end it; per round
= 5 × their sum): 1024×768 (iPad-like) 5/3/6 / 5/4/6, 70 / 75 shots, 69 s; 640×360 7/5/7 / 8/6/7, 95 / 105, 71 s;
1280×720 6/4/7–8 / 7/5/7, 85–90 / 95, 81 s; 844×390 8/6/8 / 9/7/8, 110 / 120, 82 s; 1366×768 6/4/8 / 7/5/8, 90 / 100,
85 s (1440×900 89 s); 1920×1080 6/4/10 / 7/4/10, 100 / 105, 110 s; Anna's 0.33 adds up to one thorn per flight (1280×720
at 10 ms ticks 8 against 7–8; 1920×1080 at 60 fps 10 against 9). Longer rounds also let more of the 30 walk on (at 1920
~55 % more than on the 640×360 phone). On an iPad-like screen Těžká needs near-perfect play: the 30th beaver would first
be in reach after ~71 s against a 69 s round, only the speed-up of early hits brings it sooner. The play-test link
records each tester's field size, so their numbers can be compared like with like; the real fix is one world size on
every screen (issue P3 "Flights take longer on taller windows"). Anna's thorns land in about `[200, width]` flying left
(the left ~200 px out of her reach; Róza and Emma cover it); Róza's reach is about `[−100, width − 100]`. At the start
only the first beaver is on the screen; the second is in reach after 0.86 s, then one every 2.5 s. With every dragon
flying left Anna's first thorn of a flight comes a little after Róza's first fireball would (her tail enters last). A won
round that ends when the flights run out leaves the walking beavers frozen under the dialog (as D31 noted for a lost
one). Thorns per Anna flight: 9 → 7–8 at 1280×720 (her new thorn stays on the screen longer and she waits 0.33 of
that); `annaWait` measured at 1280×720: 0 % 9–11, 25 % 9, 33 % 8, 50 % 6, 100 % 3 (below ~25 % her 3-thorn cap decides,
and her thorns come in bursts ~0.11 s apart: play-test only, the limiter squeezes harder, nothing passes its ceiling).
Emma's bolt hits 0.556 s after it leaves at 1280×720 (D32: 0.657) and 0.221 s on the shortest screen (0.267); her
stacks (printed by `sfx.test.mjs`): a single hit cut by 3.8–4.7 dB (2.3–2.6 ms above the knee), 6 fast shots 4.9–5.3 dB,
28–35 ms; over the battle music (`emma-fullscale.mjs`) never past full scale at the default music volume or at 85, at
file level a single hit 0.3–0.8 % of the time, fast tapping 9.0–11.3 % (Bezzubka's 0.8 % and 12.3 %). Anna's stacks
(her thorns 0.6–0.644 s apart, each hitting 1.19–1.34 s after it left) stay inside D31's budget (3.8 dB, 3.7 ms at
844×390). For up to ~10 minutes after the deploy an old cached tab's `AutoSave.load()` drops the unknown `difficulty`,
and its next save (its first scene change: `persist()` writes the whole save) writes the save without it, so that
player's choice falls back to Normální (the class D29 noted for `effectsVolume`). `startXRatio` is now mirrored for
`direction: -1` (a change for a story that sets both). D24's normalisation list gains `speedUp` (`positive`),
`sheetCount` (a whole number ≥ 1; a fraction too falls back, unlike `maxShots`, which is floored), `logSeconds` and `logFadeSeconds` (`nonNegative`), each else its DEFAULTS value, and
the `winPercent` values; none is written into the config. `worldScale()` (dragonAttack.js) is the one formula for the
game's scale, used by the play-test page's field size too. Enter on a focused Přeskočit during the round stays cancelled (the
skip menu is reachable by pointer only: issues.md; during a round Enter and Space are attacks). The play-test page is
reachable by anyone with its link, as the game is; it is to be removed when Sára says. It hard-codes the story's id (for
the saved volumes), `battle.mp3` and `dam_02.png`: a renamed file or story id needs it updated (issues.md). Its copied link
carries the tester's window size in game px (its intro says so). The older mutation runners
(`sfx-`, `anna-`, `beaver-`, `emma-`, `menu-mutate.mjs`) run snapshots of the shared checks taken before this change
(`minigame-roza.d32.mjs`, `menu.d32.mjs`, `as-test/autosave.test.d32.mjs`, `as-test/sfx.test.d32.mjs`).

## D34 — The story is set among the Slavs of the 10th century (2026-11-15) — Accepted
Decision: the story takes place among the Slavs in the 10th century and stays historically accurate in everything
except the magic and the dragons: no castles, towns, knights, fishponds or other later things; settlements are a
village (ves, osada) and a gord (hradiště: wood and earth ramparts); the people around the riders are a prince (kníže),
his family and nobles (velmoži), farmers and craftsmen. The sorceress's scarlet dress (`beaver_after_battle_win_07`) marks
her as someone from a princely or noble family (imported dyed cloth was a luxury of the elite).
Why: decided by Sára ("nemůže tu být zámek, má to odpovídat desátému století, Slované, chceme to držet až na tu
magii a draky v rámci historické přesnosti").
Consequences: new scenes, places and background art follow the period (wooden houses, ramparts, sacred groves, fords,
trade paths). Words already in the story that don't fit are listed in issues.md ("Anachronisms in story.json").

## D35 — Names are an exception to the period accuracy (2026-11-15) — Accepted
Decision: characters' names don't have to be period names (D34): Róza, Emma, Anna, Soňa, Rubínka stay as they are.
Mythological and fantastic creatures fall under the magic exception too.
Why: decided by Sára ("Jména jsou výjimka z dobové přesnosti"), asked after Claude noted that Soňa (the Russian form of
Sofia) reached Czech much later; Róza isn't a period name either.

## D36 — Act 2a's places get their own music, in early-medieval Slavic folk style (2026-11-16) — Accepted
Decision: seven new tracks, one per kind of place or mood in Act 2a: `vedma_hut` (the vědma's hut), `night_forest`
(the night search, the will-o'-the-wisps), `vily_magic` (the víly), `playful` (the fox, the hejkal from his first line,
the fox family), `tesak_lair` (Tesák's lair and the egg), `sacred_grove` (Triglav's grove) and `danger` (from Bezzubka's
roar to `act2a_end`). The paths, the badger, the fawn, the wisent and Soňa keep `forest_ground`. Made with Runway's
music tool (full-length model, ~1:40–3:00 each, 8 credits a track), all instrumental early-medieval Slavic folk: a
wooden folk flute, a hammered dulcimer (cimbalom), a plucked or bowed gusle, a drone, a frame drum at most; no piano,
orchestra, synthesizers or modern drums; a short, simple modal melody repeated with small variations; an ending that
flows back into the start. `vily_magic` has wordless women's voices and `sacred_grove` a wordless choir (low men's
voices with women's above); every other track is without voices. Each prompt also names the place's mood (warm and
melancholic, hushed night, playful dance, lament with hope, solemn ritual, driving tension). Originals in `art/music/`,
deployed 9 dB quieter by `scripts/build-music.sh` (D29).
Why: asked for by Sára ("we need new music for new scenes, so the music score is more diverse"): 155 Act 2a scenes
played `forest_ground` almost throughout. Her direction for the style: background music without lyrics, evoking old
Slavic music, the early Middle Ages, folklore, flutes and cimbalom, not piano, simpler melodies; she heard the first
track (`vedma_hut`) before the rest were made ("je to fajn"), and asked for the wordless voices for the víly and the
grove. A first, instrumental `sacred_grove` was replaced by the choir version (it stays in Runway, not in the repo).
Consequences: ~24 MB more music to stream (each track only on its scenes, D21). Every change of place in Act 2a now
changes the track (a 350 ms fade, D21); a Back across such a change starts the other track over (only `battle` resumes,
D26). The tracks are AI-generated like the older ones; the deployed files lose their provenance metadata, as before.
The older tracks (`village_day`, `dragon_flight`, `forest_ground`, `battle`) are not in the folk style.

## D37 — Scenes with lines, choice memory, sprite sizes, the story in parts, centred choices, locations (2026-11-16) — Accepted
Supersedes: D3 (one story file; a typo now warns at load), D14's choice split on phones (not for centred choices),
D18's "the next tap opens the end card" for an ending with no line (it opens 500 ms after the move), D6's save (a new key and format), D8's "3 scenes ahead" (3
taps ahead), D18's "an ending counts as soon as its scene is shown" and its gallery source (`readSceneIds`), D19's
autoread per scene (per line), D27's `hasProgress` (from the real follow-up).
Decision:
- A scene is one background with its lines until a choice, another scene or a minigame (`lines`: speaker, text, an
  optional stage and `if`); minigames stay scenes of their own; a new scene also starts where two branches meet and
  where the music changes. Back goes one line back. The old one-line form still reads (one line).
- Choice memory: names → whole numbers (`set` = flags, `add` = counters), changed by choices and by scenes when entered
  by a move (once per entry; the start scene's at every fresh start), read by `if` on lines, choices and `next` list
  entries (`name`, `!name`, `name>=N`, `name<N`, or a list that must all hold). One order after a scene's last visible
  line: visible choices, `next`, `end`. A move is resolved purely first (`resolveEntry`: pass-throughs followed, at
  most 20); a dead end changes nothing; only the landing is saved, drawn and played. Back restores the memory. After a minigame, a landing on the scene the newest history entries are from (with the same
  memory: a lost retry) takes that earlier visit back, so Back never shows the lose scene's lines twice (a retry whose
  choice or lose scene changes the memory keeps both visits: Back restores each memory).
- The save: `vn:<id>:autosave2` (position: scene, line, memory; history entries with their memory, at most 500;
  `endings`); the old key is migrated once (the memory replayed from scenes' own changes, old ids through
  `movedScenes`) and never written, so old cached code and new code never touch each other's data. Act 1's two
  memories sit on scenes for the replay: `bobri_pratele` on `dam_with_beavers_persuade`, `bobri_porazeni` on
  `beaver_battle_win` (names by Sára). A save that can't be placed falls back to its newest placeable history entry.
- An ending counts when its last line is shown with the end card next (the gallery lists `endings`, in story order).
  An end card with no line before it opens 500 ms after the move. `hasProgress` is false on the fresh position with
  no history, and on a recorded ending's last line.
- Sprites: a character's `scale` (a height in rider heights, R = min(0.72·H, 0.42·W); characters without it keep the
  old fit exactly) and `raise` (feet above the riders' in rider heights); positions by name or as a share of the width;
  `flip`; entry order is draw order; a scaled or raised sprite's top stays below the top controls (never under 10 % of
  the height); `#top-controls` is `visibility: hidden` under the menu and during a minigame (so it can be measured).
  Act 2a's creatures got Sára's sizes as a start; `liskova_rodina` is a character of its own (one scale per character).
- The story is split into a main file (`story-v2.json`: everything shared, `movedScenes`, `parts`) and parts beside it
  (Act 1, each day of Act 2a), merged at load, fetched with `cache: 'no-cache'` so a deploy can't pair a new main file
  with an old part; a part that fails stops the load. `story.json` is frozen for cached old tabs.
- Choices are centred in a big panel when more than two are visible or the scene says `choiceLayout: "center"` (Sára:
  "it should take center stage"); its bottom follows the dialogue panel (`--dialogue-top`, measured); on phones it
  takes the whole height over the dialogue strip and repeats the line as its heading.
- Every choice panel waits 500 ms without any input (one long-lived `choiceGuard`, D27's rule, judged by the press as
  `guardTaps` does); "Zpět na začátek" is behind `guardTaps` with keys (armed per open). The tap that shows a line can
  no longer press what appears under the finger (the story still advances on `pointerup`: a click-based advance was
  dropped, Android's long press gives no click). A finger already down when the choices, the end card or the minigame's result appear (autoread, a
  no-line ending's card, a round ending) never counts, however long it is held (one set of the pointers down, shared by
  `choiceGuard` and `guardTaps`).
- Locations (Sára: one file per location, the engine picks among the available events, some first, no event twice): a
  part may hold a `location` with its `events` (`scene`, `if`, `first`, `name`); a choice with `"location"` plays the
  first available `first` event, else one of the available others at random, and marks it played by its name (its
  `name`, else its scene id; permanent once committed: a removed event stays listed as `{ "name", "retired": true }`); the choice shows only while its pick would find an event
  (judged with the choice's own changes); a lost event comes back through a give-up choice (`"giveUp": true`: the engine un-plays the event whose scenes hold
  the choice).
Why: asked for by Sára ("paměť voleb je určitě potřeba", "Scéna by měla být tam, kde je jedno pozadí…", the sizes and
positions of the creatures, "split story.json… act 1, each day in act 2a separate file", "the multiple choice dialog
should… take center stage", the locations and events of 2026-11-16), with her answers: all in one change, Back
restores the memory, a lost quest is offered again, a skipped minigame wins its helper, the part names, the creatures'
sizes as a start. Planned through 39 disprover rounds, plus 7 for locations and the tests in the repo.
Consequences: every line tap rewrites the save (up to 500 history entries with memory, ~100–200 KB late in the game);
`readSceneIds` is per scene and records landings only; preload reads conditions with the current memory (a warm-up);
progress made in old code after the migration stays in the old key; a `set`/`add` added later doesn't reach saves
already past it; inserting lines into a scene shifts saved positions (the editing rule in CLAUDE.md); Back undoes the
memory, so a player can undo time spent or re-roll a location's event; a duplicate scene id keeps the first; a
corrupt top-level `memory` takes the last history entry's; a corrupt `autosave2` (not an object) brings
the old key's save back through the migration (the old key is never deleted: better than a fresh start); every choice panel is dimmed for its first 0.5 s; under
720 px wide desktop windows a 2-choice line covers a small creature (accepted by Sára); after the Act 2a rewrite
players saved inside old Act 2a restart from `act1_end`; a lost `first` event given up keeps its location's other
events waiting until it is won. The Act 2a story itself is not rewritten yet (story work, with Sára).

## D38 — The node checks live in the repo and run before every deploy (2026-11-16) — Accepted
Decision: `tests/storyflow.test.mjs`, `tests/autosave.test.mjs`, `tests/story.test.mjs` and `tests/story-history.test.mjs`
(node and git only; the last runs `story.test.mjs` on synthetic git repos in the system temp folder, never inside the
project: an early version kept them in `tests/.tmp`, and when two runs collided a git command fell through to the
project's own repository and committed there) are in the repo; `npm test` runs them; the deploy workflow runs `npm test` before `npm run build` (with the full history,
`fetch-depth: 0`), so a failing check leaves the live site on its previous build. `tests/story.test.mjs` checks the
story files as they are: no lint warning, every referenced file in git, no scene id of a committed version (or of the
frozen `story.json`) gone without a `movedScenes` entry, every committed event name still listed (active or retired),
`movedScenes` into an event only from its own old scenes, the frozen `story.json` unchanged, one texture size per character; committed versions that don't load are skipped with a note.
Why: Sára ("some set of test should be in the repository itself, and that should be run before deploy"). Her own
story edits (a dangling id, a malformed condition, a missing file, a removed scene) now stop the deploy instead of
breaking the live game.
Consequences: a push with a story mistake doesn't deploy (check the Actions tab). Only `main` deploys (a manual run
from another branch builds nothing); the build job keeps no token on disk (`persist-credentials: false`) and only the
deploy job has the Pages permissions. A shallow clone, or a newest committed version today's engine can't load, fails
the test instead of letting the history checks compare nothing. The Playwright suite (Chrome, a dev
server, the live URL for D11) and the ffmpeg checks stay in `C:\tmp\claude`; moving them is a separate step.

## D39 — Characters and movedScenes in parts of their own (2026-11-16) — Accepted
Supersedes: D37's main file holding everything shared and `movedScenes` (now characters.json and compatibility.json).
Decision: `story-v2.json` keeps `id`, `start`, `menuMusic`, `resumeMusic`, `assets` and `parts`; the characters are in
`public/story/characters.json` (`{ "scenes": [], "characters": {…} }`) and `movedScenes` in `compatibility.json`
(`{ "scenes": [], "movedScenes": {…} }`), both listed first in `parts`. `mergeStory` takes `characters` and `movedScenes`
from any part and merges them into the main file's own (the base), the first entry of an id kept (a later one warns);
a part needs `scenes`, a `location` or one of the two; a value that isn't a plain object warns and is ignored (in the main
file too; absent: no warning); ids are kept as plain entries (`__proto__` included). `tests/story.test.mjs` refuses
characters anywhere but characters.json and movedScenes anywhere but compatibility.json, and both files missing from
`parts`. The movedScenes lint messages end with "(in compatibility.json)". The other backward-compatibility pieces stay
where they are: retired events in their location's file (the engine reads event names per location), the frozen
`story.json`, the old save migration and the one-line scene form in code.
Why: asked for by Sára ("story-v2.json is too long. Can you split out characters.json and compability.json (with moved
scenes and another backward compatibility features)"); the main file went from 17 KB to under 1 KB. The name is spelled
`compatibility.json`. `"scenes": []` because the code deployed before this (60b204a) throws on a part without a
`scenes` list: a tab reloaded within Pages' ~10-minute cache can run that code with the new files, and with the empty list
it loads (warnings, placeholder sprites and speaker ids for that visit) instead of not starting. The main file still
accepts both because committed versions and the test stories hold them there, and a stale cache pairing new code with
the old story-v2.json stays harmless.
Consequences: a broken or missing characters.json or compatibility.json stops the load, as a broken story-v2.json did
(D37: a failing part stops it). `"scenes": []` can go once the window is over (with the story.json cleanup, issues.md).
In that window, old-key saves of someone who never ran D37's code, served D37's code from a shared cache with the new
files, would be migrated without movedScenes (unplaceable ids dropped, never re-run): theoretical, accepted.

## D40 — Act 2a as days and locations (2026-11-16) — Accepted
Supersedes: the Act 2a draft of 2026-11-15 (its 32 scenes, all `movedScenes` → `act1_end` line 0, D37's accepted
restart); story.md's "Bezzubka is taken while the riders are in the grove" and "at the end of a location where the
dragons wait outside" (now always in the evening of day 3 at the gord); the solstice "in three days" (now four).
Decision:
- The calendar: Act 1 is day 0; days 1–3 have two half-days each (`pul`, 0–6), six choices; the solstice is the night of
  day 4 (Act 2b's day); the days left are counted the same way everywhere (day 0 "čtyři dny" … day 3 "Zítra v noci").
- One hub (`a2_kam`, centred) with one line per half-day ("Druhý den odpoledne. Kam poletíme?"), and one router
  (`a2_cesta`, a pass-through) after every action: day 3 over → the evening; the night search; day 2's and day 3's
  mornings (each once, each with a free light stop: the hejkal, the fox family; day 1's is the fox); else the hub.
- Three locations, one file each, two events each, any day: the deep forest (Soňa first, the fawn), the dam (the badger,
  the víly), the mountains (Tesák's lair first, only after the vědma; the wisent, on the new `mountain_meadow`
  background). Two single destinations in `act2a.json`: the vědma (after Soňa) and Triglav's grove (after the hejkal,
  always met on day 2, or the vědma). Resting at the gord is always offered (no hub can be empty). Each event and
  destination costs a half-day; the light stops cost nothing.
- Quests have no "move on" choice: the trip is the cost. Their win scenes set the finale's helpers (`jezevci`, `vily`,
  `zubr`, `srna`); a minigame later goes between an event's first scene and its win scene.
- Soňa's help is a promise (`slib`): the riders keep the rest of the day, search with her that night after supper
  (`a2_noc`, played by the router when the day ends) and sleep away the next morning (`add: { pul: 1 }`); not offered on
  day 3.
- Bezzubka is taken in the evening of day 3 at the gord, whatever the riders did (Sára: finding the grove must not be
  punished).
- Triglav answers two questions of three; the questions are the choices. What the riders learned elsewhere changes
  texts and choices through `vedma`, `vily`, `haj_nav`, `haj_zeme` and `zubr` (besides the bookkeeping names `pul`,
  `sona`, `haj_znam`, `haj`, the heads' flags, `hlavy`, and the vědma's welcome on `amulet`), each read by a scene after
  the one that sets it. The finale's names (`studanka`, `hlas`, `melodie`, `vejce`, the helpers, `amulet`,
  `vedma_pratele`) are recorded for Act 2b/3; of them only `studanka`, `hlas` and `melodie` are never read in Act 2a
  (the riders' source is read instead).
- The texts (and Claude's old Act 1 lines, rewritten in place) were written by a Fable agent on Sára's direction: more
  fairy tale and fantasy, magic and mystery, characters with goals of their own, not long.
- `tests/act2a.test.mjs` walks every choice and every possible pick (memoized on scene, line and memory) and checks the
  text rules statically (no `if` on a name its own scene sets, no `studanka`, `hlas` or `melodie` read, "Rubínka" only with `vedma`, times
  of day only where they hold, headings ≤ 40 characters).
Why: asked for by Sára ("pojďme přepsat Akt 2a do dnů a lokací"; "I think we need to change texts and options what can
players ask baseed on what they already know"; "it should not be too complicated"; her answers of 2026-11-16 to the
plan's questions: day 4, the night after supper with the morning slept away, quests without a skip, the abduction always
at the gord, the víly giving the gate and their flooded meadow, a new mountain background, the texts by Fable).
Consequences: a focused player (Soňa, the vědma, the lair, the grove) has two half-days to spare; helping everyone
(Soňa's night and the four animals) fills all six and misses the vědma, the egg and Triglav. Old Act 2a saves restart
at `act1_end`. The old `act2a-den*.json` stay in git, unlisted, for one deploy (Pages' cache could pair an old main file
with them), then go (issues.md). For ~10 minutes after the deploy a stale cache can pair the new main file with an old
`act1.json` or the reverse: a dead end at `act1_end` for that visit. A night-search minigame can't use a give-up choice
inside `a2_noc` (it is in no event's scenes): that feature plans a loss another way. Once deployed, the new scene ids and
event names are permanent; Sára's text rewrites edit lines in place, or insert them only where nobody is saved yet.

## D41 — The fox family comes right before the grove (2026-11-17) — Accepted
Supersedes: D40's light stop of day 3 (the fox family on day 3's morning).
Decision: the fox family (`haj_lisky`, the scene formerly `a2_liskova_rodina`) plays when the riders fly to Triglav's
grove, on the path just before it, whatever the day; `a2_rano3` goes straight to the hub. The old id leads to
`a2_rano3`'s last line (`compatibility.json`), so a save on it goes on to the hub, not into a grove nobody chose. Its first
and last lines were rewritten by the Fable agent for the new place.
Why: decided by Sára ("dat ji pred haj"): the grove can come on day 2 since D40, and the family was meant to come
before the grove (story.md, 2026-11-15).
Consequences: day 3 has no fixed light stop any more (story.md's "every day needs a light stop" no longer holds for it; said to
Sára); a player who never flies to the grove never meets the fox family. Players of the day-old D40 build who met the
family on day 3's morning meet it again before the grove. `tests/act2a.test.mjs` checks that the grove is entered only
through it.

## D42 — The badger cubs rescue minigame, first on the play-test page (2026-11-17) — Accepted
Supersedes: D38's "moving them [the Playwright checks into the repo] is a separate step" for new checks (they go into
`tests/` now); D23's `mergeConfig` (it now skips a JSON `__proto__` key).
Decision: a second minigame, `badgerRescue` (the badger event's quest, D40), built in two steps: first the game, its art
and music and its play-test page (`playtest.html?game=jezevci`), then (after Sára has played it) the story wiring, the
Fable texts and the sound effects. The game: the riverbank burrow (`badger_flood.png`) with five holes on the left and
the river to the right; the water rises from the painted water line, flooding the holes from the lowest-right one,
`firstFlood` 6 s then every `floodGap` 7 s; a flooded hole's cubs climb one by one (`cubGap` 2.5 s) onto branches that
the current carries right (`currentSpeed` by difficulty: Lehká 45, Normální 60, Těžká 80 px/s, each piece ± 15 %); two
bare logs drift too. `holeCubs` [1, 1, 1, 2, 2] (7 cubs; the play-test page also offers [1, 1, 2, 2, 3], 9). The three
dragons fly in from the right in turns, as in the beaver game, 140 game px wide; a tap or key makes the flying dragon dive
straight down (0.35 s each way, the flight paused, wing-up frame, tilted 10°): a cub's branch under its claws (any part,
or 12 px past its ends) is caught and the cub flies to the father at the new burrow up the bank; a log there is a bump
(no dive for 1.5 s after the dive ends), nothing a splash (1.0 s). A log never blocks a cub in reach; the nearest cub is
caught. A branch reaching the right edge waits while a dive is going down (at most `dive.down`, 0.35 s; the round is never
lost under the claws: two branches held by one dive, it catches the nearest and the other goes on as the dive turns up); otherwise the mother on her boulder saves it while she has strength (`motherSaves`: Lehká 2,
Normální 1, Těžká 0), then rests (on Těžká she only watches), and the next cub floating away loses the round. Won when every cub is safe (Sára: always all of them). The result waits
for the caught cubs' flight and the mother's trips; meanwhile the field keeps moving (the dragon flies on, the logs and
branches drift; a branch stops at the edge; a lost cub floats away past the edge, the result once its branch is out of sight: 1.2 s at least,
5 s at most; the water stops rising, so no hole floods meanwhile). A cub the mother saves counts in the score, and the
status says she can't help any more, once she has brought it back (`motherView`). The river's last stretch runs in front of the
mother's boulder, so a catch there can be seen. HUD: "V bezpečí: 3 z 7", the status "Máma pomůže: 2×" / "Máma už
nemůže" / "Zachraň všechna!" (no mother: by `motherSaves`, not by the level's name), the loss "Jezevče odplavalo".
The rules are a pure state machine (`badgerRules.js`: `normalize`, `createState`, `step`), the Pixi class only draws it
and feeds taps (stepped at most 1/60 s at a time), so the node checks play the game itself; the shared config helpers
moved to `configRules.js` (where `mergeConfig` now skips a JSON `__proto__` key, for the beaver game too: it set the
merged object's prototype), and `dragonAttack.js` exports what the new game reuses (its `DEFAULTS` for the dragons' art, `NOT_ATTACK_KEYS`,
`loadStrip`, `showFrame`, `tryLoadTexture`, `soundEntry`, `createDragonGraphic`). `MinigameManager.register` takes the game's own HUD texts as a
third argument (a scene's `labels` and `instructions` still win). The field is the background's contain rectangle (the
scene draws the same picture behind it), 600 game px tall, so the holes and the father sit on the painted bank on every
screen; the play-test link carries no field size. The music `zachrana` (Lyria; water, danger, the strain of the rescue).
Why: Sára's design answers (2026-11-17): save all cubs always, the levels differing in how long a cub holds on; the
mother saves one (Normální) or two (Lehká) and then lies exhausted on the bank; burrows only on the left, water to the
right; seven cubs, or nine as 1-1-2-2-3, adjustable on the test page; after a loss no text, just a retry without
penalty and a way to fly back (giving up the half-day without the helper; step 2); a new track evoking water, danger and
the strain of a rescue; art and music from Runway; "testovací stránku pro minihru s nastavením chci hned" (hence the play-
test page first). The pure rules make balance testable: 500 seeded rounds per player type through `step()` (a masher,
a masher with a reaction delay, careful players with an aim error), measured with the committed values: mashing
Normální ~10–15 %, careful σ 25 px Normální 100 %, σ 50 Těžká ~62 %. The water band is drawn over the dragons, so a
dive dips into it. The catch point is each fly strip's lowest opaque point on its wing-up frame (measured from the
committed strips; `tests/badgerRules.test.mjs` measures it again, so a re-packed strip fails the test until updated);
the dive's tilt turns the art around that point (the eye moved so the claws stay put), so the claws reach the water
right where the rules catch. Drawn sizes are config (`sizes`), to resize by eye as for the creatures (D37).
Consequences: step 2 (the story) is still to do: `reka_jezevec` → the minigame → `reka_jezevec_pomoc` or a lose scene
with a retry and a give-up choice, the Fable texts, six sound effects (the `sounds` keys exist, all `null`). Until then
the game is reachable only from the play-test page. Těžká's 0 saves is Claude's choice (Sára named Normální and Lehká).
The game's numbers are tuned on 1280×720 thinking but the field is screen-independent (one field size everywhere,
unlike the beaver game, D33). A dragon whose fly strip fails draws the vector placeholder and catches with the same
offsets (approximate: the placeholder's shape isn't the art's). `tests/badgerRules.test.mjs` reads the fly strips'
`bodyWidth`s from `dragonAttack.js` as text (that module needs a DOM): it needs three plain numbers and fails, saying
so, otherwise; the fly strips' specs it reads the same way for the catch-point check. The round pauses while the skip menu is open (a cub floats away in seconds; the beaver game runs on). The result of a round ended by an error (D24's backstop) still says "Jezevče odplavalo". On the smallest
phones (568×270) the instructions pill covers the starting water line until the first dive (it hides then, as D31's).
Tests in the repo (Sára, 2026-11-17: "všechny testy, které nejsou dočasné a měly by se pouštět opakovaně, by měly být
v adresáři tests"; supersedes D38's "moving them is a separate step" for new checks): the game's browser check is
`tests/browser/badger.test.mjs` and its rules test's fail-before runner `tests/mutate/badgerRules.mutate.mjs`, both run
by hand for now (not in `npm test` or CI); `playwright-core` is a devDependency (the installed Chrome, no browser
download, no install scripts; the version the outside suite already used, 1.64.1). The runner copies the files it
needs into the system temp folder or `MUTATE_TMP`, never inside the project by real path, links `node_modules` there
and removes the copy after. Moving the older suite in, with the reliable browser checks in CI, is issues.md's P2. Not
built from the plan's browser list: the field at seven viewports and after resizes (two sizes are checked), the
result guard (the HUD's own, checked by the beaver game's checks), the tilt's clearance under the claws, and a check that `cropBadgerSprites.mjs` rebuilds the committed sprites
byte for byte (it needs ffmpeg; done by hand on 2026-11-17: identical).

## D43 — The badger rescue polished: cubs on the water, no piece over another, the animals move, a faster current (2026-11-17) — Accepted
Supersedes: D42's drawing of the cubs at `surface + 10` on their bottom edge, its releases at the hole whatever floats
there, its cubs saved by the mother sitting on her rock, its one speed of the current per level, its still animals,
and its "8 files" for `cropBadgerSprites.mjs` (now 15).
Decision:
- A cub on its branch is anchored on the branch's line (`BRANCH_LINE` 0.58 of `cub_branch.png`'s height, measured: the
  middle row of the rows with at least 220 px of alpha > 8; the node test measures it again) and drawn 2 px under the
  water line, its legs under the water band (also the cub waiting at the edge, and the placeholders).
- No piece floats over another. No passing: from the most downstream, each piece moves at most up to touching the one
  ahead (a stable sort: on a tie the piece created first leads), never back; a faster one follows a slower one ("trains",
  Sára's choice over one speed for every piece); a log limits the pieces behind it until it wraps; a lost branch floats
  away freely but limits the one behind it; while a saved cub waits at the edge for the mother, its spot holds the next
  piece (so she saves one cub per `motherLeap`, never two on one step). At a release: another cub's branch over the
  new branch's stretch → the cub waits in its hole; else a bare log centred at the hole, with room around it → the cub
  boards it (the branch takes the log's place and speed, the log floats in again from the left 1.5 s later,
  `LOG_RETURN_DELAY`); a log only partly over the hole or without room → the cub waits, at most `LOG_WAIT_MAX` 2 s,
  then boards the nearest regardless (a story config could otherwise block a hole for ever). Touching pieces never count
  as overlapping through rounding (1e-6 px).
- The cub the mother saved flies to the father (the same arc as a caught cub, from where it rode on her, once she is
  back on her rock); nothing sits on her rock any more; the round's result waits for that flight.
- The current speeds up as the water rises: × `currentRise` at the highest hole's level, linear from the painted water
  line (`{ easy: 1, normal: 1.3, hard: 1.3 }`, a number from 1 to 3 else the level's default; one number in a story
  config speeds Lehká up too), still once the round is decided. The play-test page's 14th slider (`rise=`, last in the
  link; an older link plays at 1.3, `rise=1` turns it off).
- The animals move (7 Runway edits of the stills' originals, `gpt-image-2.6-flare`, 8 generations in all): the father
  shifts his weight (a paw lifted, his head lowered; 0-1-0-2 at 2.5 fps, then 2 s still); a cub on its branch paddles
  and lifts a paw (0-1-0-2 at 3 fps, each cub its own phase, kept when its branch becomes the waiting cub); the mother's
  tail twitches in bursts (5 fps, 4 swaps, 1.5 s still), her head turned down towards the river while a cub floats on
  it or waits at the edge (each head state held at least 0.5 s), her still while on a trip and resting. All on the
  round's time (they pause with the game). A missing frame: the father or a cub plays its still; the mother turns her
  head only with both head frames, else faces out and twitches with `motherTail`, without it her still. Each frame is
  lined up on its still's source by a scale and an offset found in a scratch search on a part that doesn't move, pinned
  in `cropBadgerSprites.mjs`'s `FRAMES`, cropped with the still's box to the still's exact size; edits that poked out of
  the still's box were regenerated (the first raised tail).
Why: Sára's requests (2026-11-17): "jezevčata plavou nad vodou … aby větev plavala na vodě"; "když připlave větev zrovna
v okamžiku, kdy jezevče opouští noru … ta původní by měla zmizet … jako že na ni nastoupí"; "je to celé takové strnulé
… táta jezevec by mohl nervózně postávat, máma jezevčice sledovat upřeně plovoucí jezevčata a hýbat nervózně ocasem";
"hlava zachráněného jezevce u mámy divně interferuje … všechny ty zachráněné zobrazila u táty"; "vyhrát to je na
počítači vcelku lehké … proud by se zrychloval s tím, jak voda stoupá". Her answers: the cub waits in its hole; cubs
animated too; the log back from the left with a small delay; the saved cub flies to the father in an arc; the speed-up
only on Normální and Těžká ("Lehká bez zrychlení": there a faster current made the masher win more, 14.6 → 27–34 %);
the trains; the mother turning her head too; the sprite budget soft. The plan went through 15 disprover rounds; Sára
then ended the loop ("to už jsou blbosti … ukonči to a implementuj").
Consequences: balance with the committed values (500 seeded rounds): masher Normální 1.8 %, Lehká 14.8 %, jittery masher
2.2 %, careful σ25 Normální 100 %, σ50 Těžká 52.6 % (D42: 9.8 / 21.8 / 15.6 / 100 / 63.2 %). The simulated players
don't see what Sára felt (higher water looks easier: the cubs are nearer the dragon; in the rules a dive takes 0.35 s
whatever the height), so whether 1.3 cancels it is for her play-test and the slider. A cub waits in its hole in most
rounds (77 % Normální, 90 % Lehká) but briefly (at most ~1.3 s Normální, ~2.4 s Lehká); with extreme sliders up to
~70 s, invisible meanwhile (its hole is under water). Trains: on Normální a branch touches another piece ~18 % of the
time on screen. After a loss, logs stop behind branches parked at the edge for up to 5 s. A log recycled to the left can
land over another off screen (it stays put there until the gap opens: never drawn overlapping). A boarding after the
2 s log limit can overlap a neighbour (extreme configs only). Config log positions closer than a log apart start drawn
over each other until the gap opens. A story config with a hole near the right edge could release a branch over the
waiting cub. A dive onto the cub waiting at the edge is a splash (it isn't a piece). The cub branch's right twig stays
~6 px above the water (8 with the bob: the branch slants). The mother looks at the river ~90 % of the time after the
first flood (a cub almost always floats); Sára judges whether "towards the river" should mean a cub near her instead.
The father's frames are pinned against the re-exported `jezevec_neutral.png`: re-running `reexportCreatures.mjs` for
jezevec makes them stale (the alignment check fails). ~0.9 MB more to download (the 7 frames). `motherView().back` and
`sizes.motherCub` are gone. Checks: `tests/badgerRules.test.mjs` (the rules, the frames' sizes and alignment,
`BRANCH_LINE`), 55 mutations in `tests/mutate/badgerRules.mutate.mjs`, 22 browser checks (each D43 one shown failing
with its fix reverted).

## D44 — The badger rescue tuned from Sára's play-test; the mother in the moss (2026-11-17) — Accepted
Supersedes: D42's 7 cubs, its floods (`firstFlood` 6 s, `floodGap` 7 s) and its currents (Lehká 45, Normální 60 px/s),
its balance floor for Těžká (σ 50 ≥ 40 %); D43's `currentRise` (`{ easy: 1, normal: 1.3, hard: 1.3 }`) and its
mother's place on her rock (10 % of the rock's height under its top).
Decision: the defaults are Sára's play-test values on Normální: 9 cubs (`holeCubs` [1, 1, 2, 2, 3]), the first flood at
2 s, then every 3 s (every level), the current 70 px/s, the mother saving 1, the speed-up × 2 at the highest water.
Lehká: current 50, the mother saving 2, no speed-up; Těžká: current 80, no mother, × 1.8. The play-test page's cubs
slider offers D42's 7 ([1, 1, 1, 2, 2]) as the other layout. The mother stands 15 % of her rock's height under its top,
in the moss (at 10 % she floated over the grass).
Why: Sára (2026-11-17): "this is better values, I sometimes do not win" (her link: cubs=9, current=70, mother=1,
firstFlood=2, floodGap=3, rise=2, the rest the defaults); her answers to the proposal for the other levels: yes, with
Těžká's speed-up 1.8 instead of the proposed 1.5; "máma jezevčice vypadá, že trochu levituje, když stojí".
Consequences: balance (500 seeded rounds): masher Normální 0 %, Lehká 29.6 %, jittery masher Normální 0 %, careful σ 25
Normální 93.2 %, Těžká 53.8 %, σ 50 Normální 35.2 % (Těžká ~10 %: its floor is now σ 25 ≥ 45 %). All five holes are
flooded 14 s into a round (D42: 34 s). The rules' checks written for D42's timing pin it (`D42_TIMING` in
`tests/badgerRules.test.mjs`). Old play-test links keep their own values (every value is in the link).

## D45 — The badger cubs rescue in the story: no word after a loss, a free retry, a give-up (2026-11-17) — Accepted
Supersedes: D42's "step 2 (the story) is still to do" and its "the result of a round ended by an error still says
Jezevče odplavalo" (in the story it goes silently to the lose screen); D42's `sounds` "all `null`" (now Sára's picks).
Decision:
- `reka_jezevec` (lines 0–7 keep their indices, texts edited in place) → `reka_jezevec_zachrana` (a minigame scene, no
  `lines` key, background `badger_flood.png`, music `zachrana`, `config: {}`) → won (or skipped as won, D37):
  `reka_jezevec_pomoc` (its texts edited in place for the dive rescue and nine cubs; still `set: ["jezevci"]`) → lost:
  `reka_jezevec_prohra`: no line, no stage, `choiceLayout: "center"`, two choices: "Zkusit to znovu." (back to the
  minigame, no `set`/`add`, no time) and "Odletět a vrátit se později." (`"giveUp": true`, `set: ["jezevci_prohra"]` →
  `a2_cesta`: the half-day stays spent, no helper, the event offered again by the dam's pick while a half-day is left).
- After a loss nothing is said: a scene's `minigame.loseResult: false` (read by `MinigameManager.run`) settles a lost
  round at once instead of showing the result dialog; a win still shows it. The beaver game and the play-test page
  don't set it (the testers keep "Jezevče odplavalo" and the cubs line). The rules still hold the end 1.2–5 s until the
  lost cub's branch is out of sight (D42), so the loss is seen. A round ended by D24's backstop goes silently to the lose
  screen too (a story typo that makes `step()` throw makes every retry an instant loss; the give-up is the way on).
- The way to end a round early is the skip menu, as in every minigame (Sára: no extra button).
- After any minigame, Back by key (← and Backspace, presses and repeats) waits for a fresh press that comes after
  `TAP_GUARD_MS` (500 ms) without any keydown, repeats included, as `choiceGuard` and `guardTaps` count keys
  (`InputController.holdBackUntilQuiet()`, called by `runMinigame`); that press goes Back, and any quiet press ends the
  wait. Not in the menu (its sliders step on arrows); the top bar's Back button is
  unchanged. Without it a ← or Backspace held or mashed through a lost round (no result dialog to take the focus) stepped
  Back off the lose screen 500 ms after the round and on through `reka_jezevec`, the hub and earlier choices, undoing
  half-days and events (found by the coordinator after the review panel). The víly-ditch plan's first rule (a key
  pressed during a minigame never repeats into the story, `heldFromButton` generalised) was built, measured and dropped:
  this rule alone already stops the held keys too (a held key's repeats never end the wait), and its own check passed
  with it removed, so it guarded nothing the story can show.
  Accepted edges (the delta's review): the wait ends once, so a child who pauses 500 ms mid-mash and mashes on steps
  Back again; a ← right after other keys (a held Space let go) can need a second press; the top bar's Back button tapped
  by pointer isn't held (it sits under the HUD's top bar during a round).
- The return after giving up (`jezevci_prohra`) has its own lines: `"!jezevci_prohra"` on lines 0–7 (1 and 2 as lists),
  three lines appended after them with `"if": "jezevci_prohra"`; the stage copied onto lines 1, 2, 4 and 6 (D37's lint:
  a conditional line that sets the stage needs the next one to set its own), so a first visit looks as before.
- No empty dialogue box under centred choices with no line: two CSS rules
  (`#game-root.choices-center:has(#dialogue-text:empty)`): the dialogue panel `visibility: hidden` (still measured for
  `--dialogue-top`) and, except on phones (their centred panel already takes the whole height, D37), the choice
  panel down to the dialogue panel's own bottom. A visible line with empty text would hide the box too (none exists).
- The texts by the Fable agent (planning, 2026-11-17); Sára's choices: no line on the lose screen, the give-up text,
  shorter lines for the return, the count kept at nine. `tests/act2a.test.mjs` ties the count words in the badger
  event's texts (5–15 as cardinals, ordinals, collectives, or digits) to the minigame's cub count (`holeCubs`' sum, or
  the scene's own config): a new default fails it until the texts say the new number (or the scene pins `holeCubs`).
- Six sound effects from Runway's sound-effect tool, three variants each (three different prompts, 24 credits),
  committed as downloaded in `art/minigames/badger-rescue/sfx/variants/` (`<sound>_<a|b|c>.mp3`; Runway's sound files carry
  no C2PA data, unlike its pictures); Sára picks on a listening
  page; `scripts/build-badger-sfx.sh` (its own script: `build-sfx.sh`'s check rebuilds that one on a copy holding only
  the dragon-attack sources) builds the picks: mono, leading silence trimmed, cut to the target length (dive 0.6,
  splash 0.8, bump 0.8, caught 1.0, mother 1.2, lost 1.5 s) with a 50 ms fade-out, trailing silence trimmed, RMS
  −14 dBFS by a gain measured per variant (`--measure`, pinned in the script), limited to −1 dBFS, 96 kbps, into
  `public/assets/minigames/badger-rescue/sfx/<sound>.mp3`; it refuses to run while a pick is "?". Each plays on its
  event as the game already did (`EVENT_SOUNDS`), `mother` too. Sára's picks (2026-11-17): dive c, splash c, bump c,
  caught a, mother b, lost c.
- The act2a walker now walks minigame scenes (both outcomes, the memory unchanged), no-line choice scenes, a retry from
  the minigame's own lose scene (ending that branch, not a loop) and give-up choices (`giveUpMemory`, as the engine).
  The fail-before runners share `tests/mutate/runMutations.mjs`.
Why: Sára (2026-11-17): "zapoj minihru do příběhu"; her rule for this step: "po prohře to nic neřekne, jen nabídne
opakovat. Tady bych dala opakování bez penalizace. Také možnost minihru ukončit a odletět zpátky. Tím se přijde o půl
den bez získání pomocníka"; her answers on the plan: "úplně bez textu je asi lepší", "může být odletět a vrátit se
později", "24 kreditů je v pohodě", "když tak se to pak přepíše, kdyby se počet ještě měnil", "jo kratší úvod asi dává
smysl", "tlačítko přeskočit by mělo být ve všech minihrách stejné". The plan went through 7 disprover rounds.
`loseResult` on the scene, not in `register()`: it is a story choice, and the play-test page needs the dialog. The
lose screen draws no badger: the sprite would stand over the painted holes and water.
Consequences: on the last half-day the give-up text ("vrátit se později") is untrue (the router goes on to the evening):
accepted by Sára. Back from `reka_jezevec_pomoc` after lose → retry → win lands on the lose screen (the retry put it in
the history); giving up there un-plays the won event with the memory Back restored: consistent (D37's "Back undoes the
memory"). Line 6's "Žena hlídá dole na balvanu, ale všech devět sama z vody nevytáhne" hints she saves some, while on
Těžká she saves none (literally true); the return says the river is higher while the next round starts at the painted
water line. With the defaults' `zachrana.mp3` (true peak −8.3 dBFS) the limiter's ceiling + the music at 75 reach
−0.19 dBFS, 0.01 dB over D31's −0.2 rule (never past full scale; accepted; `tests/badgerSfx.test.mjs` asserts
≤ −0.15). The six sounds load at the round's start and are never awaited (D29): on slow data the first dive of the first
round can be silent. A save inside a queue of the mother's trips plays `mother` at the save, up to `motherReturn` before
her leap (rare: the waiting-cub spot, D43, makes a queued save unusual). The play-test page plays the sounds
too (same DEFAULTS). The minigame's art (~1.7 MB) and `zachrana` load when the round starts (issues.md P2's preload).
For ~10 minutes after the deploy a cached old bundle can run with the new `lokace-reka.json` (parts are fetched
no-cache, the bundle isn't): a loss then shows the old dialog and the lose screen an empty dialogue box with the English
hint; the game still works. Once deployed, `reka_jezevec_zachrana`, `reka_jezevec_prohra` and `jezevci_prohra` are
permanent. Checks: `tests/act2a.test.mjs` (its fail-before `tests/mutate/act2a.mutate.mjs`: D40's 28 mutations moved in from `C:\tmp\claude\act2a-build`, 14 for D45, 3 controls),
`tests/badgerRules.test.mjs` (the sounds' files), `tests/browser/badgerStory.test.mjs` (23 checks, the real game; the six for Back each fail with `holdBackUntilQuiet()`
removed, the hold-then-mash one also with repeats left out of the key quiet),
`tests/badgerSfx.test.mjs` (hand-run, ffmpeg; its RMS window −18 to −12.5 dBFS rather than the plan's −14 ± 1.5: the −1 dBFS
limiter takes a peaky clip lower, as D29 found for Anna's hit, −16.9); `tests/browser/badger.test.mjs`'s art routes narrowed to `*.png`. The
sound checks in the browser use six existing dragon-attack files through the routed scene config (the play-test page
can't set `sounds`), so they test the wiring before Sára's picks exist.

## D46 — The wisent's song: an echo minigame with a calm rule, in the story and on the play-test page (2026-11-18) — Accepted
Supersedes: D40's `hory_zubr` → `hory_zubr_pomoc` straight (now through the minigame); `hory_zubr_pomoc`'s narrated
shout and singing (the shout moved before the game, the singing is the game); story.md's audience "children" (now
readers of 8–11).
Decision:
- The audience is children who can read, 8–11 years old (Sára, 2026-11-18): the levels are tuned for them.
- A third minigame, `zubrMelody` (the wisent event's quest), Sára's variant A ("echo") with variant B's calm rule
  ("Tichý hlas"). Five stars (D4 E4 G4 A4 B4, an E minor pentatonic: any order of taps sounds consonant), each its own
  colour (Okabe–Ito), shape (circle, triangle, diamond, star, rosette) and pitch. Róza sings a step of the song, each
  note lighting its star; the player taps the stars in the same order (the canvas's `pointerdown`, or Digit/Numpad 1–5
  by `event.code`: a Czech layout's number row types `+ ě š č ř`). The echo opens 0.5 s before Róza's last onset
  (`echoLead`) and is judged by alignment (the longest run of the latest taps that matches the step's start), so a child
  following her lights and then echoing lines up wherever its echo starts; in the grace (until her held note ends +
  `followLag` 1.0 s) a tap that breaks every alignment is forgiven on a star she lights, lights within `anticipate` 0.25
  s, or lit under 1.0 s ago (never one Rubínka's red tone lit since); a fall back is a restart only after a pause of
  `restartPause` 2.75 beats or in the grace, else a mistake. Nothing is ever replayed by itself (Sára's play-test: the stall replay started while she was tapping;
  then, 2026-11-18, also no replay for a child who hasn't tapped): the replay button "Ještě jednou" (upper left, a disc with a circular arrow, its label above;
  hit circle of radius 56 game px, ≥ 44 CSS px across at 568×270, clear of the stars, the meter, the words and the HUD bar; or R by
  `event.code`, no repeat, no modifier) makes Róza sing the step again, free (no mistake, nothing on the meter), and the
  echo starts over; it is enabled only in the echo once her last note has ended (`timeline.end`; dimmed while she
  sings, in a snort, a success, the finale, the charge and the hold), and pulses after `hintAfter` (6 / 10 / 20 s) without a tap, counted from the echo's opening or the last tap, so an idle
  child gets the hint too. On Těžká (no mistake allowed) the HUD's status reads "Bez chyby!" (until the mistake) instead of the snort count
  (`labels.flawless`, whenever `mistakes` is 1). The charge's sound replaces the snort's on the mistake that charges
  (the last one on every level, Těžká's only one): one sound, not two at once. A loss ends only from the hold (the
  charge's end time and its phase time could round apart, leaving a lost round frozen in the charge without the hold's
  ring: found by a flaky browser check).
  The words of the line being sung show under the stars, between the wisent and Róza (two rows, bold, 32 game px,
  14.4 CSS px at 568×270, on a dark backing): her sounding syllable gold, the echoed ones white, the next underlined, the
  rest dimmed; faded out with the stars at a charge, and none where a story's phrase has no lyric line of its length.
  The calm meter is a leaky bucket: +1 a tap, −3.125 a second (not tied to the beat), over 3.5 a shout (a mistake, also
  over a demo; in the intro only the burst); the top segment at 80 % warns. A mistake: the snort (head jerk, puffs, mist
  thicker); on the 6th / 3rd / 1st mistake (Lehká / Normální / Těžká) the charge (Bezzubka, Róza's fly strip, rises out of a dust puff
  in Róza's place); a lost round ends only after 1.5 s without any tap, click or key anywhere (`quietEnd`, at most
  `quietMax` 15 s after the charge; a closing ring round the meter shows it), so a child tapping on through the charge
  doesn't land on the lose screen's choices; D24's backstop ends it at once. After the last step Róza sings the whole
  song (28 notes, 19.2 s), the mist thins to a veil, and the result says "Píseň dozpívána": the story wakes the wisent.
- The levels (Sára after her play-test: 14 tones can't be remembered; 7 a step, fewer mistakes allowed instead; Těžká
  "úplně bez chyby"): every level echoes the four lines one at a time (`steps` one list, 7 notes each), `mistakes` 6 /
  3 / 1 (5, 2 and no mistake allowed), no red tones (`rubinka` 0: Rubínka's sour reed stays in the code for a story
  config, the balance didn't need it); ♩ = 150, 3/4, each trochee long–short, a line's
  last syllable held. The play-test page lost its Postup, stall and idle-replay sliders (9 sliders). The whole song is
  sung by Róza, not echoed (a deviation from variant A, said to Sára).
- The song: "stará píseň proti kletbám" (Sára's name, 2026-11-18; never "ukolébavka"), passed from Róza's grandmother to
  her mother to her; its words by the Fable agent, Sára's pick of ten: „Cizí píseň ztrácí moc, / kolem tebe dýchá noc. /
  Slyšíš? Volám jméno tvé, / vrať se k sobě, srdce mé.“ (AABB, 7 trochaic syllables a line; the planned notes kept, line
  3 is new words on line 1's tune). In the code the words live only in `LYRIC` (zubrRules.js), checked against the
  phrases' note counts and `hory_zubr` line 11's quote; the name the player sees lives in `SONG` (zubrRules.js, beside
  the lyric; the HUD's title through `HUD_TEXTS`: "Píseň proti kletbám", Fable's short form) and the story's own lines
  (`hory_zubr` line 10, which the test checks holds the name). `MinigameManager.register`'s HUD texts may carry the
  game's own `title` (used when the scene gives none: the story's minigame scene leaves it out). Act 2a's time-of-day
  rule skips the song's quoted words ("dýchá noc"). The song is the melody (`melodie`) the finale can reuse (a shorter
  configuration through `steps`, `finale` and `rubinka`).
- The tones are synthesised with Web Audio (`zubrTones.js`: a flute voice, an 8 ms attack for a tap, one voice per star
  for Róza and one per star for the player, one for the red tones), not samples: nothing to load, exact pitches, any
  length, no credits. They go through `sfx.js`'s new `effectsOutput()` (a gain at `EFFECT_MIX` × the effects slider into
  Howler's master gain: the limiter, the hidden page's mute and the slider apply; rebuilt when Howler replaces its
  context); a tone plays only while the context runs; a tap is applied to the rules in its own input task (its tone
  starts there, at `currentTime`); Róza's notes on the frame (a `ponytail:` note, issues.md). The round sets
  `navigator.audioSession.type = 'playback'` where it exists (Safari 17+) and the type before back at its end (and while
  the page is hidden), so the tones are heard on a silenced iPhone (this round has no HTML5 music to do that; set only
  for the round, so the other games and a muted phone in class stay as they were: the security review). No music in the
  round or on its lose screen.
- The art is the existing `mountain_meadow.png`, `zubr_neutral.png` (its painted misty eyes; the eye and nostril points
  measured and checked on the file), Róza's story poses and Bezzubka's fly strip; the stars, mist, puffs, dusk and meter
  are drawn. Only the wisent and Róza singing are awaited at the start.
- The story: `hory_zubr` lines 0–5 gain `"!zubr_prohra"` (line 2 the stage copy), lines 6–13 appended (the shout, the
  charge, Anna, or after the grove Anna remembering Triglav, Róza recalling the song, the stars lighting), lines 14–17
  for the return after giving up (`zubr_prohra`); `hory_zubr_zpev` (the minigame, `loseResult: false`, no music, no
  stage); `hory_zubr_prohra` (no line, the dazed wisent, a free retry and "Odletět a vrátit se později.", `giveUp`, as
  D45); `hory_zubr_pomoc`'s lines rewritten in place (still `set: ["zubr", "melodie"]`). Texts by the Fable agent.
- The play-test page: `?game=zubr` (looked up with `Object.hasOwn`), 9 sliders, a level select (`level=`: the per-level
  sliders jump to its defaults, the rest stay, no reload; a link is read level first, then its defaults, then its own
  values; shown only where the game has levels), the context's latency line, no music (its `AudioManager` still mutes on
  a hidden page), the page's first Howl at load (Howler's one-time context replacement before any round) and the tones'
  bus set up and resumed inside the Hrát click.
- Three sound effects (snort, charge, clear) from Runway, three variants each (15 credits), committed as downloaded in
  `art/minigames/zubr/sfx/variants/`, built by `scripts/build-zubr-sfx.sh` (D45's chain) into
  `public/assets/minigames/zubr/sfx/`: Sára's picks snort b, charge b, clear c (2026-11-18).
Why: Sára (2026-11-17): "A s tím pravidlem o klidu z B, postav to a otestujeme to na detech"; (2026-11-18) "je to
tomirene na deti, ktere umi cist tak je to tak 8-11 let. tudiz bych rekla, ze je to moc lehke", the lyric on her words
and then her pick of a fully rhyming one, "asi by se ta písen nemela nazyvat ukolebavkou, ale proste pisni proti
ovlivneni zlem", the name; after her play-test "it automatically started to repeat the song when I was pressing the
stars … there is a button for that" and "14 tonu je moc … snizovat pocet moznych chyb mi prijde lepsi. slova bych tam
mozna ukazovala … na nejtezsi … jen by to muselo byt uplne bez chyby". The plan went through 12 disprover rounds, 3 more
for the revision and 5 for the button, the levels and the words. The calm rule as a
bucket: a per-tap threshold let a perfect masher of short steps through; the grace and the restart pause protect careful
children (followers at a normal reaction win every round). The memory models were recalibrated so an adult can't hold
the old 14-note step (23 % on the old Normální): the error per note grows with the square of the excess over the span
(8-year-old 4.5 notes, 11-year-old 5, adult 6), a tune echoed before counts as 85 % of its notes (line 3 has line 1's),
a retry cuts the error ×0.9 at most twice (so free replays can't erase the levels: an assumption, not data), a lost
child stops mid-echo and presses the button (60 / 80 / 95 %) or guesses. Balance (1000 seeded rounds through the rules):
8-year-old 86.5 / 45.5 / 9.2 %, 9–10-year-old 95.8 / 66.3 / 18.7 %, 11-year-old 99.7 / 87.1 / 32.5 %, adult 100 / 99.6 /
71.0 % (Lehká / Normální / Těžká; children pressing the button before each new line up to ~10 points more); every masher
and "the right stars as fast as a finger goes" 0 %. Těžká flawless: its 11-year-old at 32.5 % is not "absurd" (the
brief's rule; one allowed gives 25.6 / 66.6 %, as far over as flawless is under). Red tones: not needed by any target.
Consequences: Těžká is under both children's targets (8-year-old ~9 % against 15–20, 11-year-old ~32 % against 50);
one allowed mistake (`mistakes: { hard: 2 }`, the play-test slider) is the alternative, for Sára's play-test with
children. On flawless Těžká a careful child loses to timing too: a slow, very jittery follower (lag 0.9 ± 0.35 s) wins
~45 % (Normální ~93 %), and starting over sooner than 1.1 s after a pause is a fall back, so the charge (the button is
the free way to start over). A steady tapper who knows the tune wins every level. Old play-test links keep their
`mistakes=` (the same meaning; only the defaults moved). Old links' `replay=` (the idle replay) is ignored. Těžká stays
flawless and the automatic replay is gone (Sára's answers, 2026-11-18); the balance didn't move (the simulated children
never waited for it). A child who keeps tapping steadily without looking ends the quiet hold at its first 1.5
s gap and can then pick a lose-screen choice by chance (Back undoes a give-up). A player with the effects at 0 hears no
song (the stars still show it). The wisent and Róza are drawn smaller in the game than in the story, and after a charge
the wisent jumps from the game's place and size to the story's on the lose screen (no dialog in between; cosmetic). A
child tapping at 1.1 s or slower makes every slip back onto the phrase's start a silent restart, not a
snort: the lenient rule as planned, for Sára to watch (no automatic replay any more). On a win the audio session and the last notes end only when the
result closes. A shout mid-demo lets Róza's note already ringing ring on through the snort (cosmetic). A whole song at
the caps (8 phrases × 16 notes × 4 beats at a 2 s beat) would last ~17 minutes; no config comes near. A correct note
equal to the step's first star after a ≥ 1.1 s hesitation, then the start's second note, reads as a restart (the same
taps as a child starting again; the next wrong tap gets the snort, one tap late): the third review panel's medium, kept
lenient as planned because the stricter rule made the planned restarter lose every Lehká round. A player saved on the
old `hory_zubr_pomoc` reads the new texts with `zubr` already set. For ~10 minutes after the deploy a cached bundle
without `zubrMelody` can meet the no-cache `lokace-hory.json`: "Unknown minigame type" → an instant loss → the lose
screen, each retry the same; giving up is the way on for that visit. Once deployed, `hory_zubr_zpev`, `hory_zubr_prohra`
and `zubr_prohra` are permanent. The sound-effect scripts refuse an output folder that leads into `art/` (checked before
anything is made, a link at an output file removed rather than written through: `build-zubr-sfx.sh`, and
`build-badger-sfx.sh` aligned to it); no repo check covers them (tried by hand with a junction). With `finale: false`
(the planned shorter reuse) the round wins without the shimmer (`clear` belongs to the finale): the reuse decides. Tones already ringing ring on through a pause and a success or snort
(cosmetic). Checks: `tests/zubrRules.test.mjs` (in `npm test`; fail-before `tests/mutate/zubrRules.mutate.mjs`),
`tests/act2a.test.mjs` (the rescues as a table; `tests/mutate/act2a.mutate.mjs` gains the wisent's),
`tests/browser/zubr.test.mjs`, `tests/browser/zubrStory.test.mjs`, `tests/zubrSfx.test.mjs` (hand-run, ffmpeg).
