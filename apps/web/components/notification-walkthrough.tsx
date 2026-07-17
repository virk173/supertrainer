"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Bell, Plus, Share, SquarePlus } from "lucide-react";

import { Button } from "@supertrainer/ui/components/button";

import {
  enablePush,
  markInstalled,
  skipPush,
  type PushSubscriptionInput,
} from "@/app/(app)/welcome/notifications/actions";
import {
  detectPlatformFromBrowser,
  isStandalone,
  urlBase64ToUint8Array,
  type Platform,
} from "@/lib/pwa/platform";

// Chrome fires this before offering its own install UI; capturing it lets us
// present the install as part of the coaching story instead of a browser banner.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function NotificationWalkthrough({ trainerName }: { trainerName: string }) {
  const router = useRouter();
  const [mounted, setMounted] = React.useState(false);
  const [platform, setPlatform] = React.useState<Platform>("desktop");
  const [standalone, setStandalone] = React.useState(false);
  const [installEvent, setInstallEvent] = React.useState<BeforeInstallPromptEvent | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Detect after mount — platform/standalone don't exist during SSR, and
  // branching on them server-side would hydrate-mismatch.
  React.useEffect(() => {
    const p = detectPlatformFromBrowser();
    const s = isStandalone();
    setPlatform(p);
    setStandalone(s);
    setMounted(true);
    // Returning here already installed is the iOS "did it work?" signal.
    if (s) void markInstalled(p);
  }, []);

  React.useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setStandalone(true);
      void markInstalled(detectPlatformFromBrowser());
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function subscribe(): Promise<PushSubscriptionInput | null> {
    const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapid || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      return null;
    }
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapid),
      });
      const json = sub.toJSON();
      return {
        endpoint: json.endpoint ?? "",
        keys: (json.keys ?? {}) as Record<string, string>,
        platform,
      };
    } catch {
      return null; // permission granted but subscribing failed — email fallback
    }
  }

  async function enable() {
    setBusy(true);
    setError(null);
    try {
      if (typeof Notification === "undefined") {
        await skipPush("denied");
        router.push("/portal");
        return;
      }
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        await skipPush("denied");
        router.push("/portal");
        return;
      }
      const sub = await subscribe();
      const result = await enablePush(sub);
      if (!result.ok) {
        setBusy(false);
        setError(result.message ?? "Couldn't turn on notifications.");
        return;
      }
      router.push("/portal");
    } catch {
      setBusy(false);
      setError("Couldn't turn on notifications.");
    }
  }

  async function skip() {
    setBusy(true);
    await skipPush("skipped");
    router.push("/portal");
  }

  async function install() {
    if (!installEvent) return;
    await installEvent.prompt();
    const { outcome } = await installEvent.userChoice;
    if (outcome === "accepted") {
      setStandalone(true);
      void markInstalled(platform);
    }
    setInstallEvent(null);
  }

  // iOS can't even ask for push until the app is installed to the Home Screen.
  const iosNeedsInstall = platform === "ios" && !standalone;

  return (
    <div className="flex flex-1 flex-col" data-testid="notif-walkthrough">
      <SampleNotification trainerName={trainerName} />

      {!mounted ? (
        <p className="mt-6 text-sm text-muted-foreground">Loading…</p>
      ) : iosNeedsInstall ? (
        <div className="mt-6 space-y-4" data-testid="ios-steps">
          <p className="text-sm text-muted-foreground">
            On iPhone, {trainerName} can only reach you once this is added to your
            Home Screen. It takes two taps:
          </p>
          <ol className="space-y-3">
            <Step icon={<Share className="size-4" />} n={1}>
              Tap the <strong>Share</strong> button in Safari&apos;s toolbar.
            </Step>
            <Step icon={<SquarePlus className="size-4" />} n={2}>
              Choose <strong>Add to Home Screen</strong>, then <strong>Add</strong>.
            </Step>
            <Step icon={<Bell className="size-4" />} n={3}>
              Open the new icon and turn on notifications.
            </Step>
          </ol>
          <p className="text-xs text-muted-foreground">
            Already added it? Open the app from your Home Screen — we&apos;ll pick
            up right here.
          </p>
          <Button
            type="button"
            variant="ghost"
            className="w-full"
            onClick={skip}
            disabled={busy}
            data-testid="skip-push"
          >
            I&apos;ll do this later
          </Button>
        </div>
      ) : (
        <div className="mt-6 space-y-3" data-testid="enable-step">
          {platform === "android" && installEvent && (
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={install}
              data-testid="install-app"
            >
              <Plus className="size-4" /> Add {trainerName} to your home screen
            </Button>
          )}

          <Button
            type="button"
            className="w-full"
            onClick={enable}
            disabled={busy}
            data-testid="enable-push"
          >
            {busy ? "Setting up…" : "Turn on notifications"}
          </Button>

          {error && (
            <p className="text-sm text-danger" data-testid="notif-error" role="alert">
              {error}
            </p>
          )}

          <Button
            type="button"
            variant="ghost"
            className="w-full"
            onClick={skip}
            disabled={busy}
            data-testid="skip-push"
          >
            Not now
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Skip and you&apos;ll only get an email digest — check-in nudges and
            {" "}{trainerName}&apos;s replies won&apos;t reach your phone.
          </p>
        </div>
      )}
    </div>
  );
}

function Step({
  n,
  icon,
  children,
}: {
  n: number;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-start gap-3">
      <span
        className="flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
        style={{
          background: "var(--brand-primary, var(--color-primary))",
          color: "var(--brand-on-primary, var(--color-primary-foreground))",
        }}
      >
        {n}
      </span>
      <span className="flex items-center gap-2 text-sm">
        {icon}
        <span>{children}</span>
      </span>
    </li>
  );
}

// "This is how {trainer} reaches you" — a realistic preview of the notification
// they're being asked to allow.
function SampleNotification({ trainerName }: { trainerName: string }) {
  return (
    <div className="rounded-xl border bg-surface p-3 shadow-sm" data-testid="sample-notification">
      <div className="flex items-start gap-3">
        <span
          className="flex size-9 shrink-0 items-center justify-center rounded-lg text-sm font-semibold"
          style={{
            background: "var(--brand-primary, var(--color-primary))",
            color: "var(--brand-on-primary, var(--color-primary-foreground))",
          }}
        >
          {trainerName.slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium">{trainerName}</p>
          <p className="text-sm text-muted-foreground">
            Nice work on today&apos;s session 💪 Don&apos;t forget to log dinner —
            I&apos;ll check your week tomorrow.
          </p>
        </div>
        <span className="metric-label ml-auto shrink-0 text-muted-foreground">now</span>
      </div>
    </div>
  );
}
