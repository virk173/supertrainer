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

// Data-minimization: identifying PII (name is passed to the agent separately;
// email/phone are never needed to summarize coaching answers), internal ids, and
// bookkeeping are dropped at ANY depth before anything reaches the model prompt.
const SKIP_EXACT = new Set([
  "email",
  "phone",
  "name",
  "selected_tier_id",
  "stage_b_completed_at",
]);
function isDroppedKey(key: string): boolean {
  const k = key.toLowerCase();
  return (
    SKIP_EXACT.has(k) ||
    k.includes("email") ||
    k.includes("phone") ||
    k.includes("mobile")
  );
}

// Serializes the assembled intake (teaser answers + Stage B sections) into a
// compact, readable block for the brief prompt. Only captured, non-PII fields
// appear, so the model is grounded strictly in the coaching-relevant answers the
// client gave. Bounded so a pathological intake can't blow the prompt budget.
export function serializeIntakeForBrief(intake: Record<string, unknown>): string {
  const lines: string[] = [];

  const walk = (prefix: string, key: string, value: unknown) => {
    if (isDroppedKey(key)) return; // never serialize PII/internal keys, at any depth
    const path = prefix ? `${prefix}.${key}` : key;
    if (value === null || value === undefined || value === "") return;
    if (Array.isArray(value)) {
      const items = value.map((v) => String(v)).filter(Boolean);
      if (items.length) lines.push(`${path}: ${items.join(", ")}`);
      return;
    }
    if (typeof value === "object") {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        walk(path, k, v);
      }
      return;
    }
    lines.push(`${path}: ${String(value)}`);
  };

  for (const [k, v] of Object.entries(intake)) walk("", k, v);

  return lines.join("\n").slice(0, 4000);
}
