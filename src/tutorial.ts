import { idx, type Game, type GameEvent } from "./engine/game";

// First-run tutorial (PRD §17: "teach the 2×2 rule through a short interactive tutorial").
// A scripted board where the player makes one square and watches the sweep clear it.

interface Step { title: string; body: (touch: boolean) => string }

const STEPS: Step[] = [
  {
    title: "Move and rotate",
    body: (t) => t
      ? "Tap ◀ ▶ or drag sideways to move. Tap ⟳ or the board to rotate."
      : "← → to move. ↑ to rotate. Space drops.",
  },
  {
    title: "Make a 2×2 square",
    body: () => "Land the piece so four cells of one colour form a solid square. Rotate to line the colours up.",
  },
  {
    title: "Ride the sweep",
    body: () => "Your square is locked in. When the sweep line passes it, it clears for points.",
  },
  {
    title: "You're ready",
    body: () => `Bigger squares score more. Clear on every sweep to build combos. Every 12 squares the skin and the track change.`,
  },
];

/** Bottom-row setup: two colour-1 cells at x=3–4. An O piece with colour 1 on its bottom row,
 *  moved one column left, completes the square. Colour-2 cells are scattered so nothing else matches. */
export function setupTutorialBoard(g: Game): void {
  g.board.fill(0);
  const put = (x: number, y: number, c: number) => (g.board[idx(x, y)] = c);
  put(3, 15, 1); put(4, 15, 1);
  put(0, 15, 2); put(1, 15, 1); put(8, 15, 2); put(9, 15, 1); put(9, 14, 2);
  g.next = { type: "O", colors: [2, 2, 1, 1] }; // O cells: top-left, top-right, bottom-left, bottom-right
  g.gravityScale = 0.3;
}

export interface TutorialUi {
  coach: HTMLElement;
  title: HTMLElement;
  body: HTMLElement;
  dots: HTMLElement;
  done: HTMLButtonElement;
}

export class Tutorial {
  active = false;
  private step = 0;
  private moved = false;
  private rotated = false;

  constructor(
    private ui: TutorialUi,
    private touch: () => boolean,
    private hooks: { resetBoard: () => void; sweepTo: (x: number) => void },
  ) {}

  start(): void {
    this.active = true;
    this.moved = this.rotated = false;
    this.go(0);
  }

  stop(): void {
    this.active = false;
    this.ui.coach.hidden = true;
  }

  private go(step: number, note?: string): void {
    this.step = step;
    const s = STEPS[step];
    this.ui.coach.hidden = false;
    this.ui.title.textContent = note ?? s.title;
    this.ui.body.textContent = s.body(this.touch());
    this.ui.dots.innerHTML = STEPS.map((_, i) => `<i class="${i <= step ? "on" : ""}"></i>`).join("");
    this.ui.done.hidden = step !== STEPS.length - 1;
    this.ui.coach.classList.remove("pulse");
    void this.ui.coach.offsetWidth;
    this.ui.coach.classList.add("pulse");
  }

  handle(events: GameEvent[]): void {
    if (!this.active) return;
    const has = (k: GameEvent["kind"]) => events.some((e) => e.kind === k);
    switch (this.step) {
      case 0:
        if (has("move")) this.moved = true;
        if (has("rotate")) this.rotated = true;
        if (this.moved && this.rotated) {
          this.hooks.resetBoard(); // fresh piece so rotations from step 0 don't scramble the colours
          this.go(1);
        } else if (has("lock")) {
          this.hooks.resetBoard();
        }
        break;
      case 1:
        if (has("formed")) {
          this.hooks.sweepTo(2.5); // don't make a new player wait a full 20s sweep
          this.go(2);
        } else if (has("lock")) {
          this.hooks.resetBoard();
          this.go(1, "Not quite. Try again");
        }
        break;
      case 2:
        if (has("clear")) this.go(3);
        break;
    }
  }
}
