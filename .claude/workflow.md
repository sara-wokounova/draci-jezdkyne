# Feature workflow

Sára asked for this process for **every feature added to the game**. Follow it
step by step. Don't skip a round, and don't add extra rounds.

Two loops. The plan loop ends with Sára's confirmation, and nothing is implemented
before that. The implementation loop ends when a review round reports only low
findings.

## Severity

Every finding from a disprover or reviewer gets one of these:

- **high**: breaks a requirement, breaks play for normal users, loses progress or
  data, or is a security problem.
- **medium**: a real bug in a less common path (a device, a race, Back or Restart
  in an odd spot), or a maintainability problem that will cause the next bug.
- **low**: cosmetic, theoretical, or style.

A finding needs evidence: a repro, a `file:line`, or a concrete scenario. "Could be
cleaner" without a consequence is low.

## Phase 1: Plan (no repo changes)

1. **Research.** Read the code paths and the assets involved. Prototypes and spikes
   go in `C:\tmp\claude`, never the repo.
2. **Write the plan** to `C:\tmp\claude\plans\<feature>.md`. It covers:
   - the request, quoted verbatim;
   - what the player sees, scene by scene or step by step;
   - the files that change and the story/config format changes;
   - the decisions it implies (future `decisions.md` entries);
   - the **test plan**: every new code path and the check that covers it;
   - risks, what is out of scope, and open questions for Sára.
3. **Independent disprover.** Start a fresh subagent. Give it the request verbatim,
   the plan file, and pointers to the code. Don't give it my reasoning. It tries
   to break the plan: missed requirements, wrong assumptions about the code or
   assets, untestable steps, cases nobody thought of. It reports findings by
   severity.
4. **Fix every finding** in the plan, low ones included.
5. **Repeat 3–4** until a round reports only low findings. Fix those and stop
   looping. Don't run another round after an all-low round.
6. **Present the plan to Sára and wait.** Implement only after she confirms. If
   she changes the plan, update it and go back to step 3 for the changed parts.

## Phase 2: Implement (after confirmation)

1. **Implement the confirmed plan, with tests covering every new code path.**
   Record decisions in `decisions.md` and issues in `issues.md` as usual.
2. **Run the tests and `npm run build`.** Fix until everything passes.
3. **Independent review panel.** Start three fresh subagents in parallel, one per
   lens. Each gets the request, the confirmed plan and the diff
   (`git diff HEAD`), but not my conclusions.
   - **Correctness:** requirements met; races; Back, Restart and the menu; phones
     (the D14 layout, rotation, fullscreen); reloads mid-feature; old saves.
   - **Security:** untrusted content reaching `innerHTML`; paths and URLs built
     from story data; localStorage parsing; new dependencies; anything fetched
     from elsewhere.
   - **Maintainability:** matches the surrounding code; no speculative
     abstraction; config over magic numbers where tuning is expected; docs
     (`CLAUDE.md`, `story.md`, `decisions.md`, `issues.md`) updated.
4. **Fix every finding** and rerun the tests and the build.
5. **Repeat 3–4** until a round reports only low findings. Fix those, rerun the
   tests, and finish. No further panel after an all-low round.
6. **Report:** what changed, test results, what was left out and why.

Standing rules still apply. Don't commit or push unless asked (a push to `main`
deploys). Once something is pushed, D11 applies: it isn't done until it has been
tested on the live site.

## Tests

The automated checks are Playwright scripts that drive the installed Chrome. They
currently live **outside the repo**, in `C:\tmp\claude`:

| script | covers |
|---|---|
| `mobile-check/mobile.mjs [local\|live\|<url>] [viewport…]` | the main suite on 5 viewports: layout (D14), rotate hint, fullscreen, menu, settings, autoread, music continuity, failed image loads, end card, gallery, the minigame. `local` starts its own Vite server. |
| `mobile-check/chrome-music.mjs <url>` | music when the browser blocks autoplay (simulated: headless browsers never block) |
| `mobile-check/playthrough.mjs`, `stress.mjs` | play-throughs; rapid taps, Back and resizes |
| `ff/ff.mjs`, `ff/ff-music.mjs` | the installed Firefox via puppeteer-core (args `-wait-for-browser -no-remote`) |

New code paths get new checks in these scripts, usually `mobile.mjs`. Whether the
suite should move into the repo (e.g. `tests/` with `playwright-core` as a
devDependency) is open: ask Sára before moving it.
