"use client";

import { useState } from "react";
import { Bell, BellOff } from "lucide-react";

import { setReminderVacationAction } from "@/app/(app)/portal/actions";

// Phase 3.6 — client-facing kill switch (vacation mode). Pausing flips all the
// client's reminder_rules.enabled off; the tick then sends nothing.
export function ReminderVacationToggle({ initialPaused }: { initialPaused: boolean }) {
  const [paused, setPaused] = useState(initialPaused);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    if (busy) return;
    setBusy(true);
    const next = !paused;
    setPaused(next);
    try {
      await setReminderVacationAction(next);
    } catch {
      setPaused(!next); // revert on failure
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      data-testid="vacation-toggle"
      aria-pressed={paused}
      onClick={toggle}
      disabled={busy}
      className="flex items-center gap-2 text-sm text-muted-foreground disabled:opacity-50"
    >
      {paused ? <BellOff className="size-4" /> : <Bell className="size-4" />}
      {paused ? "Reminders paused — tap to resume" : "Pause reminders (vacation)"}
    </button>
  );
}
