"use client";

import * as React from "react";

import { cn } from "@supertrainer/ui/lib/utils";

// Phase 9.5 — the hero, and the one interactive thing on the site.
//
// The wedge is capacity: a coach's income is bounded by how many people they can
// personally answer. So instead of asserting that, the page hands over the math
// and lets a coach put THEIR numbers in. Every input is theirs, including the
// share of message time a drafting layer takes off — we don't get to assert a
// benchmark about their business, and a slider they control is more persuasive
// than a number we made up.

function hoursLabel(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  return `${hours.toFixed(1)} h`;
}

export function CapacityCalculator() {
  const [clients, setClients] = React.useState(35);
  const [minutesEach, setMinutesEach] = React.useState(25);
  const [drafted, setDrafted] = React.useState(60);

  const weeklyHours = (clients * minutesEach) / 60;
  const returnedHours = (weeklyHours * drafted) / 100;
  // The honest inversion: the same MESSAGE hours, spread over more people. It is
  // deliberately phrased as a statement about message time rather than a promise
  // about capacity — messages are not the only thing that caps a book, and a
  // marketing page that implies otherwise is lying with arithmetic.
  const capacityAfter =
    minutesEach === 0 || drafted >= 100
      ? clients
      : Math.floor((weeklyHours * 60) / (minutesEach * (1 - drafted / 100)));

  return (
    <section
      className="rounded-md border bg-surface-raised p-6 sm:p-8"
      aria-labelledby="capacity-heading"
      data-testid="capacity-calculator"
    >
      <h2 id="capacity-heading" className="font-display text-lg font-semibold tracking-tight">
        The math of one more client
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Your numbers, not ours. Drag them.
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_auto]">
        <div className="space-y-5">
          <Slider
            id="clients"
            label="Clients you coach"
            value={clients}
            min={5}
            max={120}
            step={1}
            display={String(clients)}
            onChange={setClients}
          />
          <Slider
            id="minutes"
            label="Minutes a week, per client, on messages and check-ins"
            value={minutesEach}
            min={5}
            max={90}
            step={5}
            display={`${minutesEach} min`}
            onChange={setMinutesEach}
          />
          <Slider
            id="drafted"
            label="Share of that you'd be happy to approve rather than write"
            value={drafted}
            min={0}
            max={90}
            step={5}
            display={`${drafted}%`}
            onChange={setDrafted}
          />
        </div>

        <div className="flex flex-col justify-center gap-4 rounded-md border bg-surface p-5 lg:w-64">
          <div>
            <p className="metric-label">On messages now</p>
            <p className="metric mt-1 text-2xl">{hoursLabel(weeklyHours)}</p>
            <p className="text-xs text-muted-foreground">every week</p>
          </div>
          <div className="border-t pt-4">
            <p className="metric-label">Hours back</p>
            <p className={cn("metric mt-1 text-2xl", returnedHours > 0 && "text-success")}>
              {hoursLabel(returnedHours)}
            </p>
            <p className="text-xs text-muted-foreground">
              {returnedHours > 0
                ? `the same message hours would cover ${capacityAfter} clients`
                : "the same book, earlier evenings"}
            </p>
          </div>
        </div>
      </div>

      <p className="mt-5 border-t pt-4 text-xs leading-relaxed text-muted-foreground">
        Messages aren&rsquo;t the only thing that caps a book — this counts message time and
        nothing else. Nothing is sent for you either: every draft waits for your approval, and
        the ones you rewrite teach it what you&rsquo;d have said instead.
      </p>
    </section>
  );
}

function Slider({
  id,
  label,
  value,
  min,
  max,
  step,
  display,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        <span className="metric text-sm tabular-nums">{display}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-2 w-full cursor-pointer appearance-none rounded-md bg-muted accent-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      />
    </div>
  );
}
