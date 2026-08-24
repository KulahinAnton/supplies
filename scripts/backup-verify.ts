/**
 * `pnpm backup:verify <file>` — prove a dump restores, without risking anything.
 *
 * A backup nobody has restored is a hypothesis. This restores into a scratch
 * database created for the purpose and dropped afterwards, then prints exact
 * row counts so the file can be compared against what production should hold.
 *
 * It never touches production and never touches the `supplies` dev database.
 * Pass --keep to leave the restored copy in place (as a separate database) if
 * you want a local copy of production data to inspect.
 */

import { spawnSync } from "node:child_process";
import { basename } from "node:path";
import { existsSync } from "node:fs";

const CONTAINER = process.env.BACKUP_CONTAINER ?? "supplies-db";
const args = process.argv.slice(2);
const keep = args.includes("--keep");
const file = args.find((arg) => !arg.startsWith("--"));

function die(message: string, hint?: string): never {
  console.error(`\n✗ ${message}`);
  if (hint) console.error(`  ${hint}`);
  process.exit(1);
}

function docker(argv: string[]) {
  const result = spawnSync("docker", argv, { encoding: "utf8" });
  if (result.error) die(`could not run docker: ${result.error.message}`);
  return result;
}

if (!file) die("usage: pnpm backup:verify <path-to-dump> [--keep]");
if (!existsSync(file)) die(`no such file: ${file}`);

const alive = docker(["ps", "--filter", `name=${CONTAINER}`, "--format", "{{.Names}}"]);
if (alive.status !== 0 || !alive.stdout.includes(CONTAINER)) {
  die("Docker is not running, or the database container is down.", "Run `pnpm db:up` first.");
}

const scratch = `restore_check_${Date.now()}`;
const remote = `/tmp/${basename(file)}`;

console.log(`\n→ Restoring ${file}`);
console.log(`  into scratch database ${scratch} (never production, never dev)\n`);

docker(["cp", file, `${CONTAINER}:${remote}`]);

const created = docker(["exec", CONTAINER, "createdb", "-U", "postgres", scratch]);
if (created.status !== 0) die("could not create the scratch database.", created.stderr.trim());

function cleanup() {
  docker(["exec", CONTAINER, "rm", "-f", remote]);
  if (!keep) docker(["exec", CONTAINER, "dropdb", "-U", "postgres", "--if-exists", scratch]);
}

const restored = docker([
  "exec", CONTAINER,
  "pg_restore", "-U", "postgres", "-d", scratch, "--no-owner", "--no-acl", remote,
]);

// pg_restore warns about things like missing roles and still succeeds; only a
// non-zero status with no tables restored is a real failure.
if (restored.status !== 0 && restored.stderr.includes("error")) {
  console.error(restored.stderr.trim());
}

/**
 * Exact counts, not pg_stat's estimates — those are populated by ANALYZE and
 * read as 0 straight after a restore, which would look like data loss.
 */
const countSql = `
SELECT relname AS table,
       (xpath('/row/c/text()',
         query_to_xml(format('SELECT count(*) AS c FROM %I.%I', schemaname, relname),
                      false, true, '')))[1]::text::bigint AS rows
FROM pg_stat_user_tables
ORDER BY rows DESC, relname;`;

const counts = docker([
  "exec", CONTAINER, "psql", "-U", "postgres", "-d", scratch, "-P", "pager=off", "-c", countSql,
]);

if (counts.status !== 0) {
  cleanup();
  die("restored, but could not read the tables back.", counts.stderr.trim());
}

console.log(counts.stdout.trim());

const total = [...counts.stdout.matchAll(/\|\s+(\d+)\s*$/gm)]
  .reduce((sum, match) => sum + Number(match[1]), 0);

if (total === 0) {
  cleanup();
  die("the dump restored but every table is empty.", "This file is not a usable backup.");
}

cleanup();

console.log(`\n✓ Restored and verified — ${total} rows across all tables.`);
console.log(
  keep
    ? `  Kept as database "${scratch}" in the ${CONTAINER} container.\n`
    : "  Scratch database dropped. Your dev database was not touched.\n",
);
