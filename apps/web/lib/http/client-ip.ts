// Shared "trusted hop" IP resolution for anything that treats the client IP
// as evidence (rate limiting, bot verification, consent evidence) rather than
// as a cosmetic display value.
//
// The leftmost X-Forwarded-For entry is appended by the ORIGINATING CLIENT,
// not a proxy — a caller can send `X-Forwarded-For: 1.2.3.4` and have it
// echoed back as if it were their real address. Only hops added by infra we
// control are trustworthy: Vercel's single-value `x-real-ip` (set at the
// edge, never client-overridable), or, failing that, the RIGHTMOST XFF hop
// (the one closest to our own trusted proxy, appended last). Never read the
// leftmost hop for anything that needs to resist spoofing.
export function clientIp(hdrs: Headers): string | null {
  return (
    hdrs.get("x-real-ip")?.trim() ||
    hdrs.get("x-forwarded-for")?.split(",").pop()?.trim() ||
    null
  );
}
