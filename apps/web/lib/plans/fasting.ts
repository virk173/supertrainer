// Fasting counter state machine (Phase 4.5, IF clients). Pure: given the eating
// window and the client-local time (minutes since midnight), report whether
// they're fasting or eating and how long until the next transition. The portal
// widget renders this; window open/close can drive a push (P6).

export interface FastWindow {
  start: string; // "HH:MM"
  end: string; // "HH:MM"
}

export type FastState = "fasting" | "eating";

export interface FastStatus {
  state: FastState;
  /** Minutes until the state flips (to close if eating, to next open if fasting). */
  minutesUntilChange: number;
  /** Minutes-since-midnight of the next transition (may be ≥1440 = tomorrow). */
  nextChangeMinutes: number;
}

const toMinutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

const DAY = 24 * 60;

export function fastingState(window: FastWindow, nowMinutes: number): FastStatus {
  const start = toMinutes(window.start);
  const end = toMinutes(window.end);
  const now = ((nowMinutes % DAY) + DAY) % DAY;

  // Handle a window that crosses midnight (end < start, e.g. 20:00–04:00) as well
  // as the common same-day window.
  const inWindow = start <= end ? now >= start && now < end : now >= start || now < end;

  if (inWindow) {
    const untilClose = now < end ? end - now : DAY - now + end;
    return { state: "eating", minutesUntilChange: untilClose, nextChangeMinutes: now + untilClose };
  }
  const untilOpen = now < start ? start - now : DAY - now + start;
  return { state: "fasting", minutesUntilChange: untilOpen, nextChangeMinutes: now + untilOpen };
}
