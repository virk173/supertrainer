import Link from "next/link";

import { formatMicros } from "@supertrainer/ai/pricing";
import { cn, focusRing } from "@supertrainer/ui/lib/utils";

import { BudgetMeter, Percent } from "@/components/admin/primitives";
import { orgHealthRows } from "@/lib/admin/metrics";
import { DEFAULT_AI_BUDGET_MICROS } from "@/lib/admin/metrics-core";

export const dynamic = "force-dynamic";

type SortKey = "clients" | "spend" | "margin" | "name";

function sorted(rows: Awaited<ReturnType<typeof orgHealthRows>>, key: SortKey) {
  const copy = [...rows];
  switch (key) {
    case "spend":
      return copy.sort((a, b) => b.aiSpendMicros - a.aiSpendMicros);
    case "margin":
      return copy.sort((a, b) => a.marginMicros - b.marginMicros);
    case "name":
      return copy.sort((a, b) => a.name.localeCompare(b.name));
    default:
      return copy.sort((a, b) => b.clientCount - a.clientCount);
  }
}

const SORTS: { key: SortKey; label: string }[] = [
  { key: "clients", label: "Clients" },
  { key: "spend", label: "AI spend" },
  { key: "margin", label: "Margin" },
  { key: "name", label: "Name" },
];

function when(iso: string | null): string {
  if (!iso) return "never";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  return `${days}d ago`;
}

export default async function AdminOrgsPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string }>;
}) {
  const { sort } = await searchParams;
  const key = (SORTS.find((s) => s.key === sort)?.key ?? "clients") as SortKey;
  const rows = sorted(await orgHealthRows(), key);

  return (
    <div className="space-y-6" data-testid="admin-orgs">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">Orgs</h1>
          <p className="text-sm text-muted-foreground">
            Every workspace, what it costs us, and what it pays.
          </p>
        </div>
        <nav aria-label="Sort orgs" className="flex flex-wrap gap-1">
          {SORTS.map((s) => (
            <Link
              key={s.key}
              href={`/admin/orgs?sort=${s.key}`}
              aria-current={s.key === key ? "true" : undefined}
              className={cn(
                "rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                s.key === key
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-foreground/5",
                focusRing,
              )}
            >
              {s.label}
            </Link>
          ))}
        </nav>
      </div>

      <div className="overflow-x-auto rounded-md border bg-surface-raised">
        <table className="w-full min-w-[52rem] border-collapse text-sm">
          <caption className="sr-only">
            Org health: clients, AI spend against budget, zero-edit rate, push delivery, margin
          </caption>
          <thead>
            <tr className="border-b text-left">
              <th scope="col" className="metric-label p-3 font-medium">Org</th>
              <th scope="col" className="metric-label p-3 font-medium">Clients</th>
              <th scope="col" className="metric-label p-3 font-medium">AI spend</th>
              <th scope="col" className="metric-label p-3 font-medium">Zero-edit</th>
              <th scope="col" className="metric-label p-3 font-medium">Push</th>
              <th scope="col" className="metric-label p-3 font-medium">Margin</th>
              <th scope="col" className="metric-label p-3 font-medium">Active</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-6 text-center text-sm text-muted-foreground">
                  No orgs yet.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.orgId} className="border-b last:border-0" data-testid="admin-org-row">
                  <th scope="row" className="p-3 text-left font-medium">
                    <Link
                      href={`/admin/orgs/${r.orgId}`}
                      className={cn("rounded-md underline-offset-4 hover:underline", focusRing)}
                    >
                      {r.name}
                    </Link>
                    {r.throttled ? (
                      <span className="ml-2 rounded-full bg-warning px-2 py-0.5 text-xs font-medium text-warning-foreground">
                        Throttled
                      </span>
                    ) : null}
                  </th>
                  <td className="metric p-3 tabular-nums">{r.clientCount}</td>
                  <td className="p-3">
                    <BudgetMeter
                      spendMicros={r.aiSpendMicros}
                      capMicros={r.aiBudgetMicros ?? DEFAULT_AI_BUDGET_MICROS}
                      state={r.budget}
                    />
                  </td>
                  <td className="p-3"><Percent value={r.zeroEditRate} /></td>
                  <td className="p-3"><Percent value={r.pushSuccessRate} /></td>
                  <td className={cn("metric p-3 tabular-nums", r.marginMicros < 0 && "text-danger")}>
                    {formatMicros(r.marginMicros)}
                  </td>
                  <td className="p-3 text-xs text-muted-foreground">{when(r.lastActiveAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
