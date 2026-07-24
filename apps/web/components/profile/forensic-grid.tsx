import { cn } from "@supertrainer/ui/lib/utils";

import type { CellState, GridRow } from "@/lib/trainer/profile";

// The signature "dispute-ender" viz: one cell per day per expectation, over 12
// weeks. State is encoded by the semantic status palette AND spelled out in the
// legend, per-row counts, and each cell's hover title — so it never depends on
// color alone (the CVD/print-safe rule). Printable: it's plain rounded cells.
const STATE_CLASS: Record<CellState, string> = {
  logged: "bg-success",
  late: "bg-warning",
  missed: "bg-danger",
  not_expected: "bg-muted",
};

const STATE_LABEL: Record<CellState, string> = {
  logged: "Logged",
  late: "Late",
  missed: "Missed",
  not_expected: "Not expected",
};

const LEGEND: CellState[] = ["logged", "late", "missed", "not_expected"];

function counts(row: GridRow) {
  const c = { logged: 0, late: 0, missed: 0, not_expected: 0 };
  for (const cell of row.cells) c[cell.state]++;
  return c;
}

export function ForensicGrid({ rows }: { rows: GridRow[] }) {
  return (
    <section
      aria-labelledby="forensic-heading"
      className="rounded-md border bg-surface-raised p-4"
      data-testid="forensic-grid"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 id="forensic-heading" className="text-sm font-semibold tracking-tight">
          Adherence — last 12 weeks
        </h2>
        <ul className="flex flex-wrap items-center gap-3">
          {LEGEND.map((state) => (
            <li key={state} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span
                aria-hidden="true"
                className={cn("size-2.5 rounded-[2px]", STATE_CLASS[state])}
              />
              {STATE_LABEL[state]}
            </li>
          ))}
        </ul>
      </div>

      <div
        className="overflow-x-auto rounded-md focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        tabIndex={0}
        role="group"
        aria-label="Adherence grid — scroll horizontally to see earlier weeks"
      >
        <div className="min-w-max space-y-1">
          {rows.map((row) => {
            const c = counts(row);
            return (
              <div key={row.key} className="flex items-center gap-3">
                <span className="w-16 shrink-0 text-xs font-medium text-muted-foreground">
                  {row.label}
                </span>
                <div className="flex gap-[2px]" aria-hidden="true">
                  {row.cells.map((cell) => (
                    <span
                      key={cell.date}
                      title={`${row.label} · ${cell.date} · ${STATE_LABEL[cell.state]}`}
                      className={cn("size-2.5 shrink-0 rounded-[2px]", STATE_CLASS[cell.state])}
                    />
                  ))}
                </div>
                {/* Screen-reader summary — the 84 cells above are decorative. */}
                <span className="sr-only">
                  {row.label}: {c.logged} logged, {c.late} late, {c.missed} missed over 12 weeks
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
