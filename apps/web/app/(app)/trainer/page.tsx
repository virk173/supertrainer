export const metadata = { title: "Dashboard — supertrainer" };

// Placeholder — Phase 0.4 builds the TrainerShell (sidebar nav, topbar).
export default function TrainerHomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-2 p-8">
      <h1 className="text-2xl font-semibold tracking-tight" data-testid="trainer-home">
        Trainer dashboard
      </h1>
      <p className="text-muted-foreground">
        Empty shell — the real dashboard arrives in Phase 0.4 and Phase 7.
      </p>
    </main>
  );
}
