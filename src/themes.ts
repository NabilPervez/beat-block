// PRD §5 palettes. `play` = the two match colours drawn from each palette.
// Themes are cosmetic: colour ids on the board never change, only how they're painted.
export interface Theme {
  id: string;
  name: string;
  swatches: string[];
  play: [string, string];
  accent: string;
}

export const THEMES: Theme[] = [
  { id: "neon", name: "Neon Circuit", swatches: ["#20D9F4", "#387BFF", "#C66BFF", "#FF4FA3", "#FF914D", "#FFE14A", "#3BE09A"], play: ["#20D9F4", "#FF4FA3"], accent: "#20D9F4" },
  { id: "bloom", name: "Cyber Bloom", swatches: ["#F72585", "#B517FF", "#7209B7", "#4CC9F0", "#80FF72", "#FFCA3A", "#FF595E"], play: ["#4CC9F0", "#FFCA3A"], accent: "#F72585" },
  { id: "plasma", name: "Plasma", swatches: ["#00E5FF", "#FF3CAC", "#FF6B35", "#FFE66D", "#7B61FF", "#00F5A0", "#FF477E"], play: ["#00F5A0", "#FF6B35"], accent: "#7B61FF" },
  { id: "arctic", name: "Arctic Pulse", swatches: ["#38E8FF", "#008CFF", "#5C6CFF", "#A4F4FF", "#FF5B6E", "#D2FF5B", "#C17AFF"], play: ["#A4F4FF", "#FF5B6E"], accent: "#38E8FF" },
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
