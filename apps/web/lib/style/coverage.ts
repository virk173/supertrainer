// PO-2 — style-profile strength / coverage, computed IN CODE from what was
// actually extracted (never an LLM-emitted number). A fresh extraction fills
// every schema field, using "unknown"/[] where the material was silent; the
// share of fields that came back with real content is an honest proxy for how
// well the AI has learned this domain. Pure and dependency-free so it runs the
// same in the server (to stamp style_profiles.confidence) and the client (to
// render the meter).

export type StrengthBand = "thin" | "developing" | "strong";

export interface StyleCoverage {
  /** Share of scoreable fields with real content, 0..1. */
  score: number;
  filled: number;
  total: number;
  band: StrengthBand;
  /** Humanized labels of the empty/unknown fields — what more examples would fill. */
  weak: string[];
}

// Humanizes a camelCase / snake_case profile key into a label, e.g.
// "warmupPatterns" → "Warmup patterns". Shared with the confirmation UI.
export function humanizeField(key: string): string {
  const spaced = key.replace(/([A-Z])/g, " $1").replace(/[_-]+/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

// A field counts as "filled" when it carries real extracted content. Numbers are
// always concrete; strings count unless empty or the "unknown" sentinel; arrays
// count when they hold at least one concrete (non-"unknown") entry. A definite
// "none" (e.g. carbTiming: "none", protocols: ["none"]) is a real answer and
// counts.
function isFilled(value: unknown): boolean {
  if (typeof value === "number" || typeof value === "boolean") return true;
  if (typeof value === "string") {
    const s = value.trim().toLowerCase();
    return s !== "" && s !== "unknown";
  }
  if (Array.isArray(value)) {
    return value.some((v) => {
      const s = String(v).trim().toLowerCase();
      return s !== "" && s !== "unknown";
    });
  }
  return value != null;
}

const STRONG_AT = 0.8;
const DEVELOPING_AT = 0.5;

export function styleCoverage(profile: Record<string, unknown>): StyleCoverage {
  const entries = Object.entries(profile);
  const total = entries.length;
  const filledEntries = entries.filter(([, v]) => isFilled(v));
  const filled = filledEntries.length;
  const weak = entries.filter(([, v]) => !isFilled(v)).map(([k]) => humanizeField(k));
  const score = total === 0 ? 0 : filled / total;
  const band: StrengthBand = score >= STRONG_AT ? "strong" : score >= DEVELOPING_AT ? "developing" : "thin";
  return { score, filled, total, band, weak };
}
