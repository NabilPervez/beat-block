import { describe, expect, it } from "vitest";
import { skinFor, SKIN_EVERY, THEMES } from "../src/themes";
import { Game, idx } from "../src/engine/game";
import { createRng } from "../src/engine/rng";
import { setupTutorialBoard } from "../src/tutorial";
import { pieceCells } from "../src/engine/pieces";

describe("skin progression", () => {
  it("advances one skin every SKIN_EVERY squares and wraps", () => {
    expect(skinFor("rave", 0).level).toBe(0);
    expect(skinFor("rave", SKIN_EVERY - 1).theme.id).toBe("rave");
    expect(skinFor("rave", SKIN_EVERY).theme.id).toBe(THEMES[1].id);
    expect(skinFor("rave", SKIN_EVERY * THEMES.length).theme.id).toBe("rave");
    expect(skinFor("rave", SKIN_EVERY / 2).progress).toBeCloseTo(0.5);
  });

  it("starts from the chosen skin; unknown ids fall back to the first", () => {
    expect(skinFor("laser", 0).theme.id).toBe("laser");
    expect(skinFor("nope", 0).theme.id).toBe(THEMES[0].id);
  });
});

describe("tutorial board", () => {
  it("moving the first piece one column left and dropping it forms a square", () => {
    const g = new Game(createRng(7));
    setupTutorialBoard(g);
    g.start();
    expect(g.piece!.type).toBe("O");
    expect(g.marked.some(Boolean)).toBe(false);
    g.command({ type: "MOVE_LEFT", pressed: true });
    g.command({ type: "MOVE_LEFT", pressed: false });
    g.command({ type: "HARD_DROP" });
    expect(g.drainEvents().some((e) => e.kind === "formed")).toBe(true);
    expect(g.marked[idx(3, 15)]).toBe(1);
  });

  it("dropping without moving does not form a square", () => {
    const g = new Game(createRng(7));
    setupTutorialBoard(g);
    g.start();
    const p = g.piece!;
    expect(Math.min(...pieceCells(p.type, p.rotation).map(([x]) => p.x + x))).toBe(4);
    g.command({ type: "HARD_DROP" });
    expect(g.drainEvents().some((e) => e.kind === "formed")).toBe(false);
  });
});
