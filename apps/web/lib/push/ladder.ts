// Phase 6.2 — the delivery ladder (pure; no DB, no network). Given one queued
// notification's state, decide the next delivery action. The worker applies it and
// advances the stored `stage`. Quiet hours gate the PUSH only — the in-app badge
// and the evening email digest still go out (a badge doesn't wake anyone).

import { isQuietHours, type QuietHours } from "@/lib/reminders/decide";

export type LadderStage = "queued" | "pushed" | "badged" | "digested" | "done" | "failed";
export type LadderAction = "send_push" | "badge" | "email_digest" | "hold" | "done";

// Escalate a pushed-but-unseen notification to the badge after this long.
export const BADGE_AFTER_MS = 4 * 60 * 60 * 1000;
// Below this local time the evening digest hasn't opened yet.
export const DIGEST_LOCAL_TIME = "20:00";

export interface LadderInput {
  stage: LadderStage;
  createdAt: string; // ISO — when enqueued
  sentAt: string | null; // ISO — when the push was accepted
  seenAt: string | null; // ISO — when the client caught up
  now: string; // ISO
  localTime: string; // client-local "HH:MM" (zero-padded)
  quietHours: QuietHours;
  hasLivePush: boolean; // client has ≥1 non-revoked push subscription
}

export function decideLadder(inp: LadderInput): LadderAction {
  // Caught up, or already terminal → nothing more to do.
  if (inp.seenAt) return "done";
  if (inp.stage === "done" || inp.stage === "failed" || inp.stage === "digested") return "done";

  const quiet = isQuietHours(inp.localTime, inp.quietHours);

  switch (inp.stage) {
    case "queued":
      // No way to push → straight to the in-app badge (badge is allowed even in
      // quiet hours). With push available, send it — unless quiet hours, in which
      // case hold the push for the next tick after the window opens.
      if (!inp.hasLivePush) return "badge";
      return quiet ? "hold" : "send_push";

    case "pushed": {
      // Pushed but unseen: escalate to the badge once it's aged past the window.
      const elapsed = new Date(inp.now).getTime() - new Date(inp.sentAt ?? inp.createdAt).getTime();
      return elapsed >= BADGE_AFTER_MS ? "badge" : "hold";
    }

    case "badged":
      // Still unseen come the evening → fold into the daily email digest.
      return inp.localTime >= DIGEST_LOCAL_TIME ? "email_digest" : "hold";

    default:
      return "hold";
  }
}
