import { Howl, Howler } from 'howler';

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

  playMusic(key) {
    if (!key || key === this.currentKey) return;

    // Stop the old track, not whatever this.currentTrack is when the fade ends.
    const previous = this.currentTrack;
    previous?.fade(0.75, 0, 350);
    previous?.once('fade', () => previous.stop());

    const src = this.musicAssets[key];
    if (!src) {
      console.warn(`Missing music asset: ${key}`);
      return;
    }

    this.currentKey = key;
    this.currentTrack = new Howl({ src: [src], loop: true, volume: 0 });
    this.currentTrack.play();
    this.currentTrack.fade(0, 0.75, 650);
  }
}
