// Nightly edit-distillation job (Phase 4.3). Reads an org's undistilled
// draft_edits, folds recurring patterns into style_exemplars (source
// 'edit_capture'), embeds each new exemplar, and marks the edits distilled.
// Embedding is an injected, no-op-safe seam (like the STT/vision seams): without
// a configured model, exemplars are written with a null embedding and P6.4's
// similarity retrieval simply has nothing to match yet — the write still happens.

import type { Database } from "@supertrainer/db/types";
import type { SupabaseClient } from "@supabase/supabase-js";

import { distillEditPatterns } from "@/lib/plans/distill";

type ServiceClient = SupabaseClient<Database>;

/** Returns a pgvector literal string, or null when no embedding model is wired. */
export type EmbedFn = (text: string) => Promise<number[] | null>;

export async function runEditDistillation(
  service: ServiceClient,
  orgId: string,
  opts: { embed?: EmbedFn; minCount?: number } = {},
): Promise<{ patterns: number; exemplarsWritten: number; editsDistilled: number }> {
  const { data: edits } = await service
    .from("draft_edits")
    .select("id, edit_kind, before, after")
    .eq("org_id", orgId)
    .is("distilled_at", null);

  const rows = edits ?? [];
  const patterns = distillEditPatterns(
    rows.map((e) => ({ edit_kind: e.edit_kind, before: e.before, after: e.after })),
    opts.minCount,
  );

  let exemplarsWritten = 0;
  for (const p of patterns) {
    const vec = opts.embed ? await opts.embed(p.exemplar) : null;
    const { error } = await service.from("style_exemplars").insert({
      org_id: orgId,
      domain: "diet",
      content: p.exemplar,
      source: "edit_capture",
      embedding: vec ? `[${vec.join(",")}]` : null,
    });
    if (!error) exemplarsWritten += 1;
  }

  // Mark every edit we read as distilled so the next run starts fresh.
  const ids = rows.map((e) => e.id);
  if (ids.length) {
    await service.from("draft_edits").update({ distilled_at: new Date().toISOString() }).in("id", ids);
  }

  return { patterns: patterns.length, exemplarsWritten, editsDistilled: ids.length };
}
