import type { SupabaseClient } from "@supabase/supabase-js";

import type { Json } from "@supertrainer/db/types";

// Phase 6.5 — recording a check-in card's tap-answer (db-injected). Derives the
// card metadata from the delivered card message, verifies the message belongs to
// the answering client (tenancy in code), and writes one check_in_responses row
// the trainer lens reads. Idempotent-ish: the latest answer per card is what shows.

export async function recordCardAnswer(
  db: SupabaseClient,
  input: { clientId: string; messageId: string; answer: unknown },
): Promise<{ ok: boolean }> {
  const { data: msg } = await db
    .from("messages")
    .select("org_id, client_id, kind, payload")
    .eq("id", input.messageId)
    .maybeSingle();
  // Must be THIS client's card message.
  if (!msg || msg.client_id !== input.clientId || msg.kind !== "card") return { ok: false };

  const payload = (msg.payload ?? {}) as { card_id?: string; card_version?: number; card_kind?: string; check_in?: boolean };
  if (!payload.check_in) return { ok: false };

  const answer = (typeof input.answer === "object" ? input.answer : { value: input.answer }) as unknown as Json;

  // One response per delivered card — a re-tap (reload, replayed action) updates
  // the existing row rather than accumulating duplicates the trainer lens would
  // double-count. (message_id is unique per delivered card.)
  const { data: existing } = await db
    .from("check_in_responses")
    .select("id")
    .eq("message_id", input.messageId)
    .maybeSingle();
  if (existing) {
    const { error } = await db
      .from("check_in_responses")
      .update({ answer, answered_at: new Date().toISOString() })
      .eq("id", existing.id);
    return { ok: !error };
  }

  const { error } = await db.from("check_in_responses").insert({
    org_id: msg.org_id,
    client_id: input.clientId,
    message_id: input.messageId,
    card_id: payload.card_id ?? "unknown",
    card_version: payload.card_version ?? 1,
    card_kind: payload.card_kind ?? "custom",
    answer,
  });
  if (error) return { ok: false };
  return { ok: true };
}
