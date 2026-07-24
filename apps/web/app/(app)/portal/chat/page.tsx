import { redirect } from "next/navigation";

import { ThreadView } from "@/components/chat/thread-view";
import { getOrgTheme } from "@/lib/brand/theme";
import { loadThreadPage } from "@/lib/chat/thread";
import { getCurrentClientContext } from "@/lib/ledger/log";

import { answerCardChat, loadOlderClientChat, markClientThreadRead, sendClientChat } from "./actions";

export const metadata = { title: "Chat — supertrainer" };

// The client thread — their direct line to the coach (and where reminders, log
// confirmations, and plan deliveries already land). Realtime, offline-tolerant.
export default async function PortalChatPage() {
  const ctx = await getCurrentClientContext();
  if (!ctx) redirect("/portal");

  const [page, theme] = await Promise.all([
    loadThreadPage(ctx.clientId, "client"),
    getOrgTheme(ctx.orgId),
  ]);
  const trainerName = theme?.name ?? "Your coach";

  return (
    // Fill the phone viewport below the shell header/tab bar so the composer sits
    // at the bottom and only the message list scrolls.
    <div className="flex min-h-[calc(100dvh-8rem)] flex-col">
      <h1 className="sr-only">Chat with {trainerName}</h1>
      <ThreadView
        viewer="client"
        clientId={ctx.clientId}
        initial={page.messages}
        hasMore={page.hasMore}
        trainerName={trainerName}
        sendAction={sendClientChat}
        markReadAction={markClientThreadRead}
        loadOlderAction={loadOlderClientChat}
        answerCardAction={answerCardChat}
        emptyHint={`This is your direct line to ${trainerName}. Say hi!`}
      />
    </div>
  );
}
