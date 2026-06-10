import { Howl, Howler } from 'howler';

export class AudioManager {
  constructor(musicAssets) {
    this.musicAssets = musicAssets;
    this.currentTrack = null;
    this.currentKey = null;
    Howler.volume(0.75);
  }

  playMusic(key) {
    if (!key || key === this.currentKey) return;

    this.currentTrack?.fade(0.75, 0, 350);
    this.currentTrack?.once('fade', () => this.currentTrack?.stop());

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
