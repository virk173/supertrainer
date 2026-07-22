"use server";

import { headers } from "next/headers";

import { getOrgTheme } from "@/lib/brand/theme";
import {
  CONSENT_DOC_VERSION,
  consentDocHash,
  renderConsentDoc,
} from "@/lib/consent/doc";
import { deliverConsentPdf } from "@/lib/consent/deliver";
import { renderConsentPdf } from "@/lib/consent/pdf";
import { clientIp } from "@/lib/http/client-ip";
import { getSessionClaims } from "@/lib/onboarding/state";
import { trackServer } from "@/lib/analytics/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export interface RecordConsentResult {
  ok: boolean;
  message?: string;
}

// Records a client's click-wrap consent (Phase 2.3). The signer must be the
// authenticated client; the user agent, document hash, and timestamp are all
// captured server-side. The IP is best-effort trusted-hop evidence (see
// clientIp()) — it favors infra-set headers over client-suppliable ones, but
// no proxy-derived IP is cryptographically unspoofable. Writes go through the
// service role because they also set client-restricted columns
// (consent_signed_at/hash).
export async function recordConsent(
  signedName: string,
): Promise<RecordConsentResult> {
  const { orgId, userId, role } = await getSessionClaims();
  if (!orgId || !userId || role !== "client") {
    return { ok: false, message: "Please sign in as a client to continue." };
  }

  const name = signedName.trim().slice(0, 120);
  if (name.length < 2) return { ok: false, message: "Type your full name to sign." };

  const theme = await getOrgTheme(orgId);
  const trainerName = theme?.name ?? "Your coach";
  const businessName = theme?.name ?? "Your coach";

  const service = createServiceClient();
  const { data: client } = await service
    .from("clients")
    .select("id")
    .eq("profile_id", userId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!client) return { ok: false, message: "We couldn't find your client record." };

  // Canonical text + hash — the exact document shown on screen.
  const docText = renderConsentDoc({ trainerName, businessName });
  const docSha256 = consentDocHash(docText);

  const hdrs = await headers();
  const ip = clientIp(hdrs);
  const userAgent = hdrs.get("user-agent") || null;
  const signedAt = new Date().toISOString();

  const { error: consentError } = await service.from("consents").insert({
    org_id: orgId,
    client_id: client.id,
    doc_version: CONSENT_DOC_VERSION,
    doc_sha256: docSha256,
    signed_name: name,
    signed_at: signedAt,
    ip,
    user_agent: userAgent,
  });
  if (consentError) {
    return { ok: false, message: "Couldn't record your consent — please try again." };
  }

  // Denormalized flags the portal guard reads (service role — these are
  // client-restricted columns). consent_doc_version drives the PO-3 re-sign gate:
  // it records which version this signature satisfies. On a re-sign it advances to
  // the current version while the consents row above preserves the full history.
  await service
    .from("clients")
    .update({
      consent_signed_at: signedAt,
      consent_doc_hash: docSha256,
      consent_doc_version: CONSENT_DOC_VERSION,
    })
    .eq("id", client.id);

  // PDF copy → storage + email. Best-effort; never blocks the client.
  try {
    const { data: userData } = await (await createClient()).auth.getUser();
    const pdf = await renderConsentPdf({
      trainerName,
      businessName,
      docText,
      signedName: name,
      signedAt,
      docVersion: CONSENT_DOC_VERSION,
      docSha256,
      ip,
    });
    await deliverConsentPdf({
      orgId,
      clientId: client.id,
      email: userData.user?.email ?? null,
      trainerName,
      version: CONSENT_DOC_VERSION,
      pdf,
    });
  } catch (err) {
    console.error("[consent] pdf/delivery failed (consent still recorded):", err);
  }

  await trackServer({
    orgId,
    event: "consent_signed",
    clientId: client.id,
    properties: { doc_version: CONSENT_DOC_VERSION },
  });

  return { ok: true };
}
