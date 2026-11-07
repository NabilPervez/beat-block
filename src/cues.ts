// S3: silent-first beat cues that live outside the board canvas: the beat strip and the multiplier meter.
// Both read BeatPhase only (never their own timers), so they can't drift from the ring or the music.
import type { BeatPhase } from "./beat";

const GOLD = "#ffe14a";
const VISIBLE = 4;   // beats on screen
const NOW_X = 0.12;  // "now" marker position (fraction of width)

/** Beat strip under the board: ticks slide into "now"; beat 1 of each bar is bigger. */
export class BeatStrip {
  private ctx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d")!;
  }

  resize(cssW: number, cssH: number): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = cssW; this.h = cssH;
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  draw(ph: BeatPhase | null, o: { accent: string; silent: boolean; reducedMotion: boolean; perfectMs: number }): void {
    const ctx = this.ctx, W = this.w, H = this.h;
    if (!W) return;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "rgba(20,10,40,0.85)";
    ctx.beginPath(); ctx.roundRect(0, 0, W, H, 6); ctx.fill();
    const nowX = Math.round(W * NOW_X);
    if (!ph) {
      ctx.fillStyle = "rgba(158,144,196,0.4)";
      ctx.fillRect(nowX - 1, 4, 2, H - 8);
      return;
    }
    const gap = (W - nowX) / VISIBLE;
    const gold = ph.msToBeat <= o.perfectMs || ph.msSinceBeat <= o.perfectMs;
    const tickW = o.silent ? 5 : 4;
    for (let k = 0; k <= VISIBLE; k++) {
      // tick k is the beat k beats after the last one; it reaches "now" when its beat lands
      const x = o.reducedMotion ? nowX + k * gap : nowX + (k - ph.p) * gap;
      if (x < nowX - gap * 0.5 || x > W + tickW) continue;
      const n = ph.n + k;
      const down = n % 4 === 0;
      const th = (down ? 0.9 : 0.45) * H;
      const atNow = Math.abs(x - nowX) < gap * 0.15 || (k === 0 && ph.msSinceBeat <= o.perfectMs) || (k === 1 && ph.msToBeat <= o.perfectMs);
      ctx.globalAlpha = x < nowX ? Math.max(0, 1 - (nowX - x) / (gap * 0.5)) : 1;
      ctx.fillStyle = atNow && gold ? GOLD : down ? "#f6f0ff" : "#9e90c4";
      ctx.fillRect(Math.round(x - tickW / 2), Math.round((H - th) / 2), tickW, Math.round(th));
    }
    ctx.globalAlpha = 1;
    // "now" marker: a solid bar in the skin accent, gold in the PERFECT window
    ctx.fillStyle = gold ? GOLD : o.accent;
    ctx.fillRect(nowX - 1, 2, 2, H - 4);
  }
}

/** Multiplier meter: fill toward ×2.0, shake + drain on a broken streak (flash under Reduced motion). */
export class BeatMeter {
  private shown = -1;
  constructor(private root: HTMLElement, private fill: HTMLElement, private label: HTMLElement, private max: number) {}

  set(mult: number): void {
    if (mult === this.shown) return;
    this.shown = mult;
    const k = Math.max(0, Math.min(1, (mult - 1) / (this.max - 1)));
    this.fill.style.transform = `scaleX(${k})`;
    this.label.textContent = mult > 1 ? `×${mult.toFixed(2).replace(/0$/, "")}` : "×1";
    this.root.classList.toggle("is-hot", mult >= this.max);
  }

  broke(): void {
    this.root.classList.remove("is-broke");
    void this.root.offsetWidth;
    this.root.classList.add("is-broke");
  }
}
