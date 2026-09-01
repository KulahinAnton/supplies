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

Branch names read as what changes: `feature/offline-sync`, `fix/telegram-keyboard`.

## The gate

Two of them, and they check the same things on purpose — the local one is for
speed, the remote one is for truth.

**Before every commit** (`.husky/pre-commit`, about 20 seconds):

| | |
|---|---|
| `lint-staged` | ESLint over the files being committed |
| `pnpm typecheck` | `tsc --noEmit` across the project |
| `pnpm test` | the unit suite |

Run the same thing by hand any time with `pnpm verify`.

**`pnpm test:db` is not in the hook.** It needs a live seeded Postgres, and a
hook that fails because Docker is not running teaches people to reach for
`--no-verify` — which disables the whole gate, including the parts that were
working. CI runs it against a real database instead.

**`--no-verify` exists and is sometimes right** — a work-in-progress commit on
your own branch does not need to be green. It is not right for anything you are
about to open a PR from, and CI will say so.

## The PR

`.github/pull_request_template.md` fills itself in. The section that earns its
place is **"What was verified, and what was not"** — "typechecks" and "tested on
a phone" are very different claims, and a reviewer cannot tell them apart unless
you say. Anything shipped unverified belongs in that second list; writing it
down is what makes it a known gap rather than a surprise.

CI runs lint, typecheck, unit tests, the integration smoke test against a real
Postgres, and a production build. All of it must pass before merge.

## Conventions worth knowing before your first PR

- **Documentation-first.** A new rule or feature lands in `PROJECT_PROMPT.md`
  before the code, and conventions live in the `CLAUDE.md` nearest the code they
  govern.
- **Ukrainian is the UI language and only that.** Code, comments, commit
  messages, docs and PRs are English.
- **Business rules go in pure `lib/` functions with colocated tests.** When a
  rule changes, its tests change in the same commit.
- **One write path.** Stock changes go through `lib/stock-service.ts` — the web
  UI, the Telegram bot and the offline replay are all callers of it. A second
  implementation is the bug this rule prevents.
- **Migrations are reviewed like code.** They run against production data.
