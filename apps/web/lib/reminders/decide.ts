// Phase 3.6 — the reminder decision engine (pure). Given a client's due reminder
// candidates and their state, decide what to send NOW, applying: the vacation/
// paused kill switch, already-logged suppression, quiet-hours deferral, and the
// 3/day cap by priority. Delivery itself is Phase 6; this decides + the tick
// enqueues. Pure so the caps/quiet-hours can be exhaustively fixtured — a bug
// here spams a real person.

export type ReminderKind = "meal" | "weigh_in" | "checkin" | "custom";

// Highest priority first — meals matter most, custom least.
export const REMINDER_PRIORITY: ReminderKind[] = ["meal", "weigh_in", "checkin", "custom"];

export interface QuietHours {
  start: string; // "HH:MM" local
  end: string; // "HH:MM" local
}

export interface ReminderCandidate {
  kind: ReminderKind;
  scheduledLocalTime: string; // "HH:MM"
}

export interface DecideInputs {
  now: { localTime: string }; // client-local "HH:MM"
  candidates: ReminderCandidate[];
  quietHours: QuietHours;
  enabled: boolean; // client/org kill switch (false = vacation mode)
  paused: boolean; // client status paused
  satisfied: Record<ReminderKind, boolean>; // expectation already logged today
  sentToday: number; // nudges already sent today
  cap: number; // max nudges/day (default 3)
}

export interface DecideResult {
  send: ReminderKind[];
  deferred: ReminderKind[]; // held for later (quiet hours) — retried next tick
  suppressed: ReminderKind[]; // dropped today (satisfied, over cap, or off)
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

// Is the local time inside the quiet window? Handles a window that wraps
// midnight (21:30 → 07:30): start inclusive, end exclusive.
export function isQuietHours(localTime: string, q: QuietHours): boolean {
  const t = toMinutes(localTime);
  const s = toMinutes(q.start);
  const e = toMinutes(q.end);
  if (s === e) return false;
  if (s < e) return t >= s && t < e;
  return t >= s || t < e;
}

export function decideReminders(inp: DecideInputs): DecideResult {
  // Kill switch / paused: nothing goes out.
  if (!inp.enabled || inp.paused) {
    return { send: [], deferred: [], suppressed: inp.candidates.map((c) => c.kind) };
  }

  const ordered = [...inp.candidates].sort(
    (a, b) => REMINDER_PRIORITY.indexOf(a.kind) - REMINDER_PRIORITY.indexOf(b.kind),
  );

  const suppressed: ReminderKind[] = [];
  const unsatisfied: ReminderKind[] = [];
  for (const c of ordered) {
    if (inp.satisfied[c.kind]) suppressed.push(c.kind); // never remind an already-logged expectation
    else unsatisfied.push(c.kind);
  }

  // Quiet hours: defer the rest to the morning tick.
  if (isQuietHours(inp.now.localTime, inp.quietHours)) {
    return { send: [], deferred: unsatisfied, suppressed };
  }

  // Cap: fill remaining slots by priority; the rest wait for tomorrow.
  const send: ReminderKind[] = [];
  let slots = Math.max(0, inp.cap - inp.sentToday);
  for (const k of unsatisfied) {
    if (slots > 0) {
      send.push(k);
      slots--;
    } else {
      suppressed.push(k);
    }
  }
  return { send, deferred: [], suppressed };
}
