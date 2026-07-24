import { expect, test } from "@playwright/test";

import { assembleMorningDigest } from "@/lib/cards/morning-digest";
import { buildWeeklyRecap } from "@/lib/cards/recap";

// Phase 6.5 — the coded assembly of the client weekly recap and the trainer
// morning digest (pure; no DB, no model). The numbers are computed here; a voice
// wrap only phrases them. Fixtured so the digest can't misreport who's slipping.

test("weekly recap reports the coded score, streak, and a next-week preview", () => {
  const recap = buildWeeklyRecap({
    score: 82,
    band: "locked_in",
    streak: 5,
    mealsLogged: 26,
    weighIns: 3,
    nextDayType: "training",
  });
  expect(recap.score).toBe(82);
  expect(recap.streak).toBe(5);
  expect(recap.lines.join(" ")).toContain("26"); // meals logged surfaced
  expect(recap.nextPreview).toContain("training");
  // Supportive, no shame words even on a low score.
  const low = buildWeeklyRecap({ score: 40, band: "reset", streak: 0, mealsLogged: 4, weighIns: 0, nextDayType: null });
  expect(low.headline.toLowerCase()).not.toMatch(/\b(fail|lazy|bad|shame|pathetic)\b/);
});

test("morning digest counts on-track vs slipping and surfaces the trainer's to-dos", () => {
  const digest = assembleMorningDigest({
    onTrack: 7,
    slipping: 3,
    pendingDrafts: 4,
    renewalsDue: 2,
    escalationsOvernight: 1,
  });
  expect(digest.onTrack).toBe(7);
  expect(digest.slipping).toBe(3);
  // The escalation is the most urgent line and leads.
  expect(digest.lines[0]!.toLowerCase()).toContain("escalation");
  const text = digest.lines.join(" ");
  expect(text).toContain("4"); // pending drafts
  expect(text).toContain("2"); // renewals due
});

test("a quiet night with nothing pending reads calm, not alarming", () => {
  const digest = assembleMorningDigest({ onTrack: 10, slipping: 0, pendingDrafts: 0, renewalsDue: 0, escalationsOvernight: 0 });
  expect(digest.lines.some((l) => l.toLowerCase().includes("escalation"))).toBe(false);
  expect(digest.hasUrgent).toBe(false);
});
