import { describe, expect, it } from "vitest";
import { createRng } from "../src/engine/rng";
import { CONFIG, Game, COLS, idx } from "../src/engine/game";
import { calibrationOffset } from "../src/beat";

const fresh = () => {
  const g = new Game(createRng(42));
  g.start();
  return g;
};

describe("Beat multiplier (TR-06, GDD-BEAT-02)", () => {
  it("builds +0.1 per consecutive on-beat hard drop, capped at ×2.0", () => {
    const g = fresh();
    const seen: number[] = [];
    for (let i = 0; i < 14 && g.status === "PLAYING"; i++) {
      g.command({ type: "HARD_DROP", onBeat: true });
      seen.push(+g.beatMult.toFixed(2));
    }
    expect(seen.slice(0, 3)).toEqual([1.1, 1.2, 1.3]);
    expect(Math.max(...seen)).toBe(CONFIG.beatMax);
  });

  it("an off-beat hard drop resets it", () => {
    const g = fresh();
    g.command({ type: "HARD_DROP", onBeat: true });
    g.command({ type: "HARD_DROP", onBeat: true });
    g.command({ type: "HARD_DROP", onBeat: false });
    expect(g.beatMult).toBe(1);
    expect(g.beatStreak).toBe(0);
    expect(g.onBeatDrops).toBe(2);
    expect(g.hardDrops).toBe(3);
  });

  it("soft drops, gravity locks and unstamped hard drops don't touch it", () => {
    const g = fresh();
    g.command({ type: "HARD_DROP", onBeat: true });
    g.command({ type: "SOFT_DROP", pressed: true });
    for (let i = 0; i < 400 && g.status === "PLAYING"; i++) g.step(16);
    g.command({ type: "HARD_DROP" });
    expect(g.beatMult).toBeCloseTo(1.1);
    expect(g.hardDrops).toBe(1);
  });

  it("lock event reports onBeat and the multiplier", () => {
    const g = fresh();
    g.drainEvents();
    g.command({ type: "HARD_DROP", onBeat: true });
    const lock = g.drainEvents().find((e) => e.kind === "lock");
    expect(lock).toMatchObject({ kind: "lock", hard: true, onBeat: true });
    expect((lock as { beatMult: number }).beatMult).toBeCloseTo(1.1);
  });

  it("stacks with combo and caps the total at ×6", () => {
    const clearOne = (g: Game) => {
      // one 2×2 of colour 1 in the bottom-left; the sweep clears it at column 1
      g.board.fill(0);
      for (const [x, y] of [[0, 14], [1, 14], [0, 15], [1, 15]]) g.board[idx(x, y)] = 1;
      const before = g.score;
      g.processColumn(1);
      return g.score - before;
    };
    const g = fresh();
    expect(clearOne(g)).toBe(CONFIG.squarePoints); // combo 1, beat ×1
    g.beatMult = 2;
    g.combo = 20; // combo mult capped at 4 → 4 × 2 = 8 → capped to 6
    expect(clearOne(g)).toBe(CONFIG.squarePoints * CONFIG.totalMultMax);
    expect(COLS).toBe(10);
  });

  it("no regression: a seeded run without beat stamps scores as before", () => {
    const play = (stamp: boolean) => {
      const g = fresh();
      for (let i = 0; i < 3000 && g.status === "PLAYING"; i++) {
        if (i % 37 === 0) g.command(stamp ? { type: "HARD_DROP", onBeat: false } : { type: "HARD_DROP" });
        if (i % 11 === 0) g.command({ type: "MOVE_LEFT", pressed: i % 22 === 0 });
        g.step(16);
      }
      return [g.score, g.squaresCleared, g.timeMs];
    };
    // off-beat stamps keep the multiplier at ×1, so the score must match the unstamped run
    expect(play(true)).toEqual(play(false));
  });
});

describe("Calibration offset (GDD-BEAT-05)", () => {
  const beat = 600, first = 1000;
  const taps = (errs: number[]) => errs.map((e, k) => first + k * beat + e);

  it("returns the median tap error", () => {
    expect(calibrationOffset(taps([40, 50, 60, 45, 55, 50, 300, 52]), first, beat, 8)).toBe(50);
  });
  it("handles early taps (negative offset)", () => {
    expect(calibrationOffset(taps([-30, -30, -30, -30, -30, -30, -30, -30]), first, beat, 8)).toBe(-30);
  });
  it("needs at least half the beats", () => {
    expect(calibrationOffset(taps([10, 10, 10]), first, beat, 8)).toBeNull();
  });
  it("ignores taps outside the click run and clamps to ±300", () => {
    expect(calibrationOffset([0, ...taps([290, 290, 290, 290])], first, beat, 8)).toBe(290);
  });
});
