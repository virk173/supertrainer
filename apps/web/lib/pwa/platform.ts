// Platform + install detection for the notification walkthrough (Phase 2.4).
// The pure functions take their inputs explicitly so the logic is unit-testable
// without a browser; the thin wrappers below read the real environment.

export type Platform = "ios" | "android" | "desktop";

// iOS only allows web push from an INSTALLED PWA (16.4+), which is why the iOS
// branch of the walkthrough has to teach Add-to-Home-Screen before it can even
// ask for permission. iPadOS 13+ lies and reports "Macintosh", so touch points
// are the tell.
export function detectPlatform(ua: string, maxTouchPoints = 0): Platform {
  const s = (ua || "").toLowerCase();
  if (/iphone|ipod|ipad/.test(s)) return "ios";
  if (/macintosh/.test(s) && maxTouchPoints > 1) return "ios";
  if (/android/.test(s)) return "android";
  return "desktop";
}

// True when the page is running as an installed app. Android/desktop expose
// display-mode: standalone; iOS Safari only sets navigator.standalone.
export function isStandaloneFrom(opts: {
  displayModeStandalone: boolean;
  iosStandalone?: boolean;
}): boolean {
  return opts.displayModeStandalone || opts.iosStandalone === true;
}

export function detectPlatformFromBrowser(): Platform {
  if (typeof navigator === "undefined") return "desktop";
  return detectPlatform(navigator.userAgent, navigator.maxTouchPoints ?? 0);
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return isStandaloneFrom({
    displayModeStandalone:
      window.matchMedia?.("(display-mode: standalone)")?.matches ?? false,
    iosStandalone:
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true,
  });
}

// Web push needs the VAPID public key as a BufferSource applicationServerKey.
// Backed by a real ArrayBuffer (not the generic ArrayBufferLike) so it satisfies
// BufferSource — a bare Uint8Array could be SharedArrayBuffer-backed.
export function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized);
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}
