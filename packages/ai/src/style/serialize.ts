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
