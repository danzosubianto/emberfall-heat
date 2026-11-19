// audio.js — every sound in Emberfall Heat is synthesised live with WebAudio.
//
// No audio files exist in this game: the engine is two detuned oscillators
// whose pitch follows the revs, the siren is an LFO sweeping a triangle
// wave, a crash is a burst of filtered noise, and the ambient score is a
// slow four-chord pad that warms up at night. The context is created lazily
// on the first user gesture, as browsers require.

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.engineFilter = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.padTimer = 0;
    this.padStep = 0;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return true;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(this.ctx.destination);
    return true;
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 0.5;
  }

  // --- the car engine: call every frame while driving ---------------------
  setEngine(rpm, load) {
    if (!this.ctx) return;
    if (!this.engineOsc) {
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      const sub = this.ctx.createOscillator();
      sub.type = 'square';
      this.engineFilter = this.ctx.createBiquadFilter();
      this.engineFilter.type = 'lowpass';
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0;
      this.engineOsc.connect(this.engineFilter);
      sub.connect(this.engineFilter);
      this.engineFilter.connect(this.engineGain);
      this.engineGain.connect(this.master);
      this.engineOsc.start();
      sub.start();
      this.engineSub = sub;
    }
    const t = this.ctx.currentTime;
    const freq = 55 + rpm * 165;
    this.engineOsc.frequency.setTargetAtTime(freq, t, 0.05);
    this.engineSub.frequency.setTargetAtTime(freq * 0.5, t, 0.05);
    this.engineFilter.frequency.setTargetAtTime(300 + load * 1400 + rpm * 500, t, 0.08);
    this.engineGain.gain.setTargetAtTime(0.05 + load * 0.11, t, 0.09);
  }

  stopEngine() {
    if (this.engineGain && this.ctx) {
      this.engineGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.06);
    }
  }

  // --- the police siren: on while any cop is close and hunting ------------
  setSiren(active, distance01) {
    if (!this.ctx) return;
    if (active && !this.sirenOsc) {
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenOsc.type = 'triangle';
      const lfo = this.ctx.createOscillator();
      lfo.type = 'square';
      lfo.frequency.value = 0.65;
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.value = 130;
      lfo.connect(lfoGain);
      lfoGain.connect(this.sirenOsc.frequency);
      this.sirenOsc.frequency.value = 780;
      this.sirenGain = this.ctx.createGain();
      this.sirenGain.gain.value = 0;
      this.sirenOsc.connect(this.sirenGain);
      this.sirenGain.connect(this.master);
      this.sirenOsc.start();
      lfo.start();
      this.sirenLfo = lfo;
    }
    if (this.sirenGain) {
      const target = active ? 0.028 + (1 - distance01) * 0.05 : 0;
      this.sirenGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.2);
    }
  }

  // --- one-shots -----------------------------------------------------------
  blip(freq = 660, dur = 0.07, vol = 0.12, type = 'square') {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  pickupChime() {
    this.blip(880, 0.09, 0.12, 'sine');
    setTimeout(() => this.blip(1318, 0.14, 0.12, 'sine'), 60);
  }

  cashRegister() {
    this.blip(1174, 0.06, 0.1, 'square');
    setTimeout(() => this.blip(1568, 0.12, 0.1, 'square'), 55);
  }

  crash(intensity = 1) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const dur = 0.18 + intensity * 0.2;
    const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * dur, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 500 + intensity * 500;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.22 * Math.min(1, intensity);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t);
    this.blip(90, dur, 0.16, 'sine');
  }

  gunshot() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.09, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 2);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 700;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.25;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t);
  }

  punch() {
    this.blip(140, 0.08, 0.18, 'sine');
  }

  // --- the ambient pad: a slow Am–F–C–G wash under everything -------------
  updatePad(dt, night) {
    if (!this.ctx) return;
    this.padTimer -= dt;
    if (this.padTimer > 0) return;
    this.padTimer = 4.2;
    const chords = [
      [110.0, 164.81, 261.63],
      [87.31, 174.61, 220.0],
      [130.81, 196.0, 329.63],
      [98.0, 146.83, 246.94],
    ];
    const chord = chords[this.padStep % chords.length];
    this.padStep++;
    const t = this.ctx.currentTime;
    for (const freq of chord) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq * (night ? 1 : 2);
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(night ? 0.035 : 0.02, t + 1.4);
      gain.gain.linearRampToValueAtTime(0, t + 4.4);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(t);
      osc.stop(t + 4.6);
    }
  }
}
