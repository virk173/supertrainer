"use client";

import Link from "next/link";
import { ArrowRight, Check, PartyPopper, SkipForward } from "lucide-react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@supertrainer/ui/components/accordion";
import { Badge } from "@supertrainer/ui/components/badge";
import { Button } from "@supertrainer/ui/components/button";
import { Progress } from "@supertrainer/ui/components/progress";
import { cn } from "@supertrainer/ui/lib/utils";

import { reopenStep, skipStep } from "@/app/onboarding/actions";
import {
  ONBOARDING_STEPS,
  isOnboardingComplete,
  resolvedStepCount,
  type OnboardingStateMap,
  type OnboardingStepStatus,
} from "@/lib/onboarding/steps";

function StatusBadge({
  step,
  status,
}: {
  step: string;
  status: OnboardingStepStatus;
}) {
  const testId = `step-status-${step}`;
  if (status === "done") {
    return (
      <Badge variant="success" data-testid={testId}>
        <Check aria-hidden="true" /> Done
      </Badge>
    );
  }
  if (status === "skipped") {
    return (
      <Badge variant="muted" data-testid={testId}>
        Skipped
      </Badge>
    );
  }
  return (
    <Badge variant="outline" data-testid={testId}>
      To do
    </Badge>
  );
}

export function OnboardingChecklist({ state }: { state: OnboardingStateMap }) {
  const total = ONBOARDING_STEPS.length;
  const resolved = resolvedStepCount(state);
  const complete = isOnboardingComplete(state);
  const pct = Math.round((resolved / total) * 100);

  // Open the first unresolved step so a returning trainer lands on their next
  // action; if everything's resolved the accordion opens nothing.
  const firstTodo = ONBOARDING_STEPS.find((s) => state[s.step] === "todo");

  return (
    <div className="space-y-6">
      <div className="space-y-2" data-testid="onboarding-progress">
        <div className="flex items-baseline justify-between">
          <span className="metric-label">Setup progress</span>
          <span className="metric text-sm" data-testid="onboarding-progress-count">
            {resolved} / {total}
          </span>
        </div>
        <Progress value={pct} aria-label={`Onboarding ${pct}% complete`} />
      </div>

      {complete && (
        <div
          data-testid="onboarding-complete"
          className="flex flex-col items-center gap-3 rounded-lg border bg-surface p-8 text-center"
        >
          <PartyPopper aria-hidden="true" className="size-8 text-success" />
          <div className="space-y-1">
            <h2 className="text-lg font-semibold tracking-tight">
              You&apos;re all set up
            </h2>
            <p className="max-w-sm text-sm text-muted-foreground">
              Every step is done or skipped. Your workspace is ready — jump into
              your dashboard.
            </p>
          </div>
          <Button asChild>
            <Link href="/trainer">
              Go to dashboard <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          </Button>
        </div>
      )}

      <div className="rounded-lg border bg-card">
        <Accordion
          type="single"
          collapsible
          defaultValue={firstTodo?.step}
          className="px-4"
        >
          {ONBOARDING_STEPS.map((config, index) => {
            const status = state[config.step];
            const resolvedStep = status !== "todo";
            return (
              <AccordionItem
                key={config.step}
                value={config.step}
                data-testid={`step-${config.step}`}
              >
                <AccordionTrigger>
                  <span className="flex flex-1 items-center gap-3">
                    <span
                      aria-hidden="true"
                      className={cn(
                        "flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium",
                        status === "done"
                          ? "border-transparent bg-success text-success-foreground"
                          : "text-muted-foreground",
                      )}
                    >
                      {status === "done" ? (
                        <Check className="size-3.5" />
                      ) : (
                        index + 1
                      )}
                    </span>
                    <span
                      className={cn(
                        "font-medium",
                        resolvedStep && "text-muted-foreground",
                      )}
                    >
                      {config.title}
                    </span>
                  </span>
                  <StatusBadge step={config.step} status={status} />
                </AccordionTrigger>
                <AccordionContent className="space-y-4">
                  <p className="text-muted-foreground">{config.detail}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button asChild size="sm" variant={resolvedStep ? "outline" : "default"}>
                      <Link href={config.href} data-testid={`open-${config.step}`}>
                        {resolvedStep ? "Review" : config.cta}
                        <ArrowRight aria-hidden="true" className="size-4" />
                      </Link>
                    </Button>

                    {status === "todo" && config.skippable && (
                      <form action={skipStep}>
                        <input type="hidden" name="step" value={config.step} />
                        <Button
                          type="submit"
                          size="sm"
                          variant="ghost"
                          data-testid={`skip-${config.step}`}
                        >
                          <SkipForward aria-hidden="true" className="size-4" />
                          Skip for now
                        </Button>
                      </form>
                    )}

                    {resolvedStep && (
                      <form action={reopenStep}>
                        <input type="hidden" name="step" value={config.step} />
                        <Button
                          type="submit"
                          size="sm"
                          variant="ghost"
                          data-testid={`reopen-${config.step}`}
                        >
                          Reopen
                        </Button>
                      </form>
                    )}
                  </div>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      </div>
    </div>
  );
}
