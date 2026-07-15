"use client";

// Last-resort boundary: only fires when the root layout itself throws, so it
// replaces <html>/<body> and cannot rely on globals.css — styles are inline.
// Phase 0.5 wires reportError() here for Sentry.
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          minHeight: "100vh",
          margin: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
          background: "#fff",
          color: "#0a0a0a",
        }}
      >
        <div style={{ maxWidth: "24rem", textAlign: "center", padding: "2rem" }}>
          <h1 style={{ fontSize: "1rem", fontWeight: 600 }}>
            Something went wrong
          </h1>
          <p style={{ fontSize: "0.875rem", color: "#525252" }}>
            The app hit an unexpected error. Try again, and reload the page if it
            keeps failing.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: "1rem",
              padding: "0.5rem 1rem",
              fontSize: "0.875rem",
              borderRadius: "0.375rem",
              border: "1px solid #e5e5e5",
              background: "#fff",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
