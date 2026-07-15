export const metadata = { title: "Today — supertrainer" };

// Placeholder — Phase 0.4 builds the PortalShell (mobile bottom tabs).
export default function PortalHomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-2 p-8">
      <h1 className="text-2xl font-semibold tracking-tight" data-testid="portal-home">
        Client portal
      </h1>
      <p className="text-muted-foreground">
        Empty shell — logging and plans arrive in Phase 2 and 3.
      </p>
    </main>
  );
}
