# Security review — Phase 9

Adversarial pass over everything Phase 9 added: data export/deletion, the
platform console, the referral engine, the public site, and custom domains.
Reviewed against the Phase 8 baseline `7482260`.

## Method

- Read every new server action, route handler and library for the three things
  that actually go wrong in this codebase: **tenancy** (service-role code that
  forgets `org_id`), **authorisation** (a check that runs in one entry point but
  not another), and **fail-open** (a missing credential that degrades into
  permission rather than refusal).
- Wrote the attack down as a test rather than a note, wherever it could be:
  `tests/e2e/tenancy-attack.spec.ts` signs a real trainer in, takes their real
  access token, and attacks every org-scoped table in the registry directly
  through the API — reads, writes, tenancy hop, and privilege escalation. It
  carries a positive control, so it cannot pass vacuously.
- Built the production client bundle and scanned every byte a browser downloads
  for the VALUES of server-only secrets, not just their names
  (`scripts/scan-client-bundle.mjs`, proven against a planted secret).

## Findings

### 1. Key registration re-checks elevation — FIXED
`beginRegisterKey` requires an elevation before adding a SECOND hardware key
(the first has nothing to elevate with). `finishRegisterKey` relied on that
check having happened upstream: without a matching challenge the call fails
anyway, so it was not exploitable — but "the other function checked" is exactly
the assumption a refactor breaks. The check is now duplicated in the finishing
action.

### 2. Bootstrap allowlist is a standing key — ACCEPTED, DOCUMENTED
`PLATFORM_ADMIN_EMAILS` promotes a signed-in user into `platform_admins` on
sight. That is the only way to create the first operator on a fresh deployment,
and it is gated on an env var that is empty in normal operation. **The launch
runbook requires emptying it after the first key is registered.** While it is
set, someone who compromises that mailbox and passes the magic-link flow becomes
a listed admin — but still cannot open the console without a physical
authenticator.

### 3. Everything else in the console is elevation-gated — VERIFIED
Every mutating action calls `requireElevated()` before touching anything, and
`adminIdentity()` re-derives both facts (listed admin, live elevation) from the
database on every request. The elevation cookie holds an opaque id, is
`httpOnly` + `SameSite=Strict`, scoped to `/admin`, and is verified server-side
against `admin_sessions` for owner, expiry and revocation. Nothing trusts a
value the browser sends beyond that id.

### 4. WebAuthn implementation — VERIFIED
Challenges are single-use rows with a 5-minute life, consumed before the expiry
check (so a burned challenge is burned either way). The credential is looked up
by id and then **checked to belong to the caller** — an assertion signed by
someone else's registered key is rejected before verification. The signature
counter is persisted and must advance, so a cloned authenticator replaying an
old assertion fails. RP ID is derived from the app's own origin, so an assertion
harvested on a phishing domain is worthless.

### 5. Read-only support view — VERIFIED BY DESIGN
"View as" does not swap sessions or mint a token for another org. It records a
row with a stated reason, shows a banner, and renders SHAPE (client count,
statuses, stuck events) — never message bodies, health flags or plan contents.
The view is written to **the org's own `audit_log`** and `impersonation_sessions`
is marked exported in the data registry, so a trainer can see who looked at
their workspace and why, in their own export. Least privilege plus a receipt.

### 6. Platform tables are invisible to API roles — VERIFIED (pgTAP)
All ten console tables have RLS on and **no grant to `anon`/`authenticated`**.
`rls_platform_admin_test.sql` asserts a fully-authenticated OWNER reads zero
rows from every one of them, cannot insert themselves into `platform_admins`,
cannot forge an elevation, and cannot rewrite the AI spend ledger.

### 7. Export cannot cross a tenancy line — VERIFIED
`buildArchive` scopes every table read by `org_id` (and `client_id` for a
client-scoped export) from the registry, and `clientExportSpecs()` includes only
client-scoped tables — a client's export can never contain org-wide or another
client's rows, asserted in `data-registry.spec.ts`. `signedExportUrl` re-checks
the job's `org_id` in code because the service role bypasses RLS, and the portal
download re-checks `client_id` the same way. Links are signed and expire in 24h;
the sweep then marks the job expired.

### 8. Deletion cannot be weaponised — VERIFIED
A deletion request opens a 30-day window and only the worker executes it. An ORG
purge REFUSES to run without a ready final archive. `push_subscriptions` is
excluded from exports (credential-shaped), and `audit_log` is anonymised rather
than dropped so the record that a deletion happened survives it.

### 9. Referral credit cannot be minted — VERIFIED
`referrals` and `referral_codes` grant only SELECT to authenticated, scoped to
the referrer's own org; every write is service-role. A trainer cannot insert a
`credited` row or upgrade a pending one (`rls_referrals_test.sql` tries both).
Credit requires the referred org to have completed onboarding AND to have a
paying, non-demo client, with self-referral, circular pairs and a monthly cap
rejected first.

### 10. Custom domains cannot hijack traffic — VERIFIED
`custom_domains` grants only SELECT to staff of the owning org; ALL writes are
service-role, so a trainer cannot insert `status='active'` for a hostname they
do not control. `connectDomain` refuses a domain already attached to another
org, and refuses the platform domain and its subdomains outright. Only an
ACTIVE row resolves in `/d/[host]`; a half-verified record serves nothing
(`domains.spec.ts`).

### 11. Public endpoints — REVIEWED
| Endpoint | Control |
|---|---|
| Teaser (`/c/[slug]/start`) | Per-email, per-org/day and per-IP/day limits (Phase 2), Turnstile, email normalisation against +tag and dot tricks |
| Referral (`/r/[code]`) | **Added**: 30/min per source, in-memory. A code only sets an attribution cookie; the limiter exists so enumeration is 429s instead of database load |
| Invite claim (`/join/[token]`) | 192 bits of token entropy — brute force is not the threat model; single-use on claim |
| Stripe webhook | Signature verification, fail-closed without the secret. **Deliberately NOT rate limited**: dropping a legitimate retry is worse than the load, and an unsigned request is already rejected |
| Cron routes | `CRON_SECRET` bearer, fail-closed (503 without the secret, 401 without the header) |
| Custom-domain resolution (`/d/[host]`) | DB lookup only for ACTIVE domains; middleware does not query per request |

The referral limiter is honest about being per-instance and best-effort — it is
defence in depth, not the primary control for anything.

### 12. No secret material in the client bundle — VERIFIED
87 client files scanned for the values of twelve server-only env vars plus seven
secret shapes (service-role JWT, `sb_secret_`, `sk_live_`/`sk_test_`, `whsec_`,
`sk-ant-`, private-key blocks). Clean. The scanner is now a CI job, and it was
proven against a deliberately planted key before being trusted.

## Residual risks, stated plainly

- **The bootstrap allowlist** (finding 2) while it is set.
- **The referral limiter is per-instance.** A distributed enumeration would get
  through it; the consequence is a discovered referral code, worth an
  attribution cookie.
- **Platform prices are placeholders** in `lib/marketing/pricing.ts`. Not a
  security issue; a launch-blocking correctness one.
- **No SOC 2.** The `/security` page says so rather than implying otherwise.
- **Legal review is outstanding** (`docs/legal-review-checklist.md`) — blocking
  for real clients.
