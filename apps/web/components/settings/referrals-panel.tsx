"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Loader2 } from "lucide-react";

import { Badge } from "@supertrainer/ui/components/badge";
import { Button } from "@supertrainer/ui/components/button";
import { cn, focusRing } from "@supertrainer/ui/lib/utils";

import {
  ensureReferralCode,
  setClientReferrals,
} from "@/app/(app)/trainer/settings/referrals/actions";

// Phase 9.4 — the referral surface. Deliberately leaderboard-free: no ranks, no
// streaks, no badges. A coach recommending a tool to another coach is a
// professional act, and dressing it up as a game cheapens both.

interface Referral {
  id: string;
  kind: "trainer" | "client";
  status: string;
  reason: string | null;
  months: number;
  createdAt: string;
}

const STATUS_LABEL: Record<string, string> = {
  pending: "Link followed",
  signed_up: "Signed up",
  activated: "Activated",
  credited: "Credited",
  rejected: "Not eligible",
};

export function ReferralsPanel({
  origin,
  code,
  clientReferralsEnabled,
  bankedMonths,
  creditMonths,
  trialDays,
  monthlyCap,
  referrals,
}: {
  origin: string;
  code: string | null;
  clientReferralsEnabled: boolean;
  bankedMonths: number;
  creditMonths: number;
  trialDays: number;
  monthlyCap: number;
  referrals: Referral[];
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);
  const [current, setCurrent] = React.useState(code);
  // Reflect the switch immediately and revert if the save fails: a control that
  // snaps back while the server thinks reads as broken.
  const [clientsOn, setClientsOn] = React.useState(clientReferralsEnabled);
  React.useEffect(() => setClientsOn(clientReferralsEnabled), [clientReferralsEnabled]);

  const link = current ? `${origin}/r/${current}` : null;

  async function mint() {
    setPending("mint");
    const res = await ensureReferralCode();
    setPending(null);
    if (res.ok && res.code) {
      setCurrent(res.code);
      router.refresh();
    } else {
      setNotice(res.message ?? "That didn’t work.");
    }
  }

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setNotice("Couldn’t copy — select the link and copy it manually.");
    }
  }

  return (
    <div className="space-y-6" data-testid="referrals">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">Referrals</h1>
        <p className="text-sm text-muted-foreground">
          Bring another coach across and you both get something: {creditMonths} month free for you,{" "}
          {trialDays} extra trial days for them.
        </p>
      </div>

      {notice ? (
        <p className="rounded-md border bg-surface p-3 text-sm" role="status">
          {notice}
        </p>
      ) : null}

      <section className="rounded-md border bg-surface-raised p-5">
        <p className="metric-label mb-4">Your link</p>
        {link ? (
          <div className="flex flex-wrap items-center gap-3">
            <code
              className="min-w-0 flex-1 truncate rounded-md border bg-surface px-3 py-2 font-mono text-sm"
              data-testid="referral-link"
            >
              {link}
            </code>
            <Button variant="outline" onClick={copy} className={cn(focusRing)}>
              {copied ? <Check /> : <Copy />}
              {copied ? "Copied" : "Copy link"}
            </Button>
          </div>
        ) : (
          <Button onClick={mint} disabled={pending !== null} data-testid="mint-code">
            {pending === "mint" ? <Loader2 className="animate-spin" /> : null}
            Create my link
          </Button>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          The credit lands once they&rsquo;ve finished setting up and taken their first paying
          client — not at signup. Up to {monthlyCap} a month.
        </p>
      </section>

      <section className="rounded-md border bg-surface-raised p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-medium">Let clients bring a friend</p>
            <p className="text-sm text-muted-foreground">
              Adds a quiet card in the client portal with their own link. Off unless you turn it
              on — it&rsquo;s your relationship, not our growth lever.
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className={cn("size-4 rounded-md accent-primary", focusRing)}
              checked={clientsOn}
              disabled={pending !== null}
              data-testid="client-referrals-toggle"
              onChange={async (e) => {
                const next = e.target.checked;
                setClientsOn(next);
                setPending("toggle");
                const res = await setClientReferrals(next);
                setPending(null);
                if (!res.ok) {
                  setClientsOn(!next);
                  setNotice(res.message ?? "Couldn’t save that.");
                } else {
                  router.refresh();
                }
              }}
            />
            {clientsOn ? "On" : "Off"}
          </label>
        </div>
      </section>

      <section className="rounded-md border bg-surface-raised p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <p className="metric-label">Referrals</p>
          <p className="text-sm">
            <span className="metric">{bankedMonths}</span>{" "}
            <span className="text-muted-foreground">
              free month{bankedMonths === 1 ? "" : "s"} banked
            </span>
          </p>
        </div>
        {referrals.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No one has used your link yet.
          </p>
        ) : (
          <ul className="divide-y">
            {referrals.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 py-3" data-testid="referral-row">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm">
                    {r.kind === "trainer" ? "A coach" : "A friend of a client"}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {new Date(r.createdAt).toLocaleDateString()}
                    {r.reason ? ` · ${r.reason}` : ""}
                  </span>
                </span>
                {r.months > 0 ? (
                  <span className="metric text-sm">+{r.months} mo</span>
                ) : null}
                <Badge
                  variant={
                    r.status === "credited"
                      ? "success"
                      : r.status === "rejected"
                        ? "muted"
                        : "outline"
                  }
                >
                  {STATUS_LABEL[r.status] ?? r.status}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
