"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";

import { Button } from "@supertrainer/ui/components/button";
import { Input } from "@supertrainer/ui/components/input";
import { Label } from "@supertrainer/ui/components/label";
import { TierCard } from "@supertrainer/ui/components/tier-card";
import { cn } from "@supertrainer/ui/lib/utils";

import { saveTiers } from "@/app/onboarding/tiers/actions";
import {
  AI_FLOOR,
  CHECKIN_FREQUENCIES,
  CHECKIN_LABELS,
  MAX_TIERS,
  MIN_TIERS,
  formatPrice,
  tierHighlightLines,
  validateTiers,
  type CheckinFrequency,
  type TierInput,
} from "@/lib/tiers/schema";

function blankTier(currency: string): TierInput {
  return {
    name: "New tier",
    price_cents: 0,
    currency,
    features: {
      checkin_frequency: "none",
      video_calls_per_month: 0,
      response_priority: false,
      custom_lines: [],
    },
  };
}

export function TierBuilder({ initialTiers }: { initialTiers: TierInput[] }) {
  const [tiers, setTiers] = React.useState<TierInput[]>(initialTiers);
  const [pending, setPending] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);

  const currency = tiers[0]?.currency ?? "usd";
  const errors = validateTiers(tiers);
  const featuredIndex = tiers.reduce(
    (best, t, i) => (t.price_cents > (tiers[best]?.price_cents ?? -1) ? i : best),
    0,
  );

  function update(index: number, patch: Partial<TierInput>) {
    setTiers((prev) => prev.map((t, i) => (i === index ? { ...t, ...patch } : t)));
    setSaved(false);
  }
  function updateFeature(index: number, patch: Partial<TierInput["features"]>) {
    setTiers((prev) =>
      prev.map((t, i) =>
        i === index ? { ...t, features: { ...t.features, ...patch } } : t,
      ),
    );
    setSaved(false);
  }
  function move(index: number, dir: -1 | 1) {
    const j = index + dir;
    if (j < 0 || j >= tiers.length) return;
    setTiers((prev) => {
      const next = [...prev];
      [next[index], next[j]] = [next[j], next[index]];
      return next;
    });
    setSaved(false);
  }
  function remove(index: number) {
    setTiers((prev) => prev.filter((_, i) => i !== index));
    setSaved(false);
  }
  function add() {
    if (tiers.length >= MAX_TIERS) return;
    setTiers((prev) => [...prev, blankTier(currency)]);
    setSaved(false);
  }

  async function save() {
    setPending(true);
    setMessage(null);
    const result = await saveTiers(tiers);
    setPending(false);
    if (!result.ok) {
      setMessage(result.message ?? result.errors?.[0]?.message ?? "Couldn't save.");
      return;
    }
    setSaved(true);
  }

  return (
    <div className="space-y-8">
      <div className="space-y-4" data-testid="tier-editors">
        {tiers.map((tier, index) => (
          <div
            key={tier.id ?? `new-${index}`}
            data-testid={`tier-editor-${index}`}
            className="rounded-lg border bg-card p-4"
          >
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex-1 space-y-1">
                <Label htmlFor={`name-${index}`} className="text-xs text-muted-foreground">
                  Name
                </Label>
                <Input
                  id={`name-${index}`}
                  value={tier.name}
                  onChange={(e) => update(index, { name: e.target.value })}
                  data-testid={`tier-name-${index}`}
                />
              </div>
              <div className="w-32 space-y-1">
                <Label htmlFor={`price-${index}`} className="text-xs text-muted-foreground">
                  Price ({currency.toUpperCase()}/mo)
                </Label>
                <Input
                  id={`price-${index}`}
                  type="number"
                  min={0}
                  value={tier.price_cents / 100}
                  onChange={(e) =>
                    update(index, {
                      price_cents: Math.round(Number(e.target.value) * 100),
                    })
                  }
                  data-testid={`tier-price-${index}`}
                />
              </div>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Move up"
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                  data-testid={`tier-up-${index}`}
                >
                  <ChevronUp className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Move down"
                  disabled={index === tiers.length - 1}
                  onClick={() => move(index, 1)}
                  data-testid={`tier-down-${index}`}
                >
                  <ChevronDown className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Remove tier"
                  disabled={tiers.length <= MIN_TIERS}
                  onClick={() => remove(index)}
                  data-testid={`tier-remove-${index}`}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor={`checkin-${index}`} className="text-xs text-muted-foreground">
                  Personal check-ins
                </Label>
                <select
                  id={`checkin-${index}`}
                  value={tier.features.checkin_frequency}
                  onChange={(e) =>
                    updateFeature(index, {
                      checkin_frequency: e.target.value as CheckinFrequency,
                    })
                  }
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  data-testid={`tier-checkin-${index}`}
                >
                  {CHECKIN_FREQUENCIES.map((f) => (
                    <option key={f} value={f}>
                      {CHECKIN_LABELS[f]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor={`video-${index}`} className="text-xs text-muted-foreground">
                  Video calls / month
                </Label>
                <Input
                  id={`video-${index}`}
                  type="number"
                  min={0}
                  value={tier.features.video_calls_per_month}
                  onChange={(e) =>
                    updateFeature(index, {
                      video_calls_per_month: Math.max(0, Number(e.target.value)),
                    })
                  }
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={tier.features.response_priority}
                  onChange={(e) =>
                    updateFeature(index, { response_priority: e.target.checked })
                  }
                  className="size-4 rounded border-input"
                />
                Priority response access
              </label>
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor={`custom-${index}`} className="text-xs text-muted-foreground">
                  Extra lines (comma-separated)
                </Label>
                <Input
                  id={`custom-${index}`}
                  value={tier.features.custom_lines.join(", ")}
                  onChange={(e) =>
                    updateFeature(index, {
                      custom_lines: e.target.value
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean),
                    })
                  }
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={add}
          disabled={tiers.length >= MAX_TIERS}
          data-testid="tier-add"
        >
          <Plus className="size-4" /> Add tier
        </Button>
        <span className="text-xs text-muted-foreground">
          {tiers.length}/{MAX_TIERS} tiers
        </span>
      </div>

      {/* Client-facing preview (the exact card reused in teaser + checkout) */}
      <div className="space-y-3">
        <p className="metric-label">Client-facing preview</p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="tier-preview">
          {tiers.map((tier, index) => (
            <TierCard
              key={tier.id ?? `preview-${index}`}
              name={tier.name || "Untitled"}
              price={formatPrice(tier.price_cents, tier.currency)}
              highlightLines={tierHighlightLines(tier.features)}
              aiFloor={AI_FLOOR}
              featured={index === featuredIndex && tiers.length > 1}
            />
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button
          type="button"
          onClick={save}
          disabled={pending || errors.length > 0}
          data-testid="save-tiers"
        >
          {pending && <Loader2 className="size-4 animate-spin" />}
          Save tiers
        </Button>
        {saved && (
          <span className="flex items-center gap-1.5 text-sm text-success" data-testid="tiers-saved">
            <Check className="size-4" /> Saved
          </span>
        )}
        {errors.length > 0 && (
          <span className="text-sm text-danger" data-testid="tier-error">
            {errors[0].message}
          </span>
        )}
        {message && <span className="text-sm text-danger">{message}</span>}
      </div>

      {saved && (
        <div className="rounded-lg border bg-surface p-4 text-sm">
          Tiers saved.{" "}
          <Link href="/onboarding" className="font-medium text-primary hover:underline">
            Back to checklist <ArrowRight className="inline size-3.5" />
          </Link>
        </div>
      )}
    </div>
  );
}
