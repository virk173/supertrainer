"use client";

import * as React from "react";

import { Button } from "@supertrainer/ui/components/button";
import { Input } from "@supertrainer/ui/components/input";

import { submitLead } from "@/app/c/[slug]/start/actions";
import { COMMON_ALLERGENS, normalizeAllergen } from "@/lib/onboarding/allergens";
import { STAGE_A_STEPS, type StageAStep } from "@/lib/onboarding/stage-a";
import { TurnstileWidget } from "@/components/turnstile-widget";

interface Draft {
  name: string;
  email: string;
  phone: string;
  age: string;
  sex: string;
  heightCm: string;
  weightKg: string;
  goal: string;
  activity: string;
  trainingDaysPerWeek: string;
  experience: string;
  diet: string;
  allergens: string[];
  allergiesNone: boolean;
}

const EMPTY: Draft = {
  name: "",
  email: "",
  phone: "",
  age: "",
  sex: "",
  heightCm: "",
  weightKg: "",
  goal: "",
  activity: "",
  trainingDaysPerWeek: "",
  experience: "",
  diet: "",
  allergens: [],
  allergiesNone: false,
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Per-step validation. Mirrors StageASubmissionSchema so the flow can't advance
// past a bad answer; the server re-validates the whole payload regardless.
function stepError(step: StageAStep, d: Draft): string | null {
  switch (step.key) {
    case "name":
      return d.name.trim() ? null : "Enter your name";
    case "email":
      return EMAIL_RE.test(d.email.trim()) ? null : "Enter a valid email";
    case "phone":
      return null; // optional
    case "age": {
      const n = Number(d.age);
      return Number.isInteger(n) && n >= 13 && n <= 100 ? null : "Enter an age (13–100)";
    }
    case "heightCm": {
      const n = Number(d.heightCm);
      return n >= 90 && n <= 260 ? null : "Enter your height in cm";
    }
    case "weightKg": {
      const n = Number(d.weightKg);
      return n >= 25 && n <= 400 ? null : "Enter your weight in kg";
    }
    case "trainingDaysPerWeek": {
      const n = Number(d.trainingDaysPerWeek);
      return Number.isInteger(n) && n >= 0 && n <= 7 ? null : "Pick 0–7 days";
    }
    case "sex":
    case "goal":
    case "activity":
    case "experience":
    case "diet":
      return d[step.key] ? null : "Pick one to continue";
    case "allergens":
      return d.allergens.length > 0 || d.allergiesNone
        ? null
        : 'Add your allergies, or choose "I have no allergies"';
  }
}

export function StageAForm({ slug }: { slug: string }) {
  const [draft, setDraft] = React.useState<Draft>(EMPTY);
  const [index, setIndex] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);
  const [token, setToken] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [done, setDone] = React.useState(false);

  const step = STAGE_A_STEPS[index];
  const isLast = index === STAGE_A_STEPS.length - 1;

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setError(null);
  }

  function back() {
    setError(null);
    setIndex((i) => Math.max(0, i - 1));
  }

  async function next() {
    const err = stepError(step, draft);
    if (err) {
      setError(err);
      return;
    }
    if (!isLast) {
      setIndex((i) => i + 1);
      return;
    }
    await submit();
  }

  async function submit() {
    setSubmitting(true);
    setError(null);
    const result = await submitLead(
      slug,
      {
        name: draft.name,
        email: draft.email,
        phone: draft.phone,
        age: draft.age,
        sex: draft.sex,
        heightCm: draft.heightCm,
        weightKg: draft.weightKg,
        goal: draft.goal,
        activity: draft.activity,
        trainingDaysPerWeek: draft.trainingDaysPerWeek,
        experience: draft.experience,
        diet: draft.diet,
        allergens: draft.allergens,
        allergiesNone: draft.allergiesNone,
      },
      token ?? undefined,
    );
    setSubmitting(false);
    if (!result.ok) {
      setError(result.message ?? "Something went wrong.");
      // Jump back to the offending field if the server pinned one.
      if (result.field) {
        const at = STAGE_A_STEPS.findIndex((s) => s.key === result.field);
        if (at >= 0) setIndex(at);
      }
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <div
        className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-3 px-6 text-center"
        data-testid="stage-a-done"
      >
        <div
          className="flex size-14 items-center justify-center rounded-full text-2xl"
          style={{
            background: "var(--brand-primary, var(--color-primary))",
            color: "var(--brand-on-primary, var(--color-primary-foreground))",
          }}
        >
          ✓
        </div>
        <h1 className="text-xl font-semibold tracking-tight">You&apos;re in.</h1>
        <p className="text-sm text-muted-foreground">
          Your coach is preparing a personalized preview of your plan. It&apos;ll be
          ready in a moment.
        </p>
      </div>
    );
  }

  return (
    <div
      className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col px-6 py-8"
      data-testid="stage-a-form"
    >
      {/* Progress dots */}
      <div className="mb-8 flex items-center gap-1.5" data-testid="progress">
        {STAGE_A_STEPS.map((s, i) => (
          <span
            key={s.key}
            className="h-1.5 flex-1 rounded-full transition-colors"
            style={{
              background:
                i <= index
                  ? "var(--brand-primary, var(--color-primary))"
                  : "var(--color-muted)",
            }}
          />
        ))}
      </div>

      <div className="flex flex-1 flex-col justify-center">
        <p className="metric-label mb-1 text-muted-foreground">
          Question {index + 1} of {STAGE_A_STEPS.length}
        </p>
        <h1 className="mb-6 text-2xl font-semibold tracking-tight" data-testid="step-label">
          {step.label}
        </h1>

        <StepInput step={step} draft={draft} set={set} onEnter={next} />

        {error && (
          <p className="mt-3 text-sm text-danger" data-testid="step-error" role="alert">
            {error}
          </p>
        )}
      </div>

      <TurnstileWidget onVerify={(t) => setToken(t)} />

      <div className="mt-6 flex items-center gap-3">
        {index > 0 && (
          <Button type="button" variant="ghost" onClick={back} data-testid="back">
            Back
          </Button>
        )}
        <Button
          type="button"
          className="flex-1"
          onClick={next}
          disabled={submitting}
          data-testid="next"
        >
          {isLast ? (submitting ? "Sending…" : "See my preview") : "Continue"}
        </Button>
      </div>
    </div>
  );
}

function StepInput({
  step,
  draft,
  set,
  onEnter,
}: {
  step: StageAStep;
  draft: Draft;
  set: <K extends keyof Draft>(key: K, value: Draft[K]) => void;
  onEnter: () => void;
}) {
  if (step.kind === "text" || step.kind === "number") {
    return (
      <Input
        autoFocus
        type={step.kind === "number" ? "number" : step.inputType ?? "text"}
        inputMode={step.kind === "number" ? "numeric" : undefined}
        placeholder={step.kind === "text" ? step.placeholder : undefined}
        value={draft[step.key] as string}
        onChange={(e) => set(step.key, e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onEnter();
          }
        }}
        data-testid={`field-${step.key}`}
        className="h-12 text-base"
      />
    );
  }

  if (step.kind === "choice") {
    const selected = draft[step.key] as string;
    return (
      <div className="grid grid-cols-2 gap-2">
        {step.options.map((opt) => {
          const active = selected === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => set(step.key, opt.value)}
              data-testid={`choice-${step.key}-${opt.value}`}
              aria-pressed={active}
              className="rounded-lg border px-4 py-3 text-left text-sm font-medium transition-colors"
              style={
                active
                  ? {
                      background: "var(--brand-primary, var(--color-primary))",
                      color: "var(--brand-on-primary, var(--color-primary-foreground))",
                      borderColor: "var(--brand-primary, var(--color-primary))",
                    }
                  : undefined
              }
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    );
  }

  // allergens
  return <AllergenPicker draft={draft} set={set} />;
}

function AllergenPicker({
  draft,
  set,
}: {
  draft: Draft;
  set: <K extends keyof Draft>(key: K, value: Draft[K]) => void;
}) {
  const [free, setFree] = React.useState("");

  function toggle(name: string) {
    const has = draft.allergens.some((a) => a.toLowerCase() === name.toLowerCase());
    const next = has
      ? draft.allergens.filter((a) => a.toLowerCase() !== name.toLowerCase())
      : [...draft.allergens, name];
    set("allergens", next);
    if (next.length > 0) set("allergiesNone", false);
  }

  function addFree() {
    const value = normalizeAllergen(free);
    if (!value) return;
    if (!draft.allergens.some((a) => a.toLowerCase() === value.toLowerCase())) {
      set("allergens", [...draft.allergens, value]);
      set("allergiesNone", false);
    }
    setFree("");
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Your preview will never include a food you can&apos;t eat. Select all that
        apply, or tell us you have none.
      </p>

      <div className="flex flex-wrap gap-2">
        {COMMON_ALLERGENS.map((name) => {
          const active = draft.allergens.some(
            (a) => a.toLowerCase() === name.toLowerCase(),
          );
          return (
            <button
              key={name}
              type="button"
              onClick={() => toggle(name)}
              aria-pressed={active}
              data-testid={`allergen-${name}`}
              className="rounded-full border px-3 py-1.5 text-sm transition-colors"
              style={
                active
                  ? {
                      background: "var(--brand-primary, var(--color-primary))",
                      color: "var(--brand-on-primary, var(--color-primary-foreground))",
                      borderColor: "var(--brand-primary, var(--color-primary))",
                    }
                  : undefined
              }
            >
              {name}
            </button>
          );
        })}
      </div>

      <div className="flex gap-2">
        <Input
          value={free}
          placeholder="Other allergy…"
          onChange={(e) => setFree(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addFree();
            }
          }}
          data-testid="allergen-input"
        />
        <Button type="button" variant="outline" onClick={addFree} data-testid="allergen-add">
          Add
        </Button>
      </div>

      {draft.allergens.length > 0 && (
        <p className="text-sm" data-testid="allergen-selected">
          Avoiding: {draft.allergens.join(", ")}
        </p>
      )}

      <button
        type="button"
        onClick={() => {
          set("allergiesNone", true);
          set("allergens", []);
        }}
        aria-pressed={draft.allergiesNone}
        data-testid="allergies-none"
        className="w-full rounded-lg border px-4 py-3 text-sm font-medium transition-colors"
        style={
          draft.allergiesNone
            ? {
                background: "var(--brand-primary, var(--color-primary))",
                color: "var(--brand-on-primary, var(--color-primary-foreground))",
                borderColor: "var(--brand-primary, var(--color-primary))",
              }
            : undefined
        }
      >
        I have no food allergies
      </button>
    </div>
  );
}
