import "server-only";

import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";

import { createServiceClient } from "@/lib/supabase/server";

// Phase 9.3 — hardware-key auth for the platform console.
//
// The relying-party id is the app's own hostname, so an assertion made on a
// phishing domain is worthless. Challenges are single-use rows with a 5-minute
// life, and the authenticator's signature counter is persisted: a cloned key
// replaying an old signature presents a counter that did not advance, and is
// rejected.

const CHALLENGE_MINUTES = 5;

export function rpID(): string {
  const url = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  try {
    return new URL(url).hostname;
  } catch {
    return "localhost";
  }
}

export function expectedOrigin(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
}

async function putChallenge(
  profileId: string,
  challenge: string,
  kind: "register" | "authenticate",
): Promise<void> {
  const service = createServiceClient();
  await service.from("admin_challenges").insert({
    profile_id: profileId,
    challenge,
    kind,
    expires_at: new Date(Date.now() + CHALLENGE_MINUTES * 60_000).toISOString(),
  });
}

/** Take the newest unconsumed challenge of this kind and burn it. */
async function takeChallenge(
  profileId: string,
  kind: "register" | "authenticate",
): Promise<string | null> {
  const service = createServiceClient();
  const { data } = await service
    .from("admin_challenges")
    .select("id, challenge, expires_at")
    .eq("profile_id", profileId)
    .eq("kind", kind)
    .is("consumed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  await service
    .from("admin_challenges")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", data.id);
  if (new Date(data.expires_at).getTime() < Date.now()) return null;
  return data.challenge;
}

export async function registrationOptions(profileId: string, label: string) {
  const service = createServiceClient();
  const { data: existing } = await service
    .from("admin_credentials")
    .select("credential_id, transports")
    .eq("profile_id", profileId);

  const options = await generateRegistrationOptions({
    rpName: "supertrainer platform",
    rpID: rpID(),
    userName: label,
    userDisplayName: label,
    attestationType: "none",
    excludeCredentials: (existing ?? []).map((c) => ({ id: c.credential_id })),
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
    },
  });
  await putChallenge(profileId, options.challenge, "register");
  return options;
}

export async function verifyRegistration(
  profileId: string,
  response: RegistrationResponseJSON,
  nickname: string,
): Promise<boolean> {
  const challenge = await takeChallenge(profileId, "register");
  if (!challenge) return false;

  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge: challenge,
    expectedOrigin: expectedOrigin(),
    expectedRPID: rpID(),
    requireUserVerification: false,
  });
  if (!verification.verified || !verification.registrationInfo) return false;

  const info = verification.registrationInfo;
  const service = createServiceClient();
  const { error } = await service.from("admin_credentials").insert({
    profile_id: profileId,
    credential_id: info.credential.id,
    public_key: bytesToHex(info.credential.publicKey),
    counter: info.credential.counter,
    transports: info.credential.transports ?? [],
    device_type: info.credentialDeviceType,
    backed_up: info.credentialBackedUp,
    nickname,
  });
  return !error;
}

export async function authenticationOptions(profileId: string) {
  const service = createServiceClient();
  const { data: creds } = await service
    .from("admin_credentials")
    .select("credential_id, transports")
    .eq("profile_id", profileId);

  const options = await generateAuthenticationOptions({
    rpID: rpID(),
    allowCredentials: (creds ?? []).map((c) => ({ id: c.credential_id })),
    userVerification: "preferred",
  });
  await putChallenge(profileId, options.challenge, "authenticate");
  return options;
}

export interface AssertionResult {
  ok: boolean;
  credentialRowId?: string;
  reason?: string;
}

export async function verifyAssertion(
  profileId: string,
  response: AuthenticationResponseJSON,
): Promise<AssertionResult> {
  const challenge = await takeChallenge(profileId, "authenticate");
  if (!challenge) return { ok: false, reason: "challenge expired" };

  const service = createServiceClient();
  const { data: cred } = await service
    .from("admin_credentials")
    .select("id, profile_id, credential_id, public_key, counter, transports")
    .eq("credential_id", response.id)
    .maybeSingle();
  // The credential must belong to the caller — never trust the id alone.
  if (!cred || cred.profile_id !== profileId) return { ok: false, reason: "unknown credential" };

  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge: challenge,
    expectedOrigin: expectedOrigin(),
    expectedRPID: rpID(),
    requireUserVerification: false,
    credential: {
      id: cred.credential_id,
      publicKey: hexToBytes(cred.public_key as unknown as string),
      counter: Number(cred.counter),
      transports: (cred.transports ?? []) as never,
    },
  });
  if (!verification.verified) return { ok: false, reason: "assertion rejected" };

  // Replay guard: the counter must advance (0 means the authenticator doesn't
  // keep one, which the spec permits).
  const next = verification.authenticationInfo.newCounter;
  if (next !== 0 && next <= Number(cred.counter)) {
    return { ok: false, reason: "counter did not advance — possible cloned key" };
  }

  await service
    .from("admin_credentials")
    .update({ counter: next, last_used_at: new Date().toISOString() })
    .eq("id", cred.id);
  return { ok: true, credentialRowId: cred.id };
}

// Supabase returns bytea as a \x-prefixed hex string; keep the conversion in one
// place so the round-trip is provably symmetric.
export function bytesToHex(bytes: Uint8Array): string {
  return `\\x${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

export function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const clean = hex.startsWith("\\x") ? hex.slice(2) : hex;
  const out = new Uint8Array(new ArrayBuffer(clean.length / 2));
  for (let i = 0; i < out.length; i += 1) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}
