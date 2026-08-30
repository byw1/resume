"use client";

/**
 * The last resort: an error in the root layout itself, which replaces the whole
 * document — no shell, no fonts, no Tailwind guaranteed to have loaded. So the
 * styles here are inline on purpose, and it does not try to report anything.
 * If the root layout is failing, a server action is not going to work either.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100svh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          padding: 24,
          textAlign: "center",
          background: "#fafaf9",
          color: "#16181d",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        }}
      >
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Hired didn&apos;t start</h1>
        <p style={{ margin: 0, maxWidth: 380, fontSize: 14, color: "#6b6f7d" }}>
          Something failed before the app could render. Reloading usually fixes it.
        </p>
        <button
          onClick={reset}
          style={{
            padding: "8px 14px",
            fontSize: 14,
            borderRadius: 8,
            border: "1px solid #d8d8de",
            background: "#fff",
            cursor: "pointer",
          }}
        >
          Reload
        </button>
        {error.digest && (
          <p style={{ margin: 0, fontSize: 11.5, color: "#9a9dab" }}>Reference {error.digest}</p>
        )}
      </body>
    </html>
  );
}
