"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";

import { Button } from "@supertrainer/ui/components/button";
import { cn, focusRing } from "@supertrainer/ui/lib/utils";

import {
  approveDraftJson,
  dismissDraftJson,
  editDraftJson,
  rewriteDraftJson,
} from "@/app/(app)/trainer/queue/actions";
import type { InboxDraft } from "@/lib/trainer/inbox";

// The drafted reply for this client, surfaced right above the composer — where
// the trainer would otherwise type. Approve sends it as the coach (it lands in
// the thread via realtime); Edit captures the diff for voice learning; Rewrite
// regenerates; Dismiss drops it. Wired to the P6.4 mutations.
export function DraftedReplyCard({ draft }: { draft: InboxDraft }) {
  const router = useRouter();
  const [text, setText] = React.useState(draft.text);
  const [busy, setBusy] = React.useState(false);
  const [gone, setGone] = React.useState(false);

  React.useEffect(() => {
    setText(draft.text);
    setGone(false);
  }, [draft.id, draft.text]);

  if (gone) return null;

  const edited = text.trim() !== draft.text.trim();

  async function run(fn: () => Promise<{ ok: boolean }>) {
    if (busy) return;
    setBusy(true);
    setGone(true); // optimistic — the sent reply arrives in the thread via realtime
    try {
      await fn();
      // Re-pull the inbox: approve/edit/dismiss leave no draft (card stays gone);
      // rewrite produced a fresh draft that re-mounts this card with new text.
      router.refresh();
    } catch {
      setGone(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="mb-3 rounded-md border bg-surface p-3"
      data-testid="drafted-reply-card"
    >
      <div className="mb-2 flex items-center gap-1.5">
        <Sparkles aria-hidden="true" className="size-3.5 text-muted-foreground" />
        <span className="metric-label">Drafted reply</span>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        aria-label="Drafted reply"
        data-testid="drafted-reply-text"
        className={cn("w-full rounded-md border bg-background p-2 text-sm", focusRing)}
      />
      <div className="mt-2 flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={busy}
          data-testid="drafted-reply-approve"
          onClick={() =>
            run(() => (edited ? editDraftJson(draft.id, text) : approveDraftJson(draft.id)))
          }
        >
          {edited ? "Send edit" : "Approve & send"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => run(() => rewriteDraftJson(draft.id))}
        >
          Rewrite
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() => run(() => dismissDraftJson(draft.id))}
        >
          Dismiss
        </Button>
      </div>
    </div>
  );
}
