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
- Back and Menu controls; a main menu with Pokračovat (continue), Nová hra (new game), settings and a gallery
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

A throw in its constructor or `start()` ends the minigame as a failure; a throw in its
`destroy()` is logged, and the HUD and the game's sprites are removed anyway. Its own
ticker listener must catch errors and end the round itself (see
`DragonAttackMinigame#tick`), or one error freezes the game.

### Dragon attack minigame (`type: "dragonAttack"`)

Three dragons fly, one after another, above a line of moving beavers. A key
press, mouse click or screen touch makes the dragon in flight attack. Each
dragon has its own attack angle/speed/gravity, may have `attack.maxShots` of
its own shots in the air at once (Róza and Emma 1, Anna 3), and after a launch
waits `attack.refireAfter` × that shot's on-screen time (Anna ⅓) before the
next. A dragon attacks only while its shot would start on the screen. Each dragon flies a
configurable number of flights. **Win** when every
beaver is hit; **lose** when the flights run out, no shot is in the air, no beaver is
still in its hit, and beavers remain.

Every number is configurable through `config`. Art is optional — vector
placeholders are drawn until you supply it. Art slots:

- `config.background.sprite` — optional dedicated minigame background.
- `config.beavers.sheetPattern` — per-beaver sprite **sheets** (`beaver1_frames.png` …
  `beaver7_frames.png`, made by `scripts/cleanBeavers.mjs`); `{n}` is replaced with `1..count`.
- `config.dragons[i].animation` — animated dragon art: `fly` and `attack`
  strips made by `scripts/packFrames.mjs` (one row of equal frames, the art
  facing right, `anchor` = the dragon's eye), the frame orders and rates, and
  `launchPoint` (where the shot leaves on the `launchFrame`, in strip px from the eye: Róza's mouth, Anna's
  tail tip). Róza and Anna have it.
- `config.dragons[i].sprite` — a single image instead (the default list has none).
- `config.dragons[i].attack.animation` — an animated shot strip (Róza's fireball, Anna's thorn): its
  `flightFrames` at `fps`, the last one held, or repeated with `"loop": true`; turned along its path
  (`artAngleDeg` = the direction the art points, in degrees from pointing right, positive = down);
  `config.dragons[i].attack.sprite` — a single image instead.

Sounds (optional): `config.dragons[i].attack.sound` plays when that dragon's shot
launches, `attack.hitSound` when it hits a beaver, `config.beavers.sounds.cry` on every hit and
`.log` when the beaver's log lands (only when a log is dropped). Each is `{ "src": "…mp3", "volume": 0.7 }`,
a bare path (volume 0.7) or `null` for none. A dragon in a custom `dragons` list without them
is silent; `beavers.sounds` is merged with the defaults, so only `null` silences the cry or the
log. A file plays at most once per game tick, at its volume × the "Hlasitost efektů" slider
(sounds using the same file share one volume); one still loading is skipped, never played late. A fixed delay after the hit belongs in the file itself, as leading silence
(the cry has 150 ms). All the effects go through a safety limiter that never lets them pass −3.2 dBFS (room for the
music, which the browser mixes in after it).

Each beaver sheet is a 6×2 grid (`config.beavers.sheet`), every cell padded by `sheet.padding`
px of the sheet on each side (50; `spriteWidth` is a cell's width without it; set `padding: 0` for your own
unpadded sheets). By default the frames are: top row (0–5) = walk cycle, then 7 and 6 = the hit (`hit: [7, 6]`:
the log falls, then the startled beaver stands beside it), 8 = a log left on the ground, 9–11 = scurry/run. When a
beaver is hit the log falls, lies where it fell (it drops when the hit's first frame ends, so list the falling-log
frame first: `[6, 7]` would show two logs), then the beaver scurries off-screen before it counts as gone (the
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
        "color": "#d6462f",
        "flightY": 0.16,
        "speed": 320,
        "entryFrom": "left",
        "attack": { "speed": 620, "angleDeg": 18, "gravity": 320, "radius": 22, "color": "#ff7b3d",
                    "maxShots": 1, "refireAfter": 0,
                    "sound": "assets/minigames/dragon-attack/sfx/bezzubka_shot.mp3",
                    "hitSound": { "src": "assets/minigames/dragon-attack/sfx/fireball_hit.mp3", "volume": 0.7 } }
      }
    ],
    "flightsPerDragon": 5,
    "flightOrder": "roundRobin",
    "score": { "perHit": 100, "winBonus": 500, "remainingFlightBonus": 50 }
  }
}
```

Providing a custom `dragons` array fully replaces the three defaults, so include
every dragon you want, each with every field it uses: `name`, `color`, `flightY`,
`speed`, `entryFrom` and an `attack` with `speed`, `angleDeg` (or `pattern: "zigzag"`),
`gravity`, `radius` and `color` (a Róza without her `animation` is the vector
placeholder again; one without `sound` and `hitSound` is silent). The example above is a
complete one-dragon list.

## Navigation controls

- Click/tap, Space, or Enter: advance
- Number keys: choose a decision option
- Back button, Backspace, or Left Arrow: go one scene back
- Menu button or Esc: the main menu over the game (Esc again, or Pokračovat, goes back)
- Nová hra in the menu: start again from the first scene (asks first when there is progress to lose)
- Nastavení in the menu: music volume, effects volume (letting go of the slider plays a test sound), autoread

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
- `src/engine/audioManager.js`: music, voice lines (sound effects: `src/engine/sfx.js`)
- `src/engine/startVisualNovel.js`: branching, minigame routing, flags, inventory
