import { getOrgTheme } from "@/lib/brand/theme";
import { requireConsentedClient } from "@/lib/onboarding/require-consent";
import { NotificationWalkthrough } from "@/components/notification-walkthrough";

export const metadata = { title: "Stay in touch" };

// Install + notification permission walkthrough (Phase 2.4). Reached right after
// the consent gate (and itself consent-gated). Unlike consent this step is
// SKIPPABLE — skipping records the email_only rung of the fallback ladder rather
// than blocking the portal.
export default async function NotificationsWelcomePage() {
  const { orgId } = await requireConsentedClient();

  const theme = await getOrgTheme(orgId);
  const trainerName = theme?.name ?? "Your coach";

  return (
    <main
      style={theme?.vars}
      className="mx-auto flex min-h-[100dvh] max-w-md flex-col px-6 py-8"
    >
      <header className="mb-5">
        <p className="metric-label text-muted-foreground">Almost there</p>
        <h1 className="text-2xl font-semibold tracking-tight">
          This is how {trainerName} reaches you
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Check-in nudges, plan updates, and replies land here — not buried in
          your inbox.
        </p>
      </header>

      <NotificationWalkthrough trainerName={trainerName} />
    </main>
  );
}
