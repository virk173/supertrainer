import { getOrgTheme } from "@/lib/brand/theme";
import { ensureInterview } from "@/lib/interview/engine";
import { requireConsentedClient } from "@/lib/onboarding/require-consent";
import { InterviewThread } from "@/components/interview-thread";

export const metadata = { title: "Your intake" };

// Stage B conversational interview (Phase 2.5). Resumable: the client can leave
// and come back, and sections unlock across days 1–3 — so this is a thread they
// return to, not a wizard that must be finished in one sitting. Consent-gated:
// the interview is coaching content and collects health disclosures.
export default async function InterviewPage() {
  const { orgId, clientId, clientName } = await requireConsentedClient();

  const theme = await getOrgTheme(orgId);
  const trainerName = theme?.name ?? "Your coach";
  const view = await ensureInterview(orgId, clientId, clientName);

  return (
    <main
      style={theme?.vars}
      className="mx-auto flex min-h-[100dvh] max-w-md flex-col px-6 py-8"
    >
      <header className="mb-2">
        <p className="metric-label text-muted-foreground">{trainerName}</p>
        <h1 className="text-xl font-semibold tracking-tight">Getting to know you</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          A few questions over the next couple of days — answer whenever suits you.
        </p>
      </header>

      <InterviewThread initial={view} trainerName={trainerName} />
    </main>
  );
}
