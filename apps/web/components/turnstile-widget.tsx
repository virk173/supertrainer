"use client";

import * as React from "react";

// Cloudflare Turnstile widget for the teaser form (Phase 2.1). No-ops when
// NEXT_PUBLIC_TURNSTILE_SITE_KEY is unset (dev/preview/CI) — it signals "ready"
// with an empty token so the funnel still works locally; the server treats an
// unconfigured verify as skipped. In prod the widget renders and reports a
// real token, which the submit action verifies server-side.

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        opts: {
          sitekey: string;
          callback: (token: string) => void;
          "error-callback"?: () => void;
          "expired-callback"?: () => void;
        },
      ) => string;
      remove: (id: string) => void;
    };
  }
}

const SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

export function TurnstileWidget({
  onVerify,
}: {
  onVerify: (token: string) => void;
}) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const ref = React.useRef<HTMLDivElement>(null);
  const onVerifyRef = React.useRef(onVerify);
  onVerifyRef.current = onVerify;

  React.useEffect(() => {
    // Unconfigured → mark ready immediately with an empty token.
    if (!siteKey) {
      onVerifyRef.current("");
      return;
    }

    let widgetId: string | undefined;
    let cancelled = false;

    const render = () => {
      if (cancelled || !ref.current || !window.turnstile) return;
      widgetId = window.turnstile.render(ref.current, {
        sitekey: siteKey,
        callback: (token) => onVerifyRef.current(token),
        "error-callback": () => onVerifyRef.current(""),
        "expired-callback": () => onVerifyRef.current(""),
      });
    };

    if (window.turnstile) {
      render();
    } else {
      const existing = document.querySelector<HTMLScriptElement>(
        `script[src="${SCRIPT_SRC}"]`,
      );
      if (existing) {
        existing.addEventListener("load", render);
      } else {
        const script = document.createElement("script");
        script.src = SCRIPT_SRC;
        script.async = true;
        script.defer = true;
        script.addEventListener("load", render);
        document.head.appendChild(script);
      }
    }

    return () => {
      cancelled = true;
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [siteKey]);

  if (!siteKey) return null;
  return <div ref={ref} className="flex justify-center" data-testid="turnstile" />;
}
