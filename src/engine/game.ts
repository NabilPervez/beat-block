import { boxSize, nextPieceType, pieceCells, type PieceType } from "./pieces";

export const COLS = 10;
export const ROWS = 16;

/** Tunables (PRD §4.3, §4.4). Kept together so playtesting only edits one place. */
export const CONFIG = {
  colorCount: 2, // active match colours per run; 2 keeps 2×2 squares reachable
  speedCurve: [ // [seconds, columns/sec], linearly interpolated
    [0, 0.45], [30, 0.65], [90, 0.85], [180, 1.05], [300, 1.25],
  ] as [number, number][],
  speedPerMinuteAfter: 0.05,
  maxSpeed: 2.0,
  gravityBase: 1.2, // cells/sec
  gravityPerMinute: 0.6,
  gravityMax: 7, // keeps touch play possible
  softDropRate: 25,
  lockDelayMs: 500,
  maxLockResets: 15,
  dasMs: 160,
  arrMs: 50,
  squarePoints: 100,
  extraSquareBonus: 25,
  comboStep: 0.25,
  comboMax: 4,
};

export type Status = "READY" | "PLAYING" | "PAUSED" | "GAME_OVER";

export type GameCommand =
  | { type: "MOVE_LEFT"; pressed: boolean }
  | { type: "MOVE_RIGHT"; pressed: boolean }
  | { type: "SOFT_DROP"; pressed: boolean }
  | { type: "ROTATE_CW" }
  | { type: "ROTATE_CCW" }
  | { type: "HARD_DROP" }
  | { type: "PAUSE" };

export type GameEvent =
  | { kind: "move" }
  | { kind: "rotate" }
  | { kind: "lock"; hard: boolean; cells: [x: number, y: number, color: number][]; dropped: number }
  | { kind: "formed"; cells: number[] }
  | { kind: "column"; col: number }
  | { kind: "clear"; cells: number[]; colors: number[]; squares: number; points: number; combo: number }
  | { kind: "gameover" };

export interface FallingPiece {
  type: PieceType;
  rotation: number;
  x: number;
  y: number;
  colors: number[]; // per canonical cell, 1..colorCount
}

export interface NextPiece {
  type: PieceType;
  colors: number[];
}

const KICKS: [number, number][] = [[0, 0], [-1, 0], [1, 0], [0, -1], [-2, 0], [2, 0], [-1, -1], [1, -1]];
const ARRANGEMENTS = [[1, 1, 2, 2], [1, 2, 1, 2], [1, 2, 2, 1], [2, 1, 1, 2], [2, 1, 2, 1], [2, 2, 1, 1]];

export const idx = (x: number, y: number) => y * COLS + x;

export function sweepSpeed(seconds: number): number {
  const c = CONFIG.speedCurve;
  const last = c[c.length - 1];
  if (seconds >= last[0]) {
    return Math.min(CONFIG.maxSpeed, last[1] + ((seconds - last[0]) / 60) * CONFIG.speedPerMinuteAfter);
  }
  for (let i = 1; i < c.length; i++) {
    if (seconds < c[i][0]) {
      const [t0, v0] = c[i - 1];
      const [t1, v1] = c[i];
      return v0 + ((seconds - t0) / (t1 - t0)) * (v1 - v0);
    }
  }
  return last[1];
}

export function gravityRate(seconds: number): number {
  return Math.min(CONFIG.gravityMax, CONFIG.gravityBase + (seconds / 60) * CONFIG.gravityPerMinute);
}

/** Cells (board indices) that belong to at least one same-colour 2×2 square. */
export function findMarked(board: Uint8Array): Uint8Array {
  const marked = new Uint8Array(board.length);
  for (let y = 0; y < ROWS - 1; y++) {
    for (let x = 0; x < COLS - 1; x++) {
      const c = board[idx(x, y)];
      if (c && board[idx(x + 1, y)] === c && board[idx(x, y + 1)] === c && board[idx(x + 1, y + 1)] === c) {
        marked[idx(x, y)] = marked[idx(x + 1, y)] = marked[idx(x, y + 1)] = marked[idx(x + 1, y + 1)] = 1;
      }
    }
  }
  return marked;
}

/** Greedy top-left count of non-overlapping 2×2 squares inside a set of cells. Deterministic. */
export function countSquares(cells: Set<number>): number {
  const used = new Set<number>();
  let n = 0;
  const sorted = [...cells].sort((a, b) => a - b);
  for (const i of sorted) {
    const x = i % COLS;
    if (x === COLS - 1) continue;
    const quad = [i, i + 1, i + COLS, i + COLS + 1];
    if (quad.every((q) => cells.has(q) && !used.has(q))) {
      quad.forEach((q) => used.add(q));
      n++;
    }
  }
  return n;
}

/** Compact every column downward (Lumines-style: cells fall individually). */
export function applyGravity(board: Uint8Array): boolean {
  let moved = false;
  for (let x = 0; x < COLS; x++) {
    let write = ROWS - 1;
    for (let y = ROWS - 1; y >= 0; y--) {
      const v = board[idx(x, y)];
      if (v) {
        if (write !== y) {
          board[idx(x, write)] = v;
          board[idx(x, y)] = 0;
          moved = true;
        }
        write--;
      }
    }
  }
  return moved;
}

export class Game {
  board: Uint8Array = new Uint8Array(COLS * ROWS);
  marked: Uint8Array = new Uint8Array(COLS * ROWS);
  piece: FallingPiece | null = null;
  next!: NextPiece;
  status: Status = "READY";
  timeMs = 0;
  score = 0;
  survivalPoints = 0;
  squaresCleared = 0;
  combo = 0;
  highestCombo = 0;
  sweepX = 0;
  /** 1 = normal. The tutorial slows pieces down so new players can read the board. */
  gravityScale = 1;
  events: GameEvent[] = [];

  private rng: () => number;
  private gravityAcc = 0;
  private lockMs = 0;
  private lockResets = 0;
  private clearedThisPass = false;
  private held = { left: false, right: false, soft: false };
  private dasDir = 0;
  private dasMs = 0;

  constructor(rng: () => number) {
    this.rng = rng;
    this.next = this.makeNext();
  }

  start(): void {
    this.status = "PLAYING";
    this.spawn();
  }

  get seconds(): number {
    return this.timeMs / 1000;
  }

  get speed(): number {
    return sweepSpeed(this.seconds);
  }

  private makeNext(): NextPiece {
    const type = nextPieceType(this.rng);
    const arr = ARRANGEMENTS[Math.floor(this.rng() * ARRANGEMENTS.length)];
    let a = 1, b = 2;
    if (CONFIG.colorCount > 2) {
      a = 1 + Math.floor(this.rng() * CONFIG.colorCount);
      b = 1 + Math.floor(this.rng() * (CONFIG.colorCount - 1));
      if (b >= a) b++;
    }
    return { type, colors: arr.map((v) => (v === 1 ? a : b)) };
  }

  private spawn(): void {
    const { type, colors } = this.next;
    this.next = this.makeNext();
    const size = boxSize(type);
    const cells = pieceCells(type, 0);
    const minY = Math.min(...cells.map((c) => c[1]));
    const p: FallingPiece = { type, rotation: 0, x: Math.floor((COLS - size) / 2), y: -minY, colors };
    this.lockMs = 0;
    this.lockResets = 0;
    this.gravityAcc = 0;
    if (!this.fits(p.type, p.rotation, p.x, p.y)) {
      this.piece = p;
      this.endGame();
      return;
    }
    this.piece = p;
  }

  fits(type: PieceType, rotation: number, x: number, y: number): boolean {
    for (const [cx, cy] of pieceCells(type, rotation)) {
      const bx = x + cx, by = y + cy;
      if (bx < 0 || bx >= COLS || by >= ROWS) return false;
      if (by >= 0 && this.board[idx(bx, by)]) return false;
    }
    return true;
  }

  ghostY(): number {
    const p = this.piece;
    if (!p) return 0;
    let y = p.y;
    while (this.fits(p.type, p.rotation, p.x, y + 1)) y++;
    return y;
  }

  private onGround(): boolean {
    const p = this.piece!;
    return !this.fits(p.type, p.rotation, p.x, p.y + 1);
  }

  private resetLock(): void {
    if (this.lockMs > 0 && this.lockResets < CONFIG.maxLockResets) {
      this.lockMs = 0;
      this.lockResets++;
    }
  }

  private shift(dx: number): boolean {
    const p = this.piece;
    if (!p || !this.fits(p.type, p.rotation, p.x + dx, p.y)) return false;
    p.x += dx;
    this.resetLock();
    this.events.push({ kind: "move" });
    return true;
  }

  private rotate(dir: 1 | -1): void {
    const p = this.piece;
    if (!p) return;
    const r = (p.rotation + dir + 4) % 4;
    for (const [kx, ky] of KICKS) {
      if (this.fits(p.type, r, p.x + kx, p.y + ky)) {
        p.rotation = r;
        p.x += kx;
        p.y += ky;
        this.resetLock();
        this.events.push({ kind: "rotate" });
        return;
      }
    }
  }

  command(cmd: GameCommand): void {
    if (cmd.type === "PAUSE") {
      if (this.status === "PLAYING") this.pause();
      else if (this.status === "PAUSED") this.resume();
      return;
    }
    if (this.status !== "PLAYING" || !this.piece) return;
    switch (cmd.type) {
      case "MOVE_LEFT":
      case "MOVE_RIGHT": {
        const dir = cmd.type === "MOVE_LEFT" ? -1 : 1;
        if (dir < 0) this.held.left = cmd.pressed;
        else this.held.right = cmd.pressed;
        if (cmd.pressed) {
          this.dasDir = dir;
          this.dasMs = -CONFIG.dasMs;
          this.shift(dir);
        } else if (this.dasDir === dir) {
          // fall back to the other direction if it is still held
          const other = dir < 0 ? this.held.right : this.held.left;
          this.dasDir = other ? -dir : 0;
          this.dasMs = -CONFIG.dasMs;
        }
        break;
      }
      case "SOFT_DROP":
        this.held.soft = cmd.pressed;
        break;
      case "ROTATE_CW":
        this.rotate(1);
        break;
      case "ROTATE_CCW":
        this.rotate(-1);
        break;
      case "HARD_DROP":
        {
          const from = this.piece.y;
          this.piece.y = this.ghostY();
          this.lock(true, this.piece.y - from);
        }
        break;
    }
  }

  /** Releases held inputs (blur, pause, touch cancel). */
  releaseAll(): void {
    this.held = { left: false, right: false, soft: false };
    this.dasDir = 0;
  }

  pause(): void {
    if (this.status !== "PLAYING") return;
    this.status = "PAUSED";
    this.releaseAll();
  }

  resume(): void {
    if (this.status === "PAUSED") this.status = "PLAYING";
  }

  private lock(hard: boolean, dropped = 0): void {
    const p = this.piece!;
    const cells = pieceCells(p.type, p.rotation);
    let overflow = false;
    const placed: [number, number, number][] = [];
    cells.forEach(([cx, cy], i) => {
      const bx = p.x + cx, by = p.y + cy;
      if (by < 0) overflow = true;
      else this.board[idx(bx, by)] = p.colors[i];
      placed.push([bx, by, p.colors[i]]);
    });
    this.piece = null;
    this.events.push({ kind: "lock", hard, cells: placed, dropped });
    applyGravity(this.board);
    this.updateMarks();
    if (overflow) {
      this.endGame();
      return;
    }
    this.spawn();
  }

  /** Recomputes squares and reports newly formed ones (for the "you made a block" moment). */
  private updateMarks(): void {
    const next = findMarked(this.board);
    const fresh: number[] = [];
    for (let i = 0; i < next.length; i++) if (next[i] && !this.marked[i]) fresh.push(i);
    this.marked = next;
    if (fresh.length) this.events.push({ kind: "formed", cells: fresh });
  }

  private endGame(): void {
    this.status = "GAME_OVER";
    this.releaseAll();
    this.events.push({ kind: "gameover" });
  }

  /** Clears marked components whose rightmost column is `col` (the sweep has passed all of it). */
  processColumn(col: number): void {
    this.events.push({ kind: "column", col });
    const marked = findMarked(this.board); // stable snapshot
    const seen = new Uint8Array(this.board.length);
    const toClear: number[] = [];
    let squares = 0;
    for (let y = 0; y < ROWS; y++) {
      const start = idx(col, y);
      if (!marked[start] || seen[start]) continue;
      const color = this.board[start];
      const comp = new Set<number>();
      const stack = [start];
      seen[start] = 1;
      let maxX = col;
      while (stack.length) {
        const i = stack.pop()!;
        comp.add(i);
        const x = i % COLS;
        if (x > maxX) maxX = x;
        const nbrs = [x > 0 ? i - 1 : -1, x < COLS - 1 ? i + 1 : -1, i - COLS, i + COLS];
        for (const n of nbrs) {
          if (n >= 0 && n < this.board.length && !seen[n] && marked[n] && this.board[n] === color) {
            seen[n] = 1;
            stack.push(n);
          }
        }
      }
      if (maxX !== col) continue; // sweep hasn't finished crossing this group
      squares += countSquares(comp);
      toClear.push(...comp);
    }
    if (!squares) {
      this.marked = marked;
      return;
    }
    this.combo++;
    this.highestCombo = Math.max(this.highestCombo, this.combo);
    this.clearedThisPass = true;
    const base = squares * CONFIG.squarePoints + (squares - 1) * CONFIG.extraSquareBonus;
    const mult = Math.min(CONFIG.comboMax, 1 + CONFIG.comboStep * (this.combo - 1));
    const points = Math.round(base * mult);
    this.score += points;
    this.squaresCleared += squares;
    const colors = toClear.map((i) => this.board[i]);
    for (const i of toClear) this.board[i] = 0;
    this.events.push({ kind: "clear", cells: toClear, colors, squares, points, combo: this.combo });
    applyGravity(this.board);
    this.updateMarks();
    // a falling piece can never overlap after gravity because gravity only moves cells down
    // into empty space below existing stacks, and the piece sits above the stack.
  }

  /** One fixed simulation step. */
  step(dtMs: number): void {
    if (this.status !== "PLAYING") return;
    const dt = dtMs / 1000;
    const prevSec = Math.floor(this.timeMs / 1000);
    this.timeMs += dtMs;
    const sec = Math.floor(this.timeMs / 1000);
    if (sec > prevSec) {
      this.survivalPoints += sec - prevSec;
      this.score += sec - prevSec;
    }

    // sweep line
    const prevX = this.sweepX;
    this.sweepX += this.speed * dt;
    for (let c = Math.floor(prevX); c < Math.floor(this.sweepX); c++) {
      this.processColumn(c % COLS);
      if (c % COLS === COLS - 1) {
        if (!this.clearedThisPass) this.combo = 0;
        this.clearedThisPass = false;
      }
    }
    if (this.sweepX >= COLS) this.sweepX -= COLS;
    if (this.status !== "PLAYING" || !this.piece) return;

    // horizontal auto-repeat
    if (this.dasDir) {
      this.dasMs += dtMs;
      while (this.dasMs >= 0) {
        if (!this.shift(this.dasDir)) {
          this.dasMs = 0;
          break;
        }
        this.dasMs -= CONFIG.arrMs;
      }
    }

    // gravity
    const fall = gravityRate(this.seconds) * this.gravityScale;
    const rate = this.held.soft ? Math.max(CONFIG.softDropRate, fall) : fall;
    this.gravityAcc += rate * dt;
    while (this.gravityAcc >= 1) {
      this.gravityAcc -= 1;
      const p = this.piece;
      if (this.fits(p.type, p.rotation, p.x, p.y + 1)) {
        p.y++;
        this.lockMs = 0;
      } else {
        this.gravityAcc = 0;
        break;
      }
    }
    if (this.onGround()) {
      this.lockMs += dtMs;
      if (this.lockMs >= CONFIG.lockDelayMs || (this.held.soft && this.lockMs >= 80)) this.lock(false);
    } else {
      this.lockMs = 0;
    }
  }

  drainEvents(): GameEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }
}
