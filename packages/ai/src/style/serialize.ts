import type { StyleDomain } from "./schemas";

export const STYLE_DOMAINS: readonly StyleDomain[] = [
  "diet",
  "training",
  "voice",
] as const;

// Deterministic, prompt-cache-friendly serialization of a confirmed style
// profile for injection into downstream prompts (P4/P5/P6). Keys are sorted so
// the same profile always renders byte-identically — a stable cache prefix.
// The variable per-request content must live AFTER this block, never inside it.
export function serializeStyleProfile(
  domain: StyleDomain,
  profile: Record<string, unknown>,
): string {
  const stable = stableStringify(profile);
  return `<style_profile domain="${domain}">\n${stable}\n</style_profile>`;
}

export interface ConfirmedStyleRow {
  domain: string;
  profile: unknown;
}

// Plain-text serialization of an org's confirmed style profiles for injection
// into the interview and preview agent prompts (SF-4 dedup — was hand-rolled
// identically in apps/web/lib/interview/engine.ts `styleFor()` and
// apps/web/lib/preview/generate.ts `getOrCreatePreview()`).
//
// Deliberately NOT serializeStyleProfile's `<style_profile>`/sorted-key format:
// that format is byte-different (tags, per-domain block, canonicalized key
// order) and swapping it in here would change the exact prompt text sent to
// interviewTurn/generatePreviewDraft — a live AI-behavior change, not a pure
// refactor. This preserves the original `${domain} style: ${json}` wire format
// so both call sites can share one implementation with zero behavior change.
export function serializeConfirmedStyles(
  rows: ConfirmedStyleRow[] | null | undefined,
): string {
  return (rows ?? [])
    .map((s) => `${s.domain} style: ${JSON.stringify(s.profile)}`)
    .join("\n");
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.keys(value as Record<string, unknown>)
      .sort()
      .map(
        (k) =>
          `${JSON.stringify(k)}:${stableStringify(
            (value as Record<string, unknown>)[k],
          )}`,
      );
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}
