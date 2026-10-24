// Original procedural club track + sfx (PRD §12). No samples, nothing borrowed.
// The music clock is driven by game time; gameplay never waits on audio.
export class Sound {
  private bass = [55, 55, 43.65, 49]; // A1 A1 F1 G1, one note per bar; replaced per skin
  private bassWave: OscillatorType = "sawtooth";

  setSkin(bass: number[], wave: OscillatorType): void {
    this.bass = bass;
    this.bassWave = wave;
  }

  /** Skin change: noise riser into a crash and a sub hit. */
  skinUp(): void {
    if (!this.sfx && !this.music) return;
    this.hiss(0.9, 0.16, 300, 0, 9000);
    this.hiss(1.2, 0.12, 5000, 0.35);
    this.tone(55, 0.8, "sine", 0.5, { slideTo: 30, delay: 0.35 });
    [0, 4, 7, 12].forEach((s, i) => this.tone(330 * Math.pow(2, s / 12), 0.5, "sawtooth", 0.05, { delay: 0.35 + i * 0.06, lp: 4000 }));
  }

  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  sfx = true;
  music = true;

  /** Must be called from a user gesture (autoplay policy). */
  unlock(): void {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.8;
      const comp = this.ctx.createDynamicsCompressor();
      this.master.connect(comp).connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 0.5;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, opts: { slideTo?: number; delay?: number; lp?: number } = {}): void {
    const c = this.ctx;
    if (!c || !this.master) return;
    const t = c.currentTime + (opts.delay ?? 0);
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (opts.slideTo) o.frequency.exponentialRampToValueAtTime(opts.slideTo, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node: AudioNode = o;
    if (opts.lp) {
      const f = c.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.setValueAtTime(opts.lp, t);
      f.frequency.exponentialRampToValueAtTime(Math.max(80, opts.lp / 6), t + dur);
      node = o.connect(f);
    }
    node.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private hiss(dur: number, vol: number, hp: number, delay = 0, sweepTo?: number): void {
    const c = this.ctx;
    if (!c || !this.noise || !this.master) return;
    const t = c.currentTime + delay;
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noise;
    f.type = sweepTo ? "bandpass" : "highpass";
    f.frequency.setValueAtTime(hp, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.master);
    s.start(t);
    s.stop(t + dur + 0.02);
  }

  move() { if (this.sfx) this.tone(1200, 0.025, "square", 0.02); }
  rotate() { if (this.sfx) this.tone(1600, 0.05, "triangle", 0.05, { slideTo: 2400 }); }
  lock(hard: boolean) {
    if (!this.sfx) return;
    this.tone(hard ? 120 : 170, 0.14, "sine", hard ? 0.35 : 0.2, { slideTo: 50 });
    if (hard) this.hiss(0.08, 0.08, 3000);
  }
  /** A new 2×2 block exists: bright pluck, the "you made one" moment. */
  formed(n: number) {
    if (!this.sfx) return;
    const base = 880 * Math.pow(2, Math.min(n - 1, 4) * 2 / 12);
    this.tone(base, 0.25, "sawtooth", 0.06, { lp: 6000 });
    this.tone(base * 1.5, 0.3, "triangle", 0.05, { delay: 0.04 });
  }
  clear(squares: number, combo: number) {
    if (!this.sfx) return;
    const root = 440 * Math.pow(2, Math.min(combo - 1, 9) / 12);
    const steps = [0, 4, 7, 12, 16, 19];
    const n = Math.min(steps.length, 3 + Math.floor(squares / 2));
    for (let i = 0; i < n; i++) this.tone(root * Math.pow(2, steps[i] / 12), 0.22, "sawtooth", 0.07, { delay: i * 0.045, lp: 5000 });
    this.hiss(0.45, 0.12, 400, 0, 8000); // riser whoosh
    this.tone(60, 0.35, "sine", 0.4, { slideTo: 35 }); // sub drop
  }
  gameOver() {
    if (!this.sfx) return;
    [440, 370, 311, 220, 147].forEach((f, i) => this.tone(f, 0.3, "sawtooth", 0.08, { delay: i * 0.15, lp: 2500 }));
  }

  /** One quarter note. `n` counts beats since the run started; `beatMs` is the beat length. */
  beat(n: number, beatMs: number) {
    if (!this.music || !this.ctx) return;
    const half = beatMs / 2000;
    this.tone(150, 0.28, "sine", 0.55, { slideTo: 42 });            // kick, every beat
    this.hiss(0.04, 0.05, 7000, half);                               // offbeat hat
    if (n % 4 === 1 || n % 4 === 3) this.hiss(0.14, 0.09, 1200);     // clap on 2 & 4
    const note = this.bass[Math.floor(n / 4) % this.bass.length];
    this.tone(note * 2, half * 0.9, this.bassWave, 0.12, { delay: half, lp: 900 }); // offbeat bass (sidechain feel)
  }
}

export function vibrate(enabled: boolean, pattern: number | number[]): void {
  if (enabled && "vibrate" in navigator) {
    try { navigator.vibrate(pattern); } catch { /* unsupported */ }
  }
}
