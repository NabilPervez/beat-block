import { COLS, ROWS, idx, type Game } from "./engine/game";
import { pieceCells, boxSize, type PieceType } from "./engine/pieces";
import { shade, type Theme } from "./themes";

interface Palette {
  top: string[]; side: string[]; edge: string[]; hi: string[];
}

interface ClearFx { cells: number[]; colors: number[]; t: number }

const BG = "#05080f";
const FRAME = "#1b2638";
const GRID = "#0d1422";
const GRID_HC = "#26344c";
const DPR_CAP = 2;

export interface RenderOptions {
  symbols: boolean;
  highContrast: boolean;
  reducedMotion: boolean;
}

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private nctx: CanvasRenderingContext2D;
  private cell = 20;
  private pad = 0;
  private pal!: Palette;
  private accent = "#20D9F4";
  private fx: ClearFx[] = [];
  private beat = 0; // 0..1 pulse from column ticks
  opts: RenderOptions = { symbols: false, highContrast: false, reducedMotion: false };

  constructor(private canvas: HTMLCanvasElement, private nextCanvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d")!;
    this.nctx = nextCanvas.getContext("2d")!;
  }

  setTheme(t: Theme): void {
    this.accent = t.accent;
    const cols = ["#000000", ...t.play];
    this.pal = {
      top: cols,
      side: cols.map((c) => shade(c, -0.45)),
      edge: cols.map((c) => shade(c, -0.25)),
      hi: cols.map((c) => shade(c, 0.55)),
    };
  }

  /** PRD §6.3: C = min(Wa/10, Ha/16). Extrusion/frame live in `pad`, outside the cells. */
  resize(wa: number, ha: number): void {
    const pad = Math.max(3, Math.round(Math.min(wa / COLS, ha / ROWS) * 0.12));
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
  }

  get cellSize(): number {
    return this.cell;
  }

  onClear(cells: number[], colors: number[]): void {
    this.fx.push({ cells, colors, t: 0 });
  }

  onBeat(): void {
    this.beat = 1;
  }

  private tile(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, color: number, alpha = 1): void {
    const d = Math.max(2, Math.round(s * 0.14)); // extrusion depth, inside the cell box
    const p = this.pal;
    ctx.globalAlpha = alpha;
    // side faces (bottom + right), solid darker colour
    ctx.fillStyle = p.side[color];
    ctx.beginPath();
    ctx.moveTo(x + s - d, y + 1);
    ctx.lineTo(x + s - 1, y + d);
    ctx.lineTo(x + s - 1, y + s - 1);
    ctx.lineTo(x + d, y + s - 1);
    ctx.lineTo(x + 1, y + s - d);
    ctx.lineTo(x + s - d, y + s - d);
    ctx.closePath();
    ctx.fill();
    // top face
    ctx.fillStyle = p.top[color];
    ctx.fillRect(x + 1, y + 1, s - d - 1, s - d - 1);
    // bevel highlight
    ctx.fillStyle = p.hi[color];
    ctx.fillRect(x + 1, y + 1, s - d - 1, Math.max(1, s * 0.06));
    if (this.opts.symbols || this.opts.highContrast) {
      ctx.fillStyle = p.side[color];
      const cx = x + (s - d) / 2 + 0.5, cy = y + (s - d) / 2 + 0.5, r = s * 0.13;
      ctx.beginPath();
      if (color === 1) ctx.arc(cx, cy, r, 0, Math.PI * 2);
      else { ctx.moveTo(cx, cy - r * 1.3); ctx.lineTo(cx + r * 1.3, cy); ctx.lineTo(cx, cy + r * 1.3); ctx.lineTo(cx - r * 1.3, cy); ctx.closePath(); }
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  draw(g: Game, dtMs: number): void {
    const ctx = this.ctx, c = this.cell, o = this.pad;
    const W = c * COLS, H = c * ROWS;
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, W + o * 2, H + o * 2);
    ctx.strokeStyle = FRAME;
    ctx.lineWidth = 1;
    ctx.strokeRect(o - 1.5, o - 1.5, W + 3, H + 3);

    // grid
    ctx.fillStyle = this.opts.highContrast ? GRID_HC : GRID;
    for (let x = 1; x < COLS; x++) ctx.fillRect(o + x * c, o, 1, H);
    for (let y = 1; y < ROWS; y++) ctx.fillRect(o, o + y * c, W, 1);

    // settled cells
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const v = g.board[idx(x, y)];
        if (v) this.tile(ctx, o + x * c, o + y * c, c, v);
      }
    }
    // matched squares: thin white outline per marked cell group edge
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = Math.max(1.5, c * 0.07);
    for (let i = 0; i < g.marked.length; i++) {
      if (!g.marked[i]) continue;
      const x = i % COLS, y = (i / COLS) | 0;
      const v = g.board[i];
      const px = o + x * c, py = o + y * c;
      ctx.beginPath();
      if (y === 0 || !g.marked[i - COLS] || g.board[i - COLS] !== v) { ctx.moveTo(px, py + 1); ctx.lineTo(px + c, py + 1); }
      if (y === ROWS - 1 || !g.marked[i + COLS] || g.board[i + COLS] !== v) { ctx.moveTo(px, py + c - 1); ctx.lineTo(px + c, py + c - 1); }
      if (x === 0 || !g.marked[i - 1] || g.board[i - 1] !== v) { ctx.moveTo(px + 1, py); ctx.lineTo(px + 1, py + c); }
      if (x === COLS - 1 || !g.marked[i + 1] || g.board[i + 1] !== v) { ctx.moveTo(px + c - 1, py); ctx.lineTo(px + c - 1, py + c); }
      ctx.stroke();
    }

    // ghost + falling piece
    const p = g.piece;
    if (p && g.status !== "GAME_OVER") {
      const cells = pieceCells(p.type, p.rotation);
      const gy = g.ghostY();
      ctx.lineWidth = 1;
      cells.forEach(([cx, cy], i) => {
        const y = gy + cy;
        if (y < 0) return;
        ctx.strokeStyle = this.pal.edge[p.colors[i]];
        ctx.strokeRect(o + (p.x + cx) * c + 2.5, o + y * c + 2.5, c - 5, c - 5);
      });
      cells.forEach(([cx, cy], i) => {
        const y = p.y + cy;
        if (y < 0) return;
        this.tile(ctx, o + (p.x + cx) * c, o + y * c, c, p.colors[i]);
      });
    }

    // clear effects: tiles shrink to nothing, solid colour, 200ms
    const dur = this.opts.reducedMotion ? 120 : 220;
    this.fx = this.fx.filter((f) => (f.t += dtMs) < dur);
    for (const f of this.fx) {
      const k = 1 - f.t / dur;
      f.cells.forEach((i, j) => {
        const x = i % COLS, y = (i / COLS) | 0;
        const s = c * k;
        ctx.fillStyle = this.opts.reducedMotion ? this.pal.top[f.colors[j]] : "#ffffff";
        ctx.globalAlpha = k;
        ctx.fillRect(o + x * c + (c - s) / 2, o + y * c + (c - s) / 2, s, s);
      });
      ctx.globalAlpha = 1;
    }

    // sweep line: solid translucent band + crisp line
    const lx = o + g.sweepX * c;
    ctx.globalAlpha = 0.1 + (this.opts.reducedMotion ? 0 : this.beat * 0.08);
    ctx.fillStyle = this.accent;
    ctx.fillRect(lx - c, o, c, H);
    ctx.globalAlpha = 1;
    ctx.fillRect(Math.round(lx) - 1, o - 2, 3, H + 4);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(Math.round(lx), o - 2, 1, H + 4);
    this.beat = Math.max(0, this.beat - dtMs / 250);

    this.drawNext(g.next.type, g.next.colors);
  }

  private lastNext = "";
  private drawNext(type: PieceType, colors: number[]): void {
    const key = type + colors.join("") + this.pal.top.join("") + this.opts.symbols;
    if (key === this.lastNext) return;
    this.lastNext = key;
    const ctx = this.nctx, S = 64;
    ctx.clearRect(0, 0, S, S);
    const cells = pieceCells(type, 0);
    const xs = cells.map((q) => q[0]), ys = cells.map((q) => q[1]);
    const w = Math.max(...xs) - Math.min(...xs) + 1, h = Math.max(...ys) - Math.min(...ys) + 1;
    const s = Math.floor(Math.min(S / Math.max(w, 2), S / 4, 15)) + (boxSize(type) === 2 ? 1 : 0);
    const ox = (S - w * s) / 2 - Math.min(...xs) * s, oy = (S - h * s) / 2 - Math.min(...ys) * s;
    cells.forEach(([x, y], i) => this.tile(ctx, ox + x * s, oy + y * s, s, colors[i]));
  }
}
