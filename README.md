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
