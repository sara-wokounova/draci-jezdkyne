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
