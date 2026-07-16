"use client";

import * as React from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { Check, Copy, Loader2, RotateCcw, Sparkles, User } from "lucide-react";

import { Badge } from "@supertrainer/ui/components/badge";
import { Button } from "@supertrainer/ui/components/button";

import { resetDemo, seedDemo } from "@/app/onboarding/demo/actions";

interface DemoData {
  intake: Record<string, string>;
  healthFlags: { allergies?: string[] };
}

const INTAKE_ROWS: { key: string; label: string }[] = [
  { key: "goal", label: "Goal" },
  { key: "current_weight", label: "Current weight" },
  { key: "height", label: "Height" },
  { key: "dietary_preference", label: "Dietary preference" },
];

export function DemoClient({
  demo,
  teaserUrl,
}: {
  demo: DemoData | null;
  teaserUrl: string | null;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);

  async function create() {
    setPending(true);
    setMessage(null);
    const result = await seedDemo();
    setPending(false);
    if (!result.ok) {
      setMessage(result.message ?? "Failed.");
      return;
    }
    router.refresh();
  }

  async function reset() {
    setPending(true);
    setMessage(null);
    const result = await resetDemo();
    setPending(false);
    setMessage(result.ok ? "Demo client reset." : result.message ?? "Failed.");
    if (result.ok) router.refresh();
  }

  if (!demo) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-lg border border-dashed bg-surface p-10 text-center">
        <User aria-hidden="true" className="size-8 text-muted-foreground" />
        <p className="max-w-sm text-sm text-muted-foreground">
          Create Alex Demo — a realistic client you can explore the whole product
          with before inviting anyone real.
        </p>
        <Button onClick={create} disabled={pending} data-testid="create-demo">
          {pending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Sparkles className="size-4" />
          )}
          Create demo client
        </Button>
        {message && <p className="text-sm text-danger">{message}</p>}
      </div>
    );
  }

  const allergies = demo.healthFlags.allergies ?? [];

  return (
    <div className="space-y-6" data-testid="demo-client">
      <div className="rounded-lg border bg-card p-5">
        <div className="mb-4 flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-full bg-surface text-sm font-semibold">
            AD
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold tracking-tight">
                {demo.intake.name ?? "Alex Demo"}
              </h3>
              <Badge variant="muted" data-testid="demo-badge">
                DEMO
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Active · excluded from analytics &amp; billing
            </p>
          </div>
        </div>

        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
          {INTAKE_ROWS.map(({ key, label }) =>
            demo.intake[key] ? (
              <div key={key} className="flex justify-between gap-3 text-sm">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="text-right font-medium">{demo.intake[key]}</dd>
              </div>
            ) : null,
          )}
          {allergies.length > 0 && (
            <div className="flex justify-between gap-3 text-sm">
              <dt className="text-muted-foreground">Allergies</dt>
              <dd className="text-right font-medium text-warning">
                {allergies.join(", ")}
              </dd>
            </div>
          )}
        </dl>

        <div className="mt-5">
          <Button variant="outline" size="sm" onClick={reset} disabled={pending} data-testid="reset-demo">
            {pending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RotateCcw className="size-4" />
            )}
            Reset demo client
          </Button>
        </div>
      </div>

      {teaserUrl && <TeaserShare url={teaserUrl} />}

      {message && <p className="text-sm text-success">{message}</p>}
    </div>
  );
}

function TeaserShare({ url }: { url: string }) {
  const [qr, setQr] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    QRCode.toDataURL(url, { width: 160, margin: 1 })
      .then(setQr)
      .catch(() => setQr(null));
  }, [url]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked — the link is visible to copy manually.
    }
  }

  return (
    <div className="rounded-lg border bg-card p-5" data-testid="teaser-share">
      <p className="metric-label mb-3">Send yourself the teaser</p>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        {qr && (
          <Image
            src={qr}
            alt="Teaser link QR code"
            width={120}
            height={120}
            className="size-28 rounded-md border bg-white p-1"
            unoptimized
          />
        )}
        <div className="min-w-0 flex-1 space-y-2">
          <p className="break-all rounded-md border bg-surface px-3 py-2 font-mono text-xs" data-testid="teaser-url">
            {url}
          </p>
          <Button size="sm" variant="outline" onClick={copy} data-testid="copy-teaser">
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            {copied ? "Copied" : "Copy link"}
          </Button>
        </div>
      </div>
    </div>
  );
}
