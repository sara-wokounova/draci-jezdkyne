# Known issues

Severity: **P0** broken for everyone · **P1** blocks play on some setups · **P2** visible bug · **P3** polish.
"Verified" = confirmed by running/inspecting; "suspected" = read from code, not reproduced.

## Open

### P1 — Not playable on phones (user-reported 2026-10-17) — fixed in working tree, verified locally 2026-10-17, awaiting deploy (D11)
Move to Fixed only after `mobile.mjs live` passes. `mobile.mjs` (local) passes on
all five viewports. This was checked in Chrome emulation only, never on a real
phone, so real Android rotation-on-lock, re-entering fullscreen after a back
gesture and the iPhone home-screen manifest path are untested.
How each cause was addressed:
- Panels overlapping / too tall, characters hidden, background covered: one
  short-landscape layout with a compact bottom strip and side-by-side choices (D14).
- Portrait: no layout. A `#rotate-hint` overlay, plus fullscreen and a landscape
  lock on tap (D12, D13, D16).
- `dvh`, safe-area insets, `viewport-fit=cover`, iOS text-size-adjust (D14).
- Minigame: scaled by screen height, beavers re-enter behind the last walker
  (never stacked), refit every tick (resize and rotation), dragons kept below the HUD,
  paused behind the rotate hint (D15). The topbar fits in one row at 640px.

Original report: dialogue panel covers the background; choices are not always visible.
Suspected causes from the code:
- `#choice-panel` sits at a fixed `bottom: … + 11rem` (10.5rem on mobile), but
  `#dialogue-panel` grows with the text. Long text (e.g. `forest_flight_01`)
  wraps to ~6 lines on a 390px screen → panels overlap.
- Landscape phone (~390px tall): dialogue + choices are taller than the
  screen; choices run off the top or under `#top-controls`.
- Characters are anchored at 98% screen height → hidden behind the dialogue panel.
- Portrait: contain-fit background is a small strip (see D5).
- `height: 100%` with no `dvh` / safe-area insets → mobile browser toolbars and
  notches can hide UI.
- Minigame: `.mg-instructions` is `white-space: nowrap` (overflows); topbar
  crams title + stats + skip into one row.
- Minigame on narrow screens: beavers start at `x = 8% + i·150px`; every beaver
  past `width + margin` wraps to the same `-margin` spot → several beavers stack.
  Sizes (`spriteWidth`, dragon `width` 150px) are fixed pixels, not screen-relative.
- Minigame background / layout isn't recomputed on resize or rotation.

### P1 — Persuade branch crashes at `dam_with_beavers_persuade_04` (verified 2026-10-17)
`next: "dam_with_beavers_persuade_05"` doesn't exist. Tapping throws
"Unknown scene id" and the player is stuck (Back still works). Needs story text.

### P2 — Minigame art missing → 404s (verified 2026-10-17)
DEFAULTS in `dragonAttack.js` point to `background.png`, `dragon_{roza,emma,anna}.png`,
`flame_roza.png`, `flash_emma.png`, `arrow_anna.png` — none exist. Each 404s and
falls back to a vector placeholder. Add the art or set those defaults to `null`.

### P2 — Overlapping scene renders (suspected) — fixed in working tree 2026-10-17, awaiting deploy (D11)
Fixed by D17 (render token). Reproduced and verified locally: a resize while a
throttled sprite loads now leaves exactly one character. The phone fullscreen tap
made this happen on the first tap on every Android phone.
`VisualRenderer.render()` is async and not cancelled. Advancing fast while
images load (or resizing mid-load) can interleave two renders → both scenes'
backgrounds/characters stacked on screen.

### P2 — Story dead ends (verified 2026-10-17)
`flooded_town` has no `next`/`choices`: the story just stops, and the "continue"
hint is still shown. `beaver_battle_win` loops to `forest_flight_01` with the
old back-history intact.

### P3 — Engine UI is English, story is Czech
`index.html` has `lang="en"` and title "Visual Novel Starter"; buttons "← Back",
"Restart"; hint "Click, tap, Space, or Enter to continue"; save status shows
internal scene ids ("Autosaved • river_dam"). Minigame HUD is already Czech.

### P3 — Czech typos in `story.json`
- `forest_flight_01`: "v lesa" → "v lese"; "nežraly" → "nežrala"
- `dam_with_beavers_persuade`: "přeprat by je by nemuselo" (double "by")
- `dam_with_beavers_persuade_01`: "Co by bychom mohly" → "Co bychom mohly"
- `dam_with_beavers_persuade_04`: "byly z nám obří bobři" → "byli z nás obří bobři"; trailing space

### P3 — Heavy assets for mobile data
Backgrounds ~3.3 MB, character poses ~2 MB, beaver sheets ~1.5 MB each, all PNG.
WebP / downscaling would cut load time a lot.

### P3 — "Velký bobr" has no sprite
Beaver lines show a dragon rider's sprite instead.

### P3 — Continue hint shown when there's nothing to continue to
Choice scenes and dead-end scenes still say "Click, tap, Space, or Enter to continue".
On phones (D14 layout) it is hidden on choice scenes. Desktop and dead ends still show it.

### P3 — No `webkitRequestFullscreen` fallback (2026-10-17)
D16 uses the unprefixed API only. Old iPads (before iPadOS 16.4) never go fullscreen.

### P3 — Phone layout relies on `:has()` (2026-10-17)
On browsers without `:has()` (before Chrome 105, Safari 15.4 or Firefox 121) the
choice panel overlaps the right half of the dialogue on phones. Fallback: toggle a
class on `#game-root` in `UiController.showChoices`.

### P3 — Minigame instructions pill covers the beavers' feet on short screens (verified 2026-10-17)
At 640x360 and 844x390 the bottom `.mg-instructions` pill overlaps the lower part of
the beaver lane (`laneY` 0.84). Visual only. Could hide the pill after the first
attack, or raise `laneY` on short screens.

## Fixed

### P2 — Beaver sprite sheets had a baked checkerboard — fixed 2026-10-17
`beaver1..7.png` were RGB with the checkerboard painted in, so beavers showed in
grey boxes. Ran `node scripts/removeCheckerboard.mjs public/assets/minigames/dragon-attack`
(now RGBA, ~81% transparent). Faint motion lines next to the scurry frames got thinner.

### P0 — Deploy broken; live site two commits old — fixed 2026-10-17 in `d498b26`
`50cf1d8` imported the uncommitted `src/engine/minigames/`, so its CI run failed
and the live site kept serving `cfaac4a`. `d498b26` committed the minigame code,
the beaver sheets and the lunch/flood backgrounds. CI passed and the live site serves them.
