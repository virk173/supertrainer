// Phase 9.6 — a best-effort limiter for public routes that touch the database
// before anyone is authenticated.
//
// Honest about what it is: an in-memory sliding window, per serverless instance.
// It will not stop a distributed attack, and it is not the primary control for
// anything — the primary controls are the ones that can't be evaded (an invite
// token is 192 bits of entropy; a webhook is signature-verified). This exists so
// a single source cannot cheaply turn one public URL into a database amplifier,
// and so an enumeration attempt shows up as 429s rather than as load.
//
// Deliberately dependency-free: adding Redis to the request path of a page that
// mostly redirects would cost more availability than it buys.

interface Window {
  hits: number[];
}

const windows = new Map<string, Window>();
const MAX_KEYS = 10_000;

export interface LimitDecision {
  ok: boolean;
  retryAfterSeconds: number;
}

export function publicRateLimit(
  key: string,
  { limit, windowSeconds }: { limit: number; windowSeconds: number },
  now = Date.now(),
): LimitDecision {
  const cutoff = now - windowSeconds * 1000;
  const entry = windows.get(key) ?? { hits: [] };
  entry.hits = entry.hits.filter((t) => t > cutoff);

  if (entry.hits.length >= limit) {
    const oldest = entry.hits[0];
    windows.set(key, entry);
    return {
      ok: false,
      retryAfterSeconds: Math.max(1, Math.ceil((oldest + windowSeconds * 1000 - now) / 1000)),
    };
  }

  entry.hits.push(now);
  // Bounded memory: a flood of unique keys must not grow the map without limit.
  if (!windows.has(key) && windows.size >= MAX_KEYS) {
    const oldestKey = windows.keys().next().value;
    if (oldestKey) windows.delete(oldestKey);
  }
  windows.set(key, entry);
  return { ok: true, retryAfterSeconds: 0 };
}

/** Drop all state — tests only. */
export function resetPublicRateLimit(): void {
  windows.clear();
}
