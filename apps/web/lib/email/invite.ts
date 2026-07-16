import "server-only";

import { Resend } from "resend";

import type { BrandConfig } from "@supertrainer/ui/lib/brand";
import { brandSocialLinks } from "@supertrainer/ui/lib/brand";

export interface InviteEmailParams {
  to: string;
  trainerName: string;
  joinUrl: string;
  personalMessage?: string;
  brand?: BrandConfig;
}

// Sends a branded invite email via Resend. No-ops (sent:false) when
// RESEND_API_KEY is unset so copy-link stays the working path in dev/preview.
export async function sendInviteEmail(
  params: InviteEmailParams,
): Promise<{ sent: boolean; reason?: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { sent: false, reason: "no_key" };

  const from = process.env.RESEND_FROM ?? "invites@supertrainer.app";
  const resend = new Resend(key);
  try {
    const { error } = await resend.emails.send({
      from,
      to: params.to,
      subject: `${params.trainerName} invited you to train`,
      html: inviteHtml(params),
    });
    if (error) return { sent: false, reason: error.message };
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: err instanceof Error ? err.message : "send_failed" };
  }
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c,
  );
}

// Branded template: trainer color/logo, personal note, CTA, social footer
// (spec §11 — socials on portal, emails, and plan PDFs).
function inviteHtml(params: InviteEmailParams): string {
  const brand = params.brand ?? {};
  const primary = brand.primaryColor ?? "#171717";
  const logo = brand.logoUrl
    ? `<img src="${esc(brand.logoUrl)}" alt="" width="48" height="48" style="border-radius:8px;object-fit:contain" />`
    : "";
  const note = params.personalMessage
    ? `<p style="color:#444;font-size:15px;line-height:1.5">${esc(params.personalMessage)}</p>`
    : "";
  const socials = brandSocialLinks(brand)
    .map(
      (s) =>
        `<a href="${esc(s.href)}" style="color:#888;text-decoration:none;margin:0 6px;font-size:12px">${esc(s.platform)}</a>`,
    )
    .join("");

  return `<!doctype html><html><body style="margin:0;background:#f6f6f6;font-family:-apple-system,Segoe UI,Roboto,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
    <table width="480" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden">
      <tr><td style="padding:28px 28px 12px">${logo}
        <h1 style="margin:12px 0 4px;font-size:20px;color:#171717">${esc(params.trainerName)} invited you to train</h1>
        <p style="color:#666;font-size:14px">Personalized coaching, powered by AI. Tap below to get started.</p>
        ${note}
        <a href="${esc(params.joinUrl)}" style="display:inline-block;margin-top:12px;background:${esc(primary)};color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;font-size:15px">Accept invite</a>
      </td></tr>
      <tr><td style="padding:16px 28px;border-top:1px solid #eee;text-align:center">
        <span style="color:#999;font-size:12px">${esc(params.trainerName)}</span><br/>${socials}
      </td></tr>
    </table>
  </td></tr></table></body></html>`;
}
