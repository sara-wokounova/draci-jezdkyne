# Known issues

Severity: **P0** broken for everyone · **P1** blocks play on some setups · **P2** visible bug · **P3** polish.
"Verified" = confirmed by running/inspecting; "suspected" = read from code, not reproduced.

## Open

### P2 — Minigame starts seconds after its HUD appears (verified 2026-10-17)
Scene preload (D8) only covers backgrounds and characters, and `spawnBeavers()`
then loads the 7 beaver sheets (~12 MB) one after another. On the live site the
HUD shows over an empty lane for ~2–4 s on a fast connection; on phone data it
will be much longer, and taps do nothing until then. Not a regression. Fix: load
the sheets with `Promise.all`, preload them from the scenes before `beaver_battle`,
and/or shrink them (see "Heavy assets").

### P1 — Persuade branch crashes at `dam_with_beavers_persuade_04` (verified 2026-10-17)
`next: "dam_with_beavers_persuade_05"` doesn't exist. Tapping throws
"Unknown scene id" and the player is stuck (Back still works). Needs story text.

### P2 — Minigame art missing → 404s (verified 2026-10-17)
DEFAULTS in `dragonAttack.js` point to `background.png`, `dragon_{roza,emma,anna}.png`,
`flame_roza.png`, `flash_emma.png`, `arrow_anna.png` — none exist. Each 404s and
falls back to a vector placeholder. Add the art or set those defaults to `null`.

### P2 — `beaver_battle_win` loops to the start (verified 2026-10-17)
It goes `next` → `forest_flight_01` with the old back-history intact. Either
continue the story or make it an ending (D18). (`flooded_town` is now an ending.)

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
(On `end` scenes the hint is right: the tap opens the end card.)

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

### P2 — Music change stopped the new track (suspected, read from code) — fixed 2026-10-28
`AudioManager.playMusic` stopped `this.currentTrack` when the old track's fade ended,
by which time that was the new track; the old one looped on at volume 0. Never hit,
because there is no music yet. Fix: stop the captured previous track.

### P3 — Nastavení page was empty — fixed 2026-10-28
Now has music volume and autoread (D19).

### P1 — Not playable on phones (user-reported 2026-10-17) — fixed 2026-10-17 in `8de3d9f`, verified live
`mobile.mjs live` passes on all five viewports (D11). Chrome emulation only, never
a real phone: real Android rotation-on-lock, re-entering fullscreen after a back
gesture and the iPhone home-screen manifest path are untested.
Was: dialogue covered the background, choices ran off-screen or under the top
controls, characters hidden behind the panel, portrait a thin strip, minigame
beavers stacked on narrow screens and the dragon flew behind the HUD.
Fix: short-landscape layout (D14), rotate hint + fullscreen + landscape lock
(D12, D13, D16), minigame scaled by screen height (D15).

### P2 — Overlapping scene renders — fixed 2026-10-17 in `8de3d9f`, verified live
Two async `VisualRenderer.render()` calls (fast advance, or a resize mid-load —
e.g. the phone fullscreen tap) both added their sprites → ghost character.
Fix: render token (D17).

### P2 — Beaver sprite sheets had a baked checkerboard — fixed 2026-10-17
`beaver1..7.png` were RGB with the checkerboard painted in, so beavers showed in
grey boxes. Ran `node scripts/removeCheckerboard.mjs public/assets/minigames/dragon-attack`
(now RGBA, ~81% transparent). Faint motion lines next to the scurry frames got thinner.

### P0 — Deploy broken; live site two commits old — fixed 2026-10-17 in `d498b26`
`50cf1d8` imported the uncommitted `src/engine/minigames/`, so its CI run failed
and the live site kept serving `cfaac4a`. `d498b26` committed the minigame code,
the beaver sheets and the lunch/flood backgrounds. CI passed and the live site serves them.
