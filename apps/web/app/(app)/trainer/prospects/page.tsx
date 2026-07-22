import { Users } from "lucide-react";

import { EmptyState } from "@supertrainer/ui/components/empty-state";

import { ProspectsTable, type ProspectRow } from "@/components/prospects-table";
import { getOrgTheme } from "@/lib/brand/theme";
import { GOAL_OPTIONS } from "@/lib/onboarding/stage-a";
import { getSessionClaims } from "@/lib/onboarding/state";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Prospects — supertrainer" };

const GOAL_LABELS: Record<string, string> = Object.fromEntries(
  GOAL_OPTIONS.map((o) => [o.value, o.label]),
);

const dateLabel = (iso: string) =>
  new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(iso));

// PO-1: trainer-facing prospect/lead pipeline. Reads the org's teaser leads under
// the existing staff-read RLS (no schema change beyond PO-6's intent columns) and
// gives the coach funnel visibility they previously had zero of.
export default async function ProspectsPage() {
  const { orgId } = await getSessionClaims();
  const supabase = await createClient();

  // RLS already scopes leads to the trainer's org; the explicit org filter is
  // belt-and-suspenders.
  const { data: leads } = orgId
    ? await supabase
        .from("leads")
        .select(
          "id, email, answers, allergens, status, created_at, intent_band, intent_reason, converted_client_id",
        )
        .eq("org_id", orgId)
        .order("created_at", { ascending: false })
        .limit(200)
    : { data: null };

  const slug = orgId ? (await getOrgTheme(orgId))?.slug ?? null : null;

  const rows: ProspectRow[] = (leads ?? []).map((l) => {
    const answers = (l.answers ?? {}) as { name?: string; goal?: string };
    return {
      id: l.id,
      name: answers.name?.trim() || l.email || "Prospect",
      goal: answers.goal ? GOAL_LABELS[answers.goal] ?? answers.goal : null,
      dateLabel: dateLabel(l.created_at),
      status: l.status,
      allergenCount: (l.allergens ?? []).length,
      intentBand: l.intent_band,
      intentReason: l.intent_reason,
      previewPath: slug ? `/c/${slug}/preview/${l.id}` : null,
      // A lead is "converted" once it's linked to a client OR reached the
      // converted stage (the two move together in practice; guarding on both
      // keeps the Convert action from showing on an already-converted row).
      converted: Boolean(l.converted_client_id) || l.status === "converted",
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <p className="metric-label text-muted-foreground">Funnel</p>
        <h1 className="text-2xl font-semibold tracking-tight" data-testid="prospects-heading">
          Prospects
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Everyone who started your teaser. Copy their preview link or convert
          them into a client.
        </p>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<Users />}
          title="No prospects yet"
          description="When someone starts your teaser, they'll show up here with their goal, intent, and funnel stage."
        />
      ) : (
        <ProspectsTable rows={rows} />
      )}
    </div>
  );
}
