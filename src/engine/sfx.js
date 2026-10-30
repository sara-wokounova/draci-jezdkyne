import { Howl, Howler } from 'howler';
import { resolveAssetPath } from './assetPath.js';

// Sound effects (D29): short clips decoded into memory and played through Web Audio, apart from the music's
// HTML5 streaming. One Howl per file for the whole page, so a retry loads nothing again. Nothing here throws:
// a sound must never break the game. Relies on Howler 2.2.4 internals: reads `howl._webAudio`, sets `Howler.state`,
// calls `Howler._autoSuspend()`, and counts on Howler's pending suspend timer checking `autoSuspend` again when it
// fires (keepAudioAwake). After a Howler upgrade rerun minigame-roza.mjs 29d, 29e and 29h.

export const EFFECT_MIX = 0.7; // every effect's volume before the effects slider (Sára: all equal)
// Nastavení's test sound: Bezzubka's hitSound in dragonAttack's DEFAULTS (rename both together).
const TEST_SOUND_SRC = 'assets/minigames/dragon-attack/sfx/fireball_hit.mp3';

const howls = new Map(); // src → Howl, or null once it failed
let effectsVolume = 1; // startup sets the saved one (setEffectsVolume)
let roundAwake = false; // keepAudioAwake: a minigame round runs

// A hidden page mid-round (a phone locked): Pixi's ticker stops, the round never ends, and Howler is muted (D22):
// let the context sleep as usual until the page comes back (the next tap or key resumes it).
document.addEventListener('visibilitychange', () => {
  if (roundAwake) updateAutoSuspend();
});

/** Nastavení → Hlasitost efektů, 0–1. */
export function setEffectsVolume(volume) {
  effectsVolume = volume;
}

/** The page's Howl for an effect file, loading from the first call; null without Web Audio or once it failed. */
export function sound(src) {
  try {
    if (howls.has(src)) return howls.get(src);
    Howler.volume(); // the getter sets up Howler's AudioContext if nothing has yet (a story without menu music)
    if (!Howler.usingWebAudio || !Howler.masterGain) return null;
    // A failed load, or Howler's fallback to HTML5 audio after a network error (streamed, and ignoring the
    // volume on iPhone): this file stays silent for the page. (Howler calls listeners on a timer: never before
    // this function returns.)
    const fail = () => {
      if (howls.get(src) === null) return;
      howls.set(src, null);
      howl.unload();
      console.warn('Sound failed to load', src);
    };
    // onloaderror in the options: Howler reads its listeners when it reports an error, and some errors (a path
    // without an audio extension) it reports from inside the constructor, before a listener added afterwards exists.
    const howl = new Howl({ src: [resolveAssetPath(src)], html5: false, preload: true, onloaderror: fail });
    howl.once('load', () => { if (!howl._webAudio) fail(); });
    howls.set(src, howl);
    return howl;
  } catch {
    return null;
  }
}

/** Plays a loaded effect at mix × the effects slider; nothing while it loads, after a failure or with the
 *  AudioContext not running (so nothing piles up to play late). */
export function playSound(howl, mix) {
  try {
    if (howl?.state() !== 'loaded' || Howler.ctx?.state !== 'running') return;
    // Also checked on 'load' (sound()), on purpose twice: Howler fires 'load' on a timer, so a tick can meet a loaded
    // Howl that has fallen back to HTML5 before that listener has unloaded it.
    if (!howl._webAudio) {
      howl.unload();
      return;
    }
    // The Howl's own volume, before play(): a start Howler still queues plays at this level from its first sample.
    howl.volume(mix * effectsVolume);
    howl.play();
  } catch {
    // a sound must never break the game
  }
}

/** Starts loading Nastavení's test sound (when the page opens). */
export function loadTestSound() {
  sound(TEST_SOUND_SRC);
}

/** Plays Nastavení's test sound at the effects level, stopping one still ringing (a held arrow key). */
export function playTestSound() {
  const sample = sound(TEST_SOUND_SRC);
  try {
    if (sample?.state() === 'loaded') sample.stop();
  } catch {
    // never throws
  }
  playSound(sample, EFFECT_MIX);
}

/** No auto-suspend while a minigame round runs: Howler suspends the AudioContext 30 s after the last sound (a timer
 *  that can still be pending when a round starts), and the shot that would wake it again plays nothing. */
export function keepAudioAwake(awake) {
  roundAwake = awake;
  updateAutoSuspend();
}

// Howler arms its timer only when a sound ends, and the ends during the round were ignored: arm it here (it waits
// while a sound still plays, whose end arms it then).
function updateAutoSuspend() {
  Howler.autoSuspend = !roundAwake || document.hidden;
  if (!Howler.autoSuspend) return;
  try {
    Howler._autoSuspend();
  } catch {
    // the context just stays awake
  }
}

/**
 * Resumes a suspended AudioContext (Howler suspends it 30 s after the last sound). Resolves once it runs, or at
 * once without one; never rejects. Never awaited where the game must go on: an interrupted iOS context resumes
 * only when the interruption ends.
 */
export function resumeAudio() {
  try {
    const ctx = Howler.ctx;
    // ctx.state still says 'running' while Howler's own suspend is in flight: ask Howler too.
    if (!ctx || (ctx.state === 'running' && Howler.state === 'running')) return Promise.resolve();
    return ctx.resume().then(() => {
      // Howler marks itself running only after its own resume; until then it queues the plays it sees.
      if (Howler.ctx === ctx && ctx.state === 'running') Howler.state = 'running';
    }, () => {});
  } catch {
    return Promise.resolve();
  }
}
