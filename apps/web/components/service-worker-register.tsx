"use client";

import * as React from "react";

// Registers the offline-shell service worker (Phase 2.4). A registered SW is one
// of the browser's installability criteria, so this is what makes the portal
// installable — and it's the same registration Phase 6's push handlers ride on.
// Renders nothing.
export function ServiceWorkerRegister() {
  React.useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    // Registration failures are non-fatal — the app works fine without it.
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.warn("[pwa] service worker registration failed:", err);
    });
  }, []);

  return null;
}
