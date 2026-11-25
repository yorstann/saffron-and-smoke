// audio.js — every sound in Saffron & Smoke is synthesised with WebAudio: short
// oscillator blips for the till and the timer bell, shaped noise for knife work and
// the frying pan. No audio files, nothing to load. The context wakes on the first
// user gesture, as browsers require.

export class SoundKit {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.sizzleGain = null;
  }

  wake() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    this.startSizzleBed();
  }

  /** A looping filtered-noise bed whose gain follows how much is frying. */
  startSizzleBed() {
    const ctx = this.ctx;
    const length = ctx.sampleRate * 1.5;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 5200;
    filter.Q.value = 0.6;
    this.sizzleGain = ctx.createGain();
    this.sizzleGain.gain.value = 0;
    source.connect(filter).connect(this.sizzleGain).connect(this.master);
    source.start();
  }

  setSizzle(level) {
    if (!this.sizzleGain || !this.ctx) return;
    const target = Math.min(0.16, level * 0.07);
    this.sizzleGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.2);
  }

  tone(freq, dur, type = 'sine', vol = 0.2, when = 0, slideTo = null) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(vol, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  noiseBurst(dur, freq, vol = 0.25, when = 0) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + when;
    const length = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.value = vol;
    source.connect(filter).connect(gain).connect(this.master);
    source.start(t0);
  }

  chop() { this.noiseBurst(0.07, 900, 0.5); this.tone(180, 0.05, 'square', 0.06); }
  pickup() { this.tone(520, 0.07, 'triangle', 0.15, 0, 760); }
  place() { this.tone(340, 0.06, 'triangle', 0.14, 0, 240); }
  ding() { this.tone(1318, 0.5, 'sine', 0.22); this.tone(1760, 0.4, 'sine', 0.1, 0.02); }
  coin() {
    this.tone(988, 0.09, 'square', 0.12);
    this.tone(1319, 0.12, 'square', 0.12, 0.07);
    this.tone(1568, 0.22, 'square', 0.1, 0.14);
  }
  error() { this.tone(160, 0.18, 'sawtooth', 0.12, 0, 110); }
  pop() { this.tone(660, 0.08, 'sine', 0.18, 0, 990); }
  trash() { this.noiseBurst(0.16, 500, 0.3); }
  unlock() {
    this.tone(523, 0.1, 'triangle', 0.15);
    this.tone(784, 0.16, 'triangle', 0.15, 0.08);
  }
}
