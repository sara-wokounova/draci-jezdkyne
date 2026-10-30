# Known issues

Severity: **P0** broken for everyone · **P1** blocks play on some setups · **P2** visible bug · **P3** polish.
"Verified" = confirmed by running/inspecting; "suspected" = read from code, not reproduced.

## Open

### P2 — Minigame starts seconds after its HUD appears (verified 2026-10-17)
Scene preload (D8) only covers backgrounds and characters, so the minigame loads the 7
beaver sheets (~12 MB) after its HUD shows. On the live site the HUD showed over an empty
lane for ~2–4 s on a fast connection; on phone data it will be much longer, and taps do
nothing until then. Not a regression. Since D23 everything loads in parallel (`Promise.all`)
instead of one sheet after another, which cuts the wait on a fast connection but not on one
limited by bandwidth (same bytes). Since D25 battle.mp3 also downloads at that moment (music
starts before the render, D21): ~3 MiB in Chrome (it buffers that far ahead), the whole 4.8 MB
in Firefox, about +25–40 % to the first flight on a slow link. A resumed battle (D26) buffers at
its position first (a range request): in Chrome on a slow link ~3–4 s instead of ~1 s. Rest of the fix: preload the
sheets from the scenes before `beaver_battle`, and/or shrink them (see "Heavy assets").

### P2 — Beaver frames show bits of their neighbours (user-reported 2026-10-29, verified)
The beaver sheets are cut on a fixed 6×2 grid, but the art isn't on that grid: the carried logs cross the cell
borders (`beaver1.png`: frame 1's log reaches into frame 2's cell, the falling log of hit frame 7 into the log
frame 8), so a frame shows a sliver of the previous or next beaver or log, and a frame's own log end is cut off at
the border. Most visible on the log left lying on the ground: about half of the falling log shows beside it. Fix: cut each frame by its own connected pixels, as `packFrames.mjs` does for Róza (D23), keeping the
beavers' placement; to be planned after Anna's art.

### P1 — Persuade branch crashes at `dam_with_beavers_persuade_04` (verified 2026-10-17)
`next: "dam_with_beavers_persuade_05"` doesn't exist. Tapping throws
"Unknown scene id" and the player is stuck (Back still works). Needs story text.

### P2 — Minigame art missing → 404s (verified 2026-10-17; partly fixed 2026-10-28)
DEFAULTS in `dragonAttack.js` pointed to `background.png`, `dragon_{roza,emma,anna}.png`,
`flame_roza.png`, `flash_emma.png`, `arrow_anna.png` — none exist. Since D23 Róza has her
animated art, and the dragon/shot sprite paths are `null` (Emma and Anna stay vector
placeholders, no requests). Still open: `background.png` 404s on every minigame start (the
scene's dam background stays behind the game). Add the art or set it to `null`.

### P2 — The fight branch's victory has no way on (verified 2026-10-28)
`beaver_battle_win` → `beaver_after_battle_win_01` … `_07` (being written by Sára), and
`_07` → `_06` → `_07` loops forever (with autoread on it ping-pongs by itself). Until
2026-10-28 it looped back to `forest_flight_01` instead. Needs story text, or an ending (D18).

### P3 — Engine UI is English, story is Czech
`index.html` has `lang="en"` and title "Visual Novel Starter"; the "← Back" button
(the menu, Menu and Nová hra are Czech since D27); hint "Click, tap, Space, or Enter to continue"; save status shows
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

### P3 — Fast shots can pass through a beaver at very low frame rates (found by review 2026-10-28)
The hit test runs once per tick. At Pixi's capped 100 ms tick (about 10 fps, or a tab coming
back) Róza's fireball moves 70–80 px per tick, more than the 60 px hit reach (22 + 38), so it
can skip over a beaver. Not a regression; matters only on very slow devices. Fix if needed:
test the segment travelled in the tick, or sub-step fast shots.

### P3 — Minigame instructions pill covers the beavers' feet on short screens (verified 2026-10-17)
At 640x360 and 844x390 the bottom `.mg-instructions` pill overlaps the lower part of
the beaver lane (`laneY` 0.84). Visual only. Could hide the pill after the first
attack, or raise `laneY` on short screens.

### P2 — Checkerboard between hair strands in the character sprites (verified 2026-10-28)
The 18 character poses show grey checkerboard in enclosed gaps: between loose hair strands
(clearest on Anna), around Emma's braids and Róza's ponytail, and in some arm gaps. The
cleaner only erases checker connected to the image edge. The `--enclosed` pass (D23, made for
Róza's minigame art) removes exactly these gaps on the characters (diff maps checked). It is
not safe on the beaver sheets, where it also erases eye whites. Fix: re-clean the
characters from their committed versions with `--force --enclosed` (they already have
transparency, so the cleaner skips them without `--force`), then check faces.

### P3 — `npm audit`: advisories in dev dependencies (found by review 2026-10-28)
`npm audit` reports high advisories in the dev toolchain (vite 7.3.5's dev server and
launch-editor, esbuild, postcss, nanoid, source-map-js) and in `@xmldom/xmldom` (pulled in by
pixi.js, not in the browser bundle). Not caused by recent changes; `package.json` is untouched.
Run `npm audit fix` and re-test some time. If it moves Howler (package.json allows ^2.2.3): `sfx.js` and
`audioManager.js` rely on Howler 2.2.4 internals (D29), so rerun minigame-roza.mjs 29d, 29e, 29h and robustness.mjs
"sample:" and "sliders:".

### P3 — HTML5 audio artefacts (2026-10-28)
Each track has a gap where it loops (HTML5 audio loops aren't gapless): ~60–90 ms in Chrome,
~0.4–0.6 s in Firefox, which restarts slowly after Howler's loop seek (measured 2026-10-29, all
tracks; once per loop, so once per 5 min for battle.mp3), and
Howler logs "HTML5 Audio pool exhausted" once at startup. Both come from streaming
(D21). Gapless loops would need Web Audio (full download + decode).

### P3 — A resumed battle start on iPhone is unverified (2026-10-29)
D26 seeks the battle track before its first `play()`. Whether iOS Safari fires the second
`canplaythrough` on a paused element after such a seek is not checked on a real device: if not,
a resumed battle could stay silent there until the next scene.

### P3 — A battle left while its resumed start buffers leaves a Howler listener on the element (found by review 2026-10-29)
When the stored position is past what Chrome first buffered (above ~190 s), the resumed `play()`
waits for `canplaythrough` with its own listener. Leaving the minigame in that window (3–4 s on a
slow link) unloads the track, but Howler keeps that listener, and its pool hands the same `<audio>`
element to the next track (forest_ground): the listener seeks it to ~175 s and plays it at volume 0
before forest_ground's own start from 0:00. The end state is right (forest_ground alone, from the
start); two extra range requests. On iPhone, which ignores the volume, a short blip is possible
(unverified). A fix would reach into Howler internals (`node._unlocked = false` before unloading a
track still `loading`, so the element isn't pooled).

### P3 — Music resume: three rare rough edges (found by review 2026-10-29)
All in D26's Consequences, none silent: a resume in the last ~0.65 s of battle.mp3 (~0.2 % of retries)
jumps in volume at the loop point; a switch during Howler's own loop restart keeps the older position; a
listed track revived inside its fade-out right after a new game keeps the old game's position (no story
path is that fast). Fixes would reach into Howler internals.

### P3 — A save left on an ending shows that ending behind the menu (D27, 2026-10-29)
The startup menu draws the saved scene behind it. On an ending save (tab closed before the end card)
Pokračovat is disabled, yet the ending's picture is behind the menu, and Nová hra starts somewhere else.
Cosmetic. Fix if it matters: draw the story's start behind the menu when the save is on an ending.

### P3 — Music volume does nothing on iPhone (2026-10-28)
Music streams as HTML5 audio (D21), and iOS ignores its volume, so neither the music
slider nor the fades work there. Since D29 the files themselves are 9 dB quieter, so the music
sits 2.6–3.6 dB under the minigame's effects there too (the effects slider works: Web Audio).
Fix if it matters: Web Audio (`html5: false`) for iOS only, at the cost of full download + decode.

### P3 — Sound effects not tried on a real phone (D29, 2026-10-29)
Checked in Chrome, Firefox (autoplay allowed: an automated Firefox can't give the real first input) and headed
Chrome with the real autoplay rule, never on a device; also to try: the effects in Firefox with its default
autoplay policy. To try on an iPhone and an Android phone: the effects play at all (Web Audio after the first tap); the iPhone's silent
switch (iOS may silence Web Audio while the HTML5 music keeps playing); a phone locked mid-round and
unlocked (Howler mutes on hide, D22; the context may come back suspended until the next tap); the first
shot of a round started after 30 s of quiet (start() resumes the context); after a system interruption
mid-round, the canvas pointerup and keys resume it (that first shot is silent, D29); the music keeps playing while
Howler suspends the AudioContext 30 s after the last effect and when the next round or the effects slider resumes
it (iOS's audio session, never seen on a device).

### P3 — Mashing Bezzubka's shot on a phone clips for a moment (D29, 2026-10-29)
A new shot as soon as the last one hit (0.45 s apart at 844×390) stacks shot, hit, cry and log to about +0.5 dBFS at
the default effects level: a few samples clip. Accepted as cosmetic in D29's Consequences (Sára's equal mix); a
1280×720 window stays at −0.6. The beaver-frames plan's safety limiter takes it away.

### P3 — Flights take longer on taller windows (2026-10-29)
The world only scales down (D15), so on a window taller than 600 px the lane is further away: Bezzubka's
fireball needs 0.37 s from launch to a hit at 844×390, 0.5 at 1280×720, 0.9 at 1920×1080 and 1.7 at
3840×2160 (measured). With sound (D29) the gap between the shot and the hit is audible there. Sára once
saw "several seconds" in Firefox: not reproduced at 60 fps (a tall window or a low frame rate would explain
it). Fix if it matters: scale the world up too, or cap the lane distance.

### P3 — A track switched away while it is starting isn't faded out (found by review 2026-10-28)
If the scene changes while the new track's `play()` is still starting (Howler's play lock,
usually well under 200 ms), its fade-out is queued behind the lock and Howler never runs it.
It stays at volume 0 (its fade-in only starts on `play`, and not for a replaced track) and is
unloaded by the timer ~400 ms later (D22), so nothing is heard, except on iPhone, which ignores
the volume: there it can sound for up to ~400 ms. Check that it stays silent elsewhere:
`music-race.mjs` "switch while starting".

## Fixed

### P2 — Back or Restart during a minigame scene's render ran the minigame over another scene (found by review 2026-10-29) — fixed 2026-10-29 in `2beba7f`, verified live
Pressed while `beaver_battle` was still drawing (its background slow to load), they left the scene, but the
stale `showScene` still started the minigame once its render resolved: the HUD ran over the start scene (R) or
`dam_with_beavers_fight` (Back), and its result jumped back into the dam branch. Since minigames (D9).
Fix: a minigame scene starts its minigame without awaiting its render (D27), and R is gone. Check: `menu.mjs`
"minigame: starts at once".

### P3 — Battle music started over on every attempt (2026-10-29) — fixed 2026-10-29 in `2beba7f`, verified live
A round lasts ~80 s, battle.mp3 299 s (D25), so battle_02 (from 2:26) was practically never heard.
Fix: a retry continues where the last attempt stopped (D26). Checks: `robustness.mjs` resume.

### P2 — Minigame: beavers in the top-left corner, Róza a red stick (user-reported 2026-10-28, Firefox) — fixed 2026-10-28 in `d54e35a`, verified live 2026-10-29
Was: while the beaver sheets loaded (seconds, longer in Firefox) each beaver sprite sat at
(0, 0) until the game's first tick; Róza's dragon was the vector placeholder (no art yet).
Fix (D23): one parallel load before anything is added, beavers placed in their lane when
created; Róza animated from her art. Also: firing rules per dragon (Róza and Emma again as
soon as their shot is gone, Anna up to 3 arrows), a skip during loading no longer carries on
and re-adds input listeners, and the round end removes every shot, impact and half-played
attack (a throw there used to stop the ticker). Checks: `minigame-roza.mjs`,
`ff/ff-minigame.mjs`, `as-test/sprites.test.mjs`.

### P1 — No music in Firefox on the menu (and village saves) (found by review 2026-10-28) — fixed 2026-10-28 in `757f054`, verified live
Firefox let the menu track start at volume 0, then paused it once the fade-in raised the
volume, and Howler never noticed. Reproduced in a real Firefox with the default autoplay
policy (`C:\tmp\claude\mobile-check\ff-autoplay.mjs`). Fix: no track before the first input (D22).

### P1 — Menu and resumed village track played at volume 0 (found by review 2026-10-28) — fixed 2026-10-28 in `757f054`, verified live
The first fix for the entry above started the waiting track after the first input, but
called `fade()` right after `play()`. On a track that is already loaded, Howler queues
that fade behind its play lock and never runs it. Fix: fade in on Howler's `play` event
(D22). The tests now check that the volume is above 0, not just `playing()`.

### P2 — Music kept playing on a hidden page (found by review 2026-10-28) — fixed 2026-10-28 in `757f054`, verified live
A locked tablet or a switched app kept the track looping, and a pause during a loading
or starting track was lost (Howler queues it), leaving the scene silent on return or
playing twice. Fix: mute + pause while hidden, resume only a stopped track (D22).
Checks: `robustness.mjs` (hidden page, while loading, while starting, due while hidden).
The first version of that fix muted Howler on hide, which left `<audio>` elements muted in
Howler's pool after an unload while hidden, so later tracks played silently (found by
review): every new track now re-applies the mute state. Check: `robustness.mjs` muted pool.
Also fixed: a quick Back to a track still fading out started a second copy over it
(`music-race.mjs` quick Back), and a dropped menu track could stream on unseen at volume 0
(`robustness.mjs` dropped menu track). Last (found by review): a hide and show both inside a new
track's play lock left it paused, because the hide's queued `pause()` ran after it started; it
is now played again after its `play` event (`robustness.mjs` hide and show while starting).

### P2 — Replaced track kept looping silently (found by review 2026-10-28) — fixed 2026-10-28 in `757f054`, verified live
If the track changed while the new one's fade-in was still at 0, the old one never
unloaded (Howler doesn't fire `fade` for 0 → 0). On iPhone, which ignores the volume,
two tracks would be audible. It was introduced by the "Music change stopped the new
track" fix below. Fix: unload on a timer (D22). Check: `music-race.mjs`.

### P1 — Black backgrounds and stick figures after the first scene (user-reported 2026-10-28) — fixed 2026-10-28 in `352cb30`, verified live with `757f054` (failed loads incl. the non-preloaded `lunch_in_town`)
Seen in Firefox on the dev server after `7bb96de`. Never reproduced with the server
running in Chrome or Firefox. It was reproduced exactly by failing every image request
after the page had loaded: the menu, the first background and the end card worked,
characters became placeholders, and backgrounds went black because a failed background
made `render()` reject. The likely trigger was the dev server behind the open tab
having stopped, since nothing was listening on 5173 right after the report. `7bb96de`
made it more likely by no longer preloading at startup.
Fix: generated-background fallback and the menu preload (D20). The trigger (a stopped
server) is inferred and was never confirmed on Sára's machine. If that's what it was,
the same situation now shows the generated forest and placeholders instead of black;
restarting `npm run dev` and reloading is the real cure.

### P2 — Music change stopped the new track (suspected, read from code) — fixed 2026-10-28
`AudioManager.playMusic` stopped `this.currentTrack` when the old track's fade ended,
by which time that was the new track; the old one looped on at volume 0. Never hit:
there was no music when it was fixed. Fix: stop the captured previous track. That fix still
waited for Howler's `fade` event, which caused "Replaced track kept looping silently" above.

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
