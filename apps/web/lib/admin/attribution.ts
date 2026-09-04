import { withAiOrg } from "@supertrainer/ai";

// Phase 9.3 — attribution helper. AI work is billed to the org it was done for;
// wrapping the pipeline entry points (rather than every individual call) keeps
// the attribution in one obvious place per feature.
//
// Deliberately NOT marked server-only: the plan/split pipelines that call it are
// kept free of server-only imports so the specs can drive them directly, and a
// guard here would take that away for no benefit — this module only reads an
// AsyncLocalStorage.
export function forOrg<T>(orgId: string | null | undefined, fn: () => Promise<T>): Promise<T> {
  return orgId ? withAiOrg(orgId, fn) : fn();
}
