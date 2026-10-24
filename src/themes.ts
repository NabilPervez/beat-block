// Skins: palette + background scene + music. Nabil, 2026-10-24: Lumines-style skin progression —
// every SKIN_EVERY cleared blocks the run moves to the next skin.
// Cosmetic only: board colour ids never change, so a skin change can't alter matching.
export type BgScene = "floor" | "tunnel" | "eq";

export interface Theme {
  id: string;
  name: string;
  play: [string, string];
  accent: string;     // sweep line, UI accent
  floor: string;      // background scene colour
  bg: BgScene;
  bpm: number;        // starting tempo for this skin
  bass: number[];     // one root note (Hz) per bar
  bassWave: OscillatorType;
}

export const SKIN_EVERY = 12;

export const THEMES: Theme[] = [
  { id: "rave", name: "Rave", play: ["#FF2BD6", "#00F0FF"], accent: "#B26BFF", floor: "#7A2BFF", bg: "floor", bpm: 112, bass: [55, 55, 43.65, 49], bassWave: "sawtooth" },
  { id: "acid", name: "Acid", play: ["#B6FF00", "#A54DFF"], accent: "#B6FF00", floor: "#6A24D9", bg: "tunnel", bpm: 124, bass: [41.2, 41.2, 49, 36.71], bassWave: "square" },
  { id: "sunset", name: "Sunset Bass", play: ["#FF7A00", "#FF2E88"], accent: "#FFB000", floor: "#FF2E88", bg: "eq", bpm: 104, bass: [49, 49, 36.71, 41.2], bassWave: "triangle" },
  { id: "laser", name: "Laser", play: ["#00F0FF", "#FFF200"], accent: "#00F0FF", floor: "#0077FF", bg: "tunnel", bpm: 128, bass: [55, 65.41, 49, 43.65], bassWave: "sawtooth" },
  { id: "deep", name: "Deep House", play: ["#00E5C0", "#FFB347"], accent: "#00E5C0", floor: "#00A08C", bg: "floor", bpm: 118, bass: [36.71, 36.71, 43.65, 41.2], bassWave: "triangle" },
  { id: "vapor", name: "Vapor", play: ["#FF71CE", "#01CDFE"], accent: "#B967FF", floor: "#B967FF", bg: "eq", bpm: 100, bass: [43.65, 49, 55, 49], bassWave: "sawtooth" },
];

export function themeById(id: string): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

/** Skin for a run that started on `startId` and has cleared `squares` blocks. */
export function skinFor(startId: string, squares: number): { theme: Theme; level: number; progress: number } {
  const start = Math.max(0, THEMES.findIndex((t) => t.id === startId));
  const level = Math.floor(squares / SKIN_EVERY);
  return { theme: THEMES[(start + level) % THEMES.length], level, progress: (squares % SKIN_EVERY) / SKIN_EVERY };
}

/** Solid shade of a hex colour (mix with black or white). Never a gradient. */
export function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c: number) => Math.round(amount < 0 ? c * (1 + amount) : c + (255 - c) * amount);
  const r = mix((n >> 16) & 255), g = mix((n >> 8) & 255), b = mix(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

export function rgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
