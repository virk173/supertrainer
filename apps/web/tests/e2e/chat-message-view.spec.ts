import { expect, test } from "@playwright/test";

import {
  toMessageView,
  type MessageKind,
  type MessageSender,
  type RawMessage,
} from "@/lib/chat/message-view";

// Deterministic coverage of the transparency-rule classifier (no browser, no AI).
// ORIGINAL-SPEC §8: an assistant (AI) message must ALWAYS be labeled and visually
// distinct from the human coach — the line is NEVER blurred. This is the coded
// safety invariant the merge gate can't weaken; the snapshot test in chat.spec.ts
// proves the RENDER honours it, this proves the classifier does.

const SENDERS: MessageSender[] = ["client", "coach", "system", "assistant"];
const KINDS: MessageKind[] = [
  "text", "voice", "photo", "card", "plan_delivery", "log_confirmation", "reminder", "interview",
];

function msg(sender: MessageSender, kind: MessageKind = "text", over: Partial<RawMessage> = {}): RawMessage {
  return {
    id: `m-${sender}-${kind}`,
    sender,
    kind,
    body: "hello",
    createdAt: "2026-07-23T12:00:00Z",
    ...over,
  };
}

test("assistant messages are ALWAYS AI-labeled and never wear the coach avatar", () => {
  for (const kind of KINDS) {
    for (const viewer of ["client", "coach"] as const) {
      const v = toMessageView(msg("assistant", kind), viewer);
      expect(v.voice).toBe("assistant");
      expect(v.isAi).toBe(true);
      expect(v.automated).toBe(true);
      expect(v.label).toBe("AI assistant");
      expect(v.showCoachAvatar).toBe(false);
    }
  }
});

test("coach messages carry the trainer avatar and no automated/AI label", () => {
  for (const viewer of ["client", "coach"] as const) {
    const v = toMessageView(msg("coach"), viewer);
    expect(v.voice).toBe("coach");
    expect(v.isAi).toBe(false);
    expect(v.automated).toBe(false);
    expect(v.label).toBeNull();
    expect(v.showCoachAvatar).toBe(true);
  }
});

test("system messages are labeled automated but not AI, and never the coach", () => {
  const v = toMessageView(msg("system", "reminder"), "client");
  expect(v.voice).toBe("system");
  expect(v.isAi).toBe(false);
  expect(v.automated).toBe(true);
  expect(v.label).toBe("Automated");
  expect(v.showCoachAvatar).toBe(false);
});

test("client messages are the plain client voice", () => {
  const v = toMessageView(msg("client"), "coach");
  expect(v.voice).toBe("client");
  expect(v.isAi).toBe(false);
  expect(v.automated).toBe(false);
  expect(v.label).toBeNull();
  expect(v.showCoachAvatar).toBe(false);
});

test("alignment is from the viewer's own perspective", () => {
  // Client viewer: their own line is 'mine', everyone else 'theirs'.
  expect(toMessageView(msg("client"), "client").align).toBe("mine");
  expect(toMessageView(msg("coach"), "client").align).toBe("theirs");
  expect(toMessageView(msg("assistant"), "client").align).toBe("theirs");
  expect(toMessageView(msg("system"), "client").align).toBe("theirs");
  // Coach viewer: the coach line is 'mine', the client's is 'theirs'.
  expect(toMessageView(msg("coach"), "coach").align).toBe("mine");
  expect(toMessageView(msg("client"), "coach").align).toBe("theirs");
  expect(toMessageView(msg("assistant"), "coach").align).toBe("theirs");
});

test("structured kinds render as cards, chat kinds as bubbles", () => {
  for (const kind of ["card", "plan_delivery", "log_confirmation"] as const) {
    expect(toMessageView(msg("system", kind), "client").isStructured).toBe(true);
  }
  for (const kind of ["text", "voice", "photo", "reminder", "interview"] as const) {
    expect(toMessageView(msg("client", kind), "client").isStructured).toBe(false);
  }
});

test("SAFETY invariant across every sender × kind: AI/coach lines never collapse", () => {
  for (const sender of SENDERS) {
    for (const kind of KINDS) {
      for (const viewer of ["client", "coach"] as const) {
        const v = toMessageView(msg(sender, kind), viewer);
        // The coach avatar is shown for coach messages and ONLY coach messages.
        expect(v.showCoachAvatar).toBe(sender === "coach");
        // Anything the coach avatar is shown for must be a live human (never automated).
        if (v.showCoachAvatar) expect(v.automated).toBe(false);
        // An AI message is always automated and labeled; it can never be the coach.
        if (v.isAi) {
          expect(v.automated).toBe(true);
          expect(v.label).toBe("AI assistant");
          expect(v.showCoachAvatar).toBe(false);
        }
      }
    }
  }
});
