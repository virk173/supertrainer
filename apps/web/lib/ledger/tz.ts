// Phase 3 — shared client-timezone helpers, GUARDED. One home for "the client's
// local date / local time" so day-close, scoring, and the reminder tick can't
// drift (they each used to re-implement this, and two copies dropped the guard —
// a single bad profiles.timezone then threw RangeError and aborted the whole
// reminder tick). An invalid IANA zone falls back to UTC rather than throwing.

export function tzDate(timezone: string, at: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(at);
  } catch {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "UTC" }).format(at);
  }
}

// Client-local "HH:MM" (24h, zero-padded).
export function tzTime(timezone: string, at: Date): string {
  const opts = { hour: "2-digit", minute: "2-digit", hour12: false } as const;
  try {
    return new Intl.DateTimeFormat("en-GB", { timeZone: timezone, ...opts }).format(at);
  } catch {
    return new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", ...opts }).format(at);
  }
}
