import { Howl, Howler } from 'howler';
import { resolveAssetPath } from './assetPath.js';

// Per-track volume; the slider (Nastavení) scales it via Howler's master volume, so the
// default slider (0.75) plays tracks at 0.75 × 0.75.
const TRACK_VOLUME = 0.75;
const FADE_IN_MS = 650;
const FADE_OUT_MS = 350;
const UNLOAD_MARGIN_MS = 50; // a replaced track is unloaded this long after its fade-out ends

export class AudioManager {
  constructor(musicAssets, volume, resumeMusic) {
    this.musicAssets = musicAssets;
    // Keys whose position is remembered when they are switched away, and continued on the next visit
    // (D26). In memory only: a reload starts them over, and so does a new game (forgetPositions).
    this.resumable = new Set(resumeMusic);
    this.positions = new Map(); // key → seconds
    this.forgottenTrack = null; // the track playing when a new game began (forgetPositions)
    for (const key of this.resumable) {
      if (this.musicPath(key) === null) console.warn('resumeMusic names no music asset:', key);
    }
    this.currentTrack = null;
    this.currentKey = null;
    this.setVolume(volume);

    // Browsers keep sound off until the first click, tap or key (D22). Firefox even lets a
    // silent track start and then pauses it for good once its volume rises, so no track
    // starts before this page has seen that input; the one waiting starts on it.
    // (Not navigator.userActivation alone: automated browsers report it set on a fresh load.)
    this.userActive = false;
    this.startWhenActive = null;
    this.resumeOnShow = false;
    this.fading = new Map(); // key → { track, timer } of tracks fading out after a switch
    this.soundIds = new WeakMap(); // track → the id of its sound (see playTrack)
    const firstInput = new AbortController();
    const activate = () => {
      // Tab, arrows, Escape or a touch that scrolls don't unlock sound: keep waiting.
      if (navigator.userActivation?.hasBeenActive === false) return;
      firstInput.abort();
      // Only once this event is fully handled: Howler's own unlock (a listener on the same
      // event) reloads every audio element that hasn't played yet, which aborts a play()
      // started before it.
      setTimeout(() => {
        this.userActive = true;
        const start = this.startWhenActive;
        this.startWhenActive = null;
        start?.();
      }, 0);
    };
    for (const type of ['click', 'keydown', 'touchend']) {
      document.addEventListener(type, activate, { capture: true, signal: firstInput.signal });
    }

    // A locked tablet or a switched app pauses the music instead of looping it in a pocket.
    // Muting too: Howler can't run a pause() while a play() is still loading or starting (it
    // queues it), and muted, whatever it does meanwhile stays silent.
    document.addEventListener('visibilitychange', () => {
      const track = this.currentTrack;
      Howler.mute(document.hidden);
      if (document.hidden) {
        this.resumeOnShow = this.userActive && Boolean(track);
        const started = Boolean(track?.playing());
        track?.pause();
        // pause() ends a running fade-in at its target for the sound but not for the track's own
        // volume, which the next fade-out starts from: keep them equal, or that fade-out is a cut.
        // Only for a track that has started: one still waiting must start silent and fade in.
        if (started) track.volume(TRACK_VOLUME);
      } else if (this.resumeOnShow) {
        this.resumeOnShow = false;
        // Not if it is still (or again) playing: a second play() would start a second copy.
        if (track && !track.playing()) this.playTrack(track);
        // "Playing" can also mean its first play() is still starting, with the hide's pause()
        // queued behind it: once it has started, start it again if that pause stopped it.
        else track?.once('play', () => setTimeout(() => {
          if (this.currentTrack === track && !document.hidden && !track.playing()) this.playTrack(track);
        }));
      }
    });
  }

  /** Every resumable track starts from the beginning again (a new game, D26). */
  forgetPositions() {
    this.positions.clear();
    // Also the one still playing: the new game's first scene switches away from it after this.
    this.forgottenTrack = this.currentTrack;
  }

  // Every play() goes through here, on the track's own sound by its id: a bare play() while Howler holds
  // its play lock with the sound still paused (a resumed start buffering at its position, D26) starts a
  // second copy, and a bare play() of an ended sound re-ids it. The first call keeps the id Howler gives
  // the sound; later calls pass it, so it doesn't change.
  playTrack(track) {
    const id = track.play(this.soundIds.get(track));
    if (typeof id === 'number') this.soundIds.set(track, id); // Howler can return null or undefined
  }

  // A music key's mp3 path, or null. Paths only: a typo like "toString" or "__proto__" finds a function or
  // an object, never a string, and must not reach the path code and break the scene. The string test comes
  // first: an odd JSON object may not even convert to a property name.
  musicPath(key) {
    const src = typeof key === 'string' ? this.musicAssets[key] : null;
    return typeof src === 'string' ? src : null;
  }

  /** Master volume 0–1 (Nastavení → Hlasitost hudby). */
  setVolume(volume) {
    Howler.volume(volume);
  }

  /**
   * Plays the scene's track (a key of story.assets.music). The same key as the
   * current track keeps playing from where it is; no key means silence (D21).
   */
  playMusic(key = null) {
    if (key === this.currentKey) {
      // Same track: keep it going. One that stopped (a play() the browser refused) starts
      // again here, inside the player's tap, instead of staying silent for every scene.
      const track = this.currentTrack;
      this.forgottenTrack = null; // it goes on in the new game: its position counts again
      if (track && this.userActive && !document.hidden && track.state() === 'loaded' && !track.playing()) {
        this.playTrack(track);
      }
      return;
    }

    // Back to a track that is still fading out (a quick Back, or two): fade it back in instead
    // of starting a second copy from the beginning over it.
    const revived = this.fading.get(key);
    if (revived) {
      clearTimeout(revived.timer);
      this.fading.delete(key);
    }

    // Fade out the old track (not whatever this.currentTrack is when the fade ends). One that
    // never started (still loading, or waiting for the first input) is dropped at once.
    const previous = this.currentTrack;
    const previousKey = this.currentKey;
    if (previous?.playing()) {
      // Only a track that played has a position worth keeping (one still loading would store 0).
      if (this.resumable.has(previousKey) && previous !== this.forgottenTrack) {
        this.positions.set(previousKey, previous.seek());
      }
      previous.fade(previous.volume(), 0, FADE_OUT_MS);
      // A timer, not Howler's 'fade' event: that never fires for a 0 → 0 fade (switched while
      // the fade-in was still at 0), which left the old track looping silently forever.
      const timer = setTimeout(() => {
        previous.unload();
        // Ours for sure: a revive of this key clears the timer, and a new track for the key is only
        // made once this entry is gone.
        this.fading.delete(previousKey);
      }, FADE_OUT_MS + UNLOAD_MARGIN_MS);
      this.fading.set(previousKey, { track: previous, timer });
    } else {
      previous?.unload();
    }
    this.forgottenTrack = null; // switched away from: a revive of it later counts as a normal track

    this.currentKey = key;
    this.currentTrack = null;
    // The waiting start belongs to the track just dropped: Howler would still play it,
    // unloaded and invisible, at volume 0 (audible on iPhone). Dropped here, and start()
    // checks it is still current too: two guards on purpose, so one refactor can't undo it.
    this.startWhenActive = null;
    if (!key) return;

    if (revived) {
      this.currentTrack = revived.track;
      revived.track.fade(revived.track.volume(), TRACK_VOLUME, FADE_IN_MS);
      return;
    }

    const src = this.musicPath(key);
    if (src === null) {
      console.warn('Missing music asset:', key); // not in a template: an odd key may not convert to text
      return;
    }

    // html5: streams the multi-MB mp3 instead of downloading and decoding it all first.
    // ponytail: iOS ignores HTML5 audio volume, so the volume slider and fades do nothing on iPhone.
    const track = new Howl({ src: [resolveAssetPath(src)], loop: true, volume: 0, html5: true });
    // Back where the last visit left it: Howler queues the seek until the track has loaded, and runs it
    // before the queued play() (Chrome then buffers at that position before the 'play' event).
    if (this.positions.has(key)) track.seek(this.positions.get(key));
    // Its <audio> element may come from Howler's pool still muted (unloaded while the page was
    // hidden); Howler.mute(false) on show only reaches tracks that existed then.
    Howler.mute(document.hidden);
    this.currentTrack = track;
    const start = () => {
      if (this.currentTrack !== track) return; // replaced before it could start (see playMusic)
      // Fade in on 'play', not right after play(): on an already loaded track Howler queues a
      // fade behind its play lock and never runs it, leaving the track playing at volume 0.
      track.once('play', () => {
        if (this.currentTrack === track) track.fade(0, TRACK_VOLUME, FADE_IN_MS);
      });
      // Autoread can move on in a background tab: that scene's track waits for the page.
      if (document.hidden) this.resumeOnShow = true;
      else this.playTrack(track);
    };
    if (this.userActive) start();
    else this.startWhenActive = start;
  }
}
