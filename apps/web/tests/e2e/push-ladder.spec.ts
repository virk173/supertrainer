import { expect, test } from "@playwright/test";

import { decideLadder, type LadderInput } from "@/lib/push/ladder";

// Deterministic coverage of the delivery ladder (pure; no DB, no network). The
// ladder decides how a queued notification climbs: push → (4h unread) badge →
// (still unread by 20:00 local) email digest — with quiet hours gating the PUSH
// but never the badge. A bug here either spams a real person or silently drops
// their coach's message, so it is fixtured exhaustively.

const QUIET = { start: "21:30", end: "07:30" };

function inp(over: Partial<LadderInput>): LadderInput {
  return {
    stage: "queued",
    createdAt: "2026-07-23T10:00:00Z",
    sentAt: null,
    seenAt: null,
    now: "2026-07-23T10:00:00Z",
    localTime: "10:00",
    quietHours: QUIET,
    hasLivePush: true,
    ...over,
  };
}

test("a fresh notification with live push, outside quiet hours, sends a push", () => {
  expect(decideLadder(inp({}))).toBe("send_push");
});

test("quiet hours holds the push (push no) but a no-push client still badges (badge yes)", () => {
  // Has push + quiet hours → hold the push.
  expect(decideLadder(inp({ localTime: "23:00" }))).toBe("hold");
  expect(decideLadder(inp({ localTime: "06:00" }))).toBe("hold");
  // No live push at all → skip straight to the in-app badge, even during quiet hours.
  expect(decideLadder(inp({ hasLivePush: false, localTime: "23:00" }))).toBe("badge");
  expect(decideLadder(inp({ hasLivePush: false, localTime: "10:00" }))).toBe("badge");
});

test("a pushed-but-unseen notification badges only after 4h", () => {
  const sentAt = "2026-07-23T10:00:00Z";
  // 3h59m later → still holding.
  expect(
    decideLadder(inp({ stage: "pushed", sentAt, now: "2026-07-23T13:59:00Z", localTime: "13:59" })),
  ).toBe("hold");
  // 4h01m later → escalate to the badge (allowed even in quiet hours).
  expect(
    decideLadder(inp({ stage: "pushed", sentAt, now: "2026-07-23T14:01:00Z", localTime: "14:01" })),
  ).toBe("badge");
  expect(
    decideLadder(inp({ stage: "pushed", sentAt, now: "2026-07-23T23:30:00Z", localTime: "23:30" })),
  ).toBe("badge");
});

test("a badged-but-unseen notification joins the email digest at 20:00 local", () => {
  expect(decideLadder(inp({ stage: "badged", localTime: "19:59" }))).toBe("hold");
  expect(decideLadder(inp({ stage: "badged", localTime: "20:00" }))).toBe("email_digest");
  expect(decideLadder(inp({ stage: "badged", localTime: "21:15" }))).toBe("email_digest");
});

test("seen at any stage is done — the ladder never chases a caught-up client", () => {
  const seenAt = "2026-07-23T12:00:00Z";
  for (const stage of ["queued", "pushed", "badged"] as const) {
    expect(decideLadder(inp({ stage, seenAt }))).toBe("done");
  }
});

test("terminal stages report done and never re-fire", () => {
  expect(decideLadder(inp({ stage: "digested", localTime: "22:00" }))).toBe("done");
  expect(decideLadder(inp({ stage: "done" }))).toBe("done");
  expect(decideLadder(inp({ stage: "failed" }))).toBe("done");
});
