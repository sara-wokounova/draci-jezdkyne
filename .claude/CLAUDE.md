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
npm run dev            # Vite dev server
npm run build          # production build into dist/ (CI runs this)
npm run preview        # serve dist/
npm run clean-sprites  # strip baked checkerboard from character PNGs (in place; skips already-transparent files)
```

No unit tests in the repo and no linter. The Playwright check scripts (and node checks
for `AutoSave`, the sprite scripts, the music and the sound-effect files) live outside the repo (see the Tests section of workflow.md). Also verify changes by running the game
(`npm run dev`) in a browser, including a phone-sized viewport.

## Architecture

```
index.html                 DOM shell: #pixi-host canvas, #top-controls (← Back, Menu), #dialogue-panel, #choice-panel,
                           #end-card, #main-menu (main page: Pokračovat / Nová hra / Nastavení / Galerie; pages:
                           Nová hra confirmation, Nastavení, Galerie);
                           #rotate-hint (portrait phones, outside #game-root); links public/manifest.webmanifest
src/main.js                wires DOM elements → startVisualNovel()
src/engine/
  startVisualNovel.js      game loop: showScene / advance / goBack / runMinigame; the menu (Pokračovat, Nová hra,
                           Menu, Esc; the session rule and the 500 ms tap guard after it closes, D27)
  storyRepository.js       fetch + minimal validation of story.json, scene lookup
  autoSave.js              localStorage: current scene, back-history, readSceneIds, settings (musicVolume,
                           effectsVolume, autoRead)
  uiController.js          DOM dialogue text, speaker name, choice buttons, end card, main menu (pages, focus,
                           Ano's tap guard, TAP_GUARD_MS) + gallery
  inputController.js       click/tap anywhere = advance; keys: Space/Enter, 1-9, Backspace/←, Esc (menu)
  visualRenderer.js        Pixi: background (contain-fit), character sprites, placeholders, preload
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
    minigameManager.js     registry; run(spec) → 'victory' | 'failure' (a throwing game → 'failure', D24;
                           a throwing clean-up can't leave the HUD up, D27)
    minigameHud.js         DOM overlay: title, score, skip menu, result dialog (Czech labels)
    dragonAttack.js        the "Dračí nálet na bobry" minigame (all tunables in DEFAULTS, safety caps beside it, D24): Róza and
                           Anna animated from strips (D23, D30), firing rules per dragon (maxShots, refireAfter); sounds: each dragon's
                           shot and hit, the beaver's cry and log, each file once per tick (D29); the beavers' padded
                           sheets, the hit 7 → 6 with the log landing after frame 7, the hint pill hidden after the
                           first attack (D31)
src/styles/main.css        all styling (DOM UI is absolutely positioned over the canvas)
public/story/story.json    the whole story (fetched at runtime, not bundled)
public/assets/             backgrounds/, characters/<id>/<id>_<pose>.png, minigames/dragon-attack/,
                           minigames/dragon-attack/sfx/ (the effects, mp3, ≤ 15 KB each), music/ (mp3, ~3.6–4.8 MB
                           each, streamed)
scripts/removeCheckerboard.mjs   flood-fills light-gray checkerboard to alpha (--enclosed, --glow, --force); --black keys a sheet
                                 painted on black (D30)
scripts/packFrames.mjs           scattered sheet frames → one-row strip, anchored (eye / white-hot core / a shot's tip)
scripts/build-music.sh           the deployed music from art/music/ (9 dB quieter, D29)
scripts/build-sfx.sh             the minigame's sound effects from art/minigames/dragon-attack/sfx/ (D29)
scripts/cleanBeavers.mjs         the beaver sheets cut by their own pieces into padded cells (D31; no arguments)
art/                             source art kept in git but not deployed (originals of the packed strips, of the
                                 beaver sheets, of the music and of the sound effects)
.github/workflows/deploy.yml     push to main → npm ci → build → GitHub Pages
```

Startup opens `#main-menu` (`openMenu`): queues `menuMusic` (it starts on the page's first
click, tap or key, D22), draws the saved scene behind
the menu (visuals only, no minigame) and preloads ahead of it (D20). Pokračovat (enabled when there is a
game to continue) and Nová hra call `showScene` (D27); the Menu button and Esc open the menu from the game.
While the menu is open (`menuOpen`) all story input is ignored, like during a minigame, and for 500 ms
after it closes.
With autoread on (Nastavení), `showScene` ends by scheduling `advance()` (D19).
Flow: `showScene(scene)` → save to localStorage → DOM text/choices → music (deliberately
before the render's await, D21) → if `scene.minigame`, run it at once (its render goes on behind it,
unawaited, D27) and jump to `onVictory`/`onFailure`; else await `visuals.render(scene)` (clears layers,
draws background, characters, effects) and preload the next 3 reachable scenes.
Window resize re-renders the current scene.
`window.__vn` (stage, minigames, audio, sceneId) is the check scripts' test hook and ships to the live
site (D11 runs the checks there). It hands out live objects: put nothing on it you wouldn't show in the console.

The UI is two stacked systems: Pixi canvas fills the screen; DOM panels float
on top with CSS. Layout bugs are almost always in `main.css`; scene-fit bugs in
`visualRenderer.js` (`contain`, `positionFor`, `scaleCharacter`).

## Story format (`public/story/story.json`)

```jsonc
{
  "id": "draci-jezdkyne-z-vlpu",          // also the localStorage key: vn:<id>:autosave
  "start": "forest_flight_01",
  "menuMusic": "village_day",             // music key for the main menu
  "resumeMusic": ["battle"],              // music keys that continue where they were left (D26)
  "assets": { "music": { "village_day": "assets/music/village_day.mp3" } },
  "characters": {
    "roza": { "displayName": "Róza", "color": "#d6462f", "hair": "#eac470",
              "sprites": { "neutral": "...", "happy": "...", "excited": "...",
                           "sad": "...", "nervous": "...", "talking": "..." } }
  },
  "scenes": [{
    "id": "scene_id",
    "background": { "type": "image", "src": "assets/backgrounds/x.png" },  // or {type:"generated", preset}
    "effects": ["wind", "snow", "sunsetGlow"],
    "characters": [{ "id": "roza", "position": "left|center|right", "pose": "talking", "alpha": 1 }],
    "speaker": "roza",          // character id, or a literal name like "Velký bobr"
    "text": "…",
    "music": "village_day",     // same key as the previous scene = keeps playing; omitted = silence;
                                // a key not in assets.music = console warning + silence
    "next": "other_scene",      // OR
    "choices": [{ "text": "…", "next": "id" }],   // OR
    "minigame": { "type": "dragonAttack", "title": "…", "allowSkip": true,
                  "onVictory": "id", "onFailure": "id", "config": {} },
    "end": { "good": false, "title": "…", "text": "…" }   // ending, see below
  }]
}
```

Rules: asset paths are relative (`assets/...`, never `/assets/...`) — required for
the GitHub Pages sub-path. A scene with neither `next`, `choices` nor `minigame`
is a dead end unless it has `end`. An `end` scene shows normally; the next tap opens
the end card (KONEC, "Dobrý/Špatný konec: title", `text`, "Zpět na začátek" → reset
to `start` + main menu). Galerie lists every `end` scene the player has ever reached
(from `readSceneIds`), with the scene's background as thumbnail. The minigame scene is kept out of back-history.

## Assets

- Backgrounds: 1672×941 PNG (~16:9, ~3.3 MB each). Displayed contain-fit (letterboxed).
- Characters: 1024×1536 RGBA PNG (~2 MB each), 6 poses per character.
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
  lose it, and `-vn -map_metadata -1` keep a future song's cover art and text tags out of them. A new track: put the
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
- Róza's and Anna's minigame strips (`public/assets/minigames/dragon-attack/roza_{fly,attack,fireball}.png`,
  `anna_{fly,attack,thorn}.png`) are generated from the originals in `art/minigames/dragon-attack/` (D23, D30), one
  file at a time (Anna's move and thorn sheets are already transparent and are packed straight from `art/`; her attack
  sheet is painted on black):
  ```
  cp art/minigames/dragon-attack/roza_move.png <tmp>/ && node scripts/removeCheckerboard.mjs <tmp>/roza_move.png --enclosed
  node scripts/packFrames.mjs <tmp>/roza_move.png public/assets/minigames/dragon-attack/roza_fly.png art/minigames/dragon-attack/roza_move.anchors.json
  cp art/minigames/dragon-attack/roze_attack.png <tmp>/ && node scripts/removeCheckerboard.mjs <tmp>/roze_attack.png --enclosed
  node scripts/packFrames.mjs <tmp>/roze_attack.png public/assets/minigames/dragon-attack/roza_attack.png art/minigames/dragon-attack/roze_attack.anchors.json
  cp art/minigames/dragon-attack/bezzubka_projektil.png <tmp>/ && node scripts/removeCheckerboard.mjs <tmp>/bezzubka_projektil.png --glow
  node scripts/packFrames.mjs <tmp>/bezzubka_projektil.png public/assets/minigames/dragon-attack/roza_fireball.png bright
  node scripts/packFrames.mjs art/minigames/dragon-attack/anna_move.png public/assets/minigames/dragon-attack/anna_fly.png art/minigames/dragon-attack/anna_move.anchors.json
  cp art/minigames/dragon-attack/anna_attack.png <tmp>/ && node scripts/removeCheckerboard.mjs <tmp>/anna_attack.png --black
  node scripts/packFrames.mjs <tmp>/anna_attack.png public/assets/minigames/dragon-attack/anna_attack.png art/minigames/dragon-attack/anna_attack.anchors.json
  node scripts/packFrames.mjs art/minigames/dragon-attack/borinoha_projektil.png public/assets/minigames/dragon-attack/anna_thorn.png art/minigames/dragon-attack/borinoha_projektil.anchors.json
  ```
  Róza rides Bezzubka; her fireball sheet was named `beska_projektil.png` until 2026-10-29 (D23 quotes that name).
  The `beska_projektil.png` in `art/` since then is another sheet (a lightning strip, not used yet), like Emma's
  sheets beside it.
  Both scripts refuse to write into `art/` (the originals and the hand-measured anchors stay untouched), also through a
  link or a UNC path. `<tmp>` is a scratch folder: `anna_attack.png` has the same name as its packed strip in `public/`.
  `packFrames.mjs` prints the frame count, size and anchor that go into the dragon's `animation` config,
  and each frame's box around the anchor. All config px are strip px (the source downscaled by the
  packer's `factor`, default 2): `bodyWidth` = the `medianWidth` it prints for the fly strip; `launchPoint` = where
  the shot leaves on the `launchFrame` (Róza's mouth, Anna's tail tip, both on attack frame 3), measured from the eye
  in the source ÷ factor. A shot's anchors file holds the point the shot is turned around (Anna's thorn: its tip).
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
build work under `/draci-jezdkyne/`. A failed build leaves the previous deploy
live — check the Actions tab after pushing. Every file the code imports or
the story references must be committed, or CI breaks / assets 404.
