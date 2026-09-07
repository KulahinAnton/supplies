"use client";

/**
 * The last resort: `app/error.tsx` renders *inside* the root layout, so it
 * cannot catch an error thrown BY that layout. This one replaces the whole
 * document instead — which is why it ships its own `<html>` and `<body>`, and
 * why it cannot use anything from `@supplies/ui`: the failure it exists for
 * includes the case where the theme provider or the font loader is what threw.
 *
 * Inline styles for the same reason. If the layout did not render, the
 * stylesheet it links may not have either.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="uk">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          fontFamily: "system-ui, sans-serif",
          textAlign: "center",
          padding: "1rem",
        }}
      >
        <div>
          <h1 style={{ fontSize: "1.25rem", margin: 0 }}>Застосунок не запустився</h1>
          <p style={{ color: "#666", marginTop: "0.5rem" }}>
            Спробуйте ще раз. Ваші дані на місці.
          </p>
          <button
            onClick={reset}
            style={{
              marginTop: "1rem",
              padding: "0.5rem 1rem",
              borderRadius: "0.5rem",
              border: "1px solid #ccc",
              background: "#2f7d5b",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            Спробувати ще раз
          </button>
          {error.digest ? (
            <p style={{ color: "#999", fontSize: "0.75rem", marginTop: "1rem" }}>
              Код помилки: {error.digest}
            </p>
          ) : null}
        </div>
      </body>
    </html>
  );
}
