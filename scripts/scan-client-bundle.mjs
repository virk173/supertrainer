#!/usr/bin/env node
// Phase 9.6 — the secrets audit, as a check rather than a habit.
//
// Next inlines any literal `process.env.NEXT_PUBLIC_*` into the browser bundle.
// The failure mode this catches is a server-only secret being read in a module
// that is (or later becomes) client-reachable — a one-word mistake that ships
// a service-role key to every visitor. So: build, then read every byte the
// browser would download and look for the actual secret VALUES from the
// environment, not just their names.
//
// Usage: node scripts/scan-client-bundle.mjs [--build-dir .next-scan]

import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const args = process.argv.slice(2);
const dirArg = args.indexOf("--build-dir");
const buildDir = dirArg >= 0 ? args[dirArg + 1] : ".next";
const root = resolve(process.cwd(), "apps/web", buildDir);

if (!existsSync(root)) {
  console.error(`No build at ${root}. Run the build first (NEXT_DIST_DIR=${buildDir} npm run build).`);
  process.exit(2);
}

/** Env vars whose VALUE must never appear in anything the browser downloads. */
const SECRET_ENV = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "ANTHROPIC_API_KEY",
  "CRON_SECRET",
  "VERCEL_API_TOKEN",
  "RESEND_API_KEY",
  "LANGFUSE_SECRET_KEY",
  "VAPID_PRIVATE_KEY",
  "SENTRY_AUTH_TOKEN",
  "TURNSTILE_SECRET_KEY",
  "CALCOM_API_KEY",
];

/** Shapes that are a secret whoever owns them. */
const SECRET_PATTERNS = [
  { name: "Supabase service-role JWT", re: /"role"\s*:\s*"service_role"/ },
  { name: "Supabase secret key", re: /\bsb_secret_[A-Za-z0-9_-]{10,}/ },
  { name: "Stripe live secret key", re: /\bsk_live_[A-Za-z0-9]{10,}/ },
  { name: "Stripe test secret key", re: /\bsk_test_[A-Za-z0-9]{10,}/ },
  { name: "Stripe webhook secret", re: /\bwhsec_[A-Za-z0-9]{16,}/ },
  { name: "Anthropic API key", re: /\bsk-ant-[A-Za-z0-9-]{16,}/ },
  { name: "Private key block", re: /-----BEGIN (RSA |EC )?PRIVATE KEY-----/ },
];

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) out.push(...walk(full));
    else if (/\.(js|mjs|css|map|json|html|txt)$/.test(entry)) out.push(full);
  }
  return out;
}

// Only what a browser can actually fetch: the static chunk output.
const clientRoots = [join(root, "static")].filter((d) => existsSync(d));
if (clientRoots.length === 0) {
  console.error(`No static output under ${root} — did the build finish?`);
  process.exit(2);
}

// Load apps/web/.env.local so the VALUE checks are real when run locally; in CI
// the values arrive as process env.
const envFile = resolve(process.cwd(), "apps/web/.env.local");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, "$2");
    }
  }
}

const files = clientRoots.flatMap(walk);
const values = SECRET_ENV.map((name) => ({ name, value: process.env[name] }))
  .filter((e) => e.value && e.value.length >= 12);

const findings = [];
for (const file of files) {
  const text = readFileSync(file, "utf8");
  for (const { name, value } of values) {
    if (text.includes(value)) findings.push({ file, what: `value of ${name}` });
  }
  for (const { name, re } of SECRET_PATTERNS) {
    const match = text.match(re);
    if (match) findings.push({ file, what: name, sample: match[0].slice(0, 12) });
  }
}

const scanned = files.length;
if (findings.length > 0) {
  console.error(`\n✗ Secret material in the client bundle (${scanned} files scanned):\n`);
  for (const f of findings) {
    console.error(`  ${f.file.replace(root, buildDir)}\n    → ${f.what}${f.sample ? ` (${f.sample}…)` : ""}`);
  }
  console.error("\nA server-only value is being read from a client-reachable module.\n");
  process.exit(1);
}

console.log(`✓ No secret material in ${scanned} client files (${values.length} env values + ${SECRET_PATTERNS.length} patterns checked).`);
