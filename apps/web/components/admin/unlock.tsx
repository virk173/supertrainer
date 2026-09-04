"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Loader2 } from "lucide-react";

import { Button } from "@supertrainer/ui/components/button";
import { Input } from "@supertrainer/ui/components/input";

import {
  beginRegisterKey,
  beginUnlock,
  finishRegisterKey,
  finishUnlock,
} from "@/app/admin/actions";

// Phase 9.3 — the console door. A password would be the wrong instrument here:
// this one session can read every org's data, so the second factor is a physical
// object you have to be holding.

export function AdminUnlock({ hasCredential }: { hasCredential: boolean }) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [nickname, setNickname] = React.useState("");

  async function unlock() {
    setPending(true);
    setError(null);
    try {
      const { startAuthentication } = await import("@simplewebauthn/browser");
      const options = await beginUnlock();
      if (!options.ok) throw new Error(options.message ?? "Not available.");
      const assertion = await startAuthentication({
        optionsJSON: options.data as Parameters<typeof startAuthentication>[0]["optionsJSON"],
      });
      const res = await finishUnlock(assertion);
      if (!res.ok) throw new Error(res.message ?? "That key wasn’t accepted.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn’t work.");
    } finally {
      setPending(false);
    }
  }

  async function register() {
    setPending(true);
    setError(null);
    try {
      const { startRegistration } = await import("@simplewebauthn/browser");
      const label = nickname.trim() || "Security key";
      const options = await beginRegisterKey(label);
      if (!options.ok) throw new Error(options.message ?? "Not available.");
      const attestation = await startRegistration({
        optionsJSON: options.data as Parameters<typeof startRegistration>[0]["optionsJSON"],
      });
      const res = await finishRegisterKey(attestation, label);
      if (!res.ok) throw new Error(res.message ?? "That key couldn’t be registered.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn’t work.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="space-y-5 rounded-md border bg-surface-raised p-6" data-testid="admin-unlock">
      <div className="space-y-1">
        <h1 className="text-lg font-semibold tracking-tight">Platform console</h1>
        <p className="text-sm text-muted-foreground">
          {hasCredential
            ? "Touch your security key to unlock. The console re-locks after 30 minutes."
            : "Register a security key to use this console. Nothing here opens without one."}
        </p>
      </div>

      {error ? (
        <p className="rounded-md border border-danger bg-danger/10 p-3 text-sm" role="alert">
          {error}
        </p>
      ) : null}

      {hasCredential ? (
        <Button onClick={unlock} disabled={pending} data-testid="admin-unlock-button">
          {pending ? <Loader2 className="animate-spin" /> : <KeyRound />}
          Unlock with security key
        </Button>
      ) : (
        <div className="space-y-3">
          <label htmlFor="key-nickname" className="block text-sm font-medium">
            Name this key
          </label>
          <Input
            id="key-nickname"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="YubiKey on my keyring"
            autoComplete="off"
          />
          <Button onClick={register} disabled={pending} data-testid="admin-register-button">
            {pending ? <Loader2 className="animate-spin" /> : <KeyRound />}
            Register this key
          </Button>
        </div>
      )}
    </section>
  );
}
