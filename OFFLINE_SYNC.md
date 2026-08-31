# Offline use with sync on reconnect — design and cost

Design, and what was built against it. All of it is implemented; see the
stage table for what each part turned out to be.

**Wanted:** add stock and take stock with no connection, and have those changes
reach the database once there is one.

**Answer: yes, and this app is better placed for it than most.** Four things
that are already true make the hard parts tractable, and one thing makes an
honest difficulty that no design removes.

## Why this codebase suits it

1. **There is one write path.** `lib/stock-service.ts` takes an `Actor`, not a
   session. A sync endpoint replaying queued work is a *new caller* of
   `addStock` / `consume` / `consumeBatch` — not new logic. This is the same
   property that made the Telegram bot cheap.
2. **Quantity is never stored.** It is summed from batches at read time, so
   there is no counter for two offline members to fight over and no "last write
   wins" that can corrupt a total. The server recomputes and is always right.
3. **Every change already writes a `StockMovement` in the same transaction.**
   The event log this design needs already exists — it just needs one more
   column.
4. **`planConsume` is pure**, taking today's date and the batches as arguments.
   That means FEFO can be *re-planned on the server at sync time* against
   current stock, instead of replaying stale batch arithmetic decided on a
   phone an hour ago.

## The design: queue intents, not diffs

The phone never decides which batch was drawn. It records **what the person
did**:

```ts
type QueuedOp = {
  clientOpId: string;   // uuid, made on the device
  kind: "addStock" | "consume" | "consumeBatch" | "discard";
  payload: …;           // itemId, quantity, expiry dates
  createdAt: string;    // for ordering and for the audit trail
};
```

Queued in IndexedDB. On reconnect they POST in order and the server replays
each through `lib/stock-service.ts`, re-planning FEFO with fresh state.

**Idempotency comes from `clientOpId`**, stored unique on `StockMovement`. A
flaky reconnect will deliver the same queue twice; without the key the
household silently loses stock twice over. This is the one schema change the
feature needs.

## The part no design removes

**A queued `consume` can legitimately fail at sync.** Someone else finished the
milk while you were offline; the server re-plans FEFO, finds nothing, and
returns `stock.shortfall`. That is not a bug — it is the truth arriving late,
and the only wrong response is to hide it.

So the feature needs somewhere to say so: *«2 зміни не вдалося застосувати»*,
with what they were and the choice to retry or drop them. Same for an item
archived or deleted meanwhile.

`addStock` never conflicts — it appends a batch, and two people adding milk
means the household has more milk.

`occurredAt` should be set from the device's `createdAt` rather than sync time,
or the movement log will claim everyone did everything at once when the signal
came back.

## What has to be built

There was no service worker in this repo at all — the app opened to Chrome's
dinosaur with no connection, installed or not. That was stage 0; the rest
followed.

| Stage | Work | Estimate |
|---|---|---|
| 0 | Service worker + app shell, so the app *opens* offline | **done** |
| 1 | Offline reads | **done — differently, see below** |
| 2 | Outbox on the add and take flows | **done** |
| 3 | Idempotency, sync endpoint, replay through `stock-service` | **done** |
| 4 | Surfacing failures: what did not apply, retry or discard | **done** |



### Stage 0, as built

`public/sw.js`, hand-written. The usual plugin (`@serwist/next`) injects
through a webpack plugin and this app builds with Turbopack; sixty lines that
plainly run beat a build-time dependency that may not.

- **Hashed build assets** (`/_next/static/`) are cache-first — the name changes
  when the content does, so the network never needs consulting.
- **Pages are network-first**, falling back to cache. A connected phone is
  never shown yesterday's stock: the whole app is a claim about what is in the
  house right now, and a fast wrong answer is worse than a slow right one.
- **Never GET-only, never `/api/`, never `/login`.** A cache must not answer a
  server action, and a cached login redirect would lock someone out of their
  own app.
- **The RSC payload and the HTML document are cached under different keys.**
  Next serves both for the same URL, and handing a client-side navigation the
  wrong one breaks the router in a way that looks nothing like a caching bug.
- **Signing out empties the caches**, because those pages are one household's
  data rendered on the server.
- Registration is production-only: Turbopack rewrites chunk URLs on every edit,
  so cache-first in dev would serve yesterday's module.

Verified with the server actually stopped (`ECONNREFUSED`, not throttled): a
visited `/dashboard` rendered in full from cache, and an unvisited `/shopping`
fell through to «Немає з'єднання».

**Known gap, and the first thing stage 1 owes:** a page served from cache looks
exactly like a live one. Nothing on screen says the numbers are from the last
time there was signal.

## Decisions to make before starting

- ~~**"Remove" means what?**~~ **Settled: taking stock.** Deleting an item
  offline is out of scope — it is rarer, and genuinely last-writer-wins against
  someone adding stock to that item meanwhile.
- **The 8-hour JWT.** If the session expires while offline, the queue must
  survive re-login rather than being cleared with the session. Key it by user,
  and never drop it on logout without asking.
- **How stale is too stale?** A queued op from four days ago may deserve a
  confirmation rather than silent application.
- **Scope of the offline read cache.** The whole item list is small (a
  household, not a warehouse), so mirroring all of it is simpler and better
  than paging.

### Stage 1 turned out to be nothing

The plan was to mirror the item list into IndexedDB and render from it offline.
Building stage 0 first made that unnecessary: the service worker already caches
the *rendered pages*, so an offline phone shows the item list, the dashboard and
every item page it has visited. A second copy of the same data in IndexedDB
would have been a mirror to keep in step with the pages beside it, for no
behaviour the user could see.

What the plan was really reaching for was **saying the data is stale**, and
that is one line in the banner, not a local database.

IndexedDB is still used — for the outbox, which is the one thing the cached
pages genuinely cannot hold.

### Stages 2–4, as built

**`lib/offline/operations.ts`** is the contract, validated by both ends: the
client before queueing, so a malformed op never poisons every flush, and the
server on arrival, because a queue that crossed a network is input like any
other.

**`submitOrQueue` tries the server first, always.** Queueing on
`navigator.onLine === false` would be wrong twice over: the flag reports the
network adapter rather than the internet, and skipping the request skips the
only answer that knows whether there is enough milk. A *rejected* write is
never queued either — a shortfall is a real answer, and putting it in the
outbox would turn a clear refusal into a change the user believes happened.

**`/api/sync` replays through `lib/stock-service.ts`** — a new caller, not a
new implementation. FEFO is re-planned against current stock at apply time,
which is the whole reason a queued take is safe to hold for an hour.

**Failures stay visible.** A refused op keeps its place in the outbox with the
reason, and the banner offers retry or discard. It is not retried automatically:
a shortfall does not become truer for being asked again, and silently applying
it later against restocked shelves would take milk the household has since
decided is someone else's.

**`occurredAt` comes from the device**, threaded through `stock-service` as an
optional argument. Without it the movement log claims an afternoon of shopping
happened in the instant the signal returned.

### Two bugs the testing caught

**Sending only the message key.** The banner rendered
«Не вистачає {missing} — доступно лише {available}» — placeholders and all —
because the sync response carried `errorKey` without its params, and the
numbers *are* that message. Fixed by carrying the whole `RuleMessage`, and by
storing the params on `ClientOperation` so a re-sent duplicate is told the same
thing as the first attempt.

**A stored key can outlive its release.** `renderMessage` looks up
`MESSAGES[key]` and calls `.replace` on the result, so a key renamed in a later
version turns a stale outbox entry into a crash. `renderStoredMessage` checks
first and falls back. This was verified by accident and then on purpose: an
entry written by the previous build rendered the fallback correctly after the
schema changed under it.

### What was actually verified

- **Idempotency, against a real database** (`pnpm test:db`): the same op
  applied once, re-sent, reported as a duplicate, and stock unchanged. This is
  the check that matters most — a flush interrupted mid-way is the normal case,
  not the edge case.
- **An honest failure**: a queued take of more than exists is refused with
  `stock.shortfall` and its numbers, and a retry returns the same refusal
  rather than quietly succeeding later.
- **The whole round trip in a browser**, with the client's POSTs made to fail
  so the app saw exactly what a phone with no signal sees: the take queued to
  IndexedDB, the banner counted it, «Надіслати» flushed it, stock went 264 →
  262, and the movement carried the device's timestamp rather than the flush's.
- **The refusal on screen**: «Не вистачає 4 728 штук — доступно (не
  прострочено) лише 272 штуки», with retry and discard beside it.

### Not verified

The service worker's registration could not be exercised in the harness
browser, which refuses to fetch worker scripts. Stage 0's caching *was* proven
there earlier by hand-registering it; the automatic path is code review only.
Offline behaviour on a real phone — the actual target — is untested by me.
