import { Flame } from "lucide-react";

import type { ClientLens } from "@/lib/ledger/score";

// Phase 3.5 client lens — the weekly score IS shown to the client, with
// supportive framing and a streak, never a red shame wall (ORIGINAL-SPEC §5).
const BAND_ACCENT: Record<ClientLens["band"]["band"], string> = {
  reset: "var(--color-warning)",
  building: "var(--color-primary)",
  locked_in: "var(--color-success)",
};

export function ClientScoreCard({ lens }: { lens: ClientLens }) {
  return (
    <div className="rounded-lg border bg-surface-raised p-4" data-testid="score-card">
      <div className="flex items-start justify-between">
        <div>
          <p className="metric-label">This week</p>
          <p
            className="metric text-3xl"
            data-testid="score-value"
            style={{ color: BAND_ACCENT[lens.band.band] }}
          >
            {lens.score}
          </p>
          <p className="text-sm font-medium">{lens.band.label}</p>
        </div>
        {lens.streak > 0 && (
          <div className="flex items-center gap-1 text-sm" data-testid="streak">
            <Flame className="size-4" style={{ color: "var(--color-warning)" }} />
            <span className="metric">{lens.streak}</span>
            <span className="text-muted-foreground">day{lens.streak === 1 ? "" : "s"}</span>
          </div>
        )}
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{lens.band.message}</p>
    </div>
  );
}
