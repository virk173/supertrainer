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
  const endRef = React.useRef<HTMLDivElement>(null);
  const [scrolledEnd, setScrolledEnd] = React.useState(false);
  const [name, setName] = React.useState("");
  const [agreed, setAgreed] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Enable only once the client has actually reached the end of the agreement
  // (or the doc is short enough that the end is visible with no scrolling at
  // all). A sentinel element after the document text is watched with an
  // IntersectionObserver rather than comparing scrollHeight/clientHeight on
  // the doc div: that comparison false-positives at mount time whenever an
  // ancestor's layout lets the *page* scroll instead of the div (the div then
  // reports scrollHeight === clientHeight even though the agreement was never
  // read). Intersection is computed against the real, clipped visual position
  // of the sentinel, so this is correct whichever element physically scrolls.
  React.useEffect(() => {
    const sentinel = endRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) setScrolledEnd(true);
      },
      { threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

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
    // Next funnel step: install + notification permission (Phase 2.4). Skippable
    // there, so the portal is reachable either way.
    router.push("/welcome/notifications");
  }

  return (
    <div className="flex flex-1 flex-col">
      <div
        ref={scrollRef}
        data-testid="consent-doc"
        tabIndex={0}
        role="region"
        aria-label="Coaching agreement document"
        className="max-h-[60vh] min-h-0 flex-1 overflow-y-auto rounded-lg border bg-card p-4"
      >
        <ConsentDoc text={docText} />
        <p className="mt-6 text-[11px] text-muted-foreground">Document version {docVersion}</p>
        {/* End-of-document sentinel for the IntersectionObserver read-gate above. */}
        <div ref={endRef} data-testid="consent-doc-end" aria-hidden="true" className="h-px" />
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
