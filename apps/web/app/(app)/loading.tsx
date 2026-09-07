/**
 * Feature 33's other half.
 *
 * Every authed page awaits a household scan before it renders anything, and
 * `getAttentionCounts` in the layout awaits the same one. Until this file
 * existed, a navigation showed the OLD page until the new one was ready —
 * which on a cold Neon connection reads as a dead tap.
 *
 * With it, Next streams the shell immediately and swaps this in underneath,
 * so the nav and the header stay live while the page loads. The skeleton
 * mirrors the shape most pages have — a heading and a list — rather than a
 * spinner, because a spinner in the same place for every screen tells the
 * reader nothing about what is arriving.
 */
export default function Loading() {
  return (
    <div className="space-y-5" aria-busy="true" aria-live="polite">
      <span className="sr-only">Завантажуємо…</span>

      <div className="space-y-2">
        <div className="h-7 w-40 animate-pulse rounded-md bg-muted" />
        <div className="h-4 w-56 animate-pulse rounded-md bg-muted" />
      </div>

      <div className="divide-y rounded-lg border">
        {[0, 1, 2, 3, 4].map((row) => (
          <div key={row} className="flex items-center justify-between gap-3 px-3 py-3">
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
              <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
            </div>
            <div className="h-4 w-16 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}
