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

The story is split into files in `public/story/` (D37):

```text
public/story/story-v2.json        the main file: id, start, music, assets, and the list of parts
public/story/characters.json      a part: { "scenes": [], "characters": {...} } (every character)
public/story/compatibility.json   a part: { "scenes": [], "movedScenes": {...} } (where old scene ids lead, for saved games)
public/story/act1.json            a part: { "scenes": [...] }
public/story/act2a.json           Act 2a's days: the hub, the router, the mornings, the vědma, the grove (D40)
public/story/lokace-<place>.json  a location: { "location": {...}, "scenes": [...] } (les, reka, hory)
```

characters.json and compatibility.json are parts too (D39; their `"scenes": []` keeps an old cached game
loading). A new part is a file there plus its name in the main file's `"parts"` list (commit both). `public/story/story.json` is
the old one-line-per-scene story, frozen for cached old tabs: never edit it. `npm test` checks the story (dangling ids,
malformed conditions, missing files, removed scenes; not a forgotten `next`: a scene with no way on is a dead end) and CI
runs it before every deploy.

A character with real sprites looks like this (inside `"characters"` in `characters.json`):

```json
{
  "roza": {
    "displayName": "Róza",
    "sprites": {
      "neutral": "assets/characters/roza/roza_neutral.png",
      "happy": "assets/characters/roza/roza_happy.png"
    }
  },
  "jezevec": { "displayName": "Jezevec", "scale": 0.35, "raise": 0.35, "sprites": { "neutral": "…" } }
}
```

`scale` draws a creature that many rider heights tall, `raise` lifts its feet behind the riders (both optional;
riders have neither). Store the files in `public/assets/characters/<id>/<id>_<pose>.png`. Do not start asset paths
with `/`. Use `assets/...`, not `/assets/...`, so GitHub Pages project URLs work correctly.

A scene is one background with its lines until a choice, another scene or a minigame:

```json
{
  "id": "example_scene",
  "background": { "type": "image", "src": "assets/backgrounds/forest_path.png" },
  "effects": ["wind"],
  "music": "forest_ground",
  "characters": [{ "id": "roza", "position": "left", "pose": "happy" }],
  "set": ["byli_v_lese"],
  "add": { "pul": 1 },
  "lines": [
    { "text": "Narration has no speaker." },
    { "speaker": "roza", "text": "Kam teď?", "characters": [{ "id": "roza", "position": 0.3, "flip": true }] },
    { "speaker": "emma", "text": "Jen když jsme pomohly jezevcům.", "if": "jezevci" }
  ],
  "choices": [
    { "text": "Do lesa.", "next": "forest", "if": "pul<2" },
    { "text": "Do hor.", "location": "hory" }
  ],
  "next": [{ "if": "pul>=6", "next": "evening" }, { "next": "hub" }]
}
```

- `characters` on a line is the whole stage from that line on. Positions: `left`, `center`, `right` or a number
  0.2–0.8 (a share of the width; the lint refuses others); `flip` mirrors.
- The memory: `set` (names to at least 1) and `add` (counters) on a scene (when entered) or a choice (when picked); `if` on
  a line, a choice or a `next` entry: `"name"`, `"!name"`, `"name>=2"`, `"name<2"`, or a list that must all hold.
- After the last line: the visible choices, else `next` (a string or the first list entry that holds), else `end`.
- `"lines": []` with a `next`: a pass-through (applies its changes and goes on).
- `"choiceLayout": "center"`: the choices in a big panel in the middle (automatic with 3 or more).
- A choice with `"location"` flies to a location: the engine plays one of its available events (`"first": true`
  ones first, the rest at random) and marks it played by its name; the choice disappears once nothing is left.
  A lost event is offered again by a choice with `"giveUp": true` on its lose scene.
- Renaming or removing a scene needs a `movedScenes` entry in `compatibility.json` (`"old_id": { "scene": "new_id", "line": 0 }`); inserting
  lines into a scene shifts saved games (appending is safe). `npm test` says when one is missing.

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
- `loseResult` — set to `false` to go on to `onFailure` as soon as a round is lost, without the result dialog (the
  badger rescue in the story, D45); a win still shows it.
- `config` — minigame-specific numbers (everything is configurable; anything you
  omit uses the default).

The minigame scene itself is kept out of the back-history, so pressing **Back**
on an outcome scene returns to whatever came before the minigame (after a lost retry, to before the lose scene's first
visit: its lines aren't shown twice).

Minigames live in `src/engine/minigames/`. To add a new one, implement a class
with `start()` and `destroy()` methods and register it in `minigameManager.js`:

```js
manager.register('myGame', (context) => new MyGame(context), { labels: { score: '…', instructions: '…' } });
```

The third argument (optional) is the game's own HUD labels; a scene's `labels` and `instructions` still override them.

Its `context` holds `app`, `layer`, `config`, `hud`, `onComplete` and `difficulty` (Nastavení's 'easy', 'normal' or
'hard'). A throw in its constructor or `start()` ends the minigame as a failure; a throw in its
`destroy()` is logged, and the HUD and the game's sprites are removed anyway. Its own
ticker listener must catch errors and end the round itself (see
`DragonAttackMinigame#tick`), or one error freezes the game.

### Dragon attack minigame (`type: "dragonAttack"`)

Three dragons fly in from the right, one after another, above a line of beavers walking in from the left
(`beavers.count` 30, `spacingPx` 225 apart, centre to centre: the first at `startXRatio` of the width, counted from the
side they walk in from (`direction` 1: from the left; −1: from the right), the others
queued behind it off the screen; a beaver that walks off the far edge joins the back of the line again). A key
press, mouse click or screen touch makes the dragon in flight attack. Each
dragon has its own attack angle/speed/gravity, may have `attack.maxShots` of
its own shots in the air at once (Róza and Emma 1, Anna 3), and after a launch
waits `attack.refireAfter` × that shot's on-screen time (Anna 0.33) before the
next. A dragon attacks only while its shot would start on the screen. Each dragon flies a
configurable number of flights (`flightsPerDragon`, 5). **Win** when every beaver is hit, or when the flights run
out (no shot in the air, no beaver still in its hit) with at least `winPercent` of the beavers hit
(`{ "easy": 40, "normal": 80, "hard": 100 }`, picked by "Obtížnost minihry" in Nastavení; a value that isn't a number
from 0 to 100 falls back to that level's default); **lose** otherwise. Reaching the goal early doesn't end the round.
Every hit speeds the walkers up: `speed × (1 + (speedUp − 1) × hits / beavers)` (`beavers`: how many there are) (`speedUp` 2, so 2× with every beaver
hit), the walk animation in step (`walkFps` is for 90 px/s; scale it for your own sheets drawn for another speed). A lying log stays `logSeconds` (3), then fades out over
`logFadeSeconds` (1). The HUD status (`config.labels.status`) takes `{hit}`, `{percent}` (the share hit, rounded
down), `{target}` (the goal in %), `{needed}` (the goal in beavers), `{flight}` and `{flights}` (and `{alive}`,
`{total}`, `{dragon}`); the result dialog adds the hits (`labels.resultHits` on the scene's `minigame`, like the
other HUD labels; it takes `{hit}`, `{total}`, `{percent}` and `{target}`). Its Pokračovat takes a tap or key only after 500 ms without one.

Every number is configurable through `config`. Art is optional — vector
placeholders are drawn until you supply it. Art slots:

- `config.background.sprite` — optional dedicated minigame background.
- `config.beavers.sheetPattern` — per-beaver sprite **sheets** (`beaver1_frames.png` …
  `beaver7_frames.png`, made by `scripts/cleanBeavers.mjs`); `{n}` is replaced with `1..sheetCount` (7), in turn
  (beaver 8 uses sheet 1).
- `config.dragons[i].animation` — animated dragon art: `fly` and `attack`
  strips made by `scripts/packFrames.mjs` from a sheet or a frames list of separate pictures (one row of equal
  frames, the art facing right, `anchor` = the point that lines up across the strips: the dragon's eye, or for
  Emma's attack where her fly strip's eye sits relative to her), the frame orders and rates, and `launchPoint`
  (where the shot leaves on the `launchFrame`, in strip px from that frame's anchor: Róza's and Emma's mouth, Anna's
  tail tip). All three dragons have it.
- `config.dragons[i].sprite` — a single image instead (the default list has none).
- `config.dragons[i].attack.animation` — an animated shot strip (Róza's fireball, Emma's bolt, Anna's thorn): its
  `flightFrames` at `fps`, the last one held, or repeated with `"loop": true`; turned along its velocity, a zigzag
  shot's weave included; `artAngleDeg` = the direction the art points, in degrees from pointing right, positive =
  down; `impactFrame` shown for `impactMs` where the shot hits, as painted;
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
frame first: `[6, 7]` would show two logs), then the beaver scurries off-screen before it counts as gone (a
victory by hitting every beaver waits for the last one to flee). Tunables include `walkFps`,
`hitFps`, `scurryFps`, `scurrySpeed`, `scurryDirection`, `dropLogOnHit` and
`spriteWidth`.

Key tunables (see `src/engine/minigames/dragonAttack.js` for the full list and
defaults):

```json
{
  "config": {
    "beavers": { "count": 30, "speed": 90, "speedUp": 2, "spacingPx": 225, "laneY": 0.84 },
    "winPercent": { "easy": 40, "normal": 80, "hard": 100 },
    "dragons": [
      {
        "name": "Róza",
        "color": "#d6462f",
        "flightY": 0.16,
        "speed": 320,
        "entryFrom": "right",
        "attack": { "speed": 720, "angleDeg": 16, "gravity": 140, "radius": 22, "color": "#ff7b3d",
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
`speed`, `entryFrom` and an `attack` with `speed`, `angleDeg` (or `pattern: "zigzag"`:
a straight fall weaving sideways, its first swing forward, the way the dragon flies),
`gravity`, `radius` and `color` (a Róza without her `animation` is the vector
placeholder again; one without `sound` and `hitSound` is silent). The example above is a
complete one-dragon list.

### Badger cubs rescue (`type: "badgerRescue"`)

The water rises over the badgers' burrow; each flooded hole's cubs climb onto branches that the current carries right.
A tap makes the flying dragon dive straight down; a cub on a branch under its claws is caught and flown to the new
burrow. A cub reaching the right edge is saved by its mother while she has strength (`motherSaves`: Lehká 2,
Normální 1, Těžká 0), else the round is lost; it is won when every cub is safe. Pieces never float over each other
(a faster one follows a slower one; a cub waits in its hole while another cub's branch is there, or boards a bare log
at its hole), and the current speeds up as the water rises (D43). Play it on
`assets/backgrounds/badger_flood.png` (the game lines its field up with that picture). `holes` must have exactly five entries (else the defaults). Tunables (all in `DEFAULTS` in
`src/engine/minigames/badgerRules.js`, the pure rules the node checks play), among them: `holeCubs` (five numbers, one
per hole, 1–5 each, at most 15 cubs), `currentSpeed`, `motherSaves` and `currentRise` per difficulty (`{ easy, normal, hard }`, or one number for all;
`currentRise` is the current's factor at the highest water, 1–3, else the level's default: `{ easy: 1, normal: 2, hard: 1.8 }` since D44, so one number
speeds Lehká up too), `currentSpread`, `firstFlood`,
`floodGap`, `cubGap`, `branchLength`, `logLength`, `logs` (at most 8), `reach`, `dive` (`down`, `up`,
`missCooldown`, `bumpCooldown`, `tilt`), `dragons` (at most 6, dragon i drawn with the beaver game's dragon i % 3 (Róza, Emma, Anna): `speed`, `catchPoint`: the claws in strip px of dragonAttack's fly strip from its anchor, the eye,
on fly frame `diveFrame`), `dragonWidth`,
`flightY`, `flightGap`, `arcSeconds`, `motherLeap`, `motherReturn`, the picture's places (`holes`, `burrow`,
`waterStart`, `mother`), `sizes` (drawn widths, and `arcHeight` the caught cub's flight's height; to resize by eye), `labels` (the status texts; the HUD's own texts
come from `HUD_TEXTS` in badgerRescue.js, overridden by a scene's `labels`), `assets` (the stills and the animation
frames `father2`, `father3`, `cubBranch2`, `cubBranch3`, `motherTail`, `motherHead`, `motherHeadTail`: each frame the
size of its still, or it is drawn at the still's width; an animal plays its still when a frame it needs is missing) and `sounds` (`dive`, `splash`, `bump`,
`caught`, `mother`, `lost`; each `{ src, volume }`, a bare path or `null`, as in the beaver game; `null` until Sára has picked
from the Runway variants in `art/minigames/badger-rescue/sfx/variants/`, then built by `scripts/build-badger-sfx.sh`, D45). A typo falls back to the default.

In the story (D45) it is the badger event's quest: `reka_jezevec` → `reka_jezevec_zachrana` (the minigame, `loseResult: false`)
→ `reka_jezevec_pomoc` (won, or skipped as won), or `reka_jezevec_prohra`: no line, a free retry and a give-up choice
(`"giveUp": true`, which costs the half-day without the helper and offers the event again later).

### Play-test page

`playtest.html` (handed out as `…/playtest/`, a redirect that keeps the query) plays one round of a minigame at a
time. Without `game` it is the beaver battle, with 15 sliders: the beavers (count, spacing, speed, speed-up), the goal (%) and the flights per dragon, each
dragon's flight and shot speed, Anna's thorn angle, gravity and her wait between thorns (% of a thorn's on-screen time).
`?game=jezevci` is the badger cubs rescue (D42) with 14 sliders of its own (the cubs 9 (the default since D44) or D42's 7, the current, the mother's
saves, the floods, the branch, the reach, the dive, each dragon's speed, the current's speed-up at high water, D43: last
in the link; a link without `rise=` plays at its default (2 since D44), `rise=1` turns it off); its link carries no
field size.
The values live only in the URL (written when a slider is let go); "Kopírovat odkaz" copies a `playtest.html?…` link
that also records the tester's field size (`field=WxH`, in game px; information only, never read back). It uses the
game's saved music and effects volumes and never saves anything. Dev: `http://localhost:5173/playtest.html`.

## Navigation controls

- Click/tap, Space, or Enter: advance
- Number keys: choose a decision option
- Back button, Backspace, or Left Arrow: go one line back (the memory as it was there)
- Menu button or Esc: the main menu over the game (Esc again, or Pokračovat, goes back)
- Nová hra in the menu: start again from the first scene (asks first when there is progress to lose)
- Nastavení in the menu: music volume, effects volume (letting go of the slider plays a test sound), autoread, the
  minigame's difficulty (Lehká / Normální / Těžká: the share of the beavers to hit)
- Minigame result: Enter or Space presses Pokračovat once nothing was pressed for 500 ms; the story then waits another
  500 ms (a double tap or a held key doesn't skip a line)

The position (scene, line, memory) and the back history are stored in autosave (`vn:<story id>:autosave2`), so a reload
continues on the same line.

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
- `src/engine/startVisualNovel.js`: branching, minigame routing, inventory
