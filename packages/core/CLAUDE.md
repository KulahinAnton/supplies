# packages/core — the rules, with no runtime attached

`@supplies/core` is every rule this app enforces, in a form that a Next.js
server, a NestJS API, a Vite SPA and a React Native bundle can each import
without any of them dragging in the other three's dependencies.

Plan and phases: [SPA_API_PORT.md](../../SPA_API_PORT.md).

## The rule that matters

**Nothing in here may import Prisma, React, Next, or a Node builtin that a
phone does not have.** That is the entire contract, and it is what makes the
package worth having — the moment one module reaches for a database client,
every consumer inherits it.

`@supplies/db/queries` and `@supplies/db/stock-service` deliberately stayed behind for
exactly this reason. They are where the database meets these rules, and that
seam belongs to whoever owns the database, not to the rules.

`telegram-link.ts` uses `node:crypto` and is the one module here a React Native
build must not import. That is safe because of how the package is exported,
below — not because anyone remembered.

## The runtimes disagree about `Intl`, and Hermes is the strict one

**`Intl.PluralRules` does not exist on Hermes.** `format.ts` constructed one at
module scope and every React Native screen that imported the module crashed on
load with `undefined cannot be used as a constructor` — while the same file's
`Intl.DateTimeFormat` and `Intl.NumberFormat`, three lines away, worked fine.
That asymmetry is the whole trap: a partial `Intl` looks present until the one
missing constructor runs.

Nothing caught it before a device did. Node has the full ICU, so the tests
passed; browsers have it, so both web clients were fine; `expo start --web`
runs under react-native-web in a browser, so even the mobile preview was fine.
**Only Hermes on the emulator failed**, which is the argument for booting one
before building screens rather than after.

The fix was to write CLDR's `uk` rule out in `selectUkPlural` rather than
polyfill it in the phone. A polyfill in one client papers over an assumption
the PACKAGE got wrong, and the next consumer with a partial ICU — an older
Android, a different JS engine, an edge runtime — hits it again. This app is
Ukrainian-only by design (§8), so it needs one language's rule, not CLDR's
machinery. `format.test.ts` compares the hand-written rule against Node's real
`Intl.PluralRules` over every integer 0–1000 and a spread of decimals, so
"written out" is checked rather than trusted.

**And a present constructor is not a working one.** `Intl.NumberFormat` exists
on Hermes and formats `1234` as «1 234» — but `format(BigInt(1234))` throws
`TypeError: Cannot convert BigInt to number`. `formatQuantity` passed a BigInt
so that a quantity longer than a safe integer would still group, and on the
phone every quantity therefore fell through to the raw-string fallback: «0.8
кг» with a decimal POINT where both web clients showed «0,8 кг», and no
thousands separator anywhere. It shipped unnoticed because the seed has no
four-digit quantities, so the only visible difference was a dot instead of a
comma on a single item.

The grouping is now four lines of string work, checked against Node's real
`Intl.NumberFormat` over 0–2000 and up to nine digits. Two failures of the same
shape were enough: this package is portable by contract, so it does not get to
find out one screen at a time which parts of `Intl` a runtime implements.

**Before adding any `Intl` API here, check it against Hermes — and check the
arguments, not just the constructor.** What is proven on the emulator, by
probe: `DateTimeFormat` with a `timeZone`, `NumberFormat` with a `number`, and
`NumberFormat` with `style: "currency"` — `formatUsd(0.0123)` gives «0,0123
USD» on Hermes and in a browser alike. What is not: `PluralRules`, which is
absent, and `NumberFormat.format` with a **BigInt**, which throws.

The probe is three lines at the top of `apps/mobile/app/_layout.tsx` and reads
in the Metro log, not `adb logcat` — worth knowing, because it turns "is this
safe on a phone" from an argument into a thirty-second answer.

## No barrel

There is no `index.ts`, and there must not be one. The `exports` map is

```json
"exports": { "./*": "./src/*.ts" }
```

so a consumer imports `@supplies/core/stock`, never `@supplies/core`. A barrel
would make one import pull the whole package into the module graph, and Metro
would then bundle `node:crypto` into a mobile app that never asked for it.

Subpaths also mean the import says what it needs, which is the same reason
`lib/queries.rsc.ts` exists as its own module rather than a flag.

## Source, not `dist`

The package ships TypeScript and has no build step. One source of truth, no
stale artefact, and no watcher to forget to run. The cost is one line per
consumer that bundles it — `transpilePackages: ["@supplies/core"]` in
`next.config.ts`, and the equivalent when the SPA and the mobile app arrive.

## Decimal

Quantities are **decimal.js**, via `src/decimal.ts`. Never float math.

`Prisma.Decimal` is decimal.js too, so rows read from the database interoperate
with values computed here — decimal.js identifies instances by a prototype
`toStringTag` rather than `instanceof`, precisely so a value from a second copy
of the library still counts.

That property is load-bearing and invisible. `packages/db/src/prisma-decimal.test.ts` — in the
app, where importing Prisma is free — pins it, because a regression would be
silently wrong quantities rather than a crash.

Values reach the database as strings, through `toDbQuantity()`.

## Units

`src/units.ts` declares the six units rather than importing the generated Prisma
enum, so a consumer can typecheck without having run `prisma generate`.
`packages/db/src/prisma-units.test.ts` compares the two lists and fails if the schema gains a unit
this package lacks.

## Tests

Colocated, and they moved with the code they cover. They import relatively, so
`pnpm test` runs them identically from a checkout that has no database, no
`.env` and no generated client.

The exceptions live in `lib/` on purpose: the drift guards above need Prisma to
compare against, which is exactly what this package may not have.

## Messages

Pure functions return a message **key plus params** (`ruleMessage(...)`), never
a formatted sentence — `src/messages.ts` holds the Ukrainian. That predates this
package and matters more now: the API will send keys over HTTP, and three
clients will render them. A rule that returned prose would force the same
sentence to be translated in three places.
