## What this changes

<!-- One or two sentences. What is different for someone using the app? -->

## Why

<!-- The problem, not the solution. If it came from using the app, say what
     happened — "the take hung in airplane mode" beats "improve offline". -->

## How to check it

<!-- The steps a reviewer follows to see it working. Include what to look at,
     not just what to click. If it needs a migration, a seeded database or an
     env var, say so here. -->

1.
2.

## What was verified, and what was not

<!-- Be specific and be honest. "Tested on a phone" and "typechecks" are very
     different claims. Anything shipped unverified belongs in the second list —
     that is the most useful part of this template. -->

- Verified:
- Not verified:

## Checklist

- [ ] `pnpm verify` passes (lint, typecheck, unit tests)
- [ ] `pnpm test:db` passes, or this change cannot affect it
- [ ] Docs updated — PROJECT_PROMPT.md for a rule or feature, the relevant CLAUDE.md for a convention
- [ ] Migrations included, and safe to run against production data
- [ ] Ukrainian for anything a user reads; English for code, comments and this PR
