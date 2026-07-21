import { WORDS } from "./params";

export interface GlowConfig {
  /** Playback speed multiplier — 1 = normal, 2 = 2× faster, 0.5 = half speed */
  speedMultiplier: number;
  /** CSS font-family name for the glow text */
  fontFamily: string;
  /** Extra letter-spacing as a fraction of font size (0 = none, 0.06 = wide) */
  letterSpacingFactor: number;
  /** Per-phrase ink (letter body) colour as hex strings — length === WORDS.length */
  phraseInkColors: string[];
}

// Default ink colours match each palette's ink
export const DEFAULT_INK_COLORS: string[] = [
  "#2a0f66", // Hello,       — Ultraviolet
  "#7a1410", // World!       — Molten
  "#8a0e52", // My name      — Bubblegum
  "#0a2b8c", // is Marina    — Electric
  "#0a3d28", // and I'm not  — Jade
  "#0a3a40", // an AI ;P     — Sunburst
];

export const DEFAULT_CONFIG: GlowConfig = {
  speedMultiplier: 0.75,
  fontFamily: "JetBrains Mono",
  letterSpacingFactor: -0.06,
  phraseInkColors: DEFAULT_INK_COLORS.slice(0, WORDS.length),
};

export const FONT_OPTIONS: { label: string; value: string }[] = [
  { label: "Inter", value: "Inter" },
  { label: "Space Grotesk", value: "Space Grotesk" },
  { label: "Playfair Display", value: "Playfair Display" },
  { label: "DM Serif Display", value: "DM Serif Display" },
  { label: "JetBrains Mono", value: "JetBrains Mono" },
];
