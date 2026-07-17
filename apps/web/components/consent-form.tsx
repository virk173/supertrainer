"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Button } from "@supertrainer/ui/components/button";
import { Input } from "@supertrainer/ui/components/input";

import { recordConsent } from "@/app/(app)/consent/actions";

// Renders the canonical consent markdown (headings/paragraphs) — the same text
// the server hashes.
function ConsentDoc({ text }: { text: string }) {
  return (
    <>
      {text.split("\n").map((line, i) => {
        const t = line.trim();
        if (!t) return null;
        if (t.startsWith("## "))
          return (
            <h3 key={i} className="mt-4 text-sm font-semibold text-foreground">
              {t.slice(3)}
            </h3>
          );
        if (t.startsWith("# "))
          return (
            <h2 key={i} className="text-lg font-semibold tracking-tight text-foreground">
              {t.slice(2)}
            </h2>
          );
        return (
          <p key={i} className="mt-2 text-sm text-muted-foreground">
            {t.replace(/\*\*/g, "")}
          </p>
        );
      })}
    </>
  );
}

export function ConsentForm({
  docText,
  docVersion,
}: {
  docText: string;
  docVersion: string;
}) {
  const router = useRouter();
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [scrolledEnd, setScrolledEnd] = React.useState(false);
  const [name, setName] = React.useState("");
  const [agreed, setAgreed] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Enable once the client has actually reached the bottom (or the doc is short
  // enough to need no scrolling).
  const checkScrolled = React.useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 24) setScrolledEnd(true);
  }, []);

  React.useEffect(() => {
    checkScrolled();
  }, [checkScrolled]);

  const canSign = scrolledEnd && name.trim().length >= 2 && agreed && !submitting;

  async function sign() {
    if (!canSign) return;
    setSubmitting(true);
    setError(null);
    const result = await recordConsent(name);
    if (!result.ok) {
      setSubmitting(false);
      setError(result.message ?? "Couldn't record your consent.");
      return;
    }
    router.push("/portal");
  }

  return (
    <div className="flex flex-1 flex-col">
      <div
        ref={scrollRef}
        onScroll={checkScrolled}
        data-testid="consent-doc"
        className="min-h-0 flex-1 overflow-y-auto rounded-lg border bg-card p-4"
      >
        <ConsentDoc text={docText} />
        <p className="mt-6 text-[11px] text-muted-foreground">Document version {docVersion}</p>
      </div>

      {!scrolledEnd && (
        <p className="mt-2 text-center text-xs text-muted-foreground" data-testid="scroll-hint">
          Scroll to the end to continue
        </p>
      )}

      <div className="mt-4 space-y-3">
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            data-testid="consent-agree"
            className="mt-0.5"
          />
          <span>
            I have read and agree to the coaching agreement, and my health
            disclosures are accurate.
          </span>
        </label>

        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Type your full name to sign"
          data-testid="consent-name"
          aria-label="Full name"
        />

        {error && (
          <p className="text-sm text-danger" data-testid="consent-error" role="alert">
            {error}
          </p>
        )}

        <Button
          type="button"
          className="w-full"
          onClick={sign}
          disabled={!canSign}
          data-testid="consent-sign"
        >
          {submitting ? "Signing…" : "Sign & continue"}
        </Button>
      </div>
    </div>
  );
}
