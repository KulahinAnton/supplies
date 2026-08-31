# Offline use with sync on reconnect — design and cost

Assessment and plan. Nothing implemented yet.

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

There is no service worker in this repo at all today — the app opens to
Chrome's dinosaur with no connection, installed or not. So this starts at zero.

| Stage | Work | Estimate |
|---|---|---|
| 0 | Service worker + app shell (Serwist), so the app *opens* offline | 1–2 days |
| 1 | Mirror the item list into IndexedDB; render from it when offline | 3–5 days |
| 2 | Outbox + optimistic UI on the add and take flows | ~1 week |
| 3 | `clientOpId` migration, sync endpoint, replay through `stock-service` | 3–5 days |
| 4 | Surfacing failures: what did not apply, retry or discard | 2–3 days |

**~3–4 weeks part-time.** Stage 0 alone is worth doing on its own: it turns a
dead app into one that opens and shows the last thing it knew.

## Decisions to make before starting

- **"Remove" means what?** Taking stock (`consume`) is designed for above.
  *Deleting an item* offline is a different thing — rarer, and genuinely
  last-writer-wins against someone adding stock to that item meanwhile. Worth
  deciding whether it is queued at all.
- **The 8-hour JWT.** If the session expires while offline, the queue must
  survive re-login rather than being cleared with the session. Key it by user,
  and never drop it on logout without asking.
- **How stale is too stale?** A queued op from four days ago may deserve a
  confirmation rather than silent application.
- **Scope of the offline read cache.** The whole item list is small (a
  household, not a warehouse), so mirroring all of it is simpler and better
  than paging.
