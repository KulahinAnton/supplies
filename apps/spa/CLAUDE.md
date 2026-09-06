# apps/spa — React without a meta-framework

Vite + React Router + TanStack Query, against the API in
[`apps/api`](../api/CLAUDE.md). Plan and phases:
[SPA_API_PORT.md](../../SPA_API_PORT.md).

**Phase 2.9 — the parity gate.** Nine screens exist and share the Next app's
design system. Several are still short of their Next counterparts in content,
and the per-screen checklist in SPA_API_PORT.md Phase 2.9 says which. Phase 3
(React Native) does not start until that table is clear.

Nothing here is mocked. Every number is fetched from the API, because a client
that fakes its data proves nothing about whether the three processes can
actually talk.

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
| `next-themes` | `src/components/theme.tsx` + an inline script in `index.html` |
| `next/font` | the system UI stack — see `src/index.css` |

**Write the query-key map before porting screens, not during** (SPA_API_PORT.md
§9.5). `revalidatePath` had no equivalent here; every mutation needs an explicit
decision about what it invalidates, and making those up one screen at a time is
how a cache starts lying.

## The design system is not local

`@supplies/ui` — the tokens, the Base UI primitives and the state badges —
is shared with the Next app ([packages/ui/CLAUDE.md](../../packages/ui/CLAUDE.md)).
**Do not add a component here that belongs there.** The reason this package
exists is that the first pass of these screens grew its own `components/ui.tsx`
with a hand-rolled palette, and the result read as a different product next to
the app it was supposed to be a port of.

What legitimately lives in `src/components/`:

- `feedback.tsx` — `Spinner`, `ErrorNote`, `EmptyNote`. A server component has
  nothing to show while it loads; every screen here does, so the loading state
  is the one component the SPA is allowed that the Next app is not.
- `theme.tsx` — the `next-themes` replacement. Same `.dark` class, same three
  states, `useSyncExternalStore` instead of a state-copying effect.
- `app-nav.tsx`, `user-menu.tsx`, `auth-page-shell.tsx` — ports of the Next
  components of the same name, differing only in the router.

## Porting a screen

Read its Next counterpart first, then match it. In particular:

- **A missing rule counts as a missing feature.** The dashboard's first version
  re-derived Feature 30's expired/soon split with an inline `filter` instead of
  calling `splitExpiring`. It looked right and it was a second implementation
  of a rule. If the Next page calls something from `@supplies/core`, so does
  this one.
- **JSON has no Date and no Decimal.** `reviveItemView` / `reviveShoppingRow`
  in `api/types.ts` put the dates back; quantities stay strings and go through
  `@supplies/core/format` or `toDecimal`, never `Number()`.
- **`Button render={<Link/>}` needs `nativeButton={false}`.** Base UI warns
  otherwise, and the semantics really are wrong — it is an `<a>`.

## `credentials: "include"` from day one

Set before there is a cookie to send. The refresh token is an httpOnly cookie,
and credentialed CORS is the configuration that fails loudest and most
confusingly when it is wrong.

`ApiError` with `status: 0` means the request never reached the API. A network
failure and a CORS rejection are indistinguishable from inside the browser —
both arrive as the same opaque `TypeError` — so the message says which two
things to check rather than repeating "Failed to fetch".

Two 401s on first load are **normal**: the auth context tries the refresh
cookie once before deciding the visitor is anonymous.

## Shared code

`@supplies/core/*` imports the same rules the Next app, the API and the Telegram
bot use — the engine runs in a browser bundle that contains no Prisma, which is
what Phase 0 was for. `/status` exists to demonstrate exactly that, and to show
whether the API is reachable at all.
