import { ImageResponse } from "next/og";
import { type NextRequest } from "next/server";

import { parseHex, readableTextOn } from "@supertrainer/ui/lib/contrast";

// Org-branded PWA icon (Phase 2.4). Renders the trainer's logo on their brand
// color, falling back to a letter avatar when there's no logo — so an installed
// home-screen app always looks like the client's coach, never generic.
// Public + cacheable: it encodes only already-public brand fields.
//
// GET /api/icon?size=512&letter=P&color=%237c3aed&logo=<url>

const DEFAULT_COLOR = "#171717";
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const size = Math.min(1024, Math.max(48, Number(searchParams.get("size")) || 512));
  const letter = (searchParams.get("letter") || "S").slice(0, 1).toUpperCase();

  // Only accept a literal hex color — this value lands in a style, so never
  // pass through arbitrary text.
  const raw = searchParams.get("color") ?? DEFAULT_COLOR;
  const color = HEX.test(raw) ? raw : DEFAULT_COLOR;
  const rgb = parseHex(color);
  const onColor = rgb ? readableTextOn(rgb).onColor : "#ffffff";

  // Only render a remote logo from an http(s) URL (the org's public brand asset).
  const logoParam = searchParams.get("logo");
  const logo =
    logoParam && /^https?:\/\//i.test(logoParam) ? logoParam : null;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: color,
        }}
      >
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logo}
            width={Math.round(size * 0.62)}
            height={Math.round(size * 0.62)}
            style={{ objectFit: "contain" }}
            alt=""
          />
        ) : (
          <div
            style={{
              display: "flex",
              fontSize: Math.round(size * 0.5),
              fontWeight: 700,
              color: onColor,
            }}
          >
            {letter}
          </div>
        )}
      </div>
    ),
    {
      width: size,
      height: size,
      headers: { "cache-control": "public, max-age=86400" },
    },
  );
}
