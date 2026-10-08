// Synthetische Klänge mit der Web Audio API (keine Audiodateien nötig)
const RANGES = {
  ar: 230, smg: 170, pistol: 170, shotgun: 200, sniper: 420, rocket: 220, explosion: 320,
  pickaxe: 30, pickaxeDirt: 25, crit: 30, swing: 15, build: 45, break: 70, chestOpen: 25,
  ammoBox: 25, glider: 50, land: 30, step: 26,
};

export class AudioSys {
  constructor() {
    this.ctx = null;
    this.volume = 0.6;
    this.lx = 0; this.ly = 0; this.lz = 0; this.lyaw = 0;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const c = this.ctx;
    this.comp = c.createDynamicsCompressor();
    this.comp.threshold.value = -14;
    this.comp.ratio.value = 6;
    this.master = c.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.comp);
    this.comp.connect(c.destination);
    const len = c.sampleRate * 2;
    this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.loops = {};
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  setListener(x, y, z, yaw) {
    this.lx = x; this.ly = y; this.lz = z; this.lyaw = yaw;
  }

  spatial(pos, range) {
    if (!pos) return { g: 1, pan: 0 };
    const dx = pos.x - this.lx, dy = (pos.y ?? this.ly) - this.ly, dz = pos.z - this.lz;
    const d = Math.hypot(dx, dy, dz);
    const f = Math.max(0, 1 - d / range);
    if (f <= 0) return { g: 0, pan: 0 };
    const rx = Math.cos(this.lyaw), rz = -Math.sin(this.lyaw);
    const pan = d > 0.5 ? (dx * rx + dz * rz) / d : 0;
    return { g: f * f, pan: pan * 0.8 };
  }

  out(g, pan) {
    const c = this.ctx;
    const gain = c.createGain();
    gain.gain.value = g;
    if (c.createStereoPanner) {
      const p = c.createStereoPanner();
      p.pan.value = pan;
      gain.connect(p);
      p.connect(this.master);
    } else gain.connect(this.master);
    return gain;
  }

  noise(dest, t0, dur, type, freq, q, vol, attack = 0.002, sweepTo = null) {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t0);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t0 + dur);
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f);
    f.connect(g);
    g.connect(dest);
    src.start(t0, Math.random());
    src.stop(t0 + dur + 0.05);
  }

  tone(dest, t0, dur, type, f0, f1, vol, attack = 0.005) {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(dest);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  play(name, pos) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const { g, pan } = this.spatial(pos, RANGES[name] || 60);
    if (g < 0.01) return;
    const c = this.ctx;
    const t = c.currentTime;
    const o = this.out(g, pan);
    switch (name) {
      case 'ar':
        this.noise(o, t, 0.16, 'bandpass', 1300, 0.7, 0.9);
        this.tone(o, t, 0.09, 'sine', 140, 50, 0.7);
        break;
      case 'smg':
        this.noise(o, t, 0.09, 'bandpass', 1900, 0.8, 0.7);
        this.tone(o, t, 0.05, 'square', 220, 90, 0.2);
        break;
      case 'pistol':
        this.noise(o, t, 0.12, 'bandpass', 1600, 0.9, 0.8);
        this.tone(o, t, 0.06, 'sine', 300, 90, 0.4);
        break;
      case 'shotgun':
        this.noise(o, t, 0.45, 'lowpass', 1800, 0.5, 1.0, 0.002, 300);
        this.tone(o, t, 0.2, 'sine', 90, 40, 0.9);
        this.noise(o, t + 0.42, 0.05, 'highpass', 2500, 1, 0.3);
        this.noise(o, t + 0.55, 0.05, 'highpass', 2000, 1, 0.3);
        break;
      case 'sniper':
        this.noise(o, t, 0.7, 'lowpass', 2600, 0.6, 1.0, 0.002, 200);
        this.tone(o, t, 0.25, 'sine', 120, 35, 1.0);
        break;
      case 'rocket':
        this.noise(o, t, 0.6, 'bandpass', 600, 0.6, 0.8, 0.02, 1800);
        break;
      case 'explosion':
        this.noise(o, t, 1.4, 'lowpass', 900, 0.4, 1.0, 0.005, 120);
        this.tone(o, t, 0.6, 'sine', 70, 28, 1.0);
        break;
      case 'pickaxe':
        this.noise(o, t, 0.1, 'lowpass', 700, 1, 0.8);
        this.tone(o, t, 0.12, 'triangle', 190, 90, 0.6);
        break;
      case 'pickaxeDirt':
        this.noise(o, t, 0.12, 'lowpass', 400, 0.7, 0.6);
        break;
      case 'crit':
        this.noise(o, t, 0.08, 'lowpass', 900, 1, 0.6);
        this.tone(o, t, 0.25, 'sine', 1320, 1320, 0.35);
        this.tone(o, t + 0.03, 0.3, 'sine', 1980, 1980, 0.25);
        break;
      case 'swing':
        this.noise(o, t, 0.15, 'bandpass', 800, 1.5, 0.25, 0.04, 2400);
        break;
      case 'hit':
        this.tone(o, t, 0.05, 'square', 1700, 1500, 0.12);
        break;
      case 'headshot':
        this.tone(o, t, 0.12, 'sine', 2400, 2400, 0.35);
        this.tone(o, t, 0.08, 'square', 1800, 1600, 0.1);
        break;
      case 'shieldBreak':
        this.noise(o, t, 0.4, 'highpass', 3000, 0.7, 0.5);
        this.tone(o, t, 0.4, 'triangle', 1400, 400, 0.4);
        break;
      case 'hurt':
        this.noise(o, t, 0.15, 'lowpass', 500, 1, 0.6);
        this.tone(o, t, 0.15, 'sine', 160, 80, 0.5);
        break;
      case 'build':
        this.noise(o, t, 0.07, 'bandpass', 1000, 1.5, 0.7);
        this.tone(o, t, 0.1, 'triangle', 330, 220, 0.4);
        break;
      case 'break':
        this.noise(o, t, 0.4, 'bandpass', 500, 0.6, 0.9, 0.003, 150);
        this.noise(o, t + 0.08, 0.15, 'bandpass', 1200, 1, 0.4);
        break;
      case 'pickup':
        this.tone(o, t, 0.12, 'sine', 660, 990, 0.35);
        break;
      case 'pickupSmall':
        this.tone(o, t, 0.06, 'sine', 880, 1100, 0.15);
        break;
      case 'chestOpen':
        [784, 988, 1175, 1568].forEach((f, i) => this.tone(o, t + i * 0.06, 0.4, 'triangle', f, f, 0.25));
        this.noise(o, t, 0.5, 'highpass', 5000, 0.5, 0.2, 0.05);
        break;
      case 'ammoBox':
        this.noise(o, t, 0.1, 'bandpass', 800, 1, 0.5);
        this.tone(o, t + 0.05, 0.15, 'square', 440, 660, 0.1);
        break;
      case 'reload':
        this.noise(o, t, 0.04, 'highpass', 3000, 1, 0.4);
        this.noise(o, t + 0.25, 0.04, 'highpass', 2500, 1, 0.35);
        break;
      case 'reloadDone':
        this.noise(o, t, 0.05, 'highpass', 2200, 1, 0.45);
        this.tone(o, t, 0.04, 'square', 900, 700, 0.08);
        break;
      case 'shell':
        this.noise(o, t, 0.05, 'bandpass', 1800, 2, 0.35);
        break;
      case 'empty':
        this.tone(o, t, 0.03, 'square', 1200, 1000, 0.15);
        break;
      case 'healStart':
        this.tone(o, t, 0.3, 'sine', 440, 660, 0.15);
        break;
      case 'healDone':
        this.tone(o, t, 0.15, 'sine', 660, 660, 0.25);
        this.tone(o, t + 0.1, 0.25, 'sine', 990, 990, 0.25);
        break;
      case 'glider':
        this.noise(o, t, 0.6, 'bandpass', 500, 0.8, 0.5, 0.05, 1500);
        break;
      case 'land':
        this.noise(o, t, 0.15, 'lowpass', 300, 1, 0.6);
        break;
      case 'jump':
        this.noise(o, t, 0.08, 'lowpass', 500, 1, 0.25);
        break;
      case 'step':
        this.noise(o, t, 0.05, 'lowpass', 700, 1, 0.35);
        break;
      case 'elim':
        this.tone(o, t, 0.15, 'square', 523, 523, 0.15);
        this.tone(o, t + 0.12, 0.3, 'square', 784, 784, 0.15);
        break;
      case 'busHorn':
        this.tone(o, t, 0.25, 'sawtooth', 330, 330, 0.18, 0.02);
        this.tone(o, t, 0.25, 'sawtooth', 415, 415, 0.14, 0.02);
        this.tone(o, t + 0.32, 0.45, 'sawtooth', 330, 330, 0.18, 0.02);
        this.tone(o, t + 0.32, 0.45, 'sawtooth', 415, 415, 0.14, 0.02);
        break;
      case 'stormWarn':
        for (let i = 0; i < 3; i++) this.tone(o, t + i * 0.35, 0.3, 'sawtooth', 220, 180, 0.12, 0.02);
        break;
      case 'victory':
        [523, 659, 784, 1047, 784, 1047].forEach((f, i) => this.tone(o, t + i * 0.14, 0.5, 'square', f, f, 0.14, 0.01));
        [523, 659, 784].forEach((f) => this.tone(o, t + 0.9, 1.4, 'triangle', f, f, 0.2, 0.02));
        break;
      case 'defeat':
        [392, 330, 262].forEach((f, i) => this.tone(o, t + i * 0.25, 0.5, 'triangle', f, f * 0.98, 0.2));
        break;
      case 'ui':
        this.tone(o, t, 0.05, 'sine', 900, 1200, 0.15);
        break;
      default:
        break;
    }
  }

  // Dauerschleifen: Truhen-Summen, Wind, Sturm
  setLoop(name, level) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    let L = this.loops[name];
    if (!L) {
      if (level <= 0.001) return;
      const c = this.ctx;
      const g = c.createGain();
      g.gain.value = 0;
      g.connect(this.master);
      L = { g, nodes: [] };
      if (name === 'chest') {
        for (const f of [1046, 1318, 1568]) {
          const o = c.createOscillator();
          o.type = 'sine';
          o.frequency.value = f;
          const lfo = c.createOscillator();
          lfo.frequency.value = 3 + Math.random() * 2;
          const lg = c.createGain();
          lg.gain.value = 25;
          lfo.connect(lg);
          lg.connect(o.frequency);
          const og = c.createGain();
          og.gain.value = 0.05;
          o.connect(og);
          og.connect(g);
          o.start();
          lfo.start();
          L.nodes.push(o, lfo);
        }
      } else {
        const src = c.createBufferSource();
        src.buffer = this.noiseBuf;
        src.loop = true;
        const f = c.createBiquadFilter();
        f.type = name === 'storm' ? 'lowpass' : 'bandpass';
        f.frequency.value = name === 'storm' ? 320 : 700;
        f.Q.value = 0.6;
        src.connect(f);
        f.connect(g);
        src.start();
        L.nodes.push(src);
      }
      this.loops[name] = L;
    }
    L.g.gain.setTargetAtTime(level, this.ctx.currentTime, 0.15);
  }

  stopLoops() {
    if (!this.loops) return;
    for (const k in this.loops) {
      const L = this.loops[k];
      for (const n of L.nodes) { try { n.stop(); } catch (e) { /* bereits gestoppt */ } }
      L.g.disconnect();
    }
    this.loops = {};
  }
}
