import { Resend } from "resend";

import type { BrandConfig } from "@supertrainer/ui/lib/brand";

// Phase 6.2 — the evening email digest (the bottom of the ladder). Privacy rule
// (spec §6.2): NEVER the full message — only the unread count, a short first-line
// snippet per item, and one deep link back into the app. Truncation is enforced
// HERE at the boundary so no caller can leak a whole message body into an email.

// Each snippet is capped hard; a real coach line is never reproduced in full.
export const SNIPPET_MAX = 48;

export interface DigestItem {
  /** A short label of what's waiting (a reminder copy line, "New message", …). */
  firstLine: string;
}

export interface DigestEmailParams {
  trainerName: string;
  clientName?: string;
  items: DigestItem[];
  portalUrl: string;
  brand?: BrandConfig;
}

export function snippetOf(text: string, max = SNIPPET_MAX): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
}

export function buildDigestEmail(params: DigestEmailParams): { subject: string; html: string } {
  const count = params.items.length;
  const primary = params.brand?.primaryColor ?? "#171717";
  const subject =
    count === 1
      ? `1 update from ${params.trainerName}`
      : `${count} updates from ${params.trainerName}`;

  // Snippets only — truncated at the boundary regardless of what the caller passed.
  const rows = params.items
    .map(
      (it) =>
        `<tr><td style="padding:6px 0;color:#444;font-size:14px;line-height:1.4">• ${esc(snippetOf(it.firstLine))}</td></tr>`,
    )
    .join("");

  const html = `<!doctype html><html><body style="margin:0;background:#f6f6f6;font-family:-apple-system,Segoe UI,Roboto,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
    <table width="480" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden">
      <tr><td style="padding:28px 28px 8px">
        <h1 style="margin:0 0 4px;font-size:18px;color:#171717">You have ${count} unread ${count === 1 ? "update" : "updates"}</h1>
        <p style="color:#666;font-size:14px;margin:0 0 12px">From ${esc(params.trainerName)}. Open the app to catch up${params.clientName ? `, ${esc(params.clientName)}` : ""}.</p>
        <table width="100%" cellpadding="0" cellspacing="0">${rows}</table>
        <a href="${esc(params.portalUrl)}" style="display:inline-block;margin-top:16px;background:${esc(primary)};color:#fff;text-decoration:none;padding:11px 18px;border-radius:8px;font-weight:600;font-size:15px">Open app</a>
      </td></tr>
      <tr><td style="padding:14px 28px;border-top:1px solid #eee;text-align:center">
        <span style="color:#999;font-size:12px">${esc(params.trainerName)}</span>
      </td></tr>
    </table>
  </td></tr></table></body></html>`;

  return { subject, html };
}

// Sends the digest via Resend. No-ops (sent:false) when RESEND_API_KEY is unset —
// the ladder still recorded the escalation; only the email delivery is skipped.
export async function sendDigestEmail(
  to: string,
  params: DigestEmailParams,
): Promise<{ sent: boolean; reason?: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { sent: false, reason: "no_key" };
  const from = process.env.RESEND_FROM ?? "digest@supertrainer.app";
  const { subject, html } = buildDigestEmail(params);
  try {
    const { error } = await new Resend(key).emails.send({ from, to, subject, html });
    return error ? { sent: false, reason: error.message } : { sent: true };
  } catch (err) {
    return { sent: false, reason: err instanceof Error ? err.message : "send_failed" };
  }
}
