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

## Working rules

- **Record decisions.** Any non-obvious choice (library, layout approach, story
  structure, asset format, scope cut) gets an entry in `decisions.md`. Append;
  never rewrite old entries — supersede them with a new one.
- **Track issues.** Found a bug you aren't fixing now → add it to `issues.md`.
  Fixed one → move it to the Fixed section with the date.
- Story text is **Czech**. Keep UI strings Czech too (see issues: engine UI is still English).
- Don't commit or push unless asked. A push to `main` deploys to production.
- Temp files go in `C:\tmp\claude`, not the OS temp dir.

## Commands

```bash
npm install
npm run dev            # Vite dev server
npm run build          # production build into dist/ (CI runs this)
npm run preview        # serve dist/
npm run clean-sprites  # strip baked checkerboard from character PNGs (overwrites files!)
```

No tests and no linter. Verify changes by running the game (`npm run dev`) in a
browser, including a phone-sized viewport.

## Architecture

```
index.html                 DOM shell: #pixi-host canvas, #top-controls, #dialogue-panel, #choice-panel,
                           #end-card, #main-menu (Start / Nastavení / Galerie pages);
                           #rotate-hint (portrait phones, outside #game-root); links public/manifest.webmanifest
src/main.js                wires DOM elements → startVisualNovel()
src/engine/
  startVisualNovel.js      game loop: showScene / advance / goBack / restart / runMinigame
  storyRepository.js       fetch + minimal validation of story.json, scene lookup
  autoSave.js              localStorage: current scene, back-history, readSceneIds, settings (volume, autoRead)
  uiController.js          DOM dialogue text, speaker name, choice buttons, end card, main menu + gallery
  inputController.js       click/tap anywhere = advance; keys: Space/Enter, 1-9, Backspace/←, R
  visualRenderer.js        Pixi: background (contain-fit), character sprites, placeholders, preload
  pixiStage.js             Pixi Application + layers: background, characters, effects, minigame, overlay
  audioManager.js          Howler music per scene (no music assets yet)
  effects/atmosphereEffects.js   sunsetGlow, wind, snow
  minigames/
    minigameManager.js     registry; run(spec) → 'victory' | 'failure'
    minigameHud.js         DOM overlay: title, score, skip menu, result dialog (Czech labels)
    dragonAttack.js        the "Dračí nálet na bobry" minigame (all numbers in DEFAULTS)
src/styles/main.css        all styling (DOM UI is absolutely positioned over the canvas)
public/story/story.json    the whole story (fetched at runtime, not bundled)
public/assets/             backgrounds/, characters/<id>/<id>_<pose>.png, minigames/dragon-attack/
scripts/removeCheckerboard.mjs   flood-fills light-gray checkerboard to alpha
.github/workflows/deploy.yml     push to main → npm ci → build → GitHub Pages
```

Startup draws the saved scene (visuals only) behind `#main-menu`; Start calls `showScene`.
While the menu is open (`menuOpen`) all story input is ignored, like during a minigame.
With autoread on (Nastavení), `showScene` ends by scheduling `advance()` (D19).
Flow: `showScene(scene)` → save to localStorage → DOM text/choices → `visuals.render(scene)`
(clears layers, draws background, characters, effects) → music → if `scene.minigame`,
run it and jump to `onVictory`/`onFailure`; else preload the next 3 reachable scenes.
Window resize re-renders the current scene.

The UI is two stacked systems: Pixi canvas fills the screen; DOM panels float
on top with CSS. Layout bugs are almost always in `main.css`; scene-fit bugs in
`visualRenderer.js` (`contain`, `positionFor`, `scaleCharacter`).

## Story format (`public/story/story.json`)

```jsonc
{
  "id": "draci-jezdkyne-z-vlpu",          // also the localStorage key: vn:<id>:autosave
  "start": "forest_flight_01",
  "assets": { "music": { "key": "assets/music/x.mp3" } },
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
    "music": "key",
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
- Beaver sheets: `beaver1..7.png`, 1448×1086, 6×2 grid (walk 0–5, hit 6–7, log 8, scurry 9–11).
- Source art arrives with a light-gray checkerboard baked in instead of
  transparency; run `scripts/removeCheckerboard.mjs <dir>` on it. It overwrites
  files in place — make sure they're committed first.
- Missing sprites never crash: the engine draws vector placeholders.

## Deployment

GitHub Actions on every push to `main` (Node 20). Vite `base: './'` makes the
build work under `/draci-jezdkyne/`. A failed build leaves the previous deploy
live — check the Actions tab after pushing. Every file the code imports or
the story references must be committed, or CI breaks / assets 404.
