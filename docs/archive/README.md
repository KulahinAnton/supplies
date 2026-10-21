# Archive

These documents are kept for their reasoning, not as instructions. Each one was
accurate when it was written and has since been overtaken by the code, or by the
documents that replaced it. **Do not follow anything in here without checking
the current docs first.** If an archived file disagrees with a live one, the
live one wins.

They are kept verbatim, links included, so some of their relative links no
longer resolve. That is expected.

| File | What it was | Archived | Replaced by |
|---|---|---|---|
| [PROJECT_PROMPT.md](PROJECT_PROMPT.md) | The original specification plus the full implementation narrative for Features 0–35: what was built, what went wrong and why each rule has the shape it has | 2026-10-21 | [/PROJECT_PROMPT.md](../../PROJECT_PROMPT.md). The rules are carried over with their numbering intact; the long "how we found out" stories stay here |
| [SPA_API_PORT.md](SPA_API_PORT.md) | The plan for turning one Next.js app into an API, an SPA and a phone app, with a day-by-day log of Phases 0–3.7 | 2026-10-21 | [docs/ARCHITECTURE.md](../ARCHITECTURE.md) for the decisions that still hold, [docs/ROADMAP.md](../ROADMAP.md) for what was never done |
| [ARCHITECTURE_REVIEW.md](ARCHITECTURE_REVIEW.md) | The 2026-09 technical review (F1–F10) and its fix log | 2026-10-21 | F1–F7 are fixed. F8 (error reporting), F9 (backup automation) and the Anthropic spend cap moved to [docs/ROADMAP.md](../ROADMAP.md) |
| [deployment-instructions.md](deployment-instructions.md) | The Vercel + Neon setup guide | 2026-10-21 | [docs/DEPLOYMENT.md](../DEPLOYMENT.md). The old guide contradicted itself about migrations through the pooler, still described a direct push to `main`, and covered the Next app only |
| [REACT_NATIVE_PORT.md](REACT_NATIVE_PORT.md) | "Can this go native?" A feasibility study that concluded the real work was the missing API | 2026-10-21 (exported from branch `feature/react-native`) | Superseded by SPA_API_PORT.md, which was itself superseded as above |
| [OFFLINE_SYNC.md](OFFLINE_SYNC.md) | Design and handover for offline writes with sync on reconnect, for the Next app | 2026-10-21 (exported from branch `feature/offline-sync`) | Still the design record for offline. The code on that branch predates the workspace split and cannot be rebased; see [docs/ROADMAP.md](../ROADMAP.md) |
| [FEATURE_31_OFFLINE.md](FEATURE_31_OFFLINE.md) | Feature 31's spec sections, which only ever existed on `feature/offline-sync` | 2026-10-21 | Feature 31 in [/PROJECT_PROMPT.md](../../PROJECT_PROMPT.md) is recorded as parked and points here |

## Why the narratives were not deleted

The project's docs record *why* as well as *what*: a rule with its reason
attached survives the next refactor, and one without it gets "simplified" back
into the bug it was preventing. The live spec keeps the rules and a one-line
reason. The full story of how each rule was found stays in these files. Each
feature in the live spec links to its archived narrative.
