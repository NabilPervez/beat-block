import { describe, expect, it } from "vitest";
import { TYPES, pieceCells, nextPieceType } from "../src/engine/pieces";
import { createRng } from "../src/engine/rng";
import { COLS, ROWS, Game, idx, countSquares, findMarked, applyGravity, sweepSpeed } from "../src/engine/game";

const key = (cells: readonly (readonly [number, number])[]) =>
  cells.map(([x, y]) => `${x},${y}`).sort().join(" ");

describe("pieces", () => {
  it("every shape has exactly four orthogonally connected cells in all rotations", () => {
    for (const t of TYPES) {
      for (let r = 0; r < 4; r++) {
        const cells = pieceCells(t, r);
        expect(new Set(cells.map((c) => c.join())).size).toBe(4);
        const set = new Set(cells.map((c) => c.join()));
        const seen = new Set([cells[0].join()]);
        const stack = [cells[0]];
        while (stack.length) {
          const [x, y] = stack.pop()!;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const k = `${x + dx},${y + dy}`;
            if (set.has(k) && !seen.has(k)) { seen.add(k); stack.push([x + dx, y + dy]); }
          }
        }
        expect(seen.size).toBe(4);
      }
    }
  });

  it("four rotations return to the start, O never changes shape", () => {
    for (const t of TYPES) expect(key(pieceCells(t, 4))).toBe(key(pieceCells(t, 0)));
    for (let r = 0; r < 4; r++) expect(key(pieceCells("O", r))).toBe(key(pieceCells("O", 0)));
  });

  it("random generation is uniform-ish, produces every shape and allows repeats", () => {
    const rng = createRng(42);
    const counts: Record<string, number> = {};
    let repeats = 0, prev = "";
    for (let i = 0; i < 70000; i++) {
      const t = nextPieceType(rng);
      counts[t] = (counts[t] ?? 0) + 1;
      if (t === prev) repeats++;
      prev = t;
    }
    for (const t of TYPES) expect(counts[t]).toBeGreaterThan(9500), expect(counts[t]).toBeLessThan(10500);
    expect(repeats).toBeGreaterThan(9000); // ~1/7 of draws repeat; a bag would make this rare
  });

  it("seeded rng is reproducible and in [0,1)", () => {
    const a = createRng(7), b = createRng(7);
    for (let i = 0; i < 1000; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("board rules", () => {
  it("findMarked only marks same-colour 2×2 squares", () => {
    const b = new Uint8Array(COLS * ROWS);
    b[idx(0, 15)] = b[idx(1, 15)] = b[idx(0, 14)] = 1;
    b[idx(1, 14)] = 2;
    expect(findMarked(b).some(Boolean)).toBe(false);
    b[idx(1, 14)] = 1;
    expect([...findMarked(b)].filter(Boolean).length).toBe(4);
  });

  it("countSquares counts non-overlapping squares consistently", () => {
    const cells = (pts: [number, number][]) => new Set(pts.map(([x, y]) => idx(x, y)));
    // 3×2 block: two overlapping squares, only one non-overlapping
    expect(countSquares(cells([[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1]]))).toBe(1);
    // 4×2 block: two
    expect(countSquares(cells([[0, 0], [1, 0], [2, 0], [3, 0], [0, 1], [1, 1], [2, 1], [3, 1]]))).toBe(2);
    // 2×2 does not wrap across the right edge
    expect(countSquares(cells([[9, 0], [0, 1], [9, 1], [0, 2]]))).toBe(0);
  });

  it("gravity compacts columns", () => {
    const b = new Uint8Array(COLS * ROWS);
    b[idx(3, 2)] = 1;
    b[idx(3, 10)] = 2;
    applyGravity(b);
    expect(b[idx(3, 15)]).toBe(2);
    expect(b[idx(3, 14)]).toBe(1);
    expect(b[idx(3, 2)]).toBe(0);
  });

  it("sweep speed ramps continuously and caps", () => {
    expect(sweepSpeed(0)).toBeCloseTo(0.45);
    expect(sweepSpeed(15)).toBeCloseTo(0.55);
    expect(sweepSpeed(300)).toBeCloseTo(1.25);
    expect(sweepSpeed(100000)).toBe(2);
  });
});

describe("game", () => {
  const setup = () => {
    const g = new Game(createRng(1));
    g.start();
    return g;
  };

  it("clears a 2×2 only after the sweep passes its rightmost column, scores 100", () => {
    const g = setup();
    g.board[idx(4, 15)] = g.board[idx(5, 15)] = g.board[idx(4, 14)] = g.board[idx(5, 14)] = 1;
    g.processColumn(4);
    expect(g.board[idx(4, 15)]).toBe(1);
    const before = g.score;
    g.processColumn(5);
    expect(g.board[idx(4, 15)]).toBe(0);
    expect(g.score - before).toBe(100);
    expect(g.squaresCleared).toBe(1);
  });

  it("does not double count a large group and awards adjacency bonus", () => {
    const g = setup();
    for (let x = 0; x < 4; x++) for (let y = 14; y < 16; y++) g.board[idx(x, y)] = 2;
    g.processColumn(3);
    expect(g.squaresCleared).toBe(2);
    expect(g.score).toBe(225);
    g.processColumn(3);
    expect(g.score).toBe(225);
  });

  it("gravity resolves floating cells after a clear", () => {
    const g = setup();
    g.board[idx(0, 15)] = g.board[idx(1, 15)] = g.board[idx(0, 14)] = g.board[idx(1, 14)] = 1;
    g.board[idx(0, 13)] = 2;
    g.processColumn(1);
    expect(g.board[idx(0, 15)]).toBe(2);
  });

  it("hard drop locks and spawns the next piece; collisions respect edges", () => {
    const g = setup();
    for (let i = 0; i < 12; i++) g.command({ type: "MOVE_LEFT", pressed: true }), g.command({ type: "MOVE_LEFT", pressed: false });
    const p = g.piece!;
    expect(Math.min(...pieceCells(p.type, p.rotation).map(([x]) => p.x + x))).toBe(0);
    g.command({ type: "HARD_DROP" });
    expect(g.board.some(Boolean)).toBe(true);
    expect(g.piece).not.toBeNull();
  });

  it("rotation with kicks never overlaps the board", () => {
    const g = setup();
    for (let i = 0; i < 400 && g.status === "PLAYING"; i++) {
      g.command({ type: i % 3 ? "ROTATE_CW" : "ROTATE_CCW" });
      const p = g.piece!;
      for (const [x, y] of pieceCells(p.type, p.rotation)) {
        const bx = p.x + x, by = p.y + y;
        expect(bx).toBeGreaterThanOrEqual(0);
        expect(bx).toBeLessThan(COLS);
        if (by >= 0) expect(g.board[idx(bx, by)]).toBe(0);
      }
      if (i % 5 === 0) g.command({ type: "HARD_DROP" });
    }
  });

  it("game over when spawn is blocked, then ignores input", () => {
    const g = setup();
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (x !== 0) g.board[idx(x, y)] = ((x + y) % 2) + 1;
    g.command({ type: "HARD_DROP" });
    expect(g.status).toBe("GAME_OVER");
    const s = g.score;
    g.command({ type: "HARD_DROP" });
    g.step(1000);
    expect(g.score).toBe(s);
  });

  it("pause freezes time and sweep; survival adds 1 point per second", () => {
    const g = setup();
    g.board.fill(0);
    for (let i = 0; i < 61; i++) g.step(1000 / 60);
    expect(g.survivalPoints).toBe(1);
    g.command({ type: "PAUSE" });
    const t = g.timeMs, x = g.sweepX;
    g.step(5000);
    expect(g.timeMs).toBe(t);
    expect(g.sweepX).toBe(x);
  });

  it("every piece has two colours, two cells each", () => {
    const g = setup();
    for (let i = 0; i < 50; i++) {
      const c = g.next.colors;
      expect(c.filter((v) => v === c[0]).length).toBe(2);
      g.command({ type: "HARD_DROP" });
      if (g.status !== "PLAYING") break;
    }
  });
});
