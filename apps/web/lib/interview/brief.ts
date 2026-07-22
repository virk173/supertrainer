// PO-5 — pure helpers for the auto-generated trainer "client brief".
//
// The brief's neutral prose is drafted by the model, but the SAFETY-CRITICAL
// parts are derived here in code, never by the LLM: the authoritative health-flag
// list is computed from clients.health_flags so the model can neither drop nor
// invent a flag, and the intake is serialized verbatim so the draft is strictly
// grounded in captured answers (no new questions, no arithmetic).

const HEALTH_CATEGORY_LABELS: Record<string, string> = {
  condition: "Medical condition disclosed",
  medication: "Medication disclosed",
  pregnancy: "Pregnancy / nursing disclosed",
  injury: "Injury disclosed",
  eating_disorder: "Disordered-eating signal — handle with care",
};

// Flattens clients.health_flags into an authoritative, human-readable list the
// brief surfaces prominently. Covers teaser/import allergens (key `allergies`)
// and any Stage B interview disclosures (key `interview.categories`). Defensive
// about shape — a malformed blob yields fewer lines, never a throw.
export function summarizeHealthFlags(healthFlags: unknown): string[] {
  if (!healthFlags || typeof healthFlags !== "object") return [];
  const hf = healthFlags as {
    allergies?: unknown;
    interview?: { categories?: unknown };
  };
  const out: string[] = [];

  if (Array.isArray(hf.allergies)) {
    for (const a of hf.allergies) {
      const label = String(a).trim();
      if (label) out.push(`Allergy: ${label}`);
    }
  }

  const categories = hf.interview?.categories;
  if (Array.isArray(categories)) {
    for (const c of categories) {
      const key = String(c).trim();
      if (key) out.push(HEALTH_CATEGORY_LABELS[key] ?? `Health flag: ${key}`);
    }
  }

  return out;
}

// Serializes the assembled intake (teaser answers + Stage B sections) into a
// compact, readable block for the brief prompt. Only captured fields appear, so
// the model is grounded strictly in what the client actually said. Bounded so a
// pathological intake can't blow the prompt budget.
export function serializeIntakeForBrief(intake: Record<string, unknown>): string {
  const lines: string[] = [];

  const walk = (prefix: string, value: unknown) => {
    if (value === null || value === undefined || value === "") return;
    if (Array.isArray(value)) {
      const items = value.map((v) => String(v)).filter(Boolean);
      if (items.length) lines.push(`${prefix}: ${items.join(", ")}`);
      return;
    }
    if (typeof value === "object") {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        walk(prefix ? `${prefix}.${k}` : k, v);
      }
      return;
    }
    lines.push(`${prefix}: ${String(value)}`);
  };

  // Skip derived/bookkeeping keys so the model sees only substantive answers.
  const SKIP = new Set(["stage_b_completed_at"]);
  for (const [k, v] of Object.entries(intake)) {
    if (SKIP.has(k)) continue;
    walk(k, v);
  }

  return lines.join("\n").slice(0, 4000);
}
