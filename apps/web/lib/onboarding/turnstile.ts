// Cloudflare Turnstile verification for the public teaser endpoint (Phase 2.1).
// The teaser will drive paid AI calls (P2.2), so the submit endpoint is bot-
// gated. Follows the project convention that integrations no-op without keys:
// when TURNSTILE_SECRET_KEY is unset (dev/preview/CI) verification is skipped
// and reported as unconfigured, so the funnel still works locally. In prod the
// key is set and a missing/invalid token is rejected.
//
// Not marked "server-only": it only reads an env secret and calls fetch (no DB
// imports), so the funnel e2e can import it and stub fetch to cover the failure
// path deterministically without live Cloudflare keys.

const SITEVERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export interface TurnstileResult {
  /** Whether the submission may proceed. */
  ok: boolean;
  /** False when no secret key is set (dev/preview) — verification was skipped. */
  configured: boolean;
}

export async function verifyTurnstile(
  token: string | null | undefined,
  remoteIp?: string | null,
): Promise<TurnstileResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  // Unconfigured: skip verification so local/preview/CI funnels work. The lead
  // records turnstile_verified=false so prod can tell verified from skipped.
  if (!secret) return { ok: true, configured: false };

  // Configured but no token → a real client always sends one; reject.
  if (!token) return { ok: false, configured: true };

  try {
    const body = new URLSearchParams({ secret, response: token });
    if (remoteIp) body.set("remoteip", remoteIp);

    const res = await fetch(SITEVERIFY_URL, { method: "POST", body });
    const data = (await res.json()) as { success?: boolean };
    return { ok: data.success === true, configured: true };
  } catch {
    // Network error verifying — fail closed (do not let bots through on a blip).
    return { ok: false, configured: true };
  }
}
