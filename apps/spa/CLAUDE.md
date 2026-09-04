# apps/spa — React without a meta-framework

Vite + React Router + TanStack Query, against the API in
[`apps/api`](../api/CLAUDE.md). Plan and phases:
[SPA_API_PORT.md](../../SPA_API_PORT.md).

**Phase 2.1 — this is a shell.** One route, which fetches the API's health,
readiness and unit list. The 16 screens arrive in Phase 2.6, once the API has
auth and data endpoints to serve them.

Nothing here is mocked. Every number on the status page is fetched, because a
scaffold that fakes its data proves nothing about whether the three processes
can actually talk.

## Running it

```bash
pnpm dev:all     # from the repo root — Next :3000, API :3200, SPA :5173
pnpm spa:dev     # just this one
```

`VITE_API_URL` defaults to `http://localhost:3200`; `src/api/client.ts` is the
only file that knows a URL (SPA_API_PORT.md §4.2). Vite inlines it at build
time, so it is a build-time variable, not a runtime lookup.

## What this replaces, and with what

| Next.js | Here |
|---|---|
| React Server Components | `useQuery` |
| Server actions | `useMutation` + `invalidateQueries` |
| `revalidatePath` | explicit key invalidation |
| `next/link`, `next/navigation` | `react-router` |
| Auth.js cookie session | bearer token + refresh cookie |

The components themselves mostly survive. `components/` in the Next app is DOM
React and Tailwind — it does not care what rendered it. Porting a screen is
changing how it gets its data, not rewriting its markup.

**Write the query-key map before porting screens, not during** (SPA_API_PORT.md
§9.5). `revalidatePath` had no equivalent here; every mutation needs an explicit
decision about what it invalidates, and making those up one screen at a time is
how a cache starts lying.

## `credentials: "include"` from day one

Set before there is a cookie to send. The refresh token becomes an httpOnly
cookie in Phase 1.2, and credentialed CORS is the configuration that fails
loudest and most confusingly when it is wrong — so it is exercised now, while
nothing is at stake.

`ApiError` with `status: 0` means the request never reached the API. A network
failure and a CORS rejection are indistinguishable from inside the browser —
both arrive as the same opaque `TypeError` — so the message says which two
things to check rather than repeating "Failed to fetch".

## Shared code

`@supplies/core/*` imports the same rules the Next app, the API and the Telegram
bot use. The status page formats a quantity through `@supplies/core/format`
specifically to demonstrate that: the engine runs in a browser bundle that
contains no Prisma, which is what Phase 0 was for.
