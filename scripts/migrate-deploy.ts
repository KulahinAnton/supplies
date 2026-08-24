/**
 * `pnpm migrate:deploy` — apply migrations against the DIRECT database.
 *
 * A deploy failed with:
 *
 *   Datasource "db": ... at "ep-xxxx-pooler.c-5.us-east-2.aws.neon.tech"
 *   Timed out trying to acquire a postgres advisory lock
 *   (SELECT pg_advisory_lock(72707369)). Timeout: 10000ms
 *
 * Prisma guards migrations with a **session-level** advisory lock. Neon's
 * pooled endpoint is PgBouncer in transaction mode, which does not keep a
 * client on one session, so the lock is taken on a connection that the next
 * statement may not be using. It works most of the time and fails under
 * timing — which is the worst kind of arrangement, because it looks fine
 * until a deploy is blocked.
 *
 * So this runs migrations on the direct endpoint. `DIRECT_URL` is used when
 * set; otherwise the direct host is derived by dropping "-pooler", which is
 * exactly how Neon names the pair. The application keeps using the pooled URL,
 * which is correct for serverless: many short-lived connections.
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const POOLER = "-pooler";

/**
 * On Vercel these are real environment variables. Locally they live in .env,
 * which tsx does not read — Prisma loads it itself, so a script standing in
 * front of Prisma has to do the same or it only works in production.
 */
function fromEnvFile(name: string): string | undefined {
  if (!existsSync(".env")) return undefined;
  for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (match && match[1] === name) return match[2].replace(/^["']|["']$/g, "");
  }
  return undefined;
}

const env = (name: string) => process.env[name] ?? fromEnvFile(name);

function directUrl(): { url: string; source: string } {
  const explicit = env("DIRECT_URL");
  if (explicit) return { url: explicit, source: "DIRECT_URL" };

  const pooled = env("DATABASE_URL");
  if (!pooled) {
    console.error("\n✗ neither DIRECT_URL nor DATABASE_URL is set.");
    process.exit(1);
  }

  if (!pooled.includes(POOLER)) {
    return { url: pooled, source: "DATABASE_URL (already direct)" };
  }

  return {
    url: pooled.replace(POOLER, ""),
    source: "DATABASE_URL with -pooler removed",
  };
}

const { url, source } = directUrl();
const host = (() => {
  try {
    return new URL(url).hostname;
  } catch {
    return "(unparseable)";
  }
})();

console.log(`\n→ Migrating against ${host}`);
console.log(`  (${source})\n`);

/**
 * Neon computes scale to zero, so the first connection of a deploy can spend
 * most of the 10s lock timeout just waking the database up. That failure is
 * transient and retrying costs nothing: `migrate deploy` applies only what is
 * pending, so a second attempt is a no-op if the first actually worked.
 */
const ATTEMPTS = 3;

for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
  const result = spawnSync(
    "pnpm",
    ["prisma", "migrate", "deploy"],
    {
      encoding: "utf8",
      stdio: "inherit",
      shell: process.platform === "win32",
      env: { ...process.env, DATABASE_URL: url },
    },
  );

  if (result.status === 0) process.exit(0);

  if (attempt === ATTEMPTS) {
    console.error(`\n✗ migrate deploy failed after ${ATTEMPTS} attempts.`);
    process.exit(result.status ?? 1);
  }

  const wait = attempt * 5;
  console.error(`\n… attempt ${attempt} failed; retrying in ${wait}s`);
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, wait * 1000);
}
