// Original procedural sounds (PRD §12). No samples, nothing borrowed.
// The beat follows the sweep line's column ticks; gameplay never waits on audio.
export class Sound {
  private ctx: AudioContext | null = null;
  sfx = true;
  music = true;

  /** Must be called from a user gesture (autoplay policy). */
  unlock(): void {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number, delay = 0): void {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(c.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  move() { if (this.sfx) this.tone(880, 0.03, "square", 0.025); }
  rotate() { if (this.sfx) this.tone(1320, 0.05, "triangle", 0.05); }
  lock(hard: boolean) { if (this.sfx) this.tone(hard ? 140 : 180, 0.12, "sine", 0.18, 60); }
  clear(squares: number, combo: number) {
    if (!this.sfx) return;
    const base = 520 * Math.pow(2, Math.min(combo - 1, 7) / 12);
    const n = Math.min(4, 1 + Math.floor(squares / 2));
    for (let i = 0; i < n; i++) this.tone(base * Math.pow(2, (i * 4) / 12), 0.14, "triangle", 0.09, undefined, i * 0.05);
  }
  gameOver() {
    if (!this.sfx) return;
    [440, 370, 311, 220].forEach((f, i) => this.tone(f, 0.22, "triangle", 0.12, undefined, i * 0.14));
  }
  /** One beat per column the sweep crosses: kick on even, hat on odd. */
  beat(col: number) {
    if (!this.music || !this.ctx) return;
    if (col % 2 === 0) this.tone(110, 0.16, "sine", 0.22, 45);
    else this.tone(6000, 0.03, "square", 0.012);
  }
}

export function vibrate(enabled: boolean, pattern: number | number[]): void {
  if (enabled && "vibrate" in navigator) {
    try { navigator.vibrate(pattern); } catch { /* unsupported */ }
  }
}
