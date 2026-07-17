"use server";

import { runTurn, type InterviewView } from "@/lib/interview/engine";
import { getSessionClaims } from "@/lib/onboarding/state";
import { createServiceClient } from "@/lib/supabase/server";

// Resolves the signed-in client's own record. The interview writes health flags
// and intake, so every turn is verified to be the client speaking for themselves.
export async function ownClient() {
  const { orgId, userId, role } = await getSessionClaims();
  if (!orgId || !userId || role !== "client") return null;
  const service = createServiceClient();
  const { data } = await service
    .from("clients")
    .select("id, intake")
    .eq("profile_id", userId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!data) return null;
  return {
    orgId,
    clientId: data.id,
    clientName: (data.intake as { name?: string })?.name,
  };
}

export interface SendAnswerResult {
  ok: boolean;
  view?: InterviewView;
  message?: string;
}

export async function sendAnswer(text: string): Promise<SendAnswerResult> {
  const own = await ownClient();
  if (!own) return { ok: false, message: "Please sign in as a client." };
  try {
    const view = await runTurn(own.orgId, own.clientId, text, own.clientName);
    return { ok: true, view };
  } catch (err) {
    console.error("[interview] turn failed:", err);
    return { ok: false, message: "Couldn't send that just now — try again." };
  }
}
