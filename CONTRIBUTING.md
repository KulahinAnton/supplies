# Working on Supplies

## The flow

```
feature branch  →  PR  →  CI + review  →  squash into main  →  Vercel deploys
```

`main` is what production runs. Nothing is committed to it directly.

```bash
git checkout main && git pull
git checkout -b feature/short-name
```

Branch names say what changes: `feature/offline-sync`, `fix/telegram-keyboard`.

**Merge a branch that carries a migration within days, not weeks.** Two
branches that each add one fight over a single local database, and production
receives whatever the merge order says. The recovery procedure is in
[prisma/CLAUDE.md](prisma/CLAUDE.md), but the cheaper fix is not to need it.

## The gates

There are two, and they check overlapping things on purpose: the local one is
for speed, the remote one is for truth.

**Before every commit** (`.husky/pre-commit`, about 30 seconds):

| | |
|---|---|
| `lint-staged` | ESLint (type-aware) over the files being committed |
| `pnpm typecheck` + `pnpm -r typecheck` | the root project, then every app under its own compiler settings |
| `pnpm test` | the unit suite: the rules, no database |
| `pnpm test:api` | the API's unit tests (tokens, config), under a second |

Run the same thing by hand any time with `pnpm verify`.

**Nothing that needs Docker is in the hook.** A hook that fails because Docker
is not running teaches people to reach for `--no-verify`, which disables the
whole gate, including the parts that were working.

**In CI** (`.github/workflows/ci.yml`), two jobs:

- **verify**, against a real Postgres: migrate, seed, lint, every typecheck,
  unit tests, `pnpm test:db`, `pnpm test:api:e2e` (including the wire
  contracts), a production build, then Playwright over the Next app and over
  the SPA.
- **mobile**: `expo-doctor` (with its version-drift check reported but not
  blocking, since that depends on what Expo published last, not on the commit)
  and a device-free Android bundle, which is how a
  missing peer dependency or a Metro resolution mistake is caught before an
  EAS build fails on it.

All of it must pass before merge.

**`--no-verify` exists and is sometimes right.** A work-in-progress commit on
your own branch does not need to be green. It is not right for anything you
are about to open a PR from, and CI will say so.

## The PR

`.github/pull_request_template.md` fills itself in. The section that earns its
place is **"What was verified, and what was not"**. "Typechecks" and "tested on
a phone" are very different claims, and a reviewer cannot tell them apart
unless you say. Anything shipped unverified belongs in that second list, which
makes it a known gap rather than a surprise.

## Conventions worth knowing before your first PR

- **Documentation first.** A new rule or feature lands in
  [PROJECT_PROMPT.md](PROJECT_PROMPT.md) before the code, and conventions live
  in the `CLAUDE.md` nearest the code they govern. Work that is planned but not
  started goes in [docs/ROADMAP.md](docs/ROADMAP.md).
- **Ukrainian is the UI language and only that.** Code, comments, commit
  messages, docs and PRs are English.
- **Business rules go in pure `packages/core` functions with colocated
  tests.** When a rule changes, its tests change in the same commit.
- **One write path.** Stock changes go through `@supplies/db/stock-service`,
  and every other write through its `@supplies/db` service. The web app's
  server actions, the API's controllers and the Telegram bot are all thin
  callers. A second implementation is the bug this rule prevents.
- **A new response field goes into `packages/core/contracts` first.** That is
  where the clients' types, the OpenAPI document and the API's contract tests
  all come from.
- **A change to one client is a question about the others.** The web app, the
  SPA and the phone are at parity. If a screen gains a control, the others are
  short of it until someone decides otherwise. Say which in the PR.
- **Migrations are reviewed like code.** They run against production data.

## End-to-end tests

```bash
pnpm test:e2e
```

```bash
pnpm test:e2e:spa
```

Both need Docker up and `pnpm db:seed` run first. The specs sign in as the demo
household, change stock, and put back what they changed, so the suites are
re-runnable.

- **The Next app** (`apps/web/e2e/`) is built and served on **port 3100**, not
  3000, so a run can never silently attach to your dev server and prove nothing
  about the build.
- **The SPA** (`apps/spa/e2e/`) builds both things it runs. The SPA, because
  `VITE_API_URL` is inlined at build time, served with `vite preview` on 4173.
  And the API, compiled fresh and started on 3210, because `start` runs
  `dist/` and a leftover `dist/` from `pnpm api:dev` is not a build anyone
  chose.

Two projects each: `chromium` (desktop) and `mobile` (Pixel 7 viewport). The
app is used standing in a shop, so a layout that only works at 1280 px is not
working.

**Keep the suites small.** FEFO, shortfalls and expiry states are proven in
`packages/core/src/stock.test.ts` in milliseconds without a browser;
re-asserting them here buys minutes and flakes. What e2e owns is the seam
nothing else covers: a form in a real browser, a server action or an API call,
a database write, and the number on screen changing to match.
