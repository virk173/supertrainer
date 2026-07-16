"use client";

import * as React from "react";
import { Check, Copy, Link2, Loader2, Mail, Send } from "lucide-react";

import { Button } from "@supertrainer/ui/components/button";
import { Input } from "@supertrainer/ui/components/input";
import { Label } from "@supertrainer/ui/components/label";
import { cn } from "@supertrainer/ui/lib/utils";

import { issueInvite } from "@/app/onboarding/invite/actions";

interface Candidate {
  id: string;
  email: string;
  name: string;
}

interface IssuedInvite {
  label: string;
  link: string;
  channel: "copy_link" | "email";
  emailSent?: boolean;
  emailReason?: string;
}

const selectClass =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

export function InvitePanel({ candidates }: { candidates: Candidate[] }) {
  const [leadId, setLeadId] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [note, setNote] = React.useState("");
  const [channel, setChannel] = React.useState<"copy_link" | "email">("copy_link");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [issued, setIssued] = React.useState<IssuedInvite[]>([]);

  const usingLead = Boolean(leadId);
  const recipientLabel = usingLead
    ? candidates.find((c) => c.id === leadId)?.email ?? "lead"
    : email.trim();

  async function generate() {
    setPending(true);
    setError(null);
    const result = await issueInvite({
      clientId: usingLead ? leadId : null,
      email: usingLead ? null : email,
      personalMessage: note,
      channel,
    });
    setPending(false);
    if (!result.ok || !result.link) {
      setError(result.message ?? "Couldn't create the invite.");
      return;
    }
    setIssued((prev) => [
      {
        label: recipientLabel,
        link: result.link!,
        channel,
        emailSent: result.emailSent,
        emailReason: result.emailReason,
      },
      ...prev,
    ]);
    setLeadId("");
    setEmail("");
    setNote("");
  }

  return (
    <div className="space-y-6">
      <div className="space-y-4 rounded-lg border bg-card p-5">
        {candidates.length > 0 && (
          <div className="space-y-1">
            <Label htmlFor="lead">Imported lead</Label>
            <select
              id="lead"
              className={selectClass}
              value={leadId}
              onChange={(e) => setLeadId(e.target.value)}
              data-testid="invite-lead"
            >
              <option value="">— enter a new email below —</option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name ? `${c.name} · ${c.email}` : c.email}
                </option>
              ))}
            </select>
          </div>
        )}

        {!usingLead && (
          <div className="space-y-1">
            <Label htmlFor="invite-email">Email</Label>
            <Input
              id="invite-email"
              type="email"
              placeholder="client@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              data-testid="invite-email"
            />
          </div>
        )}

        <div className="space-y-1">
          <Label htmlFor="note">Personal note (optional)</Label>
          <textarea
            id="note"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Excited to start working together!"
            className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Delivery:</span>
          {(["copy_link", "email"] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setChannel(c)}
              className={cn(
                "flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm transition-colors",
                channel === c
                  ? "border-transparent bg-primary text-primary-foreground"
                  : "hover:bg-foreground/5",
              )}
              data-testid={`channel-${c}`}
            >
              {c === "copy_link" ? <Link2 className="size-3.5" /> : <Mail className="size-3.5" />}
              {c === "copy_link" ? "Copy link" : "Email"}
            </button>
          ))}
        </div>

        <Button
          onClick={generate}
          disabled={pending || (!usingLead && !email.trim())}
          data-testid="generate-invite"
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          Generate invite
        </Button>
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>

      {issued.length > 0 && (
        <div className="space-y-3" data-testid="issued-invites">
          <p className="metric-label">Invites</p>
          {issued.map((inv, i) => (
            <IssuedRow key={i} invite={inv} />
          ))}
        </div>
      )}
    </div>
  );
}

function IssuedRow({ invite }: { invite: IssuedInvite }) {
  const [copied, setCopied] = React.useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(invite.link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked — link is visible to copy manually.
    }
  }

  return (
    <div className="rounded-md border bg-card p-3" data-testid="issued-invite">
      <div className="mb-1 flex items-center justify-between gap-2 text-sm">
        <span className="truncate font-medium">{invite.label}</span>
        {invite.channel === "email" && (
          <span className="text-xs text-muted-foreground">
            {invite.emailSent
              ? "Email sent"
              : invite.emailReason === "no_key"
                ? "Email not configured — copy the link"
                : "Email failed — copy the link"}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate rounded bg-surface px-2 py-1 font-mono text-xs" data-testid="invite-link">
          {invite.link}
        </p>
        <Button size="sm" variant="outline" onClick={copy} data-testid="copy-invite">
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  );
}
