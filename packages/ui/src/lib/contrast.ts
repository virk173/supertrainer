// WCAG contrast helpers. Used by the brand step to warn when a trainer's
// primary color can't legibly carry text, and to pick a readable on-color for
// buttons/badges rendered in that color.

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

// Parses #rgb / #rrggbb (with or without leading #). Returns null on anything
// else so callers can treat bad input as "no color yet".
export function parseHex(hex: string): Rgb | null {
  const clean = hex.trim().replace(/^#/, "");
  const expanded =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  if (!/^[0-9a-fA-F]{6}$/.test(expanded)) return null;
  return {
    r: parseInt(expanded.slice(0, 2), 16),
    g: parseInt(expanded.slice(2, 4), 16),
    b: parseInt(expanded.slice(4, 6), 16),
  };
}

// Relative luminance per WCAG 2.1.
export function relativeLuminance({ r, g, b }: Rgb): number {
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

// Contrast ratio (1–21) between two colors.
export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

const WHITE: Rgb = { r: 255, g: 255, b: 255 };
// Near-black — matches the design system's darkest ink rather than pure #000.
const NEAR_BLACK: Rgb = { r: 23, g: 23, b: 23 };

// AA for normal text is 4.5:1. Returns the best readable text color for a
// background and whether it clears AA.
export function readableTextOn(bg: Rgb): {
  onColor: "#ffffff" | "#171717";
  ratio: number;
  passesAA: boolean;
} {
  const whiteRatio = contrastRatio(bg, WHITE);
  const blackRatio = contrastRatio(bg, NEAR_BLACK);
  const useWhite = whiteRatio >= blackRatio;
  const ratio = useWhite ? whiteRatio : blackRatio;
  return {
    onColor: useWhite ? "#ffffff" : "#171717",
    ratio,
    passesAA: ratio >= 4.5,
  };
}

// Convenience for the brand form: given a primary color hex, does SOME text
// color (white or near-black) render legibly on it? Warn when not.
export function primaryColorPassesAA(hex: string): boolean {
  const rgb = parseHex(hex);
  if (!rgb) return false;
  return readableTextOn(rgb).passesAA;
}
