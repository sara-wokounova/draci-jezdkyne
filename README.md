# Visual Novel Starter

Barebone fullscreen cinematic visual novel starter using plain JavaScript, JSON story files, PixiJS rendering, Howler.js audio, Vite, and GitHub Pages deployment.

## What is included

- Fullscreen visual novel layout
- PixiJS scene renderer
- Real image sprites loaded from JSON
- Generated fallback background and fallback placeholder characters
- Simple atmosphere effects: sunset glow, wind, snow
- JSON-driven story scenes and choices
- Mouse, touch, Space/Enter, and number-key choice controls
- Back and Restart controls
- Autosave using `localStorage`
- GitHub Pages workflow

## Requirements

- Node.js 20+
- npm

## Run locally

```bash
npm install
npm run dev
```

Open the local URL printed by Vite.

## Build locally

```bash
npm run build
npm run preview
```

The production build is written to `dist/`.

## Story editing

Edit:

```text
public/story/story.json
```

A character with real sprites looks like this:

```json
{
  "roza": {
    "displayName": "Róza",
    "sprites": {
      "neutral": "assets/characters/roza/roza_neutral.png",
      "happy": "assets/characters/roza/roza_happy.png",
      "excited": "assets/characters/roza/roza_excited.png",
      "sad": "assets/characters/roza/roza_sad.png",
      "nervous": "assets/characters/roza/roza_nervous.png",
      "talking": "assets/characters/roza/roza_talking.png"
    }
  }
}
```

Store the files here:

```text
public/assets/characters/roza/roza_neutral.png
public/assets/characters/roza/roza_happy.png
public/assets/characters/roza/roza_excited.png
public/assets/characters/roza/roza_sad.png
public/assets/characters/roza/roza_nervous.png
public/assets/characters/roza/roza_talking.png
```

Do not start asset paths with `/`. Use `assets/...`, not `/assets/...`, so GitHub Pages project URLs work correctly.

A scene can contain:

```json
{
  "id": "example_scene",
  "background": { "type": "generated", "preset": "sunset_forest" },
  "effects": ["sunsetGlow", "wind", "snow"],
  "characters": [
    { "id": "roza", "position": "center", "pose": "happy" }
  ],
  "speaker": "roza",
  "text": "Dialogue goes here.",
  "next": "another_scene"
}
```

A choice scene can use:

```json
{
  "id": "choice_scene",
  "speaker": "roza",
  "text": "Which way do we go?",
  "choices": [
    { "text": "Go left.", "next": "left_scene" },
    { "text": "Go right.", "next": "right_scene" }
  ]
}
```

## Optional image backgrounds

Generated backgrounds still work, but you can also load a real image:

```json
{
  "background": {
    "type": "image",
    "src": "assets/backgrounds/forest_sunset.png"
  }
}
```

Put it in:

```text
public/assets/backgrounds/forest_sunset.png
```

## Minigames

Scenes can launch a minigame. Each minigame ends in **victory** or **failure**,
and the player can always **skip** it and pick the outcome manually.

Add a minigame to the flow by giving a scene a `minigame` field instead of
`next`/`choices`:

```json
{
  "id": "beaver_battle",
  "background": { "type": "image", "src": "assets/backgrounds/dam_02.png" },
  "minigame": {
    "type": "dragonAttack",
    "title": "Dračí nálet na bobry",
    "allowSkip": true,
    "onVictory": "beaver_battle_win",
    "onFailure": "beaver_battle_lose",
    "config": {}
  }
}
```

- `onVictory` / `onFailure` — scene id to jump to for each outcome.
- `allowSkip` — set to `false` to remove the skip button.
- `config` — minigame-specific numbers (everything is configurable; anything you
  omit uses the default).

The minigame scene itself is kept out of the back-history, so pressing **Back**
on an outcome scene returns to whatever came before the minigame.

Minigames live in `src/engine/minigames/`. To add a new one, implement a class
with `start()` and `destroy()` methods and register it in `minigameManager.js`:

```js
manager.register('myGame', (context) => new MyGame(context));
```

### Dragon attack minigame (`type: "dragonAttack"`)

Three dragons fly, one after another, above a line of moving beavers. Each
flight you get exactly **one** attack (key press, mouse click, or screen touch).
Each dragon has its own attack angle/speed/gravity and a configurable number of
flights. **Win** when every beaver is hit; **lose** when the flights run out.

Every number is configurable through `config`. Sprites are optional — vector
placeholders are drawn until you supply art. Sprite slots:

- `config.background.sprite` — optional dedicated minigame background.
- `config.beavers.sheetPattern` — per-beaver sprite **sheets** (`beaver1.png` …
  `beaver7.png`); `{n}` is replaced with `1..count`.
- `config.dragons[i].sprite` — each dragon (the default list has three).
- `config.dragons[i].attack.sprite` — each dragon's projectile.

Each beaver sheet is a 6×2 grid (`config.beavers.sheet`). By default the frames
are: top row (0–5) = walk cycle, then bottom row 6–7 = hit reaction, 8 = a log
left on the ground, 9–11 = scurry/run. When a beaver is hit it plays the hit
frames, drops the log, then scurries off-screen before it counts as gone (the
victory screen waits for the last beaver to flee). Tunables include `walkFps`,
`hitFps`, `scurryFps`, `scurrySpeed`, `scurryDirection`, `dropLogOnHit` and
`spriteWidth`.

Key tunables (see `src/engine/minigames/dragonAttack.js` for the full list and
defaults):

```json
{
  "config": {
    "beavers": { "count": 7, "speed": 90, "spacingPx": 150, "laneY": 0.84 },
    "dragons": [
      {
        "name": "Róza",
        "sprite": "assets/minigame/dragon_roza.png",
        "flightY": 0.16,
        "speed": 320,
        "entryFrom": "left",
        "attack": { "speed": 620, "angleDeg": 18, "gravity": 320, "sprite": "assets/minigame/fire_roza.png" }
      }
    ],
    "flightsPerDragon": 5,
    "flightOrder": "roundRobin",
    "score": { "perHit": 100, "winBonus": 500, "remainingFlightBonus": 50 }
  }
}
```

Providing a custom `dragons` array fully replaces the three defaults, so include
every dragon you want.

## Navigation controls

- Click/tap, Space, or Enter: advance
- Number keys: choose a decision option
- Back button, Backspace, or Left Arrow: go one scene back
- Restart button or `R`: restart from the first scene

Back history is stored in autosave, so refreshing the browser should preserve the current scene and the previous-scene stack.

## Deploy to GitHub Pages

1. Create a GitHub repository.
2. Push this project to the repository's `main` branch.
3. In GitHub, open repository `Settings -> Pages`.
4. Under `Build and deployment`, choose `GitHub Actions`.
5. Push a commit. The included workflow builds Vite and publishes `dist/`.

The Vite config uses `base: './'`, so the build should work both for a user page and for a project page like `https://username.github.io/repository-name/`.

## Future extension points

- `src/engine/autoSave.js`: read-history storage for future auto-skip
- `src/engine/effects/`: snow, wind, sunbeams, particles
- `src/engine/visualRenderer.js`: real backgrounds, character sprites, transitions
- `src/engine/audioManager.js`: music, sound effects, voice lines
- `src/engine/startVisualNovel.js`: branching, minigame routing, flags, inventory
