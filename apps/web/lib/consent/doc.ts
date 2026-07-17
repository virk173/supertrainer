import { createHash } from "node:crypto";

import { CONSENT_DOC_VERSION, CONSENT_V1_TEMPLATE } from "./template";

export { CONSENT_DOC_VERSION };

export interface ConsentContext {
  trainerName: string;
  businessName: string;
}

// Renders the canonical consent text a client actually agrees to: the internal
// <!-- LAWYER TODO --> comment stripped, placeholders filled, whitespace
// normalized. This exact string is BOTH shown to the client and hashed, so the
// evidence trail's sha256 provably matches what was on screen.
export function renderConsentDoc(ctx: ConsentContext): string {
  return CONSENT_V1_TEMPLATE.replace(/<!--[\s\S]*?-->/g, "")
    .replaceAll("{{trainerName}}", ctx.trainerName)
    .replaceAll("{{businessName}}", ctx.businessName)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Stable sha256 (hex) of the rendered text. Deterministic for a given context —
// the same document always hashes to the same value.
export function consentDocHash(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}
