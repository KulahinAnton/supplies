# Technical review — 2026-09

Scope: everything on `main` plus the three open branches (`feature/recipes`,
`feature/offline-sync`, `feature/react-native`). Method: read the code, verify
each suspicion against the source before writing it down, and say plainly when
something that looks wrong is actually fine.

One calibration up front: **this codebase is in better shape than most at this
size.** One write path shared by three front ends, rules in pure tested
functions, documentation that explains *why*, derived-not-stored quantities.
The findings below are ranked by what they would cost the household, not by how
easy they were to spot — and at 72 items and 2 users, nothing here is on fire.
Two of them are still real bugs.

---

## P1 — correctness bugs, live today

### F1. Concurrent stock writes lose updates

**Evidence:** `lib/stock-service.ts` — `consume()` loads the batches, plans
FEFO *outside* any transaction, then writes **absolute** quantities computed
from that stale read:

```
const plan = planConsume(item, item.batches, amount, todayUTC());  // read + plan
await prisma.$transaction(async (tx) => {
  await tx.stockBatch.update({ data: { quantity: draw.remaining.toFixed(3) } });
```

Two people take from the same item at the same moment: both read `10`, one
writes `8`, the other writes `7` — and the household has lost a take. The
second write can also *resurrect* stock (batch at 2, both plan from 10, loser
writes back 7). `consumeBatch`, `correctBatchAction` and `discardBatchAction`
follow the same read-plan-write shape. This is a multi-user app; two phones in
one kitchen is the normal case, not the edge case.

**Why it has not bitten visibly:** the window is milliseconds and the household
is two people. It will bite exactly once, as an inventory that quietly stops
matching the fridge, and nobody will be able to say when.

**Fix (choose one):**

- *Preferred:* move the read inside the transaction and run it
  `isolationLevel: "Serializable"`, retrying once on Prisma `P2034`
  (serialization failure). Smallest diff, matches the existing code shape,
  and the retry re-plans FEFO against fresh state — which is already the
  design principle the offline replay uses.
- *Alternative:* keep the optimistic read but make every write conditional —
  `updateMany({ where: { id, quantity: <planned-from> }, ... })` and treat
  `count === 0` as "someone moved first", re-plan, retry. More code, no
  isolation-level dependency, and the conflict branch is unit-testable.

**Effort:** half a day including a smoke check for the conditional branch.

### F2. Movement timestamps render in the server's timezone

**Evidence:** `lib/format.ts` — `dateTimeFormatter` has no `timeZone` option,
so `formatDateTime` renders instants in whatever zone the process runs in.
Vercel runs UTC; the household lives in Kyiv. Every «Останні дії» entry and
every movement time in production shows **2–3 hours earlier than it happened**.
Flagged during Feature 12 work; never fixed.

**Fix:** pin `timeZone: "Europe/Kyiv"` on `dateTimeFormatter`, and pin
`timeZone: "UTC"` on the date-only formatter so `@db.Date` values keep matching
`lib/period.ts`'s UTC arithmetic (midnight-UTC + Kyiv offset stays the same
calendar day, but explicit beats accidental).

The house convention says household settings are data, not constants — the
*right* shape is a `Household.timezone` column. For one family in one city
that is machinery without a customer; hardcode it with a comment naming the
upgrade path, and add the column the day a second timezone exists.

**Effort:** an hour, including a test that formats a known instant.

---

## P2 — architecture debt with cheap exits

### F3. Every navigation scans the whole household two or three times

**Evidence:** `app/(app)/layout.tsx` runs on every page and calls
`getAttentionCounts()` → which calls `getItemViews()` (all items, all batches,
all categories) plus `getRestockEntries()`. The page under it then calls
`getItemViews()` again (dashboard, items, recipes…). `getHousehold()` is
called by the layout, by `getItemViews` internally, and often by the page —
three identical queries per request. Nothing memoizes: `React.cache` appears
nowhere in the repo.

At 72 items this is invisible. What it actually costs is **round-trips to
Neon** — the latency is per-query, not per-row, and it doubles the work of
every request forever.

**Fix — with one trap to respect:** the obvious move is wrapping the query
functions in `React.cache()` for per-request deduplication. But
`lib/queries.ts` deliberately has plain-Node consumers (the bot, the digest —
see the `server-only` note in CLAUDE.md), and request-scoped caching semantics
outside an RSC request are not something to lean on. So: a thin
`lib/queries.rsc.ts` that does `import "server-only"` and re-exports the hot
readers wrapped in `cache()`; layout and pages import from there, bot and
digest keep the uncached module. One file, ~15 lines, no behaviour change.

**Effort:** half a day including verifying the dedup with a query-count log.

### F4. The "pure engine" is not pure — it value-imports the generated client

**Evidence:** `lib/stock.ts`, `lib/item-group.ts`, `lib/shopping.ts` do
`import { Prisma } from "@/lib/generated/prisma/client"` for `Prisma.Decimal`.
That one import drags the generated client into any bundle that touches the
engine — already documented as fatal for browser bundles (the `node:module`
failure), and the reason `lib/format.ts` has a standing "must stay Prisma-free"
rule that every future contributor can trip over.

**Fix:** depend on `decimal.js` directly (it is what Prisma re-exports), type
the engine on it, convert at the database edge in `queries.ts` /
`stock-service.ts`. Identified in REACT_NATIVE_PORT.md; worth doing **on
`main`, now, regardless of any native-app decision** — it converts a
convention enforced by vigilance into one enforced by the import graph.

**Effort:** a day; ~330 unit tests keep it honest.

### F5. The recipe call can outlive its serverless function

**Evidence:** `lib/claude.ts` constructs `new Anthropic()` with the SDK default
timeout (**10 minutes**) and default retries (2). On Vercel Hobby the function
hosting the server action has a far smaller duration budget. A slow or hung
upstream call means the *platform* kills the function before the SDK gives up —
the user gets a generic Next error instead of the Ukrainian
`recipe.unavailable` message this module exists to guarantee, and a retry may
double-bill a completed request.

**Fix:** `new Anthropic({ timeout: 25_000, maxRetries: 1 })`, and
`export const maxDuration = 30` on the recipes route segment. Also worth doing
with zero code: set a **monthly spend limit in the Anthropic console** — that
is the real cap on a button any household member can press repeatedly, and it
is better placed there than in a hand-rolled rate limiter.

**Effort:** an hour.

### F6. Every bot update reads the same row twice

**Evidence:** `bot/bot.ts` — `withUser` → `resolveChat()` does
`telegramLink.findUnique` (with the user), then `settleKeyboardDebt` →
`keyboardVersionOf()` does `telegramLink.findUnique` on the same chat id
again. One webhook message, two identical lookups.

**Fix:** return `keyboardVersion` from `resolveChat` (it already holds the
row) and pass it down. Fold `getPending` in too if feeling thorough — three
reads become one.

**Effort:** an hour.

---

## P3 — process and operations

### F7. Parallel branches with migrations, and the drift dance

It happened twice this project already: the dev database carried
`feature/offline-sync`'s migrations while another branch was checked out, and
`prisma migrate dev` refused with drift — resolved by hand-dropping tables and
history rows. The prod-copy database was also three migrations behind and
crashed the app on login.

This is not a code bug; it is what long-lived schema branches cost. **Policy
worth adopting:** a branch that adds a migration merges within days or rebases
before anyone else migrates; the drop-table recovery goes in prisma/CLAUDE.md
so next time it is a procedure, not an investigation. Note the standing
instance: `feature/offline-sync` holds two migrations *older-dated* than
`feature/recipes`' — `migrate deploy` handles out-of-order arrival fine, but
merge offline soon or re-date on rebase.

### F8. Production failures are invisible

There is no error reporting. A production exception is seen only if a family
member mentions it. For an app this size, Sentry's free tier (or even a
`console.error`-to-Telegram hook using the bot that already exists) changes
"my wife says it was broken yesterday" into a stack trace with a timestamp.

**Effort:** half a day for Sentry; the Telegram-hook version is a fun afternoon
and zero new vendors.

### F9. Backups are manual

`pnpm backup:prod` exists and restores are verified — genuinely better than
most hobby projects. But it runs when someone remembers, and Neon's free-tier
history window is short. A monthly GitHub Actions cron that runs the dump and
uploads an artifact (or the calendar reminder equivalent) closes the "nobody
ran it since August" hole. Mind the secret: the job needs the direct database
URL; store it as an Actions secret, never in the workflow.

### F10. The untestable surface is documented — keep it that way

Camera scanning and drag-reorder are honestly labelled "no automated check
possible; verified by hand". That is the correct posture. If UI regressions
start recurring, the next step is one Playwright smoke (login → add stock →
take stock) in CI — but do not build that speculatively; the current
test pyramid (330 unit, 62 integration) is well shaped for the codebase.

---

## Explicitly not issues

Things a reviewer might flag that are deliberate and correct at this scale:

- **In-memory pagination** (`getItemsPage` loads all, then slices): the
  alternative is re-implementing derived stock/expiry state in SQL — a second
  implementation free to disagree with the first. Right call below ~1k items;
  revisit only with evidence.
- **`lib/queries.ts` at 600+ lines:** it is the single DB↔engine seam by
  design. Splitting it would scatter the one boundary worth guarding.
- **JWT with no revocation list:** `validSessionOrNull` re-reads the user per
  request, so deactivation works immediately. Password change not killing old
  sessions is acceptable for a family app; note it, do not build it.
- **`bcryptjs` over native bcrypt:** slower, but immune to serverless native-
  binding pain. Correct trade here.
- **Cron endpoint security:** checked — `CRON_SECRET` is enforced with a 503
  when unset. Fine.

---

## Suggested order

| # | Item | Size | Why this order |
|---|------|------|----------------|
| 1 | F2 timezone pin | 1h | Live user-facing bug, one-line fix |
| 2 | F5 Claude timeouts + console spend cap | 1h | Before the recipes PR merges — it ships the exposure |
| 3 | F1 serializable stock writes | 0.5d | The only silent-corruption risk in the codebase |
| 4 | F6 bot double-read | 1h | Piggyback on any bot work |
| 5 | F3 request-scoped query cache | 0.5d | Latency + Neon round-trips, zero behaviour change |
| 6 | F4 decimal.js decoupling | 1d | Converts a vigilance rule into an import-graph rule |
| 7 | F8 error reporting | 0.5d | Ops visibility before more features land |
| 8 | F9 backup cron | 2h | Cheap insurance |
| 9 | F7 policy note in prisma/CLAUDE.md | 30m | Documentation of a procedure already paid for twice |

Items 1–2 are small enough to ride along with `feature/recipes` before it
merges; 3–6 are each an honest standalone PR under the new flow.

---

## Fix log

**F2 — fixed.** `dateTimeFormatter` now pins `Europe/Kyiv`, hardcoded next to a
comment naming the `Household.timezone` upgrade path. Three tests cover it:
EEST, EET (a fixed +3 would be wrong for half the year), and an instant that
crosses midnight — `23:30Z` renders as `02:30` the *next day*, so the old code
was putting movements on the wrong date, not merely the wrong hour. Verified by
removing the pin and running under `TZ=UTC`: all three fail exactly as
production behaves.

*Correction to this review:* it claimed the date-only formatter also needed
pinning. It was already `timeZone: "UTC"`. Only the date-time one was wrong.

**F5 — fixed.** `new Anthropic({ timeout: 12_000, maxRetries: 1 })` and
`export const maxDuration = 30` on the recipes segment. The numbers are linked:
worst case is `timeout × (retries + 1)` plus backoff ≈ 25s, which has to stay
under `maxDuration` or the platform kills the request before the SDK can return
the Ukrainian error. The original suggestion of 25s × 2 retries would have
exceeded it — the review got the shape right and the arithmetic wrong.

Still outstanding, and *not* addressed by the above: the **spend limit in the
Anthropic console**. That is the real cap on a button any household member can
press repeatedly, it costs nothing, and no amount of application code
substitutes for it.

**F1 — fixed and now verified.** Docker was down when this landed, so the
integration proof sat unrun; with it up, `pnpm test:db` section 13 passes, and
removing the count check turns it red — so the interleaving in that check does
reproduce the real race, not just exercise the happy path.

**F6 — fixed.** `resolveChat` already held the row, so `BotUser` now carries
`keyboardVersion` and `keyboardVersionOf` is deleted rather than left as an
unused second reader of the same row. The new type-aware lint caught the dead
import within seconds of the change, which is the tooling paying for itself.

**F3 — fixed, and the first attempt would not have worked.** Wrapping the
exported readers in `React.cache` deduplicates nothing on its own: the
expensive scan happens *inside* `getAttentionCounts` and `getDashboard`, each
of which loaded its own copy. They take the item views (and the household row)
as optional arguments now, and `lib/queries.rsc.ts` is what threads the cached
loaders through. Measured on a real dashboard render:

| | `getItemViews` | `getHousehold` |
|---|---|---|
| before | 2 | 4 |
| after | 1 | 1 |

**F7 — documented** in prisma/CLAUDE.md, including the prod-copy variant that
cost a debugging session.

**Playwright — added**, against this review's own advice not to build it
speculatively. That advice is withdrawn: it was asked for deliberately, and the
first run immediately failed on a strict-mode violation caused by the header
logo and the nav tab both reading «Запаси» — a real ambiguity in the page, found
by the first test written against it. Four specs, two viewports, green.

### Still open

**F4 (decimal.js decoupling)** is deliberately not in this branch. It rewrites
the type of every quantity in the engine, and doing it in the same pass as a
concurrency fix and a caching change would make one unreviewable diff out of
three reviewable ones. It is a day on its own, with ~340 tests to keep it
honest.

**F8 (error reporting)** needs a decision this review cannot make for you:
Sentry's free tier, or a `console.error`-to-Telegram hook using the bot that
already exists. Pick the vendor question first.

**F9 (backup cron)** is a workflow file and an Actions secret — small, and best
done at the same time as whatever else touches CI.
