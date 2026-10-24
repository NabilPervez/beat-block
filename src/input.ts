import type { GameCommand } from "./engine/game";

type Send = (cmd: GameCommand) => void;

const HOLD: Record<string, "MOVE_LEFT" | "MOVE_RIGHT" | "SOFT_DROP"> = {
  ArrowLeft: "MOVE_LEFT", KeyA: "MOVE_LEFT",
  ArrowRight: "MOVE_RIGHT", KeyD: "MOVE_RIGHT",
  ArrowDown: "SOFT_DROP", KeyS: "SOFT_DROP",
};
const TAP: Record<string, GameCommand["type"]> = {
  ArrowUp: "ROTATE_CW", KeyW: "ROTATE_CW", KeyX: "ROTATE_CW",
  KeyZ: "ROTATE_CCW", Space: "HARD_DROP", Escape: "PAUSE", KeyP: "PAUSE",
};

/** Keyboard → commands. Browser key-repeat is ignored; the engine does its own DAS. */
export function bindKeyboard(send: Send, isActive: () => boolean, onEnter: () => void): void {
  addEventListener("keydown", (e) => {
    if (e.code === "Enter" && !isActive()) { onEnter(); return; }
    if (!isActive()) return;
    const hold = HOLD[e.code];
    const tap = TAP[e.code];
    if (!hold && !tap) return;
    e.preventDefault();
    if (e.repeat) return;
    if (hold) send({ type: hold, pressed: true });
    else send({ type: tap } as GameCommand);
  });
  addEventListener("keyup", (e) => {
    const hold = HOLD[e.code];
    if (hold) send({ type: hold, pressed: false });
  });
}

/** On-screen pad. Held buttons stop on release, cancel, or the pointer leaving. */
export function bindPad(pad: HTMLElement, send: Send): void {
  pad.querySelectorAll<HTMLButtonElement>("[data-cmd]").forEach((btn) => {
    const cmd = btn.dataset.cmd as GameCommand["type"];
    const holdable = cmd === "MOVE_LEFT" || cmd === "MOVE_RIGHT" || cmd === "SOFT_DROP";
    let down = false;
    const release = () => {
      btn.classList.remove("is-down");
      if (down && holdable) send({ type: cmd, pressed: false } as GameCommand);
      down = false;
    };
    btn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      btn.setPointerCapture(e.pointerId);
      btn.classList.add("is-down");
      down = true;
      send(holdable ? ({ type: cmd, pressed: true } as GameCommand) : ({ type: cmd } as GameCommand));
    });
    btn.addEventListener("pointerup", release);
    btn.addEventListener("pointercancel", release);
    btn.addEventListener("lostpointercapture", release);
    // keyboard activation of a focused button (Enter/Space) without double firing on touch
    btn.addEventListener("click", (e) => { if (e.detail === 0) { send(holdable ? { type: cmd, pressed: true } as GameCommand : { type: cmd } as GameCommand); if (holdable) send({ type: cmd, pressed: false } as GameCommand); } });
  });
}

/**
 * Gestures on the board: drag sideways = move one column per cell width,
 * fast flick down = hard drop, slow drag down = soft drop, tap = rotate.
 * A gesture is classified once so it never counts as both a swipe and a tap.
 */
export function bindGestures(el: HTMLElement, send: Send, cellSize: () => number): void {
  let id = -1, sx = 0, sy = 0, lastX = 0, t0 = 0, moved = false, soft = false;
  el.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse") return;
    id = e.pointerId; sx = lastX = e.clientX; sy = e.clientY; t0 = performance.now(); moved = false; soft = false;
    el.setPointerCapture(id);
  });
  el.addEventListener("pointermove", (e) => {
    if (e.pointerId !== id) return;
    const c = cellSize();
    let dx = e.clientX - lastX;
    while (Math.abs(dx) >= c) {
      const dir = dx > 0 ? "MOVE_RIGHT" : "MOVE_LEFT";
      send({ type: dir, pressed: true });
      send({ type: dir, pressed: false });
      lastX += dx > 0 ? c : -c;
      dx = e.clientX - lastX;
      moved = true;
    }
    const dy = e.clientY - sy;
    if (!soft && dy > c * 1.5 && Math.abs(dy) > Math.abs(e.clientX - sx)) {
      soft = true; moved = true;
      send({ type: "SOFT_DROP", pressed: true });
    }
  });
  const end = (e: PointerEvent, cancelled: boolean) => {
    if (e.pointerId !== id) return;
    id = -1;
    if (soft) send({ type: "SOFT_DROP", pressed: false });
    if (cancelled) return;
    const dt = performance.now() - t0;
    const dy = e.clientY - sy, dx = e.clientX - sx;
    if (dy > cellSize() * 2 && dt < 250 && Math.abs(dy) > Math.abs(dx) * 1.5) send({ type: "HARD_DROP" });
    else if (!moved && Math.hypot(dx, dy) < 12 && dt < 300) send({ type: "ROTATE_CW" });
  };
  el.addEventListener("pointerup", (e) => end(e, false));
  el.addEventListener("pointercancel", (e) => end(e, true));
}
