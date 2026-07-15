import { createServiceClient } from "@/lib/supabase/server";

export const metadata = { title: "Join — supertrainer" };

// Stub — Phase 2 implements the full claim flow (client account creation,
// consent, intake). For now it only validates the token server-side.
export default async function JoinPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // Token resolution is service-role only: invites are not readable by
  // anon/client roles (see supabase/migrations/20260715140000_invites.sql).
  const service = createServiceClient();
  const { data: invite } = await service
    .from("invites")
    .select("id, expires_at, used_at, orgs (name)")
    .eq("token", token)
    .maybeSingle();

  const valid =
    invite !== null &&
    invite.used_at === null &&
    new Date(invite.expires_at).getTime() > Date.now();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-2 p-8 text-center">
      {valid ? (
        <>
          <h1 className="text-2xl font-semibold tracking-tight">
            You&apos;re invited to train with {invite.orgs?.name}
          </h1>
          <p className="max-w-md text-muted-foreground">
            Client onboarding opens in Phase 2 — this invite link is valid and
            will get you set up then.
          </p>
        </>
      ) : (
        <>
          <h1 className="text-2xl font-semibold tracking-tight">
            Invite invalid or expired
          </h1>
          <p className="max-w-md text-muted-foreground">
            Ask your trainer to send you a fresh invite link.
          </p>
        </>
      )}
    </main>
  );
}
