# apps/spa — React without a meta-framework

Vite + React Router + TanStack Query, against the API in
[`apps/api`](../api/CLAUDE.md). Where it sits:
[docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md). How it was built, screen by
screen: [docs/archive/SPA_API_PORT.md](../../docs/archive/SPA_API_PORT.md)
Phases 2.9 and 2.10. Not deployed yet:
[docs/DEPLOYMENT.md](../../docs/DEPLOYMENT.md) §6.

**Parity is reached.** Every screen the Next app has, this one has, including
the four public auth flows. The one route with no Next
counterpart is `/status`, which exists to prove the engine runs in a browser
bundle with no Prisma in it.

What that buys, and what to protect: a change to one client is now a question
about the other. If a rule moves, it moves into `packages/core` or
`packages/db` so both get it; if a screen gains a control, the other screen is
short of it until someone says otherwise.

Nothing here is mocked. Every number is fetched from the API, because a client
that fakes its data proves nothing about whether the three processes can
actually talk.

## Running it

```bash
pnpm dev:all     # from the repo root — Next :3000, API :3200, SPA :5173
pnpm spa:dev     # just this one
```

`VITE_API_URL` defaults to `http://localhost:3200`; `src/api/client.ts` is the
only file that knows a URL (docs/ARCHITECTURE.md §5). Vite inlines it at build
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

**Write the query-key map before porting screens, not during**
(docs/ARCHITECTURE.md §9). `revalidatePath` had no equivalent here; every mutation needs an explicit
decision about what it invalidates, and making those up one screen at a time is
how a cache starts lying. `e2e/spa.spec.ts` is what proves the map is right: a
forgotten key looks exactly like a successful write until someone notices the
screen disagreeing with the database.

## The response types are not written here

`src/api/types.ts` re-exports `@supplies/core/contracts` and adds the three
revivers JSON forces. **Do not hand-add a field to it.** If an endpoint grows
one, it goes in the contract, where the OpenAPI document and the API's own
contract tests pick it up too — a field added only here is a field the server
is not known to send.

## How a screen is put together

**Routes compose; they do not implement.** A file under `src/routes/` reads as
a list of what goes where — the biggest is 311 lines and most are under 150.
The two places the work actually lives:

- `src/hooks/` — **what is true.** `useItemList` owns the URL state, the
  350 ms debounce and the rule that a filter change resets to page 1 while a
  pager click does not. `useShoppingList` owns the grouping and the
  invalidation. `useItemWrite` returns a refusal instead of reporting it,
  because only the caller knows whether it belongs in a dialog or a toast.
- `src/components/<feature>/` — **what it looks like.** One component per
  thing on screen, colocated by the screen that needs it.

This is not a size rule. `shopping.tsx` was 1097 lines with a 444-line
component holding nine `useState`s, and the reason to split it was that the
rules inside were unreadable, not that the file was long.

One consequence worth keeping: **`ItemSearchBar` is rendered unconditionally**
by its parent. It used to sit inside a `page && (…)`, so every debounced
keystroke unmounted the field along with the results and the caret went with
it. A control that drives a query must never be conditional on that query's
data — and having no `data` in scope in that file is what keeps it that way.

## Routes are lazy, and one boundary catches what throws

Fourteen of the sixteen route components are `lazy()` in `App.tsx`. `/login`
and `/dashboard` stay eager because each is somebody's first paint — a chunk
fetched during a tap is free, one fetched before the app opens is not.
`@zxing/browser` is lazy behind the scan button and must stay that way: it is
408 KB, more than the rest of the first paint put together.

`ErrorBoundary` is a class — catching a render error is the one thing React
still has no hook for. It sits **inside** the shell, so a screen that throws
leaves the header and the nav standing.

If you add a `manualChunks` entry to `vite.config.ts`, read the comment there
first: naming a chunk overrides Rollup's automatic async splitting, and a
blanket vendor chunk drags every lazy dependency back into the first paint.

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

## Refreshing is single-flight, and that is not a nicety

**Never post to `/auth/refresh` yourself. Call `refreshSession()`.**

Refresh tokens rotate, and the API answers a replayed one by revoking every
session — correctly, since a replay is what theft looks like. `AuthProvider`
used to post directly, so React's StrictMode double-invoked effect sent two
refreshes and the second carried the token the first had just retired. The
app turned itself in; the symptom was being signed out immediately after
registering.

The guard is per **document**, so it fixes a double mount and not two tabs
loading at the same instant: those have two module instances and two guards.
The server covers that case with a 10-second grace window for a token revoked
by rotation (`REFRESH_GRACE_MS`, docs/ARCHITECTURE.md §8).

Related, in `api/client.ts`: a 401 clears the access token only when the token
still installed is the one that failing attempt carried. Otherwise a slow
request that 401s after a concurrent refresh already installed a new token
would sign someone out mid-session.

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
