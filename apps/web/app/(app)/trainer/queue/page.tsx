import { notFound } from "next/navigation";

import { Button } from "@supertrainer/ui/components/button";
import { EmptyState } from "@supertrainer/ui/components/empty-state";

import { getSessionClaims } from "@/lib/onboarding/state";
import { createServiceClient } from "@/lib/supabase/server";

import { approveDraftAction, dismissDraftAction, editDraftAction, rewriteDraftAction } from "./actions";

export const metadata = { title: "Reply queue — supertrainer" };

// Phase 6.4 — the drafted-reply queue (minimal; P7 builds the full inbox). Each
// pending draft shows the client, the triggering message, and the AI draft in the
// coach's voice with one-tap Approve, inline Edit, Rewrite, and Dismiss.
export default async function TrainerQueuePage() {
  const { orgId, role } = await getSessionClaims();
  if (!orgId || (role !== "owner" && role !== "staff")) notFound();

  const service = createServiceClient();
  const { data: drafts } = await service
    .from("drafts")
    .select(
      "id, client_id, category, draft_text, created_at, message_id, clients:client_id (intake, profiles:profile_id (display_name)), messages:message_id (body)",
    )
    .eq("org_id", orgId)
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  const rows = drafts ?? [];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight" data-testid="queue-home">
        Reply queue
      </h1>

      {rows.length === 0 && (
        <EmptyState
          title="No drafts waiting"
          description="When a client messages, a reply drafted in your voice shows up here for one-tap approval."
        />
      )}

      {rows.map((d) => {
        const profile = (d.clients as { profiles?: { display_name?: string | null } } | null)?.profiles ?? null;
        const intakeName = (d.clients as { intake?: { name?: unknown } } | null)?.intake?.name;
        const clientName = profile?.display_name ?? (typeof intakeName === "string" ? intakeName : "Client");
        const trigger = (d.messages as { body?: string | null } | null)?.body ?? "";

        return (
          <form key={d.id} className="rounded-xl border bg-surface-raised p-4" data-testid="draft-card">
            <input type="hidden" name="draftId" value={d.id} />
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium">{clientName}</span>
              <span className="metric-label text-[11px] text-muted-foreground">{d.category}</span>
            </div>
            {trigger && (
              <p className="mb-2 rounded-lg bg-surface p-2 text-sm text-muted-foreground" data-testid="draft-trigger">
                {trigger}
              </p>
            )}
            <textarea
              name="text"
              defaultValue={d.draft_text}
              rows={3}
              data-testid="draft-text"
              aria-label="Draft reply"
              className="w-full rounded-lg border bg-background p-2 text-sm"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="submit" formAction={approveDraftAction} data-testid="draft-approve">
                Approve &amp; Send
              </Button>
              <Button type="submit" formAction={editDraftAction} variant="outline" data-testid="draft-send-edit">
                Send edit
              </Button>
              <Button type="submit" formAction={rewriteDraftAction} variant="outline" data-testid="draft-rewrite">
                Rewrite
              </Button>
              <Button type="submit" formAction={dismissDraftAction} variant="ghost" data-testid="draft-dismiss">
                Dismiss
              </Button>
            </div>
          </form>
        );
      })}
    </div>
  );
}
