import { COLS, ROWS, idx, type Game } from "./engine/game";
import { pieceCells, type PieceType } from "./engine/pieces";
import { shade, rgba, type Theme } from "./themes";

// Visual layer only. Glow comes from shadowBlur baked into cached tile sprites,
// so per-frame cost is drawImage calls, not blurs. Fills stay solid (no gradients).

type TileState = "n" | "m" | "c" | "p";

interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; color: string }
interface Ring { x: number; y: number; r0: number; r1: number; t: number; dur: number; color: string; w: number }
interface Pop { i: number; t: number }
interface Flash { x: number; y: number; t: number; dur: number; color: string }
interface FloatText { x: number; y: number; text: string; t: number; dur: number; size: number; color: string; skin?: boolean }
interface Streak { x: number; y0: number; y1: number; t: number; color: string }

const DPR_CAP = 2;
const MAX_PARTICLES = 700;

export interface RenderOptions {
  symbols: boolean;
  highContrast: boolean;
  reducedMotion: boolean;
  effects: boolean; // full neon glow + particles; off = lite mode for slow phones
}

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private nctx: CanvasRenderingContext2D;
  private bctx: CanvasRenderingContext2D;
  private cell = 20;
  private pad = 0;
  private theme!: Theme;
  private colors: string[] = [];
  private sprites = new Map<string, HTMLCanvasElement>();
  private glow = 0; // sprite margin
  private beat = 0;
  private beatCount = 0;
  private shake = 0;
  private time = 0;
  private particles: Particle[] = [];
  private rings: Ring[] = [];
  private pops: Pop[] = [];
  private flashes: Flash[] = [];
  private texts: FloatText[] = [];
  private streaks: Streak[] = [];
  private bgW = 0;
  private bgH = 0;
  private stars: { x: number; y: number; p: number }[] = [];
  private bgRings: { t: number }[] = [];
  private floorScroll = 0;
  opts: RenderOptions = { symbols: false, highContrast: false, reducedMotion: false, effects: true };

  constructor(private canvas: HTMLCanvasElement, private nextCanvas: HTMLCanvasElement, private bg: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d")!;
    this.nctx = nextCanvas.getContext("2d")!;
    this.bctx = bg.getContext("2d")!;
    // cosmetic star field; Math.random is fine here because it never touches game RNG
    for (let i = 0; i < 70; i++) this.stars.push({ x: Math.random(), y: Math.random() * 0.6, p: Math.random() * Math.PI * 2 });
  }

  setTheme(t: Theme): void {
    this.theme = t;
    this.colors = ["#000000", ...t.play];
    this.sprites.clear();
    this.lastNext = "";
  }

  setOptions(o: RenderOptions): void {
    this.opts = o;
    this.sprites.clear();
    this.lastNext = "";
  }

  /** PRD §6.3: C = min(Wa/10, Ha/16). Frame + glow live in `pad`, outside the cells. */
  resize(wa: number, ha: number): void {
    const pad = Math.max(4, Math.round(Math.min(wa / COLS, ha / ROWS) * 0.18));
    const c = Math.max(8, Math.floor(Math.min((wa - pad * 2) / COLS, (ha - pad * 2) / ROWS)));
    this.cell = c;
    this.pad = pad;
    const w = c * COLS + pad * 2, h = c * ROWS + pad * 2;
    const dpr = Math.min(DPR_CAP, window.devicePixelRatio || 1);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const ns = 64;
    this.nextCanvas.width = ns * dpr;
    this.nextCanvas.height = ns * dpr;
    this.nctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.sprites.clear();
    this.lastNext = "";
    this.resizeBg();
  }

  resizeBg(): void {
    // background at DPR 1: it's soft by design and this keeps it cheap
    this.bgW = innerWidth;
    this.bgH = innerHeight;
    this.bg.width = this.bgW;
    this.bg.height = this.bgH;
  }

  get cellSize(): number {
    return this.cell;
  }

  // ---------- tile art ----------

  private drawTile(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, color: number, state: TileState, glow: boolean): void {
    const col = this.colors[color];
    const inset = Math.max(1.5, s * 0.07);
    const lw = Math.max(1.5, s * 0.085);
    const inner = s - inset * 2;
    const lit = state === "m" || state === "c";
    // body: dark tinted glass, or bright when part of a square
    ctx.fillStyle = state === "c" ? shade(col, 0.35) : lit ? shade(col, -0.15) : shade(col, state === "p" ? -0.62 : -0.72);
    ctx.fillRect(x + inset, y + inset, inner, inner);
    // neon rim
    if (glow) { ctx.shadowColor = col; ctx.shadowBlur = s * (lit ? 0.7 : 0.45); }
    ctx.strokeStyle = lit ? "#ffffff" : col;
    ctx.lineWidth = lw;
    ctx.strokeRect(x + inset + lw / 2, y + inset + lw / 2, inner - lw, inner - lw);
    // LED core
    ctx.fillStyle = lit ? "#ffffff" : col;
    const core = s * 0.22;
    const cx = x + s / 2, cy = y + s / 2;
    if (this.opts.symbols || this.opts.highContrast) {
      ctx.beginPath();
      if (color === 1) ctx.arc(cx, cy, core * 0.75, 0, Math.PI * 2);
      else { const r = core; ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy); ctx.lineTo(cx, cy + r); ctx.lineTo(cx - r, cy); ctx.closePath(); }
      ctx.fill();
    } else {
      ctx.fillRect(cx - core / 2, cy - core / 2, core, core);
    }
    ctx.shadowBlur = 0;
    // top-left glint
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.fillRect(x + inset + lw, y + inset + lw, Math.max(1, s * 0.18), Math.max(1, s * 0.05));
  }

  private sprite(color: number, state: TileState): HTMLCanvasElement {
    const key = color + state;
    let sp = this.sprites.get(key);
    if (sp) return sp;
    const dpr = Math.min(DPR_CAP, window.devicePixelRatio || 1);
    const s = this.cell;
    this.glow = Math.ceil(s * 0.6);
    const size = s + this.glow * 2;
    sp = document.createElement("canvas");
    sp.width = Math.ceil(size * dpr);
    sp.height = Math.ceil(size * dpr);
    const c = sp.getContext("2d")!;
    c.scale(dpr, dpr);
    this.drawTile(c, this.glow, this.glow, s, color, state, this.opts.effects);
    this.sprites.set(key, sp);
    return sp;
  }

  private blit(ctx: CanvasRenderingContext2D, px: number, py: number, color: number, state: TileState, scale = 1): void {
    const sp = this.sprite(color, state);
    const size = this.cell + this.glow * 2;
    if (scale === 1) {
      ctx.drawImage(sp, px - this.glow, py - this.glow, size, size);
    } else {
      const s2 = size * scale, off = (s2 - size) / 2;
      ctx.drawImage(sp, px - this.glow - off, py - this.glow - off, s2, s2);
    }
  }

  // ---------- events from the game ----------

  onBeat(): void {
    this.beat = 1;
    this.beatCount++;
    if (!this.opts.reducedMotion) {
      this.bgRings.push({ t: 0 });
      for (let i = 0; i < this.eqBars.length; i++) this.eqBars[i] = Math.max(this.eqBars[i], 0.25 + Math.random() * 0.75);
    }
  }

  private skinFlash = 0;
  /** Called after setTheme() when a run reaches a new skin. */
  onSkin(level: number, name: string): void {
    const c = this.cell, o = this.pad;
    const cx = o + (COLS * c) / 2, cy = o + (ROWS * c) / 2;
    this.skinFlash = 1;
    this.rings.push({ x: cx, y: cy, r0: c, r1: c * 12, t: 0, dur: 900, color: this.theme.accent, w: 6 });
    this.rings.push({ x: cx, y: cy, r0: c * 0.5, r1: c * 9, t: -150, dur: 800, color: "#ffffff", w: 3 });
    this.texts = this.texts.filter((t) => !t.skin); // a newer skin title replaces the old one
    this.texts.push({ x: cx, y: cy - c * 1.1, text: `SKIN ${level + 1}`, t: 0, dur: 1800, size: c * 0.8, color: "#ffffff", skin: true });
    this.texts.push({ x: cx, y: cy + c * 0.3, text: name.toUpperCase(), t: 0, dur: 1800, size: c * 1.5, color: this.theme.accent, skin: true });
    if (this.opts.effects) {
      for (let k = 0; k < 6; k++) this.burst(cx, cy, 12, k % 2 ? this.theme.play[0] : this.theme.play[1], 0.5, 1100);
    }
  }

  onFormed(cells: number[]): void {
    const c = this.cell, o = this.pad;
    for (const i of cells) this.pops.push({ i, t: 0 });
    if (!this.opts.effects) return;
    // one ring per newly made block, centred on its cells
    const xs = cells.map((i) => i % COLS), ys = cells.map((i) => (i / COLS) | 0);
    const cx = o + ((Math.min(...xs) + Math.max(...xs) + 1) / 2) * c;
    const cy = o + ((Math.min(...ys) + Math.max(...ys) + 1) / 2) * c;
    this.rings.push({ x: cx, y: cy, r0: c * 0.8, r1: c * 2.2, t: 0, dur: 420, color: "#ffffff", w: 2 });
    this.burst(cx, cy, 10, "#ffffff", 0.12, 420);
  }

  onLock(cells: [number, number, number][], dropped: number): void {
    const c = this.cell, o = this.pad;
    for (const [x, y, col] of cells) {
      this.flashes.push({ x, y, t: 0, dur: 140, color: "#ffffff" });
      if (dropped > 1) this.streaks.push({ x, y0: Math.max(0, y - dropped), y1: y, t: 0, color: this.colors[col] });
    }
    if (dropped > 1 && this.opts.effects) {
      for (const [x, y, col] of cells) this.burst(o + (x + 0.5) * c, o + (y + 1) * c, 3, this.colors[col], 0.18, 380, -0.5);
      if (!this.opts.reducedMotion) this.shake = Math.max(this.shake, 2.5);
    }
  }

  onClear(cells: number[], colors: number[], squares: number, points: number, combo: number): void {
    const c = this.cell, o = this.pad;
    let sx = 0, sy = 0;
    cells.forEach((i, j) => {
      const x = i % COLS, y = (i / COLS) | 0;
      sx += x; sy += y;
      this.flashes.push({ x, y, t: 0, dur: 260, color: this.colors[colors[j]] });
      if (this.opts.effects) {
        const px = o + (x + 0.5) * c, py = o + (y + 0.5) * c;
        this.burst(px, py, 7, this.colors[colors[j]], 0.32, 900);
        this.burst(px, py, 3, "#ffffff", 0.22, 600);
      }
    });
    const cx = o + (sx / cells.length + 0.5) * c, cy = o + (sy / cells.length + 0.5) * c;
    const accent = this.theme.accent;
    this.rings.push({ x: cx, y: cy, r0: c, r1: c * (3 + squares), t: 0, dur: 600, color: accent, w: 4 });
    if (this.opts.effects) this.rings.push({ x: cx, y: cy, r0: c * 0.5, r1: c * (2 + squares * 0.6), t: -80, dur: 520, color: "#ffffff", w: 2 });
    this.texts.push({ x: cx, y: cy, text: `+${points.toLocaleString("en-US")}`, t: 0, dur: 900, size: Math.min(c * 1.4, c * (0.9 + squares * 0.12)), color: "#ffffff" });
    if (combo > 1) {
      this.texts.push({ x: o + (COLS * c) / 2, y: o + ROWS * c * 0.3, text: `COMBO ×${combo}`, t: 0, dur: 1100, size: c * 1.3, color: accent });
    }
    if (!this.opts.reducedMotion) this.shake = Math.max(this.shake, Math.min(9, 3 + squares * 1.2));
  }

  private burst(x: number, y: number, n: number, color: string, speed: number, life: number, lift = -0.15): void {
    const c = this.cell;
    for (let k = 0; k < n && this.particles.length < MAX_PARTICLES; k++) {
      const a = Math.random() * Math.PI * 2;
      const v = (0.4 + Math.random()) * speed * c;
      this.particles.push({
        x, y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v + lift * c,
        life: 0, max: life * (0.6 + Math.random() * 0.6),
        size: Math.max(1.5, c * (0.06 + Math.random() * 0.1)),
        color,
      });
    }
  }

  // ---------- frame ----------

  draw(g: Game, dtMs: number): void {
    this.time += dtMs;
    this.drawBackground(g, dtMs);
    const ctx = this.ctx, c = this.cell, o = this.pad;
    const W = c * COLS, H = c * ROWS;
    const fullW = W + o * 2, fullH = H + o * 2;
    const fx = this.opts.effects;

    ctx.save();
    ctx.clearRect(0, 0, fullW, fullH);
    if (this.shake > 0.1) {
      ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
      this.shake *= Math.pow(0.0001, dtMs / 1000 * 2.2);
    }

    // board glass: mostly opaque so blocks always read clearly over the background
    ctx.fillStyle = "rgba(6,2,16,0.9)";
    ctx.fillRect(o, o, W, H);

    // grid pulses on the beat
    const gridA = (this.opts.highContrast ? 0.22 : 0.07) + this.beat * 0.08;
    ctx.fillStyle = rgba(this.theme.floor, gridA);
    for (let x = 1; x < COLS; x++) ctx.fillRect(o + x * c, o, 1, H);
    for (let y = 1; y < ROWS; y++) ctx.fillRect(o, o + y * c, W, 1);

    // neon frame
    if (fx) { ctx.shadowColor = this.theme.accent; ctx.shadowBlur = 14 + this.beat * 10; }
    ctx.strokeStyle = rgba(this.theme.accent, 0.55 + this.beat * 0.45);
    ctx.lineWidth = 2;
    ctx.strokeRect(o - 2, o - 2, W + 4, H + 4);
    ctx.shadowBlur = 0;

    // settled cells
    const popScale = new Map<number, number>();
    this.pops = this.pops.filter((p) => (p.t += dtMs) < 260);
    for (const p of this.pops) popScale.set(p.i, 1 + 0.28 * Math.sin((p.t / 260) * Math.PI));
    const pulse = this.opts.reducedMotion ? 0 : this.beat;
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const i = idx(x, y);
        const v = g.board[i];
        if (!v) continue;
        let state: TileState = "n";
        if (g.marked[i]) state = x < g.sweepX ? "c" : "m"; // "charged" once the line has passed
        const scale = popScale.get(i) ?? (state !== "n" ? 1 + pulse * 0.05 : 1);
        this.blit(ctx, o + x * c, o + y * c, v, state, scale);
      }
    }

    // ghost + falling piece
    const p = g.piece;
    if (p && g.status !== "GAME_OVER") {
      const cells = pieceCells(p.type, p.rotation);
      const gy = g.ghostY();
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      cells.forEach(([cx, cy], i) => {
        const y = gy + cy;
        if (y < 0) return;
        ctx.strokeStyle = rgba(this.colors[p.colors[i]], 0.6);
        ctx.strokeRect(o + (p.x + cx) * c + 3.5, o + y * c + 3.5, c - 7, c - 7);
      });
      ctx.setLineDash([]);
      cells.forEach(([cx, cy], i) => {
        const y = p.y + cy;
        if (y < 0) return;
        this.blit(ctx, o + (p.x + cx) * c, o + y * c, p.colors[i], "p");
      });
    }

    ctx.globalCompositeOperation = "lighter";

    // hard-drop streaks
    this.streaks = this.streaks.filter((s) => (s.t += dtMs) < 220);
    for (const s of this.streaks) {
      const k = 1 - s.t / 220;
      ctx.fillStyle = rgba(s.color, 0.2 * k);
      ctx.fillRect(o + s.x * c + c * 0.25, o + s.y0 * c, c * 0.5, (s.y1 - s.y0 + 1) * c);
    }

    // cell flashes: lock = quick white, clear = colour flare that grows
    this.flashes = this.flashes.filter((f) => (f.t += dtMs) < f.dur);
    for (const f of this.flashes) {
      const k = 1 - f.t / f.dur;
      const grow = f.dur > 200 ? 1 + (1 - k) * 0.6 : 1;
      const s = c * grow;
      ctx.fillStyle = rgba(f.color === "#ffffff" ? "#ffffff" : f.color, (f.dur > 200 ? 0.9 : 0.35) * k);
      ctx.fillRect(o + f.x * c + (c - s) / 2, o + f.y * c + (c - s) / 2, s, s);
      if (f.dur > 200) {
        ctx.fillStyle = `rgba(255,255,255,${0.8 * k * k})`;
        ctx.fillRect(o + f.x * c + c * 0.2, o + f.y * c + c * 0.2, c * 0.6, c * 0.6);
      }
    }

    // shockwave rings
    this.rings = this.rings.filter((r) => (r.t += dtMs) < r.dur);
    for (const r of this.rings) {
      if (r.t < 0) continue;
      const k = r.t / r.dur;
      const e = 1 - Math.pow(1 - k, 3);
      ctx.strokeStyle = rgba(r.color, 1 - k);
      ctx.lineWidth = r.w * (1 - k) + 0.5;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r0 + (r.r1 - r.r0) * e, 0, Math.PI * 2);
      ctx.stroke();
    }

    // particles
    const dt = dtMs / 1000;
    const grav = c * 9;
    let w = 0;
    for (const q of this.particles) {
      q.life += dtMs;
      if (q.life >= q.max) continue;
      q.vy += grav * dt * 0.25;
      q.vx *= 0.985;
      q.x += q.vx * dt * 10;
      q.y += q.vy * dt * 10;
      const k = 1 - q.life / q.max;
      ctx.fillStyle = rgba(q.color, k);
      const s = q.size * (0.5 + k * 0.5);
      ctx.fillRect(q.x - s / 2, q.y - s / 2, s, s);
      this.particles[w++] = q;
    }
    this.particles.length = w;

    // sweep line: stepped afterimage band + hot core
    const lx = o + g.sweepX * c;
    const acc = this.theme.accent;
    for (let k = 0; k < 6; k++) {
      ctx.fillStyle = rgba(acc, 0.05 * (6 - k) / 6 + this.beat * 0.02);
      ctx.fillRect(lx - (k + 1) * c * 0.22, o, c * 0.22, H);
    }
    if (fx) { ctx.shadowColor = acc; ctx.shadowBlur = 18 + this.beat * 16; }
    ctx.fillStyle = acc;
    ctx.fillRect(Math.round(lx) - 2, o - 4, 4, H + 8);
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(Math.round(lx) - 0.5, o - 4, 1.5, H + 8);
    if (fx && g.status === "PLAYING" && Math.random() < dtMs / 40) {
      this.particles.push({ x: lx, y: o + Math.random() * H, vx: -c * 0.05, vy: 0, life: 0, max: 500, size: 2, color: acc });
    }

    ctx.globalCompositeOperation = "source-over";

    // floating score + combo text
    this.texts = this.texts.filter((t) => (t.t += dtMs) < t.dur);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const t of this.texts) {
      const k = t.t / t.dur;
      const punch = k < 0.15 ? 0.6 + (k / 0.15) * 0.55 : k < 0.3 ? 1.15 - ((k - 0.15) / 0.15) * 0.15 : 1;
      const rise = this.opts.reducedMotion ? 0 : k * c * 1.6;
      ctx.globalAlpha = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
      ctx.font = `600 ${Math.round(t.size * punch)}px Outfit, system-ui, sans-serif`;
      if (fx) { ctx.shadowColor = t.color === "#ffffff" ? acc : t.color; ctx.shadowBlur = 16; }
      ctx.lineWidth = 4;
      ctx.strokeStyle = "rgba(6,2,16,0.9)";
      ctx.strokeText(t.text, t.x, t.y - rise);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y - rise);
      ctx.shadowBlur = 0;
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    this.beat = Math.max(0, this.beat - dtMs / 300);
    this.drawNext(g.next.type, g.next.colors);
  }

  // ---------- background: club floor + speaker rings + stars ----------

  private drawBackground(g: Game, dtMs: number): void {
    const ctx = this.bctx, W = this.bgW, H = this.bgH;
    if (!W) return;
    const still = this.opts.reducedMotion || !this.opts.effects;
    ctx.fillStyle = "#05010c";
    ctx.fillRect(0, 0, W, H);
    const floor = this.theme.floor;

    // stars twinkle
    for (const s of this.stars) {
      const a = still ? 0.4 : 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(this.time / 700 + s.p));
      ctx.fillStyle = `rgba(255,255,255,${a})`;
      ctx.fillRect(s.x * W, s.y * H, 1.5, 1.5);
    }

    // speaker rings expand from centre on each beat
    const cx = W / 2, cy = H * 0.45;
    const maxR = Math.hypot(W, H) * 0.6;
    this.bgRings = this.bgRings.filter((r) => (r.t += dtMs) < 1600);
    ctx.lineWidth = 2;
    for (const r of this.bgRings) {
      const k = r.t / 1600;
      ctx.strokeStyle = rgba(floor, 0.22 * (1 - k));
      ctx.beginPath();
      ctx.arc(cx, cy, 40 + k * maxR, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (!still && g.status === "PLAYING") this.floorScroll = (this.floorScroll + dtMs * 0.00035 * (1 + g.speed)) % 1;
    if (this.theme.bg === "tunnel") this.drawTunnel(ctx, W, H, cx, cy, floor);
    else if (this.theme.bg === "eq") this.drawEq(ctx, W, H, floor, dtMs, still);
    else this.drawFloor(ctx, W, H, cx, floor);

    // skin change: whole screen flashes the new accent, then fades
    if (this.skinFlash > 0) {
      ctx.fillStyle = rgba(this.theme.accent, 0.35 * this.skinFlash);
      ctx.fillRect(0, 0, W, H);
      this.skinFlash = Math.max(0, this.skinFlash - dtMs / 700);
    }
  }

  private drawTunnel(ctx: CanvasRenderingContext2D, W: number, H: number, cx: number, cy: number, floor: string): void {
    // nested squares zooming outward: reads as flying down a corridor
    const n = 12;
    ctx.lineWidth = 1.5;
    for (let i = 0; i < n; i++) {
      const z = ((i + this.floorScroll * 2) % n) / n;
      const s = Math.pow(z, 2.2) * Math.max(W, H) * 1.1;
      ctx.strokeStyle = rgba(floor, (0.08 + 0.4 * z) * (0.7 + this.beat * 0.5));
      ctx.strokeRect(cx - s / 2, cy - s / 2, s, s);
    }
    ctx.strokeStyle = rgba(floor, 0.12);
    ctx.beginPath();
    for (const [x, y] of [[0, 0], [W, 0], [0, H], [W, H]]) { ctx.moveTo(cx, cy); ctx.lineTo(x, y); }
    ctx.stroke();
  }

  private eqBars: number[] = [];
  private drawEq(ctx: CanvasRenderingContext2D, W: number, H: number, floor: string, dtMs: number, still: boolean): void {
    // equaliser bars jump on the beat and fall back down
    const n = 28;
    if (this.eqBars.length !== n) this.eqBars = Array.from({ length: n }, () => 0.2);
    const bw = W / n;
    for (let i = 0; i < n; i++) {
      if (!still) this.eqBars[i] = Math.max(0.08, this.eqBars[i] - dtMs / 900);
      const h = this.eqBars[i] * H * 0.45;
      ctx.fillStyle = rgba(floor, 0.22);
      ctx.fillRect(i * bw + 2, H - h, bw - 4, h);
      ctx.fillStyle = rgba(this.theme.accent, 0.7);
      ctx.fillRect(i * bw + 2, H - h - 4, bw - 4, 3);
    }
    ctx.fillStyle = rgba(floor, 0.5);
    ctx.fillRect(0, H - 1, W, 1);
  }

  private drawFloor(ctx: CanvasRenderingContext2D, W: number, H: number, cx: number, floor: string): void {
    // perspective floor grid scrolling toward the viewer, speed follows the game
    const horizon = H * 0.62;
    ctx.fillStyle = "#05010c";
    ctx.fillRect(0, horizon, W, H - horizon);
    const lineA = 0.28 + this.beat * 0.3;
    ctx.strokeStyle = rgba(floor, lineA);
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < 14; i++) {
      const z = (i + this.floorScroll) / 14;
      const y = horizon + (H - horizon) * z * z;
      ctx.moveTo(0, y); ctx.lineTo(W, y);
    }
    for (let i = -12; i <= 12; i++) {
      ctx.moveTo(cx + i * 18, horizon);
      ctx.lineTo(cx + i * W * 0.16, H);
    }
    ctx.stroke();
    ctx.fillStyle = rgba(floor, 0.7 + this.beat * 0.3);
    ctx.fillRect(0, horizon - 1, W, 2);
  }

  private lastNext = "";
  private drawNext(type: PieceType, colors: number[]): void {
    const key = type + colors.join("");
    if (key === this.lastNext) return;
    this.lastNext = key;
    const ctx = this.nctx, S = 64;
    ctx.clearRect(0, 0, S, S);
    const cells = pieceCells(type, 0);
    const xs = cells.map((q) => q[0]), ys = cells.map((q) => q[1]);
    const w = Math.max(...xs) - Math.min(...xs) + 1, h = Math.max(...ys) - Math.min(...ys) + 1;
    const s = Math.floor(Math.min(48 / w, 48 / h, 15));
    const ox = (S - w * s) / 2 - Math.min(...xs) * s, oy = (S - h * s) / 2 - Math.min(...ys) * s;
    cells.forEach(([x, y], i) => this.drawTile(ctx, ox + x * s, oy + y * s, s, colors[i], "p", this.opts.effects));
  }
}
