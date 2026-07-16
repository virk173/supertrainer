import { ArrowRight } from "lucide-react";

import { Button } from "@supertrainer/ui/components/button";

import { recordInviteOpen } from "@/lib/invites/claim";

export const metadata = { title: "Join — supertrainer" };

// Client-facing invite landing. Records the open (funnel), shows a trainer-
// branded welcome, and on accept creates the client's account and hands off to
// the portal (Phase 2 Stage B). Token resolution is service-role only.
export default async function JoinPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const { orgName, valid } = await recordInviteOpen(token);

  if (!valid) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-2 p-8 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          Invite invalid or expired
        </h1>
        <p className="max-w-md text-muted-foreground">
          Ask your trainer to send you a fresh invite link.
        </p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8 text-center">
      <div className="space-y-2">
        <p className="metric-label" data-testid="join-valid">
          You&apos;re invited
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">
          Train with {orgName ?? "your coach"}
        </h1>
        <p className="max-w-md text-muted-foreground">
          Personalized coaching, powered by AI. Accept to set up your account and
          get started.
        </p>
      </div>
      {/*
       * Plain anchor (full navigation), not next/link or a server action: the
       * accept route handler must run as a document request so the downstream
       * /auth/confirm sets the client's session cookies.
       */}
      <Button asChild size="lg">
        <a href={`/join/${token}/accept`} data-testid="accept-invite">
          Accept &amp; get started <ArrowRight aria-hidden="true" className="size-4" />
        </a>
      </Button>
    </main>
  );
}
