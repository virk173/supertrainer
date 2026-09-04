"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";

import { Badge } from "@supertrainer/ui/components/badge";
import { Button } from "@supertrainer/ui/components/button";
import { Input } from "@supertrainer/ui/components/input";

import {
  connectDomain,
  disconnectDomain,
  refreshDomain,
} from "@/app/(app)/trainer/settings/domain/actions";

// Phase 9.5 — connecting a coach's own domain. DNS is the part people get stuck
// on, so the records are shown exactly as the host returned them, copyable, with
// no paraphrasing: a TXT value retyped from prose is a support ticket.

interface DnsRecord {
  type: string;
  domain: string;
  value: string;
}

interface ConnectedDomain {
  domain: string;
  status: string;
  records: DnsRecord[];
  error: string | null;
  lastCheckedAt: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  pending: "Not set up",
  verifying: "Waiting on DNS",
  active: "Live",
  error: "Needs attention",
};

export function DomainPanel({
  configured,
  platformDomain,
  slug,
  domain,
}: {
  configured: boolean;
  platformDomain: string | null;
  slug: string;
  domain: ConnectedDomain | null;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [value, setValue] = React.useState("");

  async function run(key: string, fn: () => Promise<{ ok: boolean; message?: string }>) {
    setPending(key);
    setNotice(null);
    const res = await fn();
    setPending(null);
    setNotice(res.message ?? null);
    if (res.ok) router.refresh();
  }

  const subdomain = platformDomain && slug ? `${slug}.${platformDomain}` : null;

  return (
    <div className="space-y-6" data-testid="domain-settings">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">Your domain</h1>
        <p className="text-sm text-muted-foreground">
          Send clients to an address that&rsquo;s yours, not ours.
        </p>
      </div>

      {notice ? (
        <p className="rounded-md border bg-surface p-3 text-sm" role="status">
          {notice}
        </p>
      ) : null}

      {subdomain ? (
        <section className="rounded-md border bg-surface-raised p-5">
          <p className="metric-label mb-2">Working now</p>
          <p className="font-mono text-sm">{subdomain}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            This keeps working whatever you do below.
          </p>
        </section>
      ) : null}

      <section className="rounded-md border bg-surface-raised p-5">
        <p className="metric-label mb-4">Your own domain</p>

        {!configured ? (
          <p className="text-sm text-muted-foreground">
            Custom domains aren&rsquo;t switched on for this workspace yet. Your{" "}
            {subdomain ? "supertrainer address" : "branded address"} keeps working in the meantime.
          </p>
        ) : domain ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="min-w-0 flex-1 truncate font-mono text-sm">{domain.domain}</span>
              <Badge
                variant={
                  domain.status === "active"
                    ? "success"
                    : domain.status === "error"
                      ? "warning"
                      : "outline"
                }
              >
                {STATUS_LABEL[domain.status] ?? domain.status}
              </Badge>
              <Button
                variant="outline"
                size="sm"
                disabled={pending !== null}
                onClick={() => run("refresh", refreshDomain)}
              >
                {pending === "refresh" ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                Check again
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={pending !== null}
                onClick={() => run("disconnect", disconnectDomain)}
              >
                Disconnect
              </Button>
            </div>

            {domain.error ? (
              <p className="rounded-md border border-warning bg-warning/10 p-3 text-sm">
                {domain.error}
              </p>
            ) : null}

            {domain.status !== "active" && domain.records.length > 0 ? (
              <div>
                <p className="mb-2 text-sm">
                  Add these records at your domain registrar, then check again. DNS usually takes
                  a few minutes and occasionally a few hours.
                </p>
                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full min-w-[32rem] border-collapse text-sm">
                    <thead>
                      <tr className="border-b bg-surface text-left">
                        <th scope="col" className="metric-label p-2.5 font-medium">Type</th>
                        <th scope="col" className="metric-label p-2.5 font-medium">Name</th>
                        <th scope="col" className="metric-label p-2.5 font-medium">Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {domain.records.map((r, i) => (
                        <tr key={`${r.type}-${i}`} className="border-b last:border-0">
                          <td className="p-2.5 font-mono text-xs">{r.type}</td>
                          <td className="p-2.5 font-mono text-xs">{r.domain || "@"}</td>
                          <td className="p-2.5 font-mono text-xs break-all">{r.value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            {domain.status === "active" ? (
              <p className="text-sm text-muted-foreground">
                Clients who visit {domain.domain} land on your page. Certificates are issued and
                renewed for you.
              </p>
            ) : null}
          </div>
        ) : (
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[16rem] flex-1 space-y-1.5">
              <label htmlFor="domain" className="block text-sm font-medium">
                Domain
              </label>
              <Input
                id="domain"
                value={value}
                placeholder="coaching.yourname.com"
                autoComplete="off"
                onChange={(e) => setValue(e.target.value)}
              />
            </div>
            <Button
              disabled={pending !== null || value.trim() === ""}
              onClick={() => run("connect", () => connectDomain(value))}
            >
              {pending === "connect" ? <Loader2 className="animate-spin" /> : null}
              Connect domain
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}
