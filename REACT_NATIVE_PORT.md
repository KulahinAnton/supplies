# Porting Supplies to React Native — feasibility and cost

Assessment only. Nothing here is implemented; this branch exists to hold the
work if the answer is yes.

## Verdict

**Possible in this repo, and the domain logic ports almost untouched. But the
work is not mostly React Native.**

The dominant cost is that this app has **no API**. 16 pages are React Server
Components reading Prisma directly, and 45 server actions write through it.
React Native can call neither: server actions are a Next.js RPC over the RSC
protocol, and Prisma cannot run on a phone. So "port to native" is really
**build an HTTP API, then build a second UI against it** — the React Native
part is the smaller half.

Realistic total for one person, part-time: **6–10 weeks**, of which roughly
half is rewriting screens.

## What already ports, unchanged

18 of the 36 modules in `lib/` have no runtime dependency on Prisma:

```
expiry · period · format · item-filter · item-sort · pagination
item-list-params · shopping-groups · ordering · duplicates · messages
metro · gepir · barcode-source · telegram-link · off-contribute
action-result · utils
```

That is the whole rules engine that has no Decimal in it, every Ukrainian
string, all `uk-UA` formatting, and the barcode sources — plus the tests that
cover them. `lib/format.ts` imports `Unit` **as a type only**, so it is erased
at compile time and the module really is portable, exactly as
`components/CLAUDE.md` claims.

## What needs a small change first

`lib/stock.ts`, `lib/item-group.ts` and `lib/shopping.ts` import `Prisma` as a
**value**, only to reach `Prisma.Decimal`:

```ts
import { Prisma } from "@/lib/generated/prisma/client";
```

That single import pulls the generated client into any bundle that touches the
engine. This project already documents what that does to a browser build —
`node:module` arrives and Turbopack fails — and Metro would hit the same wall.

**Fix:** depend on `decimal.js` directly (which is what Prisma re-exports) and
type the engine on that, converting at the database edge in `lib/queries.ts`
and `lib/stock-service.ts`. Half a day to a day, ~314 tests to keep honest, and
it improves the web build too by making the engine genuinely bundle-safe. This
is the right first commit on this branch whether or not the port happens.

## What does not port at all

| | Size | Why |
|---|---|---|
| Screens and components | 16 pages, 25 components, 22 UI primitives, ~4.8k lines | Tailwind + shadcn/Base UI render DOM. React Native has no DOM. NativeWind gives you Tailwind-like class names; it does not give you the components |
| Server actions | 45 across 8 files | No equivalent on RN. Each needs an HTTP endpoint |
| Auth | Auth.js v5, JWT in cookies | Phones need bearer tokens in secure storage, not cookies |
| Cache invalidation | `revalidatePath` everywhere | Replaced by a client cache (TanStack Query) |

One thing genuinely in your favour: the actions are already thin. Business
logic lives in `lib/stock-service.ts` and `lib/queries.ts`, and every action
already returns a typed `ActionResult`. Endpoints would be wrappers, not
rewrites — this is the payoff of the "one implementation, two front ends" rule
that the Telegram bot already proves.

## Cost breakdown

| Work | Estimate | Notes |
|---|---|---|
| Decouple the engine from `Prisma.Decimal` | 0.5–1 day | Do this regardless |
| HTTP API over the existing engine | 1–2 weeks | tRPC keeps end-to-end types and suits a single client; REST if you ever want third parties |
| Token auth for mobile | 2–4 days | Refresh tokens, `expo-secure-store`, and a decision about the 8h session |
| Expo app: shell, navigation, 16 screens | 3–5 weeks | The bulk. Lists, forms, filters, the multi-row add form |
| Native barcode scanning | 1–2 days | `expo-camera` — simpler and more reliable than the current two-path web scanner |
| Push notifications | 2–3 days, optional | Would replace or complement the Telegram digest on iOS |
| Store setup, builds, release | 3–5 days | EAS Build; **iOS needs a Mac or EAS cloud**. $99/yr Apple, $25 once for Google |

## Doing it in this repo

Workable, and the usual shape:

```
apps/web      (this Next.js app)
apps/mobile   (Expo)
packages/core (the engine, messages, formatting, validation)
```

pnpm workspaces already back this repo, so the move is mostly mechanical.
Three specific frictions:

1. **Metro needs teaching about the workspace** — `nodeModulesPaths` and
   symlink resolution, or it will not find `packages/core`.
2. **The `@/` alias has to become a package name.** Everything imports
   `@/lib/...` today; shared code becomes `@supplies/core`.
3. **Prisma must never enter the mobile module graph** — the same rule as the
   browser bundle, now enforced across two build systems. The Decimal change
   above is what makes that possible.

## Worth asking before starting

You already ship an installable PWA (`app/manifest.ts`, icons, offline-capable
shell). The honest question is what native buys that it does not have:

- **Barcode scanning** already works on iOS — `BarcodeDetector` on
  Chrome/Android, `@zxing/browser` over `getUserMedia` everywhere else. Native
  would be faster and more reliable, not newly possible.
- **Push notifications** are the real gap on iOS, and today Telegram fills it.
- **Home-screen presence and app-store discovery** are real, but this is a
  household app with a fixed set of users.

If the driver is "scanning on my phone is clumsy", a week improving the
existing scanner is a tenth of the cost. If the driver is wanting a real app in
the stores, the estimate above holds.
