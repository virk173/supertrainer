import Link from "next/link";

import { Button } from "@supertrainer/ui/components/button";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-4xl font-semibold tracking-tight">supertrainer</h1>
        <p className="max-w-md text-muted-foreground">
          AI coaching platform for personal trainers. Phase 0 scaffold — auth,
          schema, and design system land next.
        </p>
      </div>
      <div className="flex gap-3">
        <Button asChild>
          <Link href="/signup">Get started</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/login">Log in</Link>
        </Button>
      </div>
    </main>
  );
}
