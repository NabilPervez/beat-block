// Neon / EDM direction (Nabil, 2026-10-23: "flat" → hypnotic club look).
// `play` = the two match colours. Themes are cosmetic: board colour ids never change.
export interface Theme {
  id: string;
  name: string;
  play: [string, string];
  accent: string;   // sweep line, UI accent
  floor: string;    // background grid colour
}

export const THEMES: Theme[] = [
  { id: "rave", name: "Rave", play: ["#FF2BD6", "#00F0FF"], accent: "#B26BFF", floor: "#7A2BFF" },
  { id: "acid", name: "Acid", play: ["#B6FF00", "#A54DFF"], accent: "#B6FF00", floor: "#5B1FC2" },
  { id: "sunset", name: "Sunset Bass", play: ["#FF7A00", "#FF2E88"], accent: "#FFB000", floor: "#FF2E88" },
  { id: "laser", name: "Laser", play: ["#00F0FF", "#FFF200"], accent: "#00F0FF", floor: "#0077FF" },
];

export function themeById(id: string): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
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
