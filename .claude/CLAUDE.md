# Dračí jezdkyně — project guide

Czech-language visual novel for kids about three dragon riders (Róza, Emma, Anna).
Plain JavaScript + Vite, rendered with PixiJS, deployed to GitHub Pages.

- Live: https://sara-wokounova.github.io/draci-jezdkyne/
- Repo: `git@github.com:sara-wokounova/draci-jezdkyne.git`, branch `main`
- Status: early development. Story is partially written; one minigame exists.

More docs in this directory (keep them current):

- @story.md — characters, scene graph, writing status
- @decisions.md — decision log (why things are the way they are)
- @issues.md — known issues / backlog
- @workflow.md — **required process for every new feature**: plan → disprover loop →
  Sára confirms → implement with tests → review panel loop

## Working rules

- **Record decisions.** Any non-obvious choice (library, layout approach, story
  structure, asset format, scope cut) gets an entry in `decisions.md`. Append;
  never rewrite old entries — supersede them with a new one.
- **Track issues.** Found a bug you aren't fixing now → add it to `issues.md`.
  Fixed one → move it to the Fixed section with the date.
- Story text is **Czech**. Keep UI strings Czech too (see issues: engine UI is still English).
- Don't commit or push unless asked. A push to `main` deploys to production.
- Commit messages are in the past tense, starting with the verb: "Added a new scene with fire ants." (D28).
- Temp files go in `C:\tmp\claude`, not the OS temp dir.

## Commands

```bash
npm install
npm run dev            # Vite dev server (the play-test page: /playtest.html)
npm run build          # production build into dist/ (CI runs this)
npm run preview        # serve dist/
npm run clean-sprites  # strip baked checkerboard from character PNGs (in place; skips already-transparent files)
npm test               # the node checks in tests/ (story rules, the save, the story files); CI runs them before every deploy
```

`npm test` (D38) runs `tests/storyflow.test.mjs`, `tests/autosave.test.mjs`, `tests/story.test.mjs` and
`tests/story-history.test.mjs` (needs git; its synthetic repos live in the system temp folder, or `STORY_TEST_TMP`: run it
locally as `STORY_TEST_TMP=C:/tmp/claude/story-test-tmp npm test` in Git Bash (forward slashes: bash eats backslashes),
`$env:STORY_TEST_TMP='C:\tmp\claude\story-test-tmp'; npm test` in PowerShell, the temp-folder rule); a failure stops the deploy. No linter. The Playwright check scripts (and the node checks for the sprite scripts, the music and the
sound-effect files, which need ffmpeg) live outside the repo (see the Tests section of workflow.md). Also verify changes by running the game
(`npm run dev`) in a browser, including a phone-sized viewport.

## Architecture

```
index.html                 DOM shell: #pixi-host canvas, #top-controls (← Back, Menu), #dialogue-panel, #choice-panel,
                           #end-card, #main-menu (main page: Pokračovat / Nová hra / Nastavení / Galerie; pages:
                           Nová hra confirmation, Nastavení, Galerie);
                           #rotate-hint (portrait phones, outside #game-root); links public/manifest.webmanifest
playtest.html              the play-test page (D33): #pixi-host, the slider panel #pt-panel, #rotate-hint; no manifest
playtest/index.html        …/playtest/ (the address handed out): a redirect to ../playtest.html keeping the query
src/main.js                wires DOM elements → startVisualNovel()
src/playtest.js            the play-test page: 15 sliders (beavers, goal, flights, each dragon's speeds, Anna's thorn),
                           the URL as its only state (+ field=WxH in the copied link), one round per "Hrát", the panel
                           inert 500 ms after it; the game's saved volumes read, never written; window.__vn (the test
                           hook, as in the game)
src/engine/
  startVisualNovel.js      game loop: the position (scene, line, memory); showPosition / move / advance / goBack /
                           runMinigame (passes the difficulty); location choices (pickEvent, D37); the menu
                           (Pokračovat, Nová hra, Menu, Esc; the session rule, D27); the 500 ms story guard after the menu
                           closes or a minigame ends (storyPausedAt, D27, D33)
  storyFlow.js             the story's rules, pure (D37): parts merged, scenes normalised (lines), memory and conditions,
                           the order after a scene's lines, resolveEntry (pass-throughs), locations (availableEvents,
                           pickEvent), placeSave / migrateOldSave, preload's walk (reachableWithin), the load-time lint
  storyRepository.js       fetches story-v2.json and its parts (no-cache), merges, normalises, lints, checks the start
  autoSave.js              localStorage `vn:<id>:autosave2`: position (scene, line, memory), back-history with memory,
                           readSceneIds, endings, settings (musicVolume, effectsVolume, autoRead, difficulty: 'easy' |
                           'normal' | 'hard', D33); the old `…:autosave` save migrated once (migrateIfNeeded), never
                           written; readSettings (the play-test page, read only)
  uiController.js          DOM dialogue text, speaker name, choice buttons (the corner panel, or centred with 3+ or
                           choiceLayout "center", D37), end card, main menu (pages, focus, Nastavení incl. the minigame
                           difficulty) + gallery; choiceGuard (every choice waits 500 ms of quiet, D37); guardTaps (Ano's
                           tap guard, also the minigame result's and "Zpět na začátek", with keys: D27, D33, D37),
                           TAP_GUARD_MS; --dialogue-top (measured for the centred panel)
  inputController.js       click/tap anywhere = advance; keys: Space/Enter, 1-9, Backspace/←, Esc (menu); Space/Enter
                           left to a focused button in the menu, end card or minigame result; number keys behind the
                           choice guard (D37); a key held from a button
                           never repeats into the story (D33); fullscreenOnTap (D16, also the play-test page)
  visualRenderer.js        Pixi: background (contain-fit), character sprites (scale, raise, numeric positions, flip, the
                           top cap: D37), placeholders, preload(items)
  assetPath.js             resolveAssetPath (story paths → base URL) and backgroundImage (which backgrounds are files)
  pixiStage.js             Pixi Application + layers: background, characters, effects, minigame, overlay
  audioManager.js          Howler music per scene + menu (HTML5 streaming; same key continues, none = silence;
                           nothing starts before the page's first click/tap/key, D22; keys in resumeMusic
                           continue where they were left, D26); the music slider sets the track's own volume (D29)
  sfx.js                   sound effects (D29): one Web Audio Howl per file for the page, played only when loaded
                           with the AudioContext running (never late, never thrown); the effects slider and its
                           test sound; resumeAudio; no auto-suspend during a round (keepAudioAwake); the effects'
                           safety limiter (a soft clipper after Howler's master gain, ceiling −3.2 dBFS, D31)
  effects/atmosphereEffects.js   sunsetGlow, wind, snow
  minigames/
    minigameManager.js     registry; run(spec, { difficulty }) → 'victory' | 'failure' (a throwing game → 'failure', D24;
                           a throwing clean-up can't leave the HUD up, D27)
    minigameHud.js         DOM overlay: title, score, skip menu, result dialog (Czech labels; the hits line; its
                           Pokračovat behind guardTaps; the top bar hidden under it, D33)
    dragonAttack.js        the "Dračí nálet na bobry" minigame (all tunables in DEFAULTS, exported for the play-test page;
                           safety caps beside it, D24): 30 beavers in one line walking in from the left, coming round
                           again, faster with every hit, their logs fading; all dragons from the right; win by the share
                           hit when the flights run out (winPercent by difficulty, D33); Róza,
                           Emma and Anna animated from strips (D23, D32, D30), firing rules per dragon (maxShots, refireAfter); sounds: each dragon's
                           shot and hit, the beaver's cry and log, each file once per tick (D29); the beavers' padded
                           sheets, the hit 7 → 6 with the log landing after frame 7, the hint pill hidden after the
                           first attack (D31)
src/styles/main.css        all styling (DOM UI is absolutely positioned over the canvas)
src/styles/playtest.css    the play-test panel (over main.css)
vite.config.js             base './'; three build inputs: index.html, playtest.html, playtest/index.html (D33)
public/story/story-v2.json the story's main file (fetched at runtime, not bundled) and its parts beside it (D37);
                           public/story/story.json is the old story, frozen for cached old tabs (never edited)
tests/                     the node checks (npm test, D38)
public/assets/             backgrounds/, characters/<id>/<id>_<pose>.png, minigames/dragon-attack/,
                           minigames/dragon-attack/sfx/ (the effects, mp3, ≤ 15 KB each), music/ (mp3, ~3.6–4.8 MB
                           each, streamed)
scripts/removeCheckerboard.mjs   flood-fills light-gray checkerboard to alpha (--enclosed, --glow, --force); --black keys a sheet
                                 painted on black (D30)
scripts/packFrames.mjs           scattered sheet frames → one-row strip, anchored (eye / white-hot core / a shot's tip);
                                 or a frames list of separate pictures (`*.frames.json`, resampled by their scales, D32)
scripts/build-music.sh           the deployed music from art/music/ (9 dB quieter, D29)
scripts/build-sfx.sh             the minigame's sound effects from art/minigames/dragon-attack/sfx/ (D29)
scripts/cleanBeavers.mjs         the beaver sheets cut by their own pieces into padded cells (D31; no arguments)
scripts/reexportCreatures.mjs    a creature's poses on one canvas (D37): node scripts/reexportCreatures.mjs <id>…; reads art/
                                 only, writes public/assets/characters/<id>/ (every pose of the creature together)
scripts/measureEmmaAnchors.mjs   prints Emma's attack anchors, found from her face in each attack frame (D32; no arguments)
art/                             source art kept in git but not deployed (originals of the packed strips, Emma's flight
                                 poses and their frames list, the beaver sheets, the music and the sound effects)
.github/workflows/deploy.yml     push to main → npm ci → npm test → build → GitHub Pages
```

Startup opens `#main-menu` (`openMenu`): queues `menuMusic` (it starts on the page's first
click, tap or key, D22), draws the saved scene behind
the menu (visuals only, no minigame) and preloads ahead of it (D20). Pokračovat (enabled when there is a
game to continue) and Nová hra call `showPosition` (D27); the Menu button and Esc open the menu from the game.
While the menu is open (`menuOpen`) all story input is ignored, like during a minigame, and for 500 ms
after it closes or a minigame ends (D33).
With autoread on (Nastavení), `showPosition` ends by scheduling `advance()` per line (D19).
Flow: a tap shows the next visible line; after the last line, a move (`move`: `resolveEntry` first, a dead end
changes nothing) pushes the position into the history and lands. `showPosition()` → save (only on a move or Back) →
DOM text/choices → music (deliberately before the render's await, D21) → if `scene.minigame`, run it at once (its
render goes on behind it, unawaited, D27) and move to `onVictory`/`onFailure`; else await `visuals.render(scene,
stage)` (clears layers, draws background, the stage at the line, effects) and preload the positions within 3 taps.
Pokračovat, a reload and a resize show the position again without changing anything.
`window.__vn` (stage, minigames, audio, sceneId, line, memory, characters) is the check scripts' test hook and ships to the live
site (D11 runs the checks there). It hands out live objects: put nothing on it you wouldn't show in the console.

The UI is two stacked systems: Pixi canvas fills the screen; DOM panels float
on top with CSS. Layout bugs are almost always in `main.css`; scene-fit bugs in
`visualRenderer.js` (`contain`, `positionFor`, `scaleCharacter`).

## Story format (`public/story/story-v2.json` and its parts, D37)

```jsonc
// story-v2.json: everything but the scenes, and the list of parts (files beside it in public/story/)
{
  "id": "draci-jezdkyne-z-vlpu",          // also the localStorage key: vn:<id>:autosave2
  "start": "forest_flight_01",
  "menuMusic": "village_day",             // music key for the main menu
  "resumeMusic": ["battle"],              // music keys that continue where they were left (D26)
  "assets": { "music": { "village_day": "assets/music/village_day.mp3" } },
  "characters": {
    "roza": { "displayName": "Róza", "color": "#d6462f", "hair": "#eac470", "sprites": { "neutral": "...", "happy": "..." } },
    "jezevec": { "displayName": "Jezevec", "scale": 0.35, "raise": 0.35, "sprites": { "neutral": "..." } }
  },                                      // scale: rider heights tall; raise: feet that many rider heights higher
  "movedScenes": { "first_choice": { "scene": "forest_flight_01", "line": 5 } },  // old ids → where saves go on
  "parts": ["act1.json", "act2a-den1.json", "act2a-den2.json", "act2a-den3.json"]
}
// a part: { "scenes": [ … ] }; a location part also { "location": { "id": "hory", "events": [
//   { "scene": "hory_doupe_01", "if": "vedma_doupe", "first": true }, { "scene": "hory_zubr_01" } ] } }  ("name" only to keep an old one)
{
  "id": "scene_id",                       // one background, its lines until a choice, another scene or a minigame
  "background": { "type": "image", "src": "assets/backgrounds/x.png" },  // or {type:"generated", preset}
  "effects": ["wind", "snow", "sunsetGlow"],
  "music": "village_day",                 // same key = keeps playing; omitted = silence; unknown key = warning + silence
  "characters": [{ "id": "roza", "position": "left|center|right|0.3" /* a number 0.2–0.8 */, "pose": "talking", "alpha": 1, "flip": true }],
  "set": ["vejce"], "add": { "pul": 1 },  // applied when the scene is entered by a move
  "lines": [
    { "speaker": "roza", "text": "…" },   // speaker: character id or a literal name ("Velký bobr"); none = narrator
    { "text": "…", "characters": [], "if": "bobri_pratele" }   // characters: the whole stage from here on
  ],
  "choices": [{ "text": "…", "next": "id", "if": "!vejce", "set": [], "add": {} },
              { "text": "Do hor", "location": "hory" }],       // a location: the engine picks an available event
  "choiceLayout": "center",               // the choices as a big centred panel (automatic with 3 or more)
  "next": "other_scene",                  // or a list: [{ "if": "pul>=6", "next": "evening" }, { "next": "hub" }]
  "minigame": { "type": "dragonAttack", "title": "…", "allowSkip": true,
                "onVictory": "id", "onFailure": "id", "config": {} },   // a scene of its own, no lines
  "end": { "good": false, "title": "…", "text": "…" }
}
```

Rules: asset paths are relative (`assets/...`, never `/assets/...`) — required for the GitHub Pages sub-path. The
memory is names → whole numbers (`set` = at least 1, `add` = raise, never below 0); a condition is `name`,
`!name`, `name>=N`, `name<N`, or a list that must all hold. After a scene's last visible line: its visible
choices, else `next`, else `end` (the next tap opens the end card, or by itself 500 ms after the move for an ending with no line
before it: KONEC, "Dobrý/Špatný konec: title", `text`,
"Zpět na začátek" → reset to `start` + main menu), else a dead end. `"lines": []` with a `next` is a pass-through.
Galerie lists the endings reached (their end card next; `endings` in the save), in story order. The minigame scene is
kept out of back-history. Back goes one line back with the memory as it was. Old scene ids live on in `movedScenes`.

Editing the story (D37): write in `story-v2.json` and its parts, never in the frozen `story.json`. `npm test` (CI runs
it before every deploy) checks most mistakes and its message says what to do; these it catches:
- a scene id that doesn't exist (also a scene in a file not listed in `parts`: "not a scene"), a malformed condition, a
  file missing from git;
- a renamed or removed scene without a `movedScenes` entry for its old id (every committed version counts, also one
  CI refused); a wholesale rewrite of an act points its old ids at the last line of the act before it (`act1_end`);
- locations: an event's scene entered other than by the location's pick; an event name (its `name`, else its scene
  id) that was committed and is gone (keep it as `"name"` when renaming or re-pointing; list a removed event as
  `{ "name": "…", "retired": true }`; a whole location removed keeps its file with every event retired); a give-up
  choice (`"giveUp": true`, the way a lost event is offered again) outside its event's scenes (one lose scene per
  event), leading back into the event (a retry, a "sure?" question), after a win or before trying, or on a location
  choice; `movedScenes` pointing into another event's scenes (point a removed event's ids at the earliest
  day hub it could be played from).

And these it can't catch:
- a scene with no visible choice, no `next` and no `end` (a forgotten `next`): a dead end where a tap does nothing
  (`act2a_end` is one on purpose until Act 2b); the lint warns only when conditions make a scene's way on vanish;
- inserting or deleting a line shifts saved positions on that scene (and its `movedScenes` lines): append lines, or
  edit a line's text, instead;
- splitting a scene in two (its later lines moved into a new scene): saves on the moved lines land on the old scene's
  last line, and `movedScenes` can't send them on (the old id still exists); split only where nobody is saved yet, or
  accept that those players replay a few lines;
- a day hub's last line stays short, ~40 characters (it is the phone panel's heading; the lint warns only over 80), and a
  hub whose choices can drop to two or fewer has `"choiceLayout": "center"` (three or more centre anyway);
- a retired event's scenes aren't reused by another event (its players would replay them);
- never amend, rebase or force-push the story files once pushed (a deployed commit would vanish from the history).

Good to know: conditions inside a scene see that scene's own changes (its `set`/`add` apply on entry).

## Assets

- Backgrounds: 1672×941 PNG (~16:9, ~3.3 MB each). Displayed contain-fit (letterboxed).
  Act 2a's nine (2026-11-15: `forest_path`, `badger_burrow`, `forest_herbs`, `forest_night_meadow`, `vedma_hut`,
  `forest_clearing`, `vily_meadow`, `tesak_lair`, `sacred_grove`) were made with Runway's GPT Image model (the style of
  Sára's ChatGPT originals; `forest_dragon_flight.png` as the style reference; prompts in her words: "manga water color
  style with wide brush, bright colours and warm light"); the full-size originals (2560×1440) are kept in
  `art/backgrounds/` (Sára: ready for reuse), the deployed files scaled with
  `ffmpeg -i art/backgrounds/X.png -vf scale=1672:941:flags=lanczos -pix_fmt rgb24 public/assets/backgrounds/X.png`.
- Characters: 1024×1536 RGBA PNG (~2 MB each), 6 poses for the riders; other characters only the poses their lines use
  (Sára; a missing pose falls back to `neutral`): Soňa 4, the vědma 3 (2026-11-15, Runway's GPT Image model with a
  transparent background, `emma_neutral.png` as the style reference, each other pose made from the neutral one;
  originals 1280×1920 in `art/characters/<id>/`, scaled with ffmpeg lanczos to 1024×1536, `-pix_fmt rgba`). The Act 2a
  creatures (jezevec, liska, srnce, srna, zubr, vila, hejkal; 1–2 poses each, any aspect ratio) from 1920×1280 /
  1920×1920 / 1280×1920 originals in `art/characters/<id>/`. The two-pose ones' deployed files (jezevec, zubr, vila, hejkal) are
  made by `node scripts/reexportCreatures.mjs <id>` (liska, srnce and srna are an older one-pose export: re-running the
  script redraws them slightly differently, so do it only when adding a pose) (D37: `scale` sizes the whole texture, so all of a creature's poses share
  one canvas, the body at one pixel scale and the feet on the bottom edge): each pose cropped to the figure, lined up on
  its alpha mass, one canvas and one factor per creature to fit 1536×1536. A new pose: put its original in `art/`, then
  re-run the script for that creature (never scale one pose on its own: `tests/story.test.mjs` checks only that the
  sizes are equal, not that the body matches). `liskova_rodina` (the fox family, its own size) is a copy of the old `liska_happy.png`.
- Beaver sheets: `beaver{n}_frames.png` (n = 1…7), 1326×544, a 6×2 grid of 221×272 cells padded 50 px a side
  (walk 0–5, hit 7 then 6, log 8, scurry 9–11), made by `node scripts/cleanBeavers.mjs` from
  `art/minigames/dragon-attack/beaver{n}.png` (1448×1086, already cleaned of their checkerboard on 2026-10-17, unlike
  the checkerboard sheets in `art/`; the raw ones are in git history, `d498b26`). The script cuts every frame by its own
  pieces (the art isn't on the grid), puts row 2 on the walkers' ground and frame 8's log under frame 7's falling log,
  and halves the result (D31). It stops, writing nothing, if a sheet doesn't have the 13 pieces it expects (new art:
  check it by eye and update its `PIECES` list) or a piece doesn't fit its padded cell.
- Music: `public/assets/music/*.mp3` (~3.6–4.8 MB each, streamed as HTML5 audio), referenced
  by key from `story.assets.music`; scenes pick a track with `music`, the menu with
  `menuMusic` (D21, D22). Every deployed track is made from its original in `art/music/`, **9 dB quieter**
  (D29: the effects must be heard over it, also on iPhone, where HTML5 music ignores every volume), at the
  original's bit rate; `battle.mp3` (the minigame) is the two songs joined and re-encoded at 128 kbps (D25).
  Made by `bash scripts/build-music.sh` (the committed files with ffmpeg 8.1; another build makes the same audio but
  not the same bytes). The originals keep their C2PA provenance metadata (AI-generated content); the deployed files
  lose it, and `-vn -map_metadata -1` keep a future song's cover art and text tags out of them. Act 2a's seven tracks (D36: `vedma_hut`, `night_forest`, `vily_magic`,
  `playful`, `tesak_lair`, `sacred_grove`, `danger`) were made with Runway's music tool (AI-generated, 192 kbps,
  −14.3 dB mean like the older originals) in early-medieval Slavic folk style (Sára: flutes, cimbalom, no piano, simple
  melodies, no lyrics; the víly and the grove with wordless voices); their style is in D36. A new track: put the
  original in `art/music/` and add its line to the script (its own bit rate, from `ffprobe`).
- Sound effects (D29): `public/assets/minigames/dragon-attack/sfx/*.mp3`, made from Sára's picks in
  `art/minigames/dragon-attack/sfx/` (Runway's sound-effect tool, AI-generated), mono, levelled to an RMS
  target of −14 dBFS (the `volume` gain is measured beforehand on the trimmed clip; ffmpeg's limiter (`$L`) then
  takes the peaky clips lower: Anna's hit −16.9), peaks limited to −1 dBFS, the trailing
  silence trimmed, 96 kbps. Bezzubka's shot drops its 0.50–0.75 s pause (Sára's "a1"); the cry starts with 150 ms
  of silence (Sára's stagger after the hit). The log (`log_land.mp3`, −15.0) is only its thud, which the game plays
  when the log lands (D31): its creak is trimmed and its gain stays the 5.8 dB Sára heard (the recipe would give
  +2.0 dB). Made by `bash scripts/build-sfx.sh`.
  A new or replaced sound: measure its gain first (the script's chain up to `$T`, then `volumedetect`: gain =
  −14 − mean_volume), add its line, and keep a fixed stagger after the hit in its file (`adelay`), not in code; a
  sound tied to something the game draws (the log landing) is played by the game at that moment instead. Renaming `fireball_hit.mp3`: it is
  also Nastavení's test sound (`TEST_SOUND_SRC` in `sfx.js`). Every effect plays at 0.7
  (`EFFECT_MIX`) × the effects slider; set per sound in the minigame config (README).
- The dragons' minigame strips (`public/assets/minigames/dragon-attack/roza_{fly,attack,fireball}.png`,
  `emma_{fly,attack,bolt}.png`, `anna_{fly,attack,thorn}.png`) are generated from the originals in
  `art/minigames/dragon-attack/` (D23, D32, D30), one file at a time (Emma's and Anna's sheets are already transparent and
  are packed straight from `art/`, except Anna's attack sheet, painted on black; Emma's fly strip comes from a frames
  list of five pictures):
  ```
  cp art/minigames/dragon-attack/roza_move.png <tmp>/ && node scripts/removeCheckerboard.mjs <tmp>/roza_move.png --enclosed
  node scripts/packFrames.mjs <tmp>/roza_move.png public/assets/minigames/dragon-attack/roza_fly.png art/minigames/dragon-attack/roza_move.anchors.json
  cp art/minigames/dragon-attack/roze_attack.png <tmp>/ && node scripts/removeCheckerboard.mjs <tmp>/roze_attack.png --enclosed
  node scripts/packFrames.mjs <tmp>/roze_attack.png public/assets/minigames/dragon-attack/roza_attack.png art/minigames/dragon-attack/roze_attack.anchors.json
  cp art/minigames/dragon-attack/bezzubka_projektil.png <tmp>/ && node scripts/removeCheckerboard.mjs <tmp>/bezzubka_projektil.png --glow
  node scripts/packFrames.mjs <tmp>/bezzubka_projektil.png public/assets/minigames/dragon-attack/roza_fireball.png bright
  node scripts/packFrames.mjs art/minigames/dragon-attack/emma_fly.frames.json public/assets/minigames/dragon-attack/emma_fly.png
  node scripts/packFrames.mjs art/minigames/dragon-attack/emma_attack.png public/assets/minigames/dragon-attack/emma_attack.png art/minigames/dragon-attack/emma_attack.anchors.json
  node scripts/packFrames.mjs art/minigames/dragon-attack/beska_projektil.png public/assets/minigames/dragon-attack/emma_bolt.png art/minigames/dragon-attack/beska_projektil.anchors.json
  node scripts/packFrames.mjs art/minigames/dragon-attack/anna_move.png public/assets/minigames/dragon-attack/anna_fly.png art/minigames/dragon-attack/anna_move.anchors.json
  cp art/minigames/dragon-attack/anna_attack.png <tmp>/ && node scripts/removeCheckerboard.mjs <tmp>/anna_attack.png --black
  node scripts/packFrames.mjs <tmp>/anna_attack.png public/assets/minigames/dragon-attack/anna_attack.png art/minigames/dragon-attack/anna_attack.anchors.json
  node scripts/packFrames.mjs art/minigames/dragon-attack/borinoha_projektil.png public/assets/minigames/dragon-attack/anna_thorn.png art/minigames/dragon-attack/borinoha_projektil.anchors.json
  ```
  Róza rides Bezzubka; her fireball sheet was named `beska_projektil.png` until 2026-10-29 (D23 quotes that name).
  The `beska_projektil.png` in `art/` since then is another sheet: Emma's lightning (D32).
  Emma's five flight poses are separate pictures (`emma_flight_01`, `_03`, `_04` by Sára; `_02` and `_03b` made with
  Runway on her pick and committed untouched, so they keep their C2PA provenance; their prompts are in
  `emma_flight_runway.txt`), listed in `emma_fly.frames.json` with each pose's eye and scale: its registration scale
  against 03 × 0.67, so Emma is as big as in the attack sheet packed at factor 2 (D32; a new or re-exported pose: pack
  it with a guessed scale, and the sprite test's "emma" head check prints its scale against 03: divide the guess by
  it). `emma_flight.png` is not used
  (Sára: some frames show Emma over the wing). Emma's attack anchors aren't hand-measured eyes: Emma's face is found in
  each attack frame by NCC, and each anchor is the face + 03's face-to-eye offset × 1.34:
  `node scripts/measureEmmaAnchors.mjs > <tmp>/emma_attack.anchors.json`, then copy it into `art/` by hand. After a
  re-export of `emma_attack.png`, update the script's `GUESS` (Emma's face in each frame, source px, ±8) if the frames
  moved; it stops, printing nothing, when it can't find her face.
  `removeCheckerboard.mjs` and `packFrames.mjs` refuse to write into `art/` (the originals and their anchors stay
  untouched), also through a link or a UNC path; `packFrames.mjs` also refuses a link at the output and, on Windows, a
  stream name (`art:x.png`). `<tmp>` is a scratch folder: `anna_attack.png` has the same name as its packed strip in `public/`.
  `packFrames.mjs` prints the frame count, size and anchor that go into the dragon's `animation` config,
  and each frame's box around the anchor. All config px are strip px (the source downscaled by the
  packer's `factor`, default 2; a frames list by each picture's scale): `bodyWidth` = the `medianWidth` it prints for the
  fly strip; `launchPoint` = where the shot leaves on the `launchFrame` (Róza's mouth and Anna's tail tip on attack frame
  3, Emma's mouth on frame 4), measured from that frame's anchor in the source ÷ factor. An anchor is the point that lines
  up with the fly strip's anchor (the eye for Róza and Anna; for Emma's attack, where 03's eye sits relative to her). A
  shot's anchors file holds the point the shot is turned around (Anna's thorn and Emma's bolt: the tip; the bolt's spark
  and burst: their white-hot core).
- Source art arrives with a light-gray checkerboard baked in instead of
  transparency; run `scripts/removeCheckerboard.mjs <file.png|dir>` on a copy of it. It
  overwrites files in place and skips any PNG that already has transparency (a packed strip
  would turn into an opaque box; a cleaned sprite would just be rewritten), unless `--force`. `--enclosed`
  also erases checker showing through enclosed gaps (hair strands, wing gaps) but can take
  neutral grey-white art such as eye whites, so check eyes and teeth after it; `--glow` is
  for fire and light painted over the checker. `--black` is for a sheet painted on pure black instead (Anna's attack
  sheet, D30): near-black regions touching the edge, or enclosed and 600+ px, become transparent and smaller dark spots
  (pupils) stay, so dark art touching the frame edge would go too. It takes one opaque file (no folder, no sheet that
  already has transparency, even with `--force`) and can't be combined with the other two.
- Missing sprites never crash: the engine draws vector placeholders, and a background that
  fails to load gets a generated one (D20).

## Deployment

GitHub Actions on every push to `main` (Node 20). Vite `base: './'` makes the
build work under `/draci-jezdkyne/`. Only `main` deploys; `npm test` runs before the build, and a failing check or a
failed build leaves the previous deploy
live — check the Actions tab after pushing. Every file the code imports or
the story references must be committed, or CI breaks / assets 404.
