import "server-only";

// Phase 9.5 — the Vercel Domains API, behind an injectable transport.
//
// Two rules make this safe to depend on:
//   1. it is CONFIGURED or it is OFF — with no token the module reports "not
//      configured" instead of half-working, so a preview deployment can't add
//      domains to the production project by accident, and
//   2. the transport is injectable, so the merge gate never makes a live call.

export interface VercelDnsRecord {
  type: string;
  domain: string;
  value: string;
  reason?: string;
}

export interface DomainState {
  configured: boolean;
  verified: boolean;
  records: VercelDnsRecord[];
  error?: string;
}

type Fetcher = typeof fetch;

let transport: Fetcher | null = null;

/** Tests inject a transport; production uses global fetch. */
export function setDomainTransportForTests(fetcher: Fetcher | null): void {
  transport = fetcher;
}

function fetcher(): Fetcher {
  return transport ?? fetch;
}

export function isDomainsConfigured(): boolean {
  return Boolean(process.env.VERCEL_API_TOKEN && process.env.VERCEL_PROJECT_ID);
}

function apiBase(path: string): string {
  const team = process.env.VERCEL_TEAM_ID;
  const query = team ? `?teamId=${encodeURIComponent(team)}` : "";
  return `https://api.vercel.com${path}${query}`;
}

async function call(
  path: string,
  init: RequestInit,
): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> {
  const res = await fetcher()(apiBase(path), {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      authorization: `Bearer ${process.env.VERCEL_API_TOKEN}`,
      "content-type": "application/json",
    },
  });
  let body: Record<string, unknown> = {};
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    // an empty body is fine for a 204
  }
  return { ok: res.ok, status: res.status, body };
}

function projectPath(suffix = ""): string {
  return `/v10/projects/${encodeURIComponent(process.env.VERCEL_PROJECT_ID ?? "")}/domains${suffix}`;
}

function readRecords(body: Record<string, unknown>): VercelDnsRecord[] {
  const raw = (body.verification ?? []) as unknown[];
  return raw
    .filter((r): r is Record<string, unknown> => typeof r === "object" && r !== null)
    .map((r) => ({
      type: String(r.type ?? "TXT"),
      domain: String(r.domain ?? ""),
      value: String(r.value ?? ""),
      reason: r.reason ? String(r.reason) : undefined,
    }));
}

/** Attach a domain to the project. Returns the DNS records the coach must add. */
export async function addDomain(domain: string): Promise<DomainState> {
  if (!isDomainsConfigured()) return { configured: false, verified: false, records: [] };

  const { ok, body } = await call(projectPath(), {
    method: "POST",
    body: JSON.stringify({ name: domain }),
  });
  if (!ok) {
    const error = (body.error ?? {}) as { message?: string; code?: string };
    // Already attached is not a failure — the coach is retrying, and the state
    // they need is the verification status, which the next call returns.
    if (error.code !== "domain_already_in_use" && error.code !== "domain_taken") {
      return {
        configured: true,
        verified: false,
        records: [],
        error: error.message ?? "Vercel rejected that domain.",
      };
    }
  }
  return domainState(domain);
}

/** Current verification state for a domain already attached to the project. */
export async function domainState(domain: string): Promise<DomainState> {
  if (!isDomainsConfigured()) return { configured: false, verified: false, records: [] };

  const { ok, status, body } = await call(`${projectPath()}/${encodeURIComponent(domain)}`, {
    method: "GET",
  });
  if (!ok) {
    return {
      configured: true,
      verified: false,
      records: [],
      error: status === 404 ? "That domain isn’t attached yet." : "Couldn’t read the domain status.",
    };
  }
  return {
    configured: true,
    verified: Boolean(body.verified),
    records: readRecords(body),
  };
}

export async function removeDomain(domain: string): Promise<{ ok: boolean }> {
  if (!isDomainsConfigured()) return { ok: false };
  const { ok } = await call(`${projectPath()}/${encodeURIComponent(domain)}`, { method: "DELETE" });
  return { ok };
}
