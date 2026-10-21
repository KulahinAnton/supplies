<!-- Exported verbatim from branch feature/offline-sync (commit e569000), where these sections of PROJECT_PROMPT.md were written. The branch was never merged; see docs/archive/README.md. -->

### Feature 31 — offline (stage 0: the app opens without a connection)

**Wanted:** add and take stock with no signal, syncing when it comes back. The
design for the whole of it is in [OFFLINE_SYNC.md](OFFLINE_SYNC.md); this is
the first stage, which makes the app *open* offline. Offline writes are stages
2–3 and are not built.

There was no service worker in this repo at all, so an installed app with no
signal showed the browser's error page. `public/sw.js` is hand-written: the
usual plugin injects through a webpack plugin and this app builds with
Turbopack, and a build-time dependency that may or may not run is a worse
foundation than sixty lines that plainly do.

- **Pages are network-first, cache second.** The whole app is a claim about
  what is in the house *right now*; a fast wrong answer is worse than a slow
  right one. Hashed build assets under `/_next/static/` are the exception —
  their name changes when their content does, so they are cache-first.
- **GET only, never `/api/`, never `/login`.** A cache must not answer a server
  action, and a cached login redirect would lock someone out of their own app
  until they cleared site data.
- **The RSC payload and the HTML document are cached under different keys.**
  Next serves both for the same URL, and handing a client-side navigation the
  wrong one breaks the router in a way that looks nothing like a caching bug.
- **Signing out empties the caches** — those pages are one household's data
  rendered on the server, and on a shared device they must not outlive the
  session.
- **Registration is production-only.** Turbopack rewrites chunk URLs on every
  edit, so a cache-first rule in dev would serve yesterday's module and produce
  hydration errors that look like application bugs.

Verified with the server actually stopped rather than throttled
(`ECONNREFUSED`): a previously visited `/dashboard` rendered in full from
cache, and a never-visited `/shopping` fell through to «Немає з'єднання».

**Known gap.** A page served from cache is indistinguishable from a live one.
Saying so on screen is the first thing stage 1 owes.

### Feature 31.1 — taking and adding stock without a connection

Stage 0 made the app open offline. This makes it usable offline: a take or a
top-up done with no signal is kept on the device and applied when there is one.
The full design and what testing found is in [OFFLINE_SYNC.md](OFFLINE_SYNC.md).

**The phone queues an intent, never a result.** It records «взяв 2 л молока»,
not which batch that came out of. FEFO depends on what is in the fridge at
apply time, which is the server's to know — possibly an hour later — and
`planConsume` is pure precisely so it can be re-run then. `/api/sync` replays
each operation through `lib/stock-service.ts`, the same write path the web UI
and the bot use: a new caller, not a new implementation.

**`clientOpId` is the idempotency key.** A flush interrupted mid-way is re-sent
whole, and without a record of what has been applied the household silently
loses the same stock twice. `ClientOperation` stores the outcome, not just the
fact — including failures, so a refused operation returns the same refusal
rather than trying again against different stock and quietly succeeding hours
later.

**The server is tried first, always.** Queueing on `navigator.onLine` would be
wrong twice: the flag reports the network adapter rather than the internet, and
skipping the request skips the only answer that knows whether there is enough
milk. A *rejected* write is never queued — a shortfall is a real answer, and
queueing it would turn a clear refusal into a change the user believes
happened.

**A queued take can fail honestly**, and that is shown rather than swallowed:
someone else finished the milk while you were offline. The operation keeps its
place in the outbox with the reason and the numbers, and offers retry or
discard. It is never retried automatically.

**`occurredAt` comes from the device.** The movement log answers "who used the
last of it, and when"; stamping a whole afternoon with the instant the signal
returned would make it lie.

**Stage 1 was dropped as unnecessary.** The plan called for mirroring the item
list into IndexedDB to render offline, but the service worker already caches
the rendered pages — a second copy would have been a mirror to keep in step for
no visible behaviour. What the plan was reaching for was *saying the data is
stale*, which is one line in the banner.

#### 31.2 — a take with no signal hung instead of queueing

**Reported from a phone in airplane mode:** taking one yoghurt "stuck" and the
quantity never changed.

The write went through `submitOrQueue`, which called the server action and
waited for it to reject. With no connection that call does not reliably
reject — the request can sit unresolved — so the wait never ended, the button
stayed spinning, and the operation was never queued at all. The one case the
whole feature exists for was the one case it did not cover.

Two changes:

- **`navigator.onLine === false` now queues without asking.** That direction of
  the flag is worth trusting: false means there is no interface, so there is
  nothing to ask. True still means only that an adapter exists, which is why a
  connection that reports online and goes nowhere is handled by a timeout
  rather than by believing the flag.
- **Every attempt is bounded**, at twelve seconds — longer than any of these
  writes takes, shorter than anyone will watch a spinner.

**The timeout created a second problem, and closing it improved the design.**
Giving up on a request the server may yet apply, then queueing it, would apply
it twice. So the operation id now travels on the SERVER ACTION as well as in
the queue, and `lib/offline/idempotency.ts` guards both routes with one
implementation. Whichever copy arrives second is recognised and ignored.

That is worth having for its own sake: it also covers a double-tapped button
and a retried request on a flaky mobile connection, neither of which had
anything to do with being offline.

`pnpm test:db` asserts the cross-route case directly: apply through the online
guard, replay the same id through the queue, and watch the second one take
