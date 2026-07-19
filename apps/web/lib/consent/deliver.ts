import "server-only";

import { Resend } from "resend";

import { createServiceClient } from "@/lib/supabase/server";

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c,
  );
}

// Stores the signed consent PDF to the private 'consents' bucket and emails the
// client a copy. Best-effort: a storage/email failure is logged, never thrown —
// the consent record itself is already committed, so delivery must not block the
// client. Email no-ops without RESEND_API_KEY (dev/preview).
export async function deliverConsentPdf(params: {
  orgId: string;
  clientId: string;
  email: string | null;
  trainerName: string;
  version: string;
  pdf: Buffer;
}): Promise<void> {
  try {
    const service = createServiceClient();
    await service.storage
      .from("consents")
      .upload(`${params.orgId}/${params.clientId}/consent-${params.version}.pdf`, params.pdf, {
        contentType: "application/pdf",
        upsert: true,
      });
  } catch (err) {
    console.error("[consent] pdf store failed:", err);
  }

  const key = process.env.RESEND_API_KEY;
  if (!key || !params.email) return;
  try {
    const from = process.env.RESEND_FROM ?? "coaching@supertrainer.app";
    const resend = new Resend(key);
    await resend.emails.send({
      from,
      to: params.email,
      subject: `Your coaching agreement with ${params.trainerName}`,
      html: `<p>Attached is a copy of the coaching agreement you signed with ${esc(
        params.trainerName,
      )}. Keep it for your records.</p>`,
      attachments: [
        { filename: `coaching-consent-${params.version}.pdf`, content: params.pdf },
      ],
    });
  } catch (err) {
    console.error("[consent] email failed:", err);
  }
}
