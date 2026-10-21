import { resolve } from "node:path";
import { config } from "dotenv";

/**
 * Loads the repo root's `.env` **before anything else is imported**.
 *
 * `packages/db/prisma` builds its client at module scope from
 * `process.env.DATABASE_URL`, the way a singleton has to. Nest's ConfigModule
 * runs during bootstrap — long after that import has already been evaluated —
 * so without this the shared client is constructed with no connection string
 * and every query fails at runtime with nothing in the config validation to
 * warn you.
 *
 * `import "./env-first"` must therefore be the FIRST line of `main.ts`. Module
 * bodies are evaluated in import order, which is the whole mechanism here.
 *
 * The same two files ConfigModule reads, in the same order, so there is one
 * answer to "where does configuration come from" (`.env.local` first, because
 * `pnpm db:prod-copy` writes it to point at a copy of production).
 */
const root = resolve(process.cwd(), "../..");
config({ path: [resolve(root, ".env.local"), resolve(root, ".env")], quiet: true });
