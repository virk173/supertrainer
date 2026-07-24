import { notFound } from "next/navigation";

import {
  loadOlderCoachChat,
  markCoachThreadRead,
  sendCoachChat,
} from "@/app/(app)/trainer/chat/[clientId]/actions";
import { InboxView } from "@/components/inbox/inbox-view";
import { getOrgTheme } from "@/lib/brand/theme";
import { loadThreadPage } from "@/lib/chat/thread";
import { getSessionClaims } from "@/lib/onboarding/state";
import { getClientInbox } from "@/lib/trainer/inbox";
import { createServiceClient } from "@/lib/supabase/server";

export const metadata = { title: "Inbox — supertrainer" };

// Phase 7.4 — the per-client inbox (spec §8 centerpiece): thread + client context
// + to-do tracker in one view. Org ownership is verified before anything renders;
// the thread actions re-verify it too (they never trust the bound clientId).
export default async function ClientInboxPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { orgId, role } = await getSessionClaims();
  if (!orgId || (role !== "owner" && role !== "staff")) notFound();

  const service = createServiceClient();
  const { data: client } = await service
    .from("clients")
    .select("id, org_id")
    .eq("id", id)
    .maybeSingle();
  if (!client || client.org_id !== orgId) notFound();

  const [inbox, page, theme] = await Promise.all([
    getClientInbox(id, new Date()),
    loadThreadPage(id, "coach"),
    getOrgTheme(orgId),
  ]);
  if (!inbox) notFound();

  return (
    <InboxView
      inbox={inbox}
      trainerName={theme?.name ?? "You"}
      initialMessages={page.messages}
      hasMore={page.hasMore}
      sendAction={sendCoachChat.bind(null, id)}
      markReadAction={markCoachThreadRead.bind(null, id)}
      loadOlderAction={loadOlderCoachChat.bind(null, id)}
    />
  );
}
