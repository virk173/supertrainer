"use client";

import { useState } from "react";
import { Check, Dumbbell, Footprints, Moon, Scale } from "lucide-react";

import { checkinAction, logWearableAction, logWeighInAction } from "@/app/(app)/portal/actions";
import { fromKg } from "@/lib/ledger/checkin";
import { registerHandler, runOrQueue } from "@/lib/offline/queue";

// Offline replay handlers (registered once when this module loads client-side).
registerHandler("weighIn", (p) => logWeighInAction(p as Parameters<typeof logWeighInAction>[0]));
registerHandler("checkin", (p) => checkinAction(p as Parameters<typeof checkinAction>[0]));
registerHandler("wearable", (p) => logWearableAction(p as Parameters<typeof logWearableAction>[0]));

export interface DailyState {
  weightKg: number | null;
  checkin: "trained" | "rest" | "missed" | null;
  steps: number | null;
  sleepMin: number | null;
}

const cardCls = "rounded-lg border bg-surface-raised p-3";

export function DailyLog({ initial, unit = "kg" }: { initial: DailyState; unit?: "kg" | "lb" }) {
  const [weight, setWeight] = useState(initial.weightKg !== null ? String(fromKg(initial.weightKg, unit)) : "");
  const [weightSaved, setWeightSaved] = useState(initial.weightKg !== null);
  const [checkin, setCheckin] = useState(initial.checkin);
  const [steps, setSteps] = useState(initial.steps !== null ? String(initial.steps) : "");
  const [sleepH, setSleepH] = useState(initial.sleepMin !== null ? String(Math.round((initial.sleepMin / 60) * 10) / 10) : "");
  const [wearableSaved, setWearableSaved] = useState(initial.steps !== null || initial.sleepMin !== null);
  const [busy, setBusy] = useState(false);

  async function saveWeight() {
    const value = Number(weight);
    if (!Number.isFinite(value) || value <= 0 || busy) return;
    setBusy(true);
    try {
      await runOrQueue("weighIn", { value, unit });
      setWeightSaved(true);
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(status: "trained" | "rest") {
    if (busy) return;
    setBusy(true);
    setCheckin(status);
    try {
      await runOrQueue("checkin", { status });
    } finally {
      setBusy(false);
    }
  }

  async function saveWearable() {
    if (busy) return;
    const s = steps ? Math.round(Number(steps)) : null;
    const sleepMin = sleepH ? Math.round(Number(sleepH) * 60) : null;
    if (s === null && sleepMin === null) return;
    setBusy(true);
    try {
      await runOrQueue("wearable", { steps: s, sleepMin });
      setWearableSaved(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2" data-testid="daily-log">
      {/* Weigh-in */}
      <div className={cardCls}>
        <div className="mb-2 flex items-center gap-2 text-sm font-medium">
          <Scale className="size-4" /> Weigh-in
          {weightSaved && <Check className="size-4 text-[var(--color-success)]" data-testid="weigh-saved" />}
        </div>
        <div className="flex items-center gap-2">
          <input
            data-testid="weigh-input"
            aria-label={`Weight in ${unit}`}
            inputMode="decimal"
            value={weight}
            onChange={(e) => {
              setWeight(e.target.value);
              setWeightSaved(false);
            }}
            placeholder={`Weight (${unit})`}
            className="w-32 rounded-lg border bg-surface p-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            type="button"
            data-testid="weigh-save"
            onClick={saveWeight}
            disabled={busy || !weight}
            className="rounded-lg bg-foreground px-3 py-2 text-sm font-medium text-background disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </div>

      {/* Gym check-in */}
      <div className={cardCls}>
        <div className="mb-2 flex items-center gap-2 text-sm font-medium">
          <Dumbbell className="size-4" /> Today at the gym
        </div>
        <div className="flex gap-2">
          {(["trained", "rest"] as const).map((s) => (
            <button
              key={s}
              type="button"
              data-testid={`checkin-${s}`}
              onClick={() => setStatus(s)}
              aria-pressed={checkin === s}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm capitalize ${
                checkin === s ? "bg-foreground text-background" : "bg-surface text-foreground hover:bg-surface-raised"
              }`}
            >
              {s === "trained" ? "Trained" : "Rest day"}
            </button>
          ))}
        </div>
      </div>

      {/* Steps + sleep */}
      <div className={cardCls}>
        <div className="mb-2 flex items-center gap-2 text-sm font-medium">
          <Footprints className="size-4" /> Steps &amp; sleep
          {wearableSaved && <Check className="size-4 text-[var(--color-success)]" data-testid="wearable-saved" />}
        </div>
        <div className="flex items-center gap-2">
          <input
            data-testid="steps-input"
            aria-label="Steps today"
            inputMode="numeric"
            value={steps}
            onChange={(e) => {
              setSteps(e.target.value);
              setWearableSaved(false);
            }}
            placeholder="Steps"
            className="w-24 rounded-lg border bg-surface p-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
          />
          <span className="flex items-center gap-1">
            <Moon className="size-4 text-muted-foreground" />
            <input
              data-testid="sleep-input"
              aria-label="Hours of sleep"
              inputMode="decimal"
              value={sleepH}
              onChange={(e) => {
                setSleepH(e.target.value);
                setWearableSaved(false);
              }}
              placeholder="Sleep h"
              className="w-20 rounded-lg border bg-surface p-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
            />
          </span>
          <button
            type="button"
            data-testid="wearable-save"
            onClick={saveWearable}
            disabled={busy || (!steps && !sleepH)}
            className="rounded-lg bg-foreground px-3 py-2 text-sm font-medium text-background disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
