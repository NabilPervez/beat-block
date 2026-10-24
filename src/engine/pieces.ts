export const TYPES = ["I", "J", "L", "O", "S", "T", "Z"] as const;
export type PieceType = (typeof TYPES)[number];

export type Cell = readonly [x: number, y: number];

/** Canonical spawn orientation inside a size×size box (y grows downward). */
const SHAPES: Record<PieceType, { size: number; cells: Cell[] }> = {
  I: { size: 4, cells: [[0, 1], [1, 1], [2, 1], [3, 1]] },
  J: { size: 3, cells: [[0, 0], [0, 1], [1, 1], [2, 1]] },
  L: { size: 3, cells: [[2, 0], [0, 1], [1, 1], [2, 1]] },
  O: { size: 2, cells: [[0, 0], [1, 0], [0, 1], [1, 1]] },
  S: { size: 3, cells: [[1, 0], [2, 0], [0, 1], [1, 1]] },
  T: { size: 3, cells: [[1, 0], [0, 1], [1, 1], [2, 1]] },
  Z: { size: 3, cells: [[0, 0], [1, 0], [1, 1], [2, 1]] },
};

export function boxSize(type: PieceType): number {
  return SHAPES[type].size;
}

/**
 * Cells for a type at a rotation (0–3, clockwise). Index i of the result always
 * corresponds to index i of the canonical list, so per-cell colours travel with rotation.
 * O never changes: its 2×2 box rotation would only permute the colours, which is still
 * a rotation the player sees, so we allow it to permute but keep geometry fixed.
 */
export function pieceCells(type: PieceType, rotation: number): Cell[] {
  const { size, cells } = SHAPES[type];
  const r = ((rotation % 4) + 4) % 4;
  return cells.map(([x, y]) => {
    let cx = x, cy = y;
    for (let i = 0; i < r; i++) {
      const nx = size - 1 - cy;
      cy = cx;
      cx = nx;
    }
    return [cx, cy] as const;
  });
}

export function nextPieceType(rng: () => number): PieceType {
  // PRD §3.3: independent uniform selection, P = 1/7. No bag.
  return TYPES[Math.floor(rng() * TYPES.length)];
}
