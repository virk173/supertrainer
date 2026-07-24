// Phase 8.1 — platform base-fee seat band from the org's paying-client count.
// Business rule §11: pricing by client count only (≤20 / ≤50 / ≤100 / unlimited).
// is_demo clients are excluded by the CALLER (excludeDemoClients) before the
// count reaches here — this is the pure band boundary, kept coded + testable.

export type SeatBand = "20" | "50" | "100" | "unlimited";

export const SEAT_BANDS: readonly SeatBand[] = ["20", "50", "100", "unlimited"];

export function seatBandForCount(activeNonDemoClients: number): SeatBand {
  const n = Math.max(0, Math.floor(activeNonDemoClients));
  if (n <= 20) return "20";
  if (n <= 50) return "50";
  if (n <= 100) return "100";
  return "unlimited";
}

/** Human label for the band (UI + receipts). */
export function seatBandLabel(band: SeatBand): string {
  return band === "unlimited" ? "Unlimited clients" : `Up to ${band} clients`;
}
