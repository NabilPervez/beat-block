import { describe, expect, it } from "vitest";
import { createRng } from "../src/engine/rng";
import { CONFIG, Game } from "../src/engine/game";
import { BeatClock, gradeFor, BEAT_CONFIG } from "../src/beat";

const fresh = () => {
  const g = new Game(createRng(42));
  g.start();
  return g;
};
const lockEvents = (g: Game) => g.drainEvents().filter((e) => e.kind === "lock") as Extract<ReturnType<Game["drainEvents"]>[number], { kind: "lock" }>[];

describe("S3 judgement tiers", () => {
  it("grades PERFECT inside ±45 ms, GOOD inside the window, OFF outside", () => {
    expect(gradeFor(0, 90)).toBe("perfect");
    expect(gradeFor(BEAT_CONFIG.perfectMs, 90)).toBe("perfect");
    expect(gradeFor(46, 90)).toBe("good");
    expect(gradeFor(90, 90)).toBe("good");
    expect(gradeFor(91, 90)).toBe("off");
    expect(gradeFor(120, 150)).toBe("good"); // wide window
  });

  it("PERFECT drops build +0.15, GOOD +0.1, still capped at ×2.0", () => {
    const g = fresh();
    g.command({ type: "HARD_DROP", onBeat: true, perfect: true });
    expect(g.beatMult).toBe(1 + CONFIG.beatPerfectStep);
    g.command({ type: "HARD_DROP", onBeat: true });
    expect(g.beatMult).toBe(1.25);
    for (let i = 0; i < 12 && g.status === "PLAYING"; i++) g.command({ type: "HARD_DROP", onBeat: true, perfect: true });
    expect(g.beatMult).toBe(CONFIG.beatMax);
    expect(g.perfectDrops).toBeGreaterThan(1);
  });

  it("flags a broken streak only when one existed", () => {
    const g = fresh();
    g.command({ type: "HARD_DROP", onBeat: false });
    expect(lockEvents(g).pop()?.broke).toBe(false);
    g.command({ type: "HARD_DROP", onBeat: true, perfect: true });
    g.command({ type: "HARD_DROP", onBeat: false });
    const last = lockEvents(g).pop()!;
    expect(last.broke).toBe(true);
    expect(g.beatMult).toBe(1);
  });

  it("unstamped hard drops still skip beat scoring", () => {
    const g = fresh();
    g.command({ type: "HARD_DROP", perfect: true });
    expect(g.hardDrops).toBe(0);
    expect(g.perfectDrops).toBe(0);
    expect(g.beatMult).toBe(1);
  });

  it("seeded replays without beat stamps are unchanged", () => {
    const run = () => {
      const g = fresh();
      for (let i = 0; i < 30 && g.status === "PLAYING"; i++) { g.command({ type: "HARD_DROP" }); g.step(16); }
      return [g.score, g.squaresCleared, g.status];
    };
    expect(run()).toEqual(run());
  });
});

describe("S3 beat phase (every cue reads this)", () => {
  it("tracks phase and time-to-beat, shifted by the calibration offset", () => {
    let t = 1000;
    const c = new BeatClock(() => t);
    c.start(500); // beat 0 fires on the next poll
    c.poll(500);
    t += 125;
    const a = c.beatPhase();
    expect(a.p).toBeCloseTo(0.25);
    expect(a.msToBeat).toBeCloseTo(375);
    const b = c.beatPhase(50); // player hears it 50 ms late, so the cue runs 50 ms behind
    expect(b.msSinceBeat).toBeCloseTo(75);
  });

  it("grade() agrees with gradeFor on the live grid", () => {
    let t = 0;
    const c = new BeatClock(() => t);
    c.start(500);
    c.poll(500);
    t += 30;
    expect(c.grade(90)).toBe("perfect");
    t += 40;
    expect(c.grade(90)).toBe("good");
    t += 100;
    expect(c.grade(90)).toBe("off");
  });
});
