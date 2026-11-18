// The wisent song's tones (D46), synthesised with Web Audio: no file to load, so the first tap of the first round
// sounds, at exact pitches, for any length. A soft wooden-flute voice for Róza's notes and the player's taps, and
// Rubínka's sour reed for her red tones. One voice per key (the game uses one per star for Róza, one per star for the
// player and one for the red tones): a new note on a key cuts its last one. No Howler, no check of the context's state
// (an OfflineAudioContext renders it too): the game plays a tone only while its context runs.

const FLUTE_PEAK = 0.38; // one note's peak before the effects' bus (≈ −14 dBFS RMS, the effect files' level, D29)
const RED_PEAK = FLUTE_PEAK * 2; // the reed's band-pass takes most of its energy: about the flute's loudness after it
const SUSTAIN = 0.7; // the flute settles to this share of its peak
const RELEASE = 0.08; // s, time constant after a note's length (≈ 0.4 s to silence)
const CUT = 0.03; // s, the fade when a new note on the same key cuts the last one

/** Holds a gain where it is now and fades it out from `at` (a cut during the attack doesn't click). */
function fadeOut(param, at, constant) {
  if (typeof param.cancelAndHoldAtTime === 'function') param.cancelAndHoldAtTime(at);
  else { // Firefox
    const value = param.value;
    param.cancelScheduledValues(at);
    param.setValueAtTime(value, at);
  }
  param.setTargetAtTime(0, at, constant);
}

/** The voices on `ctx`, into `output`. Each call is wrapped by the caller: a sound must never break the game. */
export function createVoices(ctx, output) {
  const live = new Map(); // key → { stop(at) }
  let noise = null;
  const noiseBuffer = () => {
    if (noise) return noise;
    noise = ctx.createBuffer(1, Math.round(ctx.sampleRate * 0.2), ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return noise;
  };
  const cut = (key, at) => {
    live.get(key)?.stop(at);
    live.delete(key);
  };

  /** A flute note on `key` now: `freq` Hz, held `dur` s, `attack` s to its peak (35 ms for Róza, 8 ms for a tap). */
  function play(key, freq, dur, attack = 0.035) {
    const t = ctx.currentTime;
    cut(key, t);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(FLUTE_PEAK, t + attack);
    env.gain.setTargetAtTime(FLUTE_PEAK * SUSTAIN, t + attack, 0.12);
    const end = t + Math.max(0.12, dur);
    env.gain.setTargetAtTime(0, end, RELEASE);
    env.connect(output);
    const oscillators = [[1, 1], [2, 0.12], [3, 0.05]].map(([harmonic, level]) => {
      const o = ctx.createOscillator();
      o.frequency.value = freq * harmonic;
      const gain = ctx.createGain();
      gain.gain.value = level;
      o.connect(gain).connect(env);
      return o;
    });
    // A 5 Hz vibrato (±0.4 %) fading in after the attack.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5;
    const depth = ctx.createGain();
    depth.gain.setValueAtTime(0, t);
    depth.gain.linearRampToValueAtTime(freq * 0.004, t + 0.3);
    lfo.connect(depth);
    oscillators.forEach((o) => depth.connect(o.frequency));
    oscillators.push(lfo);
    // A breath at the onset.
    const breath = ctx.createBufferSource();
    breath.buffer = noiseBuffer();
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = freq * 2;
    band.Q.value = 1.5;
    const breathGain = ctx.createGain();
    breathGain.gain.setValueAtTime(0.25, t);
    breathGain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    breath.connect(band).connect(breathGain).connect(env);
    oscillators.forEach((o) => {
      o.start(t);
      o.stop(end + 0.6);
    });
    breath.start(t);
    live.set(key, {
      stop(at) {
        fadeOut(env.gain, at, CUT);
        oscillators.forEach((o) => { try { o.stop(at + 0.2); } catch { /* already stopped */ } });
      },
    });
  }

  /** Rubínka's red tone: two sawtooths ±12 cents through a band-pass, 30 cents flat and sinking 60 more. */
  function red(freq, dur) {
    const key = 'red';
    const t = ctx.currentTime;
    cut(key, t);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(RED_PEAK, t + 0.02);
    env.gain.setTargetAtTime(0, t + dur, 0.05);
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 1400;
    band.Q.value = 2;
    band.connect(env).connect(output);
    const oscillators = [-12, 12].map((cents) => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(freq * 2 ** ((cents - 30) / 1200), t);
      o.frequency.linearRampToValueAtTime(freq * 2 ** ((cents - 90) / 1200), t + dur);
      o.connect(band);
      o.start(t);
      o.stop(t + dur + 0.4);
      return o;
    });
    live.set(key, {
      stop(at) {
        fadeOut(env.gain, at, 0.02);
        oscillators.forEach((o) => { try { o.stop(at + 0.15); } catch { /* already stopped */ } });
      },
    });
  }

  return { play, red, stopAll: () => [...live.keys()].forEach((key) => cut(key, ctx.currentTime)) };
}
