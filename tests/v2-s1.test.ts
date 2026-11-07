import { describe, expect, it } from "vitest";
import { createRng, localDateKey, seedForDate } from "../src/engine/rng";
import { nextPieceType } from "../src/engine/pieces";
import { migrate, recordDaily, emptyDaily, SCHEMA_VERSION } from "../src/storage";
import { dailyStartSkin, THEMES } from "../src/themes";
import { BeatClock, beatMsFor, isOnBeat, offBeatMs } from "../src/beat";

const pieces = (seed: number, n = 100) => {
  const rng = createRng(seed);
  return Array.from({ length: n }, () => nextPieceType(rng));
};

describe("Daily seed (TR-01)", () => {
  it("same date gives the same 100 pieces", () => {
    expect(pieces(seedForDate("2026-11-07"))).toEqual(pieces(seedForDate("2026-11-07")));
  });
  it("different dates differ", () => {
    expect(seedForDate("2026-11-07")).not.toBe(seedForDate("2026-11-08"));
    expect(pieces(seedForDate("2026-11-07"))).not.toEqual(pieces(seedForDate("2026-11-08")));
  });
  it("FNV-1a matches the reference value", () => {
    expect(seedForDate("")).toBe(0x811c9dc5);
    expect(seedForDate("a")).toBe(0xe40c292c);
  });
  it("formats local date keys", () => {
    expect(localDateKey(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});

describe("Daily start skin (TR-04)", () => {
  it("is deterministic and a real skin", () => {
    const s = seedForDate("2026-11-07");
    expect(dailyStartSkin(s)).toBe(dailyStartSkin(s));
    expect(THEMES.map((t) => t.id)).toContain(dailyStartSkin(s));
  });
});

describe("Profile migration (TR-02)", () => {
  const v1 = {
    schemaVersion: 1, personalBestScore: 4200, bestSurvivalMs: 91000, totalRuns: 12, totalPlayTimeMs: 600000,
    totalSquaresCleared: 140, highestCombo: 5, furthestSkin: 3, tutorialDone: true,
    settings: { themeId: "acid", musicEnabled: false, soundEffectsEnabled: true, vibrationEnabled: true, reducedMotion: false,
      effects: true, symbols: true, highContrast: false, leftHanded: true, controlLayout: "pad" },
  };
  it("keeps every v1 record and adds v2 defaults", () => {
    const p = migrate(v1);
    expect(p.schemaVersion).toBe(SCHEMA_VERSION);
    expect(p.personalBestScore).toBe(4200);
    expect(p.bestSurvivalMs).toBe(91000);
    expect(p.totalRuns).toBe(12);
    expect(p.furthestSkin).toBe(3);
    expect(p.settings.themeId).toBe("acid");
    expect(p.settings.leftHanded).toBe(true);
    expect(p.settings.controlLayout).toBe("pad");
    expect(p.daily).toEqual(emptyDaily());
    expect(p.settings.beatWindow).toBe("normal");
    expect(p.settings.audioOffsetMs).toBe(0);
    expect(p.settings.classicSweep).toBe(false);
  });
  it("round-trips a v2 profile and sanitises bad daily data", () => {
    const p = migrate(v1);
    p.daily = { date: "2026-11-07", best: 900, timeMs: 30000, streak: 2, lastPlayed: "2026-11-07" };
    expect(migrate(JSON.parse(JSON.stringify(p)))).toEqual(p);
    expect(migrate({ ...v1, daily: { date: "nope", best: -5 } }).daily).toEqual(emptyDaily());
  });
});

describe("Daily records (GDD-DAILY-02)", () => {
  it("keeps the day's best across retries and resets next day", () => {
    const d = emptyDaily();
    expect(recordDaily(d, "2026-11-07", 500, 20000, "2026-11-06")).toBe(true);
    expect(recordDaily(d, "2026-11-07", 300, 10000, "2026-11-06")).toBe(false);
    expect(d.best).toBe(500);
    expect(d.streak).toBe(1);
    recordDaily(d, "2026-11-08", 100, 5000, "2026-11-07");
    expect(d.best).toBe(100);
    expect(d.streak).toBe(2);
    recordDaily(d, "2026-11-10", 50, 5000, "2026-11-09");
    expect(d.streak).toBe(1);
  });
});

describe("Beat clock (TR-05)", () => {
  it("on-beat window math", () => {
    expect(offBeatMs(1000, 0, 500)).toBe(0);
    expect(offBeatMs(1080, 0, 500)).toBe(80);
    expect(offBeatMs(1420, 0, 500)).toBe(80);
    expect(isOnBeat(1089, 0, 500, 90)).toBe(true);
    expect(isOnBeat(1091, 0, 500, 90)).toBe(false);
    expect(isOnBeat(1140, 0, 500, 90, 50)).toBe(true); // calibration offset
    expect(offBeatMs(-20, 0, 500)).toBe(20);
  });
  it("fires beats on schedule and pauses cleanly", () => {
    let t = 0;
    const c = new BeatClock(() => t);
    c.start(500);
    expect(c.poll(500)).toEqual([0]);
    t = 499; expect(c.poll(500)).toEqual([]);
    t = 500; expect(c.poll(500)).toEqual([1]);
    c.pause(); t = 5000; expect(c.poll(500)).toEqual([]);
    c.resume(); t = 5499; expect(c.poll(500)).toEqual([]);
    t = 5500; expect(c.poll(500)).toEqual([2]);
  });
  it("caps bursts after a stall and keeps the grid", () => {
    let t = 0;
    const c = new BeatClock(() => t);
    c.start(100);
    c.poll(100);
    t = 1000;
    expect(c.poll(100, 1)).toEqual([1]);
    expect(c.n).toBe(11);
    expect(c.onBeat(10)).toBe(true);
  });
  it("tempo rises up to +24 BPM", () => {
    expect(beatMsFor(120, 0)).toBe(500);
    expect(beatMsFor(96, 10000)).toBe(500);
  });
});
