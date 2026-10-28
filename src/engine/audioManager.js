import { Howl, Howler } from 'howler';

const TRACK_VOLUME = 0.75;

export class AudioManager {
  constructor(musicAssets, volume) {
    this.musicAssets = musicAssets;
    this.currentTrack = null;
    this.currentKey = null;
    this.setVolume(volume);
  }

  /** Master volume 0–1 (Nastavení → Hlasitost hudby). */
  setVolume(volume) {
    Howler.volume(volume);
  }

  /**
   * Plays the scene's track (a key of story.assets.music). The same key as the
   * current track keeps playing from where it is; no key means silence (D20).
   */
  playMusic(key = null) {
    if (key === this.currentKey) return;

    // Fade out the old track (not whatever this.currentTrack is when the fade ends). One that
    // never started (still loading, or blocked until the first tap) is dropped at once:
    // Howler would queue the fade and its pending play would start later over the new track.
    const previous = this.currentTrack;
    if (previous?.playing()) {
      previous.fade(previous.volume(), 0, 350);
      previous.once('fade', () => previous.unload());
    } else {
      previous?.unload();
    }

    this.currentKey = key;
    this.currentTrack = null;
    if (!key) return;

    const src = this.musicAssets[key];
    if (!src) {
      console.warn(`Missing music asset: ${key}`);
      return;
    }

    // html5: streams the multi-MB mp3 instead of downloading and decoding it all first.
    // ponytail: iOS ignores HTML5 audio volume, so the volume slider and fades do nothing on iPhone.
    const track = new Howl({ src: [src], loop: true, volume: 0, html5: true });
    // The menu track starts before any tap, which browsers block: retry once Howler unlocks audio.
    track.once('playerror', () => track.once('unlock', () => track.play()));
    track.play();
    track.fade(0, TRACK_VOLUME, 650);
    this.currentTrack = track;
  }
}
