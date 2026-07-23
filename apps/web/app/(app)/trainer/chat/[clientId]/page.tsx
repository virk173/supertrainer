import { notFound } from "next/navigation";

import { ThreadView } from "@/components/chat/thread-view";
import { getOrgTheme } from "@/lib/brand/theme";
import { loadThreadPage } from "@/lib/chat/thread";
import { getSessionClaims } from "@/lib/onboarding/state";
import { createServiceClient } from "@/lib/supabase/server";

import { loadOlderCoachChat, markCoachThreadRead, sendCoachChat } from "./actions";

export const metadata = { title: "Chat — supertrainer" };

// The trainer's per-client thread. Minimal by design — Phase 7 builds the full
// inbox (thread list, drafts, to-dos); 6.1 ships the working realtime channel and
// a direct coach reply. org ownership is verified before anything renders.
export default async function TrainerChatPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  const { orgId, role } = await getSessionClaims();
  if (!orgId || (role !== "owner" && role !== "staff")) notFound();

  const service = createServiceClient();
  const { data: client } = await service
    .from("clients")
    .select("id, org_id, intake, profiles:profile_id (display_name)")
    .eq("id", clientId)
    .maybeSingle();
  if (!client || client.org_id !== orgId) notFound();

  const [page, theme] = await Promise.all([
    loadThreadPage(clientId, "coach"),
    getOrgTheme(orgId),
  ]);

  const profile = (client.profiles ?? null) as { display_name?: string | null } | null;
  const intakeName = (client.intake as { name?: unknown } | null)?.name;
  const clientName =
    profile?.display_name ?? (typeof intakeName === "string" ? intakeName : "Client");
  const trainerName = theme?.name ?? "You";

  return (
    <div className="mx-auto flex h-[calc(100dvh-3.5rem)] w-full max-w-2xl flex-col p-4">
      <h1 className="mb-2 text-lg font-semibold tracking-tight" data-testid="trainer-chat-title">
        {clientName}
      </h1>
      <ThreadView
        viewer="coach"
        clientId={clientId}
        initial={page.messages}
        hasMore={page.hasMore}
        trainerName={trainerName}
        sendAction={sendCoachChat.bind(null, clientId)}
        markReadAction={markCoachThreadRead.bind(null, clientId)}
        loadOlderAction={loadOlderCoachChat.bind(null, clientId)}
        emptyHint={`No messages with ${clientName} yet.`}
      />
    </div>
  );
}
