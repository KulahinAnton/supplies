# Rebuilding Supplies as SPA + API + React Native

A plan for turning one Next.js app into **one domain engine with four clients**:
the existing Next.js app, a plain React SPA, a React Native app, and the
Telegram bot that already exists.

The goal is not new features. It is to make the codebase say, without a cover
letter, that the author can build a standalone API and a React front end that
is not Next.js — and can put a phone in front of the same API.

This absorbs and supersedes [REACT_NATIVE_PORT.md](REACT_NATIVE_PORT.md), which
answered "can we go native" and correctly found that the real work is the
missing API. It also picks up **F4** from
[ARCHITECTURE_REVIEW.md](ARCHITECTURE_REVIEW.md), which is now a blocker rather
than a nice-to-have.

---

> **Decided 2026-09-04.** Full parity · NestJS · one workspace · offline branch
> parked · iOS as a later phase after Android ships · no deadline. §10 records
> the answers; the plan below is written to them.

---

## 1. Repo shape — one workspace

The reasoning is kept rather than deleted, because it is what an interviewer
will ask about the moment they see four apps in one repository — and because
the condition attached to it is real work, not a formality.

### Why one repo

The strongest thing this codebase can claim is not "it has a React SPA in it".
It is that **the rules were already factored so a second and third client could
be added without rewriting them** — 339 unit tests over pure functions, a
single stock write path, and a Telegram bot that has been proving the "one
implementation, two front ends" rule in production for months.

Copy the engine into a second repo and that claim evaporates. You get two
repositories that each demonstrate one thing, plus a divergence problem: the
day FEFO changes in one and not the other, the portfolio is actively
misleading. In one repo, adding a third and fourth client *without duplicating
a single rule* is the demonstration.

Practical arguments in the same direction:

- The 20-odd pure modules move once and are then imported by four consumers.
- One CI run proves the engine, the API, the web app and the SPA together.
- Workspace/monorepo setup is itself a thing job ads ask for, and it is only
  visible if there is a workspace.
- Nothing has to be kept in sync by hand — `packages/core` is either green for
  everyone or red for everyone.

### The condition

A reviewer gives a repository somewhere between 60 seconds and 10 minutes. If
they open the README and see a Next.js household tracker, they will conclude
"Next.js developer" and close the tab — which is the exact outcome this whole
exercise exists to prevent.

So: **the README is part of the deliverable, not documentation of it.** It has
to open with the architecture (one engine, four clients), a diagram, and a
table pointing at where each stack lives. Phase 4 treats that as work, with
hours attached.

### What was rejected, and why it is worth being able to say

A separate `supplies-api` + `supplies-spa` showcase repo reads in three minutes;
this one will not, at ~20k lines before any of this starts. That is a genuine
cost and the honest answer to "why is your portfolio repo so big" is the trade
above: brevity was given up to keep one engine and one set of rules.

The other case for splitting — not wanting to touch a live app — is handled by
sequencing instead. Every phase before the last is additive, and production
configuration does not change until Phase 4.1.

---

## 2. Where the app actually stands today

Counted, not estimated:

| | Count | Ports to a new client? |
|---|---|---|
| Screens (`page.tsx`) | 16 + 1 redirect | No — RSC, `next/*`, server actions |
| Feature components | 26 (~6.7k lines) | **Mostly, to the SPA.** Not to RN |
| UI primitives (`components/ui`) | 22 | **Yes, to the SPA**, nearly verbatim |
| Server actions | 46 across 9 files | No — become HTTP endpoints |
| Query readers (`lib/queries.ts`) | 17 | Server-side; reused by the API as-is |
| Modules in `lib/` (non-test) | 44 | 20-odd are pure and move to `packages/core` |
| Unit tests | 339 across 22 files | **Move with the code, unchanged** |
| DB integration checks | 52 (`pnpm test:db`) | Stay with the API |
| Playwright specs | 4 | Adapt to the SPA nearly as-is |
| Migrations | 14 | Untouched — one schema, one database |

**Prisma coupling is the only structural obstacle**, and it is small. Seven
modules import `Prisma` as a *value*; only three of those are pure engine —
`lib/stock.ts`, `lib/item-group.ts`, `lib/shopping.ts` — and each does it for
exactly one reason: to reach `Prisma.Decimal`. That single import drags the
generated client into any bundle touching the engine, which already breaks
browser builds (`node:module`) and would break Metro identically.

`lib/format.ts` imports from the generated client too, but **type-only**, so it
is erased at compile time and is genuinely portable.

That is the whole blast radius. Everything else is additive.

---

## 3. Stack

### API — NestJS + REST + OpenAPI

| Concern | Choice |
|---|---|
| Framework | **NestJS** (Fastify adapter) |
| ORM | Prisma 7 — unchanged, same schema, same migrations |
| Validation | **`nestjs-zod`** over the existing `lib/validation/` schemas |
| Auth | JWT access (15 min) + rotating refresh (30 d), `bcryptjs` hashes reused |
| Docs | `@nestjs/swagger` → OpenAPI at `/docs` |
| Hardening | `helmet`, CORS allowlist, `@nestjs/throttler` |
| Tests | `supertest` e2e against a seeded database |

**Why Nest.** It is the Node backend framework job ads name most often after
Express, and unlike Express it *forces* structure — modules, DI, guards,
interceptors, pipes. That structure is the signal. It also generates OpenAPI,
which is what lets the SPA and the RN app share one typed client instead of two
hand-written ones.

**Fastify standalone was the alternative** and would have saved roughly 3–4 days
of ceremony. Declined: with no deadline, the ceremony *is* the deliverable —
modules and guards are the part a reviewer reads to judge whether you can
structure a backend, and a single `server.ts` with 40 routes does not show it.

**Rejected: tRPC.** Excellent DX, wrong instrument here. It hides the API behind
a TypeScript function call, which is precisely the thing you are trying to
prove you can build — and a reviewer cannot open `/docs` and see an API. It is
also perceived as Next-adjacent, which does not help.

### SPA — Vite + React Router + TanStack Query

| Concern | Choice | Notes |
|---|---|---|
| Build | **Vite** | Pin at scaffold time |
| Router | **React Router 7** | The default non-Next answer; 16 routes to map |
| Server state | **TanStack Query 5** | The direct replacement for RSC + `revalidatePath` |
| Forms | react-hook-form + zod | Already used — ports with no changes |
| Styling | Tailwind v4 + shadcn/Base UI | Same config, same components |
| Tests | Vitest + Testing Library, Playwright | Existing specs adapt |

The insight worth planning around: **the SPA is much cheaper than it looks.**
Those 48 components are DOM React and Tailwind. They do not care that Next.js
rendered them. What actually changes is three things — `next/link` and
`next/navigation` become React Router, RSC data loading becomes `useQuery`, and
server actions become `useMutation` + `invalidateQueries`. The markup, the
styling and the Ukrainian copy survive intact.

### React Native — Expo

| Concern | Choice |
|---|---|
| Runtime | Expo (current SDK), EAS Build |
| Router | Expo Router — file-based, same mental model as App Router |
| Styling | NativeWind 4 — Tailwind class names, native primitives |
| Server state | **TanStack Query — the same hooks the SPA uses** |
| Camera | `expo-camera` (replaces `BarcodeDetector` + `@zxing/browser`) |
| Tokens | `expo-secure-store` |
| Push | `expo-notifications` — in scope (Phase 3.7); today Telegram fills this gap |

### Shared packages

- **`packages/core`** — the pure engine, `lib/messages.ts`, `lib/format.ts`,
  and `lib/validation/`. Imported by all four clients *and* the API.
- **`packages/api-client`** — `openapi-typescript` types generated from the
  Nest OpenAPI doc, `openapi-fetch` for calls, plus TanStack Query hooks.
  **Written once, consumed by the SPA and the RN app.**

The zod schemas in `lib/validation/` become the API's request validation, the
SPA's form resolver *and* the RN form resolver — one schema, three consumers,
no drift possible. That is worth a paragraph in the README on its own.

---

## 4. Target layout

```
supplies/
├── apps/
│   ├── web/          Next.js 16 — today's app, moved 2026-09-06
│   ├── api/          NestJS — the new backend
│   ├── spa/          Vite + React — the new web client
│   └── mobile/       Expo + React Native
├── packages/
│   ├── core/         pure engine, messages, formatting, zod schemas + tests
│   ├── db/           Prisma client, queries, and every write service
│   ├── ui/           design system — theme tokens + Base UI primitives
│   └── api-client/   generated types + fetch client + TanStack Query hooks
├── prisma/           one schema, one seed — unchanged
└── bot/              @supplies/bot — Telegram bot, still on the engine directly
```

**One database.** All four clients point at the same Postgres on port 5434 with
the same seed. That is not just convenient — being able to take a bottle of
water on the phone, watch it drop in the SPA, and see the same number come back
from the Telegram bot is the single most persuasive thing you can put in front
of an interviewer, and it costs nothing extra to arrange.

The bot keeps importing `lib/stock-service.ts` directly. It is a server-side
Node process with database access; routing it through HTTP would add a network
hop and a failure mode to buy nothing. Worth one line in the README explaining
that, because it is a deliberate call and reads as one.

### 4.1 Hosting — what actually changes on Vercel

**In Phase 0, nothing.** The Next app does not have to move for the workspace to
exist. The root `package.json` stays the Next.js app; `pnpm-workspace.yaml`
gains a `packages:` key (today it holds only `allowBuilds`); the root depends on
`@supplies/core` with `workspace:*`. Root Directory stays `.`, install and build
commands stay as they are, the domain and the bot webhook are untouched.

The only code change is `transpilePackages: ["@supplies/core"]` in
`next.config.ts`, because the shared package ships TypeScript source rather than
a built `dist` — the standard internal-package arrangement, and the reason Vite
and Metro can consume the same files.

| Deployment | Host | Root Directory | Cost |
|---|---|---|---|
| Next.js app | Vercel — **same project, same domain** | `.`, becoming `apps/web` in Phase 4.1 | unchanged |
| API | Railway / Fly / Render | `apps/api` | new service, ~$5/mo |
| SPA | Vercel — **second project, same repo** | `apps/spa` | free tier |

Two Vercel projects from one repository is an ordinary supported setup: create a
second project against the same Git repo, give it a different Root Directory,
and enable including files outside it so Vercel installs from the workspace root
and resolves `packages/core` through the pnpm link. Phase 4.1 then changes
exactly one setting on the existing project — Root Directory `.` → `apps/web` —
and is verified against a preview deploy before it touches production.

**Why the API should not live on Vercel.** It can; Nest runs behind a serverless
handler. But Nest is built for a long-lived process and three things get worse
without one: cold starts on every call the phone makes, `@nestjs/throttler`'s
in-memory rate limiting stops meaning anything once each request may be a fresh
lambda, and Prisma needs the pooled Neon endpoint plus connection-limit care.
Railway or Fly gives a normal Node process, a subdirectory setting for
monorepos, and a health check, for a few dollars a month.

**Stop rebuilding everything on every push.** Give each Vercel project an
Ignored Build Step so an SPA-only commit does not rebuild the Next app:

```bash
git diff --quiet HEAD^ HEAD -- apps/web packages prisma
```

Exit 0 means nothing that project cares about changed, and Vercel skips the
build.

**Three origins means CORS is real work, not a checkbox.** The SPA and the API
will be on different domains, so the API needs an explicit allowlist, and the
refresh-token cookie needs either a shared parent domain (`api.supplies.app` +
`app.supplies.app`, cookie `Domain=.supplies.app`, `SameSite=Lax`) or
`SameSite=None; Secure` cross-site.

### 4.2 Domains are unknown — so nothing hard-codes one

Decided 2026-09-04: **every origin is an environment variable with a working
localhost default.** No domain appears in source, and the first deploy is a
matter of filling values in, not editing code.

| Variable | Local default | Read by |
|---|---|---|
| `API_PORT` | `3200` | API |
| `CORS_ORIGINS` | `http://localhost:5173,http://localhost:3000` | API — comma-separated allowlist |
| `COOKIE_DOMAIN` | *empty* → host-only cookie | API |
| `COOKIE_SAMESITE` | `lax` | API |
| `COOKIE_SECURE` | `false` | API |
| `VITE_API_URL` | `http://localhost:3200` | SPA build |
| `EXPO_PUBLIC_API_URL` | `http://<LAN-ip>:3200` | RN build |
| `APP_URL` | `http://localhost:3000` | already exists — Next app |

Local port map, so nothing collides: **3000** Next dev · **3100** Playwright's
production build · **3200** API · **5173** Vite.

Two rules that make this hold up rather than merely look tidy:

1. **The config module fails loudly on a bad value, at boot.** Nest reads and
   validates these once through a zod schema at startup, so a missing or
   malformed origin is a refusal to start with a named variable — not a CORS
   error at 2am that reads like a browser bug.
2. **Cross-site cookie settings are a matched set.** `SameSite=None` without
   `Secure` is silently dropped by every current browser. The three cookie
   variables are validated together, and the schema rejects the combination
   rather than letting it fail at runtime in one browser and not another.

Phone testing needs a LAN IP rather than `localhost`, which is why
`EXPO_PUBLIC_API_URL` is separate — the same reason `TELEGRAM_WEBHOOK_URL` is
already separate from `APP_URL` today.

### 4.3 The design system is shared too — `packages/ui`

**Added 2026-09-06, after the first SPA screens made the omission obvious.**

The plan was careful about one kind of duplication and blind to another. It
said, correctly and at length, that the *rules* must have one implementation.
It said nothing about the *presentation*, and so the SPA grew its own: a single
`components/ui.tsx` with four hand-rolled components and a hard-coded
neutral/emerald palette, next to a Next app with twenty-two Base UI primitives,
a themed token set in `oklch`, and a dark mode.

That is the same mistake in a different layer, and it fails for the same
reason. Two definitions of a card diverge exactly as fast as two definitions of
a stock rule; the only difference is that nobody writes a test for the card, so
the divergence is discovered by looking at it. Which is how it *was* discovered.

**What makes this fixable is that almost none of it was ever Next-specific.**
The primitives are Base UI plus `class-variance-authority` plus Tailwind — plain
React with no framework dependency at all. A grep for `next` across
`components/ui/` returns exactly one hit, `sonner.tsx`, which reads
`next-themes` for the toaster's colour scheme. Twenty-one of twenty-two files
move as they are.

```
packages/ui/
├── src/
│   ├── theme.css      the oklch tokens, .dark, and the @theme inline map
│   ├── lib/utils.ts   cn()
│   ├── primitives/    button, card, badge, input, select, checkbox, switch, …
│   └── domain/        state-badges — the one place expiry/stock colours live
└── package.json       "./*": "./src/*.tsx", same subpath pattern as core
```

Three things this buys, in the order they matter:

1. **The parity work stops being cosmetic.** With one token set and one button,
   aligning a screen is a question of structure and content — which is where
   the real gaps are — instead of re-deriving a colour and getting it nearly
   right.
2. **The domain colours get one home.** `--warning` and `--success` exist
   because an expiry chip must not hardcode a hex value. That argument does not
   weaken when a second client renders the same chip; it gets stronger.
3. **It is the claim the project is trying to make, in a second layer.** "One
   engine, four clients" reads better when the design system is shared by a
   Next.js app and a Vite SPA than when the SPA visibly is not the same product.

Two costs, both known and both small:

- **Tailwind v4 must be told to scan the package.** Content detection follows
  imports from the entry CSS, and a linked workspace package under
  `node_modules` is skipped by default. Both apps add one
  `@source "../../packages/ui/src"` line. Without it the classes exist in the
  source and not in the stylesheet, which looks like the components are broken.
- **`sonner.tsx` and the theme toggle stay app-local.** They depend on how the
  host app stores the theme — `next-themes` on a class attribute for Next, a
  small hook for the SPA. The *tokens* are shared; the mechanism that flips
  them is not, and pretending otherwise would drag `next-themes` into a Vite
  bundle to serve one component.

`@supplies/ui` is web-only on purpose. React Native has no DOM and no Tailwind
class strings, so Phase 3 shares `core` and the API client and gets its own
components — that is a real boundary, not a failure to reuse.

---

## 5. Phases

Marked **⚠ prod** where a step can affect the running deployment. There are
exactly two, and both are last.

### Phase 0 — make the engine shareable · 3–4 days

| # | Task | Est. |
|---|---|---|
| 0.1 | Add `packages:` to `pnpm-workspace.yaml` (today it is only a build allowlist) | 1 h |
| 0.2 | **F4:** decouple `stock.ts`, `item-group.ts`, `shopping.ts` from `Prisma.Decimal` → `decimal.js`; convert at the DB edge in `queries.ts` / `stock-service.ts` | 1 d |
| 0.3 | Create `packages/core`; move the pure modules **and their tests**; leave `lib/*.ts` re-export shims so the app compiles unchanged | 1 d |
| 0.4 | Repoint the Next app at `@supplies/core`; delete the shims | 0.5 d |
| 0.5 | Wire vitest + ESLint + tsconfig project references for the workspace | 0.5 d |

**Gate:** `pnpm verify`, `pnpm test:db`, `pnpm test:e2e` and a Vercel preview
deploy all green before anything else starts. 0.2 touches the arithmetic of a
stock tracker; the 339 tests are the reason this is a day and not a fortnight.

### Phase 1 — the API · 2–3 weeks

| # | Task | Est. |
|---|---|---|
| 1.1 | Scaffold Nest, config module, Prisma module (`--schema` at repo root) | 1 d |
| 1.2 | Auth: `register` / `login` / `refresh` / `logout` / `me`; reuse bcrypt hashes so existing users work | 3 d |
| 1.3 | `JwtAuthGuard` + a household-scoping guard, so no handler can forget `householdId` | 1 d |
| 1.4 | Resource modules — see the endpoint sketch below | 6–8 d |
| 1.5 | `nestjs-zod` pipes over `packages/core/validation` | 1 d |
| 1.6 | Error envelope carrying **message keys + params**, never formatted prose — the existing `RuleMessage` rule, extended to HTTP | 1 d |
| 1.7 | OpenAPI at `/docs`, CORS allowlist, helmet, throttler | 1 d |
| 1.8 | `supertest` e2e mirroring what `scripts/smoke.ts` covers | 2–3 d |

Endpoint sketch — 46 actions and 17 readers collapse to roughly 40 routes:

| Resource | Routes |
|---|---|
| `/auth` | register, login, refresh, logout, me, change-password, forgot, reset, invite |
| `/items` | list (paged/filtered), get, create, update, archive, names, archived |
| `/items/:id/stock` | add, consume, consume-batch, discard, correct |
| `/dashboard` | one composed read |
| `/shopping` | list, add row, check, uncheck, update, delete, archive, bulk |
| `/shopping-groups` | CRUD + reorder + move row |
| `/settings` | household, categories, locations, item-groups (CRUD + reorder + defaults) |
| `/barcode/:code` | lookup (OFF → GEPIR → METRO chain, server-side) |
| `/recipes` | suggest (Claude; gated on `aiEnabled`) |
| `/telegram` | link token, send digest now |

### Phase 2 — the SPA · 2–3 weeks

| # | Task | Est. |
|---|---|---|
| 2.1 | Vite scaffold, Tailwind v4 config, copy the 22 UI primitives | 1 d |
| 2.2 | `packages/api-client`: generate types from OpenAPI, fetch wrapper, refresh-on-401 interceptor | 2 d |
| 2.3 | Auth context, protected routes, token storage | 1 d |
| 2.4 | Router: 16 routes + the authed shell | 1 d |
| 2.5 | TanStack Query hooks + invalidation map (the `revalidatePath` replacement) | 2 d |
| 2.6 | Port screens: login → items → item detail → add/take → shopping → dashboard → settings → groups → recipes | 6–9 d |
| 2.7 | Barcode scanner — lift the existing DOM code verbatim | 0.5 d |
| 2.8 | Playwright against the SPA; adapt the 4 existing specs | 1 d |
| 2.9 | **Parity gate** — extract `packages/ui`, then align screen by screen | 4–6 d |

#### Phase 2.9 — the parity gate

**Added 2026-09-06.** The first pass built the SPA screens as *translations* —
same data, same endpoints, whatever layout fell out. Put side by side with the
Next app they are visibly a different product, and in a few places a
functionally poorer one. Since the entire point is to demonstrate that the same
application can be built twice on one engine, "roughly equivalent" is the one
outcome that proves nothing.

So parity is now an explicit gate with a checklist, and **Phase 3 does not
start until it closes** (decided 2026-09-06 — see §10).

Two rules for the work, because they change what "aligned" means:

- **The Next app is the reference.** Where the two differ, the SPA moves. Where
  the Next app is itself wrong, both change, and the fix lands in `web` first.
- **A missing rule counts as a missing feature.** A screen is not aligned
  because it looks the same. If the Next page calls `splitExpiring` from the
  engine and the SPA re-derives the split with an inline filter, that is a
  second implementation of a rule, and it is the exact failure this whole plan
  exists to prevent — it just slipped in through the view layer.

| # | Screen | Gap | State |
|---|---|---|---|
| — | *design system* | SPA had 4 hand-rolled components and a bare palette against 22 primitives + tokens + dark mode | **done** — `packages/ui` (§4.3) |
| — | *shell* | text tabs vs icon nav with a mobile bottom bar; no expiring badge; no theme toggle; no user menu; `max-w-2xl` vs `max-w-5xl` | **done** |
| 1 | dashboard | rule duplicated (inline filter, not `splitExpiring`); no expiry/stock badges; no «Останні дії»; no warn-days caption; group rows linked to a page that does not exist; no minimum shown | **done** |
| 2 | login | bare inputs; no shell; validated nothing before submitting | **done** |
| 3 | items | search, barcode scan, sort menu, filter and category chips, pagination and page size, the «Набори» shortcut, group badge, location and minimum — and the list URL is now literally the same link in both clients. The two stragglers, Feature 16.2's create affordance and the archive link, closed in Phase 2.10.4 | **done** |
| 4 | item detail | FEFO-ordered batches with expired appended, per-batch take/correct/discard, «Поповнити» with Feature 4's multi-row form and its barcode check, «Взяли» with the shortfall refusal inline, barcode and notes, movement history, archive and restore | **done** |
| 5 | item form | duplicate warning while typing, barcode lookup on scan or blur with the GS1 fallback and the Open Food Facts opt-in, the set picker that hides the minimum, the unit lock, notes | **done** |
| 6 | shopping | full port: drag between groups, the move menu, group create/rename/delete, per-group add, the buy dialog with its stock-in, check/uncheck, archive and its reveal toggle, row editing, candidates with their detail lines, and who added or bought each row | **done** |
| 7 | settings | all seven panels: household, categories with per-category warn days, locations, item groups with their thresholds, duplicates, members and invites, Telegram, password — with drag-to-reorder, star-a-default, add and delete throughout | **done** |
| 8 | recipes | matched | **done** |
| 9 | groups + group detail | both screens, with the membership editor and its barcode scan | **done** |
| 10 | items archive | **missing entirely** | **done** — Phase 2.10.4 |
| 11 | register · join · forgot · reset | **missing entirely** — 4 public routes, one of them blocked on the API | **done** — Phase 2.10.3–4 |

Rows 3–7 were audited against their Next counterparts rather than guessed, and
what is listed is what was actually found. They are on the shared design system
and read as the same product; the remainder is content, and each gets its own
pass.

#### Phase 2.10 — the architecture audit

**Added 2026-09-07**, after a four-part review asked of the whole workspace:
is each client a showcase in its own right, what is left for parity, are the
imports right where the two hosts differ, and is the SPA actually decomposed.

The constraint that frames all four answers, stated by the owner and now
binding:

> The two apps share a **database, not a codebase**. Duplicated views or
> duplicated logic between them is acceptable. A shared component is
> acceptable **only while it costs neither host its own rules** — the moment
> sharing forces either app into an idiom it would not otherwise choose, the
> sharing is wrong and the duplication is right.

That is a sharper test than "is this reused twice", and `packages/ui` passes
it today (§4.3, re-verified below). It is not a licence to keep sharing: each
new candidate gets tested against it individually.

##### What the audit found

**The parts that already hold up.** The engine boundary is enforced rather
than documented — `eslint.config.mjs` bans Prisma, `next`, `react` and Node
builtins inside `packages/core`, with `node:crypto` as a named exception.
`lib/queries.rsc.ts` collapses the layout's and the page's duplicate scans
through `React.cache` behind `server-only`. `lib/auth-guard.ts` re-reads the
user row rather than trusting an eight-hour JWT. The SPA keeps its access
token in memory with an httpOnly refresh cookie and single-flight rotation.
None of that changes.

**1 · Architecture.** Four gaps, two per client.

- *Web has none of the App Router's error primitives.* No `error.tsx`, no
  `global-error.tsx`, no `not-found.tsx`, no `loading.tsx`, and not one
  `Suspense` boundary in the app. Every page is a blocking await and any throw
  in a server component lands on Next's default screen. For an App Router
  showcase this is the most conspicuous omission and the cheapest to close.
- *Web never reaches for `useActionState` / `useFormStatus` / `useOptimistic`.*
  Server actions everywhere, forms on react-hook-form plus a hand-written
  runner. Coherent, but not the React 19 idiom a reviewer looks for.
- *The SPA does not code-split.* All twelve routes are static imports in
  `App.tsx`, so the build is one 749 KB chunk (240 KB gzip) and Vite's own
  output names the fix. The technique is plainly understood — `@zxing/browser`
  is already lazy behind the scan button — it just was not applied at the
  route boundary, where it pays most.
- *Neither client has an error boundary or a single component test.* All 357
  tests are engine tests. Web has one Playwright spec; the SPA has none. The
  SPA is also not installable while the Next app is, which is backwards: a
  Vite SPA is where a manifest is nearly free.

**2 · Parity.** Confirmed against the route inventory, not against this
table's own claims. Five rows remain, and only one of them is blocked:

| Missing | Blocked on |
|---|---|
| `/items/archive` | nothing — `GET /items/archive` already exists |
| `/items`: the create affordance and the archive link | nothing |
| `/register` | nothing — `POST /auth/register` already takes `inviteToken` |
| `/join/:token` | one endpoint; `inviteHouseholdName` has no API equivalent |
| `/forgot-password`, `/reset-password` | **two endpoints that do not exist** |

The last row is the sixth instance of a pattern this plan has already fixed
five times. `apps/web/lib/actions/auth.ts` hand-rolls token hashing, the
one-hour expiry, single-use marking and the enumeration-safe always-ok
response **directly against Prisma** — while `changePasswordAction` and
`createInviteAction`, in the same file, correctly delegate to
`@supplies/db/account-service`. The API cannot offer password reset because
the rules are not reachable from it. Note this is *not* a code-sharing
question: the rule belongs in the service layer both hosts already call
through, which is the boundary the whole plan is built on.

Features 7, 9 and 19 (PWA, Telegram webhook, cron digest) show up as web-only
in a feature-marker diff and are **not** parity gaps — they are properties of
the Next deployment.

**3 · Imports.** `packages/ui` passes the constraint above: zero `next/*`,
`react-router`, `sonner` or `@tanstack` imports, navigation injected through
Base UI's `render` prop, refusals returned as booleans from host-supplied
callbacks. One React copy resolves across all three packages, and the
`"use client"` directives are inert under Vite while load-bearing under Next.
Two real problems:

- *The boundary is enforced for `core` and nowhere else.* Core's own config
  comment reads "a convention that is not enforced is a convention that
  breaks" — and then `packages/ui` and `apps/spa` run on convention alone.
  Nothing stops the shared package importing `next/link` tomorrow, or the
  browser app importing `@supplies/db`.
- *`packages/core` exports everything with no condition split.* A browser can
  reach `@supplies/core/claude` (the Anthropic SDK) or
  `@supplies/core/telegram-link` (`node:crypto`); the lint rule governs what
  core *imports*, not what a consumer *reaches*. `@supplies/core/stock.test`
  is a public entry point too.

**4 · SPA componentisation.** The clearest finding, and the sharpest contrast
between the two clients:

| SPA route | lines | largest single component |
|---|---|---|
| `shopping.tsx` | 1097 | `ShoppingRoute` — **444 lines, 9 `useState`** |
| `settings.tsx` | 736 | 11 components — this one is right |
| `item-detail.tsx` | 715 | `ItemDetailRoute` — 273 |
| `item-form.tsx` | 544 | one component plus three helpers |
| `items.tsx` | 509 | `ItemsRoute` — **426 lines, one component** |

Web made the opposite call on the same screens: shopping is `shopping-list` +
`shopping-group-header` + `shopping-row-edit`, settings is five panel files.
Same product, 25 SPA files against ~60. The SPA has seven files in
`components/` and twelve routes, so nearly everything lives in whichever route
first needed it. `settings.tsx` — ported last, and decomposed — proves the app
can do it; the earlier screens simply were not.

In fairness to web, `shopping-list.tsx` at 803 lines is the same smell one
size down.

##### The board

Ordered by value, not by file count. Each row is independently shippable.

| # | Work | Closes | State |
|---|---|---|---|
| 2.10.1 | Decompose the SPA route monoliths into `components/` and `hooks/` | audit 4 | **done** |
| 2.10.2 | Lazy route boundaries and an error boundary in the SPA | audit 1 | **done** |
| 2.10.3 | Move the reset flow — and registration — into `@supplies/db/account-service`; four new endpoints | audit 2 blocker | **done** |
| 2.10.4 | The five remaining screens: archive, register, join, forgot, reset | Phase 2.9 rows 10-11 | **done** |
| 2.10.5 | `error.tsx`, `global-error.tsx`, `not-found.tsx`, `loading.tsx` in web | audit 1 | **done** |
| 2.10.6 | ESLint boundaries for `packages/ui`, `apps/spa` and `apps/web` | audit 3 | **done** |
| 2.10.7 | SPA web-app manifest | audit 1 | **done** |

**Deferred, with reasons.** `useActionState` in web is a rewrite of seven
working forms for idiom alone, and the custom runner exists partly to keep
`SettingsListPanel` host-neutral — revisit only if the runner stops paying for
itself. Component tests for both clients are Phase 4.5's CI work, where they
belong with the matrix that runs them; adding a lone Vitest setup now would be
a harness with three tests in it.

### Phase 3 — React Native, Android · 3–4 weeks

> **Was blocked on Phase 2.9; unblocked 2026-09-07.** The reasoning is in §10:
> a third client built against a second-rate second client copies its gaps, and
> the phone is the most expensive place to discover that. The gate is now
> closed — see Phase 2.9's table and the Phase 2.10 audit that finished it.

| # | Task | Est. |
|---|---|---|
| 3.1 | Expo + Expo Router + NativeWind scaffold; Metro workspace resolution | 1.5 d |
| 3.2 | `expo-secure-store` tokens, same `api-client`, refresh on 401 | 1 d |
| 3.3 | **Milestone A** — login, items list, item detail with take/add, scan | 4–5 d |
| 3.4 | `expo-camera` barcode scanning | 1 d |
| 3.5 | EAS Build → internal-distribution APK on your phone | 1 d |
| 3.6 | Remaining 12 screens: dashboard, shopping + groups, settings panels, item form, archive, recipes, join/reset | 2–2.5 w |
| 3.7 | Push notifications via `expo-notifications` | 2–3 d |
| 3.8 | Play Console listing ($25, once) | 1 d |

**Milestone A is a checkpoint, not a reduced scope.** Full parity is the
destination; 3.3–3.5 just happen to be the order that proves the whole stack —
workspace, API, auth, camera, real write — before twelve more screens are built
on top of it. If something is structurally wrong, it surfaces in week one of
this phase rather than week four. Ship an APK to your own phone at 3.5 and use
it for a few days before continuing.

**Do not paint yourself into Android**, since Phase 5 exists. Concretely, from
3.1 onward: `react-native-safe-area-context` on every screen even though Android
mostly does not need it, no Android-only libraries, `expo-camera` rather than
anything platform-specific, and keyboard handling written against
`KeyboardAvoidingView` rather than Android's default resize behaviour. All four
are free now and expensive to retrofit.

### Phase 4 — finish and present · 3–5 days

| # | Task | Est. |
|---|---|---|
| 4.1 | **⚠ prod** Move the Next app to `apps/web`; set Vercel Root Directory | 0.5 d |
| 4.2 | **⚠ prod** Verify the deploy: build, migrations, bot webhook, cron | 0.5 d |
| 4.3 | Deploy the API (Railway / Fly / Render) and the SPA (Vercel / Netlify) | 1 d |
| 4.4 | README rewrite: diagram, stack table, screenshots, "where to look" | 1 d |
| 4.5 | CI matrix — core, api, web, spa; Playwright on both web clients | 1 d |

Phase 4.1 is deliberately **the last thing that touches production**. Until
then the Next app stays at the repo root and Vercel's configuration never
changes, so every phase before it is additive and cannot break what your
household is using.

At the end of Phase 4 the portfolio is complete and showable: API, SPA, Android
app, Next.js app, Telegram bot, one engine. Phase 5 extends it.

### Phase 5 — iOS · 1–1.5 weeks

Sequenced after Phase 4 on purpose, so nothing you show people is ever blocked
on Apple's review queue.

| # | Task | Est. |
|---|---|---|
| 5.1 | Apple Developer account ($99/yr), EAS credentials, bundle id | 0.5 d |
| 5.2 | Platform pass: safe areas, keyboard, scroll behaviour, haptics | 2–3 d |
| 5.3 | `Info.plist` usage strings (camera), icons, splash | 0.5 d |
| 5.4 | APNs push, if 3.7 shipped | 1 d |
| 5.5 | TestFlight build, install, fix what only shows on a real device | 1–2 d |
| 5.6 | App Store submission: demo account, privacy policy, App Privacy answers | 1–2 d + review latency |

**You need a Mac or EAS cloud builds.** EAS removes the hardware requirement,
not the $99. Review latency is usually a day or two and is entirely outside your
control — which is the whole reason this phase sits where it does.

---

## 6. Scope and timeline

**Full parity.** Every endpoint, all 16 screens on the SPA, all 16 on React
Native, push notifications, both stores.

Estimates below are **working days of focused effort** — a "week" is five of
them. Translate to calendar at whatever rate you actually work; the two columns
on the right are the honest arithmetic, not a hedge.

| Phase | Effort | Full-time | ~15 h/week |
|---|---|---|---|
| 0 · shareable engine | 3–4 d | <1 wk | ~2 wk |
| 1 · API | 10–15 d | 2–3 wk | 5–7 wk |
| 2 · SPA | 10–15 d | 2–3 wk | 5–7 wk |
| 3 · Android | 15–20 d | 3–4 wk | 7–10 wk |
| 4 · finish + present | 3–5 d | ~1 wk | ~2 wk |
| **Showable total** | **41–59 d** | **8–12 wk** | **5–7 months** |
| 5 · iOS | 5–8 d | 1–1.5 wk | 2–4 wk |

Two things follow from choosing parity with no deadline, and both are worth
building in from the start rather than discovering later:

**Order matters more than scope now.** Milestone A in Phase 3 exists precisely
because the total is long: it puts a working end-to-end vertical — workspace,
API, auth, camera, real write — on your phone inside the first week of that
phase, so a structural mistake surfaces at day 5 rather than day 25.

**Something has to be presentable at every point after Phase 2.** Five months is
long enough that a job opportunity will appear mid-way through. Keep the README
current as each phase lands, so the repo is never in a state where the honest
description is "half-migrated". That is a habit, not a task — but it is the one
that pays if a recruiter appears in week nine.

---

## 7. Testing and CI

The existing test story is unusually strong for a personal project and is worth
protecting — it is itself a hiring signal.

| Layer | Tool | Where it lands |
|---|---|---|
| Rules | vitest, 339 tests | `packages/core` — **moved, not rewritten** |
| API contract | supertest + seeded Postgres | `apps/api` — absorbs `scripts/smoke.ts` |
| SPA units | Vitest + Testing Library | `apps/spa` |
| SPA e2e | Playwright, desktop + Pixel 7 | `apps/spa` — the 4 specs adapt |
| Next e2e | Playwright, unchanged | `apps/web` |
| RN | Maestro flows over the critical paths | `apps/mobile` — cheaper to write and maintain than Detox |

CI becomes a matrix: `core` (fast, always), then `api` / `web` / `spa` in
parallel behind a Postgres service. The pre-commit hook stays as it is —
lint + typecheck + unit — because 20 seconds is the budget that keeps it from
being bypassed.

---

## 8. What a reviewer will be able to verify

The point of the whole exercise, mapped to evidence:

| Claim | Where it is provable |
|---|---|
| React without a meta-framework | `apps/spa` — Vite, React Router, TanStack Query |
| Backend API design | `apps/api` — Nest modules, guards, DTOs, OpenAPI at `/docs` |
| Auth beyond a library default | Access + rotating refresh, cookie for web, secure-store for native |
| React Native | `apps/mobile` — real APK, camera, same API |
| Monorepo | pnpm workspace, four apps, two shared packages |
| Domain modelling | `packages/core` — FEFO, expiry states, Decimal arithmetic, 339 tests |
| Testing judgement | Four layers with a written rationale for the size of each |
| Not just greenfield | An existing production app refactored without downtime |

That last row is the one most portfolios cannot claim, and it comes free with
the one-repo decision.

---

## 9. Risks and frictions

1. **Prisma must never enter the SPA or Metro bundle.** Already true for the
   browser; Phase 0.2 is what makes it enforceable across three build systems.
   Add a lint rule banning `@/lib/generated/*` outside `apps/api`, `apps/web`
   and `bot/` — a convention that is not enforced is a convention that breaks.
2. **Metro and workspaces.** `nodeModulesPaths` and symlink resolution need
   configuring or Metro will not resolve `packages/core`. Budget half a day and
   do not be surprised by it.
3. **The `@/` alias.** Everything imports `@/lib/...` today. Shared code becomes
   `@supplies/core`; this is mechanical but touches many files, which is why
   Phase 0.3 keeps re-export shims so it lands as its own reviewable commit.
4. **Auth divergence.** Two auth systems will coexist — Auth.js cookies for
   `apps/web`, JWT bearer for everything else. Acceptable and normal, but say
   so in the README before someone calls it an inconsistency. Unifying `web`
   onto the API is possible later and is not worth doing now.
5. **`revalidatePath` has no equivalent.** Every mutation needs an explicit
   invalidation decision. Write the query-key map (2.5) *before* porting
   screens, not during.
6. **Scope creep into features.** The temptation to "improve it while I'm in
   there" is what turns 7 weeks into 20. The API is a translation of 46
   existing actions. Behaviour changes go on a separate list.
7. **`feature/offline-sync` is parked, and parking it has a cost.** It stays on
   its branch, out of scope, not merged. Be clear-eyed that Phase 0 moves the
   engine into `packages/core` and rewrites every `@/lib/*` import the branch
   touches — after that, rebasing it is not a merge conflict, it is a rewrite.
   Treat the branch as a **design record** rather than resumable code: the
   IndexedDB outbox, the idempotency keys and the `navigator.onLine` fast-path
   are the parts worth re-reading if offline is ever rebuilt on the API, which
   is where it belongs anyway — one queue serving two mobile clients instead of
   a browser-only one.

---

## 10. Decisions taken — 2026-09-04

| # | Decision | Consequence in this plan |
|---|---|---|
| 1 | **Full parity** | All 16 screens on RN too; Phase 3 is 3–4 weeks, not one |
| 2 | **NestJS** | Modules/DI/guards; OpenAPI at `/docs`; Fastify declined |
| 3 | **One workspace** | §1; Vercel untouched until Phase 4.1 |
| 4 | **Offline parked** | Out of scope; §9.7 on why the branch will not rebase |
| 5 | **iOS later** | Its own Phase 5, after Phase 4 ships; §3 stays cross-platform |
| 6 | **No deadline** | Buys the Nest ceremony and full parity; §6 on what it costs |
| 7 | **Domains unknown → env-driven** | §4.2; localhost defaults, no origin in source |

### Amended 2026-09-06

Three corrections, all from reading the first SPA screens next to the Next app.

| # | Decision | Consequence in this plan |
|---|---|---|
| 8 | **Phase 4.1 pulled forward — `apps/web` now** | Decision 3 said Vercel stays untouched *until* 4.1; it never said 4.1 had to be last. Keeping the Next app at the repo root while `apps/api` and `apps/spa` existed made the layout say the opposite of what it means: that the Next app is the project and the rest are attachments. The move is a rename plus one Vercel setting, and doing it on an unmerged branch costs nothing — doing it after three more phases means re-touching every file those phases add. |
| 9 | **The design system is shared: `packages/ui`** | §4.3. The original plan factored the rules and forgot the components, which is the same duplication one layer up. |
| 10 | **Parity gates Phase 3** | Phase 2.9. A React Native app built against a second-rate SPA inherits its gaps, and a phone is the slowest place to find them. Full parity was already decision 1; this says *when* it is checked, not just that it is owed. |

### Still open, but not blocking

- **API host** — Railway, Fly or Render. Any of the three; pick when Phase 1
  first needs to deploy, not before.
- **Package build strategy** — ship `packages/core` as TypeScript source
  (simpler, one source of truth, needs `transpilePackages` + Metro config) or
  build to `dist` (works everywhere with no bundler config, adds a build step).
  Source is the default; revisit only if Metro fights back in Phase 3.1.

---

## 11. Progress log

### Phase 0 — done, 2026-09-04

| # | Task | Commit |
|---|---|---|
| 0.1 | `packages:` key in `pnpm-workspace.yaml`; Next app stays the root package | `5396ea1` |
| 0.2 | Engine decoupled from `Prisma.Decimal` → decimal.js; units moved out of the generated enums | `abadd29` |
| 0.3 | 28 modules + their tests moved to `packages/core`, subpath exports, no barrel | `5396ea1` |
| 0.4 | Every app import repointed to `@supplies/core/*` — done directly, no shim commit | `5396ea1` |
| 0.5 | vitest over three roots, ESLint boundary rule, `transpilePackages` | — |

**Gate met:** 351 unit tests (339 + 12 new), lint, typecheck, production build,
and all 52 live-database smoke checks. Not yet run: `pnpm test:e2e` and a Vercel
preview deploy — both belong to the `chore/post-review` PR this branch is
stacked on.

Three things worth knowing before Phase 1:

**The boundary is enforced, not documented.** `eslint.config.mjs` bans Prisma,
React, Next, `server-only`, the `@/` alias and Node builtins inside
`packages/core`, with `node:crypto` the single exception for
`telegram-link.ts`. Verified against a file that deliberately imports all of
them, rather than assumed from a passing lint run. Core's *tests* keep every
ban but the Node one — they run in Node, and `gepir.test.ts` reads fixtures off
disk.

**No barrel, and it must stay that way.** `exports` is `"./*": "./src/*.ts"`.
An `index.ts` would put `node:crypto` in the module graph of any mobile screen
that imported anything at all.

**The engine's tests no longer need a database, an `.env`, or a generated
client.** That is the property Phase 1 will lean on when the API imports the
same rules, and Phase 3 when Metro does.

### Phase 1.1 — done, 2026-09-04

`apps/api` boots, connects, and serves. Verified by running it, not by building
it: `/health`, `/health/ready` (real `SELECT 1`), `/api/meta`, and Swagger UI at
`/docs` all answered on port 3200.

| Piece | State |
|---|---|
| NestJS 11 on Fastify, helmet, cookie, throttler | done |
| `PrismaService` — eager connect, real shutdown hook | done |
| Env config: zod-validated at boot, 11 tests | done |
| `GET /api/meta` — units and movement reasons from `@supplies/core` | done |
| OpenAPI at `/docs` | done |
| Auth, resource modules, zod pipe | Phase 1.2+ |

**§4.2 is implemented.** No domain appears anywhere in `apps/api`. The config
refuses to boot on `SameSite=None` without `Secure`, refuses an origin that is
not a URL, refuses plain `http://` origins in production, and names every bad
variable in one message rather than one per restart. `API_JWT_SECRET` is the
only value with no default — a fallback secret is a fallback that reaches
production.

**`GET /api/meta` is the wiring proof, not a placeholder.** It serves the unit
list from the same module the zod schemas validate against, which is the same
one `lib/units.test.ts` pins to the Prisma enum. The SPA and the phone will both
need that list for their «Одиниця» dropdowns, and a hardcoded copy in either is
a copy that still says six units the day the schema has seven.

**Toolchain, in one line each** — the detail is in
[apps/api/CLAUDE.md](apps/api/CLAUDE.md):

- The API is **CommonJS**, and Prisma's generator is told `moduleFormat = "cjs"`
  for it. Its default ESM output carries `import.meta`, which survives a
  CommonJS build and makes Node reject the file.
- **ESM is a dead end here.** Node ESM needs file extensions, tsc never adds
  them on emit, and Turbopack will not resolve `./decimal.js` to `decimal.ts` —
  so one of the two consumers of `packages/core` breaks whichever way its source
  is written. Tried, reverted, documented.
- A tsconfig `paths` alias does not survive emit, so the API has its **own
  generated client** and one file (`src/core.ts`) that reaches into
  `packages/core/src` relatively.
- **No `ValidationPipe`.** Nest's default needs class-validator; this API
  validates with the zod schemas in `@supplies/core/validation`. Two validation
  libraries would be two definitions of a valid item.

### Phase 2.1 — done, 2026-09-04

`apps/spa` — Vite, React 19, React Router 7, TanStack Query, Tailwind v4. One
route so far, and **nothing on it is mocked**: it fetches the API's liveness,
readiness and unit list, and formats a quantity through `@supplies/core/format`
to show the engine running in a browser bundle with no Prisma in it.

**All three run together:**

```bash
pnpm dev:all     # Next :3000 · API :3200 · SPA :5173
```

Verified in a browser, not just with curl: the SPA's cross-origin requests to
:3200 return 200 with `credentials: "include"`, the console is clean, and the
Next app still serves `/login` alongside them.

`credentials: "include"` is set before there is a cookie to send. Credentialed
CORS is the configuration that fails loudest and most confusingly when wrong, so
it gets exercised now rather than on the day the refresh token needs it.

One fix on the way: `nest start --watch` looks for `dist/main`, but including
`packages/core` in the API's tsconfig makes tsc infer the repo root as
`rootDir`, so the entry is `dist/apps/api/src/main`. `entryFile` in
`nest-cli.json` now says so.

### Phase 1 — the API · substantially done, 2026-09-05

Documented as **Feature 34** in PROJECT_PROMPT.md before any of it was written.

| # | Task | State |
|---|---|---|
| 1.1 | Nest on Fastify, config, Prisma, health, OpenAPI | done |
| 1.2 | Auth: register/login/refresh/logout/me, rotation + reuse detection | done |
| 1.3 | Global guard, `@CurrentUser` household scoping | done |
| 1.4 | Items, dashboard, shopping, taxonomy, groups, movements, 5 stock writes | done |
| 1.5 | zod pipe over `@supplies/core/validation` | done |
| 1.6 | Error envelope carrying message keys + params | done |
| 1.7 | CORS allowlist, helmet, throttler | done |
| 1.8 | 19 e2e checks against a live database | done |
| — | Items, shopping and settings writes | done |
| — | Barcode and recipes endpoints | done |
| — | Telegram link/digest endpoints | **skipped** — see below |

**`packages/db` arrived here, and it had to.** Feature 34 makes the API a third
front end, and one that wrote its own queries would be a third implementation.
So `prisma.ts`, `queries.ts` and `stock-service.ts` moved into a package every
consumer shares — which needed one generated client instead of two
(`moduleFormat = "cjs"`), and needed Feature 4's discard and correct to move out
of `lib/actions/stock.ts` into the write path where the bot and the API can
reach them.

**Three toolchain findings, each verified rather than assumed:**

- Prisma 7's ESM output carries `import.meta`, which survives a CommonJS build
  and leaves a file Node rejects.
- **ESM for the API is a dead end.** Node ESM needs file extensions, tsc never
  adds them on emit, and Turbopack will not resolve `./decimal.js` to
  `decimal.ts` — so `packages/core` breaks one of its two consumers whichever
  way its source is written. Tried, reverted, documented.
- **tsc does not rewrite module specifiers**, so anything `nest build` compiles
  must import across packages relatively. This bit three times before it was
  written down.

**The Telegram endpoints are deliberately not built.** `createTelegramLinkAction`
mints a deep-link token and `sendDigestNowAction` triggers the daily digest —
both are settings-page conveniences that only make sense next to a bot the web
app already links. Adding them to the API would mean pulling grammy and
`lib/digest.ts` into it to serve a button no other client has. If the SPA or
the phone ever grows a Telegram settings screen, they are two thin wrappers.

> **Reversed 2026-09-07.** The SPA grew that settings screen, so the "no other
> client has it" clause expired. Both endpoints exist now, and the prediction
> held: they are two thin wrappers. The cost was as stated — `apps/api`
> depends on `@supplies/bot` and therefore grammy — and it also dragged the
> bot into the API's compile graph, which broke the API until the bot's
> cross-package imports were made relative. See the Phase 2.9 entry for 7
> September.

### Phase 2 — the SPA · in progress, 2026-09-05

| # | Task | State |
|---|---|---|
| 2.1 | Vite, React Router, TanStack Query, Tailwind scaffold | done |
| 2.3 | Auth context, in-memory access token, refresh-cookie recovery | done |
| 2.5 | Query-key map, written before the screens | done |
| 2.6 | Login, dashboard, items, item detail, item form, shopping, settings, recipes | done |
| 2.6 | Groups, archive, register, invite, password reset | **remaining** |
| 2.2 | Generate the client from OpenAPI (hand-written types for now) | **remaining** |
| 2.7 | Barcode scanner | done — shared, in `packages/ui` |
| 2.8 | Playwright against the SPA | **remaining** |

Verified in a browser rather than only by build: sign in, the dashboard shows
the seeded household's expired/expiring/low items, open an item, press «Взяли»
— 120 becomes 119 — press «Поповнити» and it is 120 again.

Two bugs that only running it could find:

- A reload landed on the login page with a valid session in the cookie jar.
  `api.post` with no body still sent `Content-Type: application/json`, and
  Fastify answers an empty JSON body with 400 *before the handler runs* — so
  `/auth/refresh`, which needs no body, was answered by the body parser.
- The item detail type was invented rather than read. `getItemDetail` returns
  the row alongside the states computed from it, and sends no per-batch expiry
  state — correctly, since shipping one would put a second copy of Feature 13's
  category inheritance on the wire.

### Review — three gaps found, 2026-09-06

Raised after the first implementation round, and all three were right.

**1. `apps/web` does not exist.** §4 has drawn the target layout since day one
and the one app that was already finished was the one still at the repo root.
The deferral had a reason — Phase 4.1 is the only step that touches production —
but the reason had quietly stopped applying: nothing on this branch is pushed,
production runs from `main`, and the "risk" was one Vercel setting flipped at
merge time rather than at commit time. Meanwhile the layout was actively
misleading, and every phase added files to a root that was going to move
anyway. Decision 8; done below.

**2. The SPA is a different product to look at.** Not a difference of taste: 22
themed primitives and a dark mode against four hand-rolled components and
`@import "tailwindcss"` on its own. Worse, some of the difference is
functional — the dashboard alone is missing the badges, the recent-activity
card and the warn-days caption, has a link that goes nowhere for group rows,
and re-implements Feature 30's split with an inline filter instead of calling
`splitExpiring`. That last one is a duplicated *rule*, in the layer nobody was
watching. Decision 9 and Phase 2.9.

**3. Native before parity is the wrong order.** Agreed and adopted as decision
10. Building a third client against a second client that is missing four routes
and three cards just copies the gaps somewhere more expensive to fix.

### Phase 4.1 — `apps/web`, moved early · done, 2026-09-06

The Next app is now `apps/web` and the root holds no application code. Verified
by running it, not only by building it: `pnpm dev`, sign in as the demo
household, dashboard renders from the real database; `pnpm build`; all 8
Playwright checks across desktop and mobile; lint, both typechecks, 351 unit
tests, 20 API tests.

**One Vercel setting changes: Root Directory `.` → `apps/web`.** The Build
Command does not, because `apps/web` grew its own `build` and `migrate:deploy`
that delegate to the repo root through `pnpm -C ../..` — Prisma has to run
where `prisma.config.ts` and the schema are. The setting and the merge have to
happen in the same window; deployment-instructions.md §2 says so at the point
someone would need to know.

Four things the move forced, each worth more than the tidiness:

- **`bot/` became `@supplies/bot`.** `apps/web`'s cron route sends the digest,
  and the digest imports the bot's reply keyboard, so `lib/digest.ts` could not
  come along to `apps/web` and could not go to `packages/db` either. Making the
  bot a package was the answer, and it removed the last `@/`-alias import
  crossing a boundary — those were the imports that would have broken silently
  on the next move rather than loudly on this one.
- **The two drift guards moved to `packages/db`.** `prisma-decimal.test.ts` and
  `prisma-units.test.ts` compare the engine's types against the generated
  client's, a comparison `packages/core` is forbidden by lint to make. They
  were in `lib/` because that was the only other place with Prisma; now they
  are where Prisma actually lives.
- **Next reads the repo-root `.env`.** Next only looks in its own project
  directory, which is now `apps/web`, while the Prisma CLI, the bot, the
  scripts and the API all read the root file. `next.config.ts` loads it
  explicitly with `override: false`, so a real environment variable — which is
  how Vercel supplies every one of these — still wins. The alternative was two
  env files and an afternoon, one day, wondering why migrations ran against a
  different database than the app.
- **Two ESLint warnings that had been hiding.** `eslint-plugin-react`'s version
  detection found no React at the root (correctly — it is in the two clients
  now), and `no-html-link-for-pages` looked for a `pages/` directory. The
  second had been dead the whole time: it is a Pages Router rule and this is an
  App Router app. Both are now settled explicitly rather than by coincidence of
  layout.

### Phase 2.9 — `packages/ui`, the shell, the dashboard · 2026-09-06

Twenty-one primitives moved out of `apps/web/components/ui` unchanged, plus
`state-badges` and `cn`. Twelve that `shadcn add` had installed and nothing
ever imported were deleted rather than carried — `alert`, `avatar`, `badge`,
`checkbox`, `field`, `popover`, `select`, `sheet`, `skeleton`, `table`, `tabs`,
`tooltip`. `sonner` stayed in the Next app because it reads `next-themes`.

Both apps now `@import "@supplies/ui/theme.css"`. The SPA's stylesheet before
this was one line: `@import "tailwindcss"`.

Verified by running all three against one database — sign in on the SPA, the
dashboard renders the same words the Next app renders, «Взяли» takes 130 to
129, «Поповнити» puts it back. Dark mode works in both.

Three things worth keeping:

- **A CSS import needs a `style` condition.** `"./theme.css": "./src/theme.css"`
  does not resolve; Tailwind resolves `@import`s itself and looks for `style`.
  The failure is loud, which is lucky — the neighbouring failure mode is a
  stylesheet that compiles, is valid, and has no tokens in it.
- **`@source "."` belongs in the package.** Tailwind's content detection skips
  `node_modules`, which is where a linked workspace package lives. Declared in
  `theme.css`, every consumer gets it by importing the theme.
- **`Button render={<Link/>}` needs `nativeButton={false}`.** Found by reading
  the browser console after the screens rendered, not by any test. The Next app
  already does this in eight places; the port had dropped it.

The SPA bundle went from 400 kB to 590 kB (127 → 192 kB gzipped) — Base UI and
lucide. Worth a code-split before the deploy in Phase 4, not before.

### Phase 2.9 — «Запаси», and a list URL that meant two things · 2026-09-06

The items list is done: search, the sort menu, filter and category chips,
pagination and page size, the group badge, location and minimum.

**Aligning it turned up a real bug, in the API rather than the SPA.** Feature
27 says the list's whole view state travels in the URL, and `itemListSearch`
in `@supplies/core` writes that URL. It was only ever being written in one
place and read in three — and the readings had drifted: the API had settled on
`category` and `perPage` where the writer emits `cat` and `per`.

The effect was quiet, which is what makes it worth recording. A filtered list
in the Next app is a link you can send to someone. Hand that identical query
string to the API and it answered with a *different* list — all categories,
default page size — with no error, no warning, and a perfectly plausible
result. Nothing failed; it was just the wrong answer.

`parseItemListSearch` is now the inverse of `itemListSearch` and the only
reader, used by the Next page, the API and the SPA. Six unit tests pin the
round trip, and three e2e checks pin it over HTTP; the category one was run
against the old controller first and fails there, so it has teeth.

The proof that mattered: `/items?per=10&page=2` open in both clients returns
byte-identical rows, badges and «11–15 з 15».

Two smaller things:

- **`use-item-sort` moved into `packages/ui`.** Feature 12.2's per-device sort
  preference is presentation state that both web clients now offer. A second
  copy would be a second answer to "what did this person choose last time".
- **`packages/ui` is excluded from the root tsconfig.** It is the one package
  that legitimately needs the DOM and JSX, and it has its own config. The
  exclusion is the boundary working rather than a hole in it — the root config
  still has no DOM lib, so the moment `core` or `db` reaches for `window` it
  says so. `pnpm -r typecheck` covers every package under its own settings.

### Phase 2.9 — the scan button and «Набори» · 2026-09-07

Both spotted by using the SPA's items page next to the Next one.

**The barcode scan button moved to `packages/ui`** rather than being rebuilt.
It is a camera, a decoder and a dialog — nothing Next-specific — and a second
scanner would sooner or later disagree about which formats it reads or how it
strips non-digits. `@zxing/browser` moved with it. The lookup behind it was
already shared: `GET /api/barcode/:code/item` answers the same question
`findItemByBarcodeAction` does, out of `@supplies/db/barcode-service`.

**Moving it exposed a latent bug in the Next app.** The component had `onScan`
in its effect's dependency array, and every call site writes that handler
inline — so any parent re-render while the dialog was open tore the camera down
and started it again. Typing in the search box beside the button was enough.
The fix is a ref holding the latest callback, so the effect depends only on
what should actually restart the camera; asking each caller to `useCallback`
puts the burden in the wrong place and is one forgotten wrap from the same bug.
Both clients get the fix.

**«Набори» needed the screens to exist first**, so a button linking nowhere was
not an option — the two group screens landed with it. That in turn needed
`GET /api/groups/:id`, which did not exist: the API had every group *mutation*
and no way to read one. Feature 26.2's membership editor came with it, barcode
scan included.

Verified against all three running on one database: the button appears only
because the household has a set; the set's editor found «Кава мелена», added it
(the total became «200 г»), and removed it again, leaving the set as found. The
scan dialog opens and reports the camera correctly as unavailable in a headless
pane — the camera itself remains the one thing only a real device can prove,
as it always has been for the Next app.

`?name=` and `?barcode=` now carry into the SPA's item form, so «Створити»
under a fruitless scan is not a dead end.

### Phase 2.9 — «Покупки», and two API bugs · 2026-09-07

The shopping screen is the biggest one in the app — 800 lines in the Next
version across three components — and it ports whole: drag between groups, the
move menu for when drag is impossible, group create/rename/delete, per-group
add fields, the buy dialog and its stock-in, check and uncheck, archive and its
reveal toggle, row editing, the candidate suggestions with their detail lines,
and «додав Антон» / «купив Оксана» on every row.

**Feature 11's rules had never left `apps/web`.** Creating, renaming, deleting
and moving between shopping groups lived only in `lib/actions/shopping-groups.ts`
— five functions the API had no route for. Writing them again in a controller
would have been the third copy of "a group name is unique within a household"
and the second of "deleting a group returns its rows to «Загальна група»
rather than destroying them", so they moved to
`packages/db/shopping-groups-service` first and both front ends now call them.
`ShoppingGroupsController` is new, under `/shopping-groups` rather than more
routes on `/shopping/:id/…`, where a future `/shopping/groups` would collide
with the row routes.

**A POST with no body was a 500.** Ticking a free-text row off sends nothing —
a one-off has no stock to record — and Fastify hands Nest `undefined` for that
body, so `body.rows` threw. Nine handlers had the same shape. `EmptyBodyPipe`
normalises an absent body to `{}` globally, because fixing it per handler means
writing `body?.x` in nine places and forgetting it in the tenth. Two e2e checks
pin it, and both were run against the un-piped app first to confirm they fail
there.

Also shared rather than copied: `id-set-store` with `use-collapsed-groups` and
`use-shown-archived` — the per-device collapse and archive-reveal preferences —
moved into `packages/ui`. The SPA gained a toaster, because the web app reports
refusals that way on this screen and inline notes would be a different
interaction for the same events.

Verified against all three running on one database: created «Аптека», moved a
row into it with the move menu (the default group went 8 → 7, «Аптека» 0 → 1),
renamed it, deleted it and watched the row come back to 8 with the toast that
says so; ticked a free-text row off and back; archived it and revealed it
again; opened the buy dialog on «Хліб житній» and used «Без запасу», which
flipped the row to «купив Антон» without touching stock. The list was put back
to its seeded two rows and no groups afterwards.

One thing worth knowing for next time: **`pnpm test:api:e2e` signs you out.**
The refresh-replay check deliberately revokes every session for
`anton@example.com`, so a browser logged in as the demo user is logged out by
the suite. That is the theft response working, not a bug.

### Phase 2.9 — «Налаштування», and a skip revisited · 2026-09-07

Seven panels, all of them: household, categories with Feature 13's
per-category warn window, locations, item groups with their thresholds and a
link into each set, Feature 16.3's duplicate report, members and invites,
Telegram, password.

**The Telegram skip is reversed.** Those two buttons were left out of the API
on the grounds that they were settings-page conveniences next to a bot the web
app already links. That reasoning held right up until the SPA had a settings
page of its own; parity here means the same two buttons, and the alternative
was telling someone to go and use the other client. The cost is named rather
than hidden: `apps/api` now depends on `@supplies/bot`, and so on grammy, to
send a digest. Reading whether a chat is linked never did — that is a row.

**Three more services had never left `apps/web`**, the same finding as Feature
11 on the shopping screen: `changePassword` and `createInvite` (now
`packages/db/account-service`, with `email.ts` moving there too) and the
Telegram link token (`packages/db/telegram-service`). `sendDigestNow` went to
`bot/digest-now.ts` instead, because `bot` already depends on `packages/db`
and putting it the other way round would be a cycle.

`SettingsListPanel` moved to `packages/ui` — 276 lines of drag-to-reorder that
both clients need. Sharing it meant taking `useRouter` and `toast` out: its
callbacks now return a boolean and the host decides what a refusal looks like.
The Next app supplies them through a new `useActionRunner`, the SPA through
its own `useWrite`.

Two bugs found by using it:

- **Pulling `bot/` into the API's compile graph broke the API.** The bot
  imported across packages by specifier, tsc left those verbatim on emit, and
  Node then resolved them to `.ts` files outside `dist` — `ERR_MODULE_NOT_FOUND`
  at boot. This is the trap apps/api/CLAUDE.md already documents for
  `packages/core` and `packages/db`; the bot had never been in that graph, so
  it had never had to follow the rule. Its cross-package imports are relative
  now, and bot/CLAUDE.md says why.
- **Changing the household warn window left every category placeholder quoting
  the old one.** Each category's day field shows the household default as its
  placeholder, meaning "inherit this", and `keys.household` was missing from
  the invalidation list. The Next app never had it because `router.refresh()`
  re-renders everything.

Also corrected: `updateHousehold`'s signature omitted `name` while the schema
parsed it and Prisma saved it — the rename worked and the type denied it.

Verified against all three on one database: saved the warn window and watched
the dashboard caption follow it to «попередження за 9 дн.»; added a category,
gave it its own 14-day window, starred it, un-starred it, deleted it; had
«Продукти» refused with «Категорію не можна видалити: у ній є товари.»; set
and cleared a set's threshold; created an invite link pointing at
`APP_URL/join/…`; minted a Telegram deep link with the real bot username; and
was refused a password change with «Поточний пароль невірний.» Everything was
put back to the seeded values.

### Phase 2.9 — the item page and its form · 2026-09-07

The last two partial screens are done, and with them the parity gate is one
row from closed.

**Item detail** shows the batches in the order FEFO will actually draw them —
by calling `fefoOrder` from `@supplies/core`, not by re-deriving "soonest
expiry first, then undated oldest-first, expired excluded". That meant a
`reviveBatch` alongside the existing revivers: the engine wants `Decimal` and
`Date`, and JSON has neither. Reviving is the cheap half of the bargain; the
expensive half would have been a second implementation of §3.3 that agreed
with the server until it did not. Plus per-batch take, correct and discard,
Feature 4's multi-row restock with its barcode check, the shortfall refusal
inline, the movement history, and archive with its confirmation.

**The item form** carries the whole of Feature 16.1 (a duplicate warning that
recomputes as you type and never blocks), Feature 10 and 20 (the barcode
lookup on scan *or* blur, with the GS1 manufacturer fallback worded as a
separate fact rather than a name), Feature 18.2's opt-in share, Feature 26's
set picker that replaces the minimum with a pointer to where it actually
lives, and §3.2's unit lock.

Both use `useState` where the Next versions use react-hook-form. That is a
dependency difference, not a behavioural one: the schema is `itemSchema` from
`@supplies/core/validation/item` in both, so the two forms refuse exactly the
same items for exactly the same reasons, and the API refuses them again.

Verified against both clients on one database. `/items/<id>` returns
byte-identical headings, quantity, minimum, batch count and FEFO order in the
SPA and the Next app. In the SPA: took one (150 → 149), was refused 99999 with
«Не вистачає 99 850 штук — доступно (не прострочено) лише 149 штук» *inside
the dialog next to the field*, restocked one (149 → 150), added and removed a
second row in the multi-row form, corrected a batch 1 → 2 → 1 (151 → 150),
saw «Усю партію» fill the field with the batch's own quantity, watched
«Кава мелен» raise the duplicate warning, watched the set picker swap the
minimum field for its pointer, and typed a barcode whose lookup answered
«За даними GS1 Україна, виробник — ТОВ «САНДОРА»» with the share checkbox
offered and unchecked. The item ended where it started: 150, no set, minimum 4.

One test-harness note worth keeping: **React's `onBlur` is delegated from
`focusout`**, so a synthetic `blur` event never reaches it. The first run of
the barcode-blur check looked like a broken feature and was a broken test.

### Phase 2.10 — the audit, and the board it produced · 2026-09-07

Seven items, all closed. **The parity gate is closed with them**, which
unblocks Phase 3.

**Decomposition (2.10.1).** The four route monoliths became routes that
compose. `shopping.tsx` went 1097 → 187 lines, `items.tsx` 509 → 145,
`settings.tsx` 736 → 102, `item-detail.tsx` 715 → 311, `item-form.tsx` 544 →
230. What came out of them is 30 files under `components/{items,shopping,item,
item-form,settings,auth}/` and eight hooks under `hooks/`.

The split is not by line count. **Hooks hold what is true; components hold
what it looks like.** `useItemList` owns the debounce, the "which control
resets the page" rule and the sort precedence — the three things on that
screen that are easy to get subtly wrong — and they now read in thirty lines
with no list row in sight. `useShoppingList` owns the grouping and the
invalidation; `useBuyFlow` owns the one write that reports its own errors,
because a shortfall belongs beside the field that caused it and the shared
runner toasts.

One thing the split preserved on purpose: `ItemSearchBar` is rendered
unconditionally by its parent, and its own doc comment says why. It used to
sit inside a `page && (…)`, so every debounced keystroke unmounted the field
and took the caret with it. Having no `data` in scope in that file is now what
keeps the rule true.

**Code splitting and the boundary (2.10.2).** Ten of twelve routes are `lazy`.
`/login` and `/dashboard` stay eager because each is somebody's first paint —
a chunk fetched during a tap is free, a chunk fetched before the app opens is
not. First paint went **749 KB → 603 KB**; `@dnd-kit` (43 KB) and the Base UI
dialog (9 KB) left it entirely, since only lazy routes reach them.

A blanket `manualChunks` vendor split was tried and reverted, and the config
says so: naming a chunk *overrides* Rollup's automatic async splitting, so
dnd-kit, the dialog and the 408 KB `@zxing/browser` were all dragged back into
the first paint. It bought caching and cost 63 KB on the visit that matters
most. What survives is a `react` chunk, which is honest about buying the
second visit rather than the first.

`ErrorBoundary` is a class, because catching a render error is still the one
thing React has no hook for. It sits INSIDE the shell, not around it: a screen
that throws leaves the header and the nav standing, since those are how the
reader reaches a screen that works. `resetKey={pathname}` clears it on
navigation.

**The last shared rule (2.10.3).** The audit found password reset living only
in `apps/web/lib/actions/auth.ts`, talking to Prisma directly — token hashing,
the one-hour expiry, single-use marking, and the enumeration-safe always-ok
answer. The API could not offer the feature because the rules were not
reachable from it. All three moved to `@supplies/db/account-service`, and the
Next actions are now four one-line delegations.

Pulling that thread found something worse. **Registration had two
implementations and they had already drifted.** `RegistrationService` in the
API consumed an invite with a conditional `updateMany` inside the transaction;
the web app's server action did not — so two people opening the same invite
link at the same moment could both join on one token. The version that kept
its guarantee is the one that survived; `registration.service.ts` is deleted
and both callers now go through `registerUser`. What deliberately stays with
the callers is the session: Next writes a NextAuth cookie, the API issues a
token pair, and both build it from the same row.

A latent bug fell out on the way: `createInvite` took an `appUrl` and
`inviteEmail` ignored it in favour of `process.env.APP_URL`, so an invite
could return one link to the caller and email a different one. Both templates
now take the base URL as an argument, which makes that disagreement
impossible to express.

Four endpoints: `POST /auth/forgot-password`, `POST /auth/reset-password`,
`GET /auth/invite/:token`, and a rewritten `POST /auth/register`. The status
mapping lives in the controller rather than the service, because a taken email
is a 409 and a dead invite is a 400 while `unwrap` answers 422 for everything
— and status codes are HTTP's business.

**Six new e2e checks**, each of which fails against the previous commit. The
one worth naming asserts that `forgot-password` answers an unknown address
**byte-identically** to a known one: same status, same body. That is the whole
security property, and it is exactly the kind of thing that decays silently
without a test.

**The last five screens (2.10.4).** `/items/archive`, `/register`,
`/join/:token`, `/forgot-password`, `/reset-password` — plus the two stragglers
on `/items`, Feature 16.2's create affordance and the archive link. The four
public routes share `useAuthForm`, which is `useState` where the Next versions
use react-hook-form and the same schema from `@supplies/core/validation/auth`
in both, so the two clients refuse the same input for the same reasons.

The join screen fetches the household name before offering the form, because
«Приєднатися до «Наша родина»» and «Приєднатися» are different questions.
Holding the single-use token is the authorisation for that name, which is why
the endpoint is public and why it 404s the moment the token is spent.

**Web's error primitives (2.10.5).** `error.tsx`, `global-error.tsx`,
`not-found.tsx` and `(app)/loading.tsx` — none of which existed, in an app
that already called `notFound()` in three places and was therefore shipping
Next's English default 404. `global-error.tsx` carries its own `<html>` and
inline styles on purpose: the failure it exists for includes the case where
the theme provider or the font loader is what threw.

**Boundaries that bite (2.10.6).** The audit's sharpest finding was that
`packages/core`'s contract is enforced by ESLint and nothing else was.
`packages/ui` may no longer import `next/*` or `react-router` — both, in
opposite directions, are the coupling the owner ruled out. `apps/spa` may not
reach `@supplies/db`, Node builtins, another app, or the two `@supplies/core`
modules that are server-only despite the wildcard export. `apps/web` may not
grow a second router or a second cache.

Each rule was **proved to fire** by writing a violating import and watching
lint fail, then deleting it. A boundary rule that matches nothing is worth
nothing.

**Deferred, unchanged from the board.** `useActionState` in web is a rewrite
of seven working forms for idiom alone. Component tests for both clients
belong with Phase 4.5's CI matrix rather than as a harness with three tests in
it.

**Not run: the API e2e suite.** It needs the local Postgres and Docker was not
running on this machine. Everything else passed — lint, four typechecks, 357
unit tests, 20 API unit tests, all three builds — and the compiled API `dist`
was checked for the specifier trap that has bitten three times before (no
non-relative `@supplies/` survives compilation). The six new checks are
written and unrun.

### Phases 3–5 — not started

React Native, the deploy, iOS. **The Phase 2.9 parity gate closed on
2026-09-07**, so decision 10 no longer blocks Phase 3: every screen the Next
app has, the SPA has, and the last business rule that lived in only one of
them now lives in `packages/db`.

### Start here

**Phase 0.2 — the `decimal.js` decoupling — is the first commit**, and it is
worth doing even if everything after it is abandoned: it removes the generated
Prisma client from the engine's bundle graph, which is a live constraint on the
current web build. That is F4 from ARCHITECTURE_REVIEW.md, closed at last, on
its own merits.
