import { ImageResponse } from "next/og";

// Phase 9.5 — the social card. Deliberately typographic and monochrome: the
// same austerity as the site, which is the point of difference in a category of
// gradient screenshots.

export const runtime = "edge";
export const alt = "supertrainer — an AI that coaches like you, not instead of you";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#0B0B0C",
          color: "#FAFAFA",
          padding: 72,
          fontFamily: "sans-serif",
        }}
      >
        {/* Satori needs an explicit display on every element with more than one
            child, and it has no line-break element — each line is its own div. */}
        <div style={{ display: "flex", fontSize: 26, letterSpacing: 2, opacity: 0.6 }}>
          SUPERTRAINER
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 76, fontWeight: 700, letterSpacing: -2 }}>
            An AI that coaches like you —
          </div>
          <div style={{ display: "flex", fontSize: 76, fontWeight: 700, letterSpacing: -2 }}>
            not instead of you.
          </div>
          <div style={{ display: "flex", fontSize: 30, opacity: 0.65, marginTop: 24 }}>
            It learns your method. It drafts. You approve.
          </div>
        </div>
        <div style={{ display: "flex", fontSize: 24, opacity: 0.5 }}>
          Everything included · priced by client count
        </div>
      </div>
    ),
    size,
  );
}
