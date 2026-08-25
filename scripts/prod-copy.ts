/**
 * `pnpm db:prod-copy [file]` — load a production dump into a local database
 * you can point the app at.
 *
 * This is the safe way to "test against production data". The unsafe way is
 * putting the Neon URL in .env: `pnpm db:seed` deletes the household «Наша
 * родина», and `prisma migrate dev` rewrites schema. Neither is recoverable
 * by undo. Nothing here can reach Neon — the only input is a dump file.
 *
 * Restores into the `prodcopy` compose service on port 5435, which is
 * Postgres 18 to match Neon; the dev container is 17 and physically cannot
 * read these archives.
 *
 * Re-runnable: the database is dropped and recreated each time, so the copy
 * never drifts into a half-updated state.
 */

import { spawnSync } from "node:child_process";
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, join } from "node:path";

const CONTAINER = "supplies-prodcopy";
const DB = "supplies";
const PORT = 5435;
const URL = `postgresql://postgres:postgres@localhost:${PORT}/${DB}`;

const args = process.argv.slice(2);
const named = args.find((arg) => !arg.startsWith("--"));
const skipEnv = args.includes("--no-env");

function die(message: string, hint?: string): never {
  console.error(`\n✗ ${message}`);
  if (hint) console.error(`  ${hint}`);
  process.exit(1);
}

/** Blocking sleep. Spawning a process to wait returns too fast to be a wait. */
function sleep(ms: number) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function docker(argv: string[]) {
  const result = spawnSync("docker", argv, { encoding: "utf8" });
  if (result.error) die(`could not run docker: ${result.error.message}`);
  return result;
}

function newestDump(): string | undefined {
  if (!existsSync("backups")) return undefined;
  return readdirSync("backups")
    .filter((entry) => entry.endsWith(".dump"))
    .map((entry) => join("backups", entry))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
}

const file = named ?? newestDump();
if (!file) {
  die("no dump to load.", "Run `pnpm backup:prod` first, or name a file.");
}
if (!existsSync(file)) die(`no such file: ${file}`);

if (docker(["info", "--format", "{{.ServerVersion}}"]).status !== 0) {
  die("Docker is not running.", "Start Docker Desktop and try again.");
}

console.log(`\n→ Source  ${file}${named ? "" : "   (newest in backups/)"}`);
console.log(`→ Target  localhost:${PORT} (${CONTAINER})\n`);

const up = spawnSync(
  "docker",
  ["compose", "--profile", "prodcopy", "up", "-d", "prodcopy"],
  { encoding: "utf8", stdio: "inherit" },
);
if (up.status !== 0) die("could not start the prodcopy container.");

let ready = false;
for (let attempt = 0; attempt < 60 && !ready; attempt += 1) {
  ready = docker(["exec", CONTAINER, "pg_isready", "-U", "postgres"]).status === 0;
  if (!ready) sleep(1000);
}
if (!ready) die("the prodcopy database never became ready.");

// Drop and recreate so a re-run is a clean load, not a merge onto stale rows.
docker(["exec", CONTAINER, "dropdb", "-U", "postgres", "--if-exists", DB]);
const created = docker(["exec", CONTAINER, "createdb", "-U", "postgres", DB]);
if (created.status !== 0) die("could not create the database.", created.stderr.trim());

docker(["cp", file, `${CONTAINER}:/tmp/${basename(file)}`]);
const restored = docker([
  "exec", CONTAINER, "pg_restore",
  "-U", "postgres", "-d", DB, "--no-owner", "--no-acl",
  `/tmp/${basename(file)}`,
]);
if (restored.status !== 0 && restored.stderr.trim()) {
  console.error(restored.stderr.trim());
}
docker(["exec", CONTAINER, "rm", "-f", `/tmp/${basename(file)}`]);

/** Exact counts — pg_stat estimates read as zero until ANALYZE runs. */
const counts = docker([
  "exec", CONTAINER, "psql", "-U", "postgres", "-d", DB, "-P", "pager=off", "-c",
  `SELECT relname AS table,
          (xpath('/row/c/text()',
            query_to_xml(format('SELECT count(*) AS c FROM %I.%I', schemaname, relname),
                         false, true, '')))[1]::text::bigint AS rows
   FROM pg_stat_user_tables ORDER BY rows DESC, relname;`,
]);
if (counts.status !== 0) die("restored, but could not read the tables back.", counts.stderr.trim());
console.log(counts.stdout.trim());

const total = [...counts.stdout.matchAll(/\|\s+(\d+)\s*$/gm)]
  .reduce((sum, match) => sum + Number(match[1]), 0);
if (total === 0) die("the copy is empty — that dump has no data in it.");

console.log(`\n✓ Loaded — ${total} rows.`);

/**
 * Point the app at the copy, rather than printing a line for someone to paste.
 *
 * Loading production data and then leaving the app on the dev database is a
 * half-finished job, and its symptom is the worst kind: the app looks exactly
 * as before, so the restore reads as having failed when it in fact succeeded.
 *
 * Next.js reads .env.local ahead of .env; the Prisma CLI reads only .env. So
 * the app moves to the copy while db:seed and migrate dev stay pointed at the
 * dev database and cannot reach this data by accident.
 */
const ENV_LOCAL = ".env.local";
const line = `DATABASE_URL="${URL}"`;

if (skipEnv) {
  console.log(`\n  --no-env given; ${ENV_LOCAL} left alone. To point the app here:`);
  console.log(`    ${line}`);
} else if (!existsSync(ENV_LOCAL)) {
  writeFileSync(
    ENV_LOCAL,
    [
      "# Local overrides. Next.js reads this ahead of .env; the Prisma CLI does not.",
      "# Written by `pnpm db:prod-copy` to point the app at the production copy.",
      "# Delete this file to go back to the dev database on port 5434.",
      line,
      "",
    ].join("\n"),
  );
  console.log(`\n✓ Wrote ${ENV_LOCAL} — the app now points at the copy.`);
} else if (readFileSync(ENV_LOCAL, "utf8").includes(line)) {
  console.log(`\n✓ ${ENV_LOCAL} already points at the copy.`);
} else {
  // Someone else's file, possibly holding unrelated overrides. Say what to
  // change; never overwrite it.
  console.log(`\n! ${ENV_LOCAL} exists and points elsewhere. Change its DATABASE_URL to:`);
  console.log(`    ${line}`);
}

console.log("\n  RESTART the dev server — env files are read once, at startup.");
console.log("  Log in with your PRODUCTION password: this is the real user table.");
console.log("\n  If the app errors about a missing column, the copy predates a local");
console.log("  migration. Bring it up to date with:");
console.log(`    DATABASE_URL="${URL}" pnpm prisma migrate deploy`);
console.log("\n  This is real family data — password hashes, emails, Telegram chat ids.");
console.log("  When you are done:");
console.log("    del .env.local                              # back to the dev database");
console.log("    docker compose --profile prodcopy down      # stop, keep the data");
console.log("    docker volume rm supplies_prodcopy_data     # erase it");
console.log("");
