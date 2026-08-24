/**
 * `pnpm backup:verify <file>` — prove a dump restores, risking nothing.
 *
 * A backup nobody has restored is a hypothesis. This starts a disposable
 * Postgres of the same major version the dump came from, restores into it,
 * prints exact row counts, and throws the whole container away.
 *
 * It uses its own container rather than the dev database for two reasons: a
 * custom-format archive written by pg_dump 18 cannot be read by pg_restore 17,
 * and verifying a backup should be incapable of touching anything real.
 * Production is never contacted; the dev database is never opened.
 *
 * --keep leaves the container running if you want a local copy of production
 * to inspect.
 */

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";

const IMAGE = process.env.BACKUP_PG_IMAGE ?? "postgres:18-alpine";
const args = process.argv.slice(2);
const keep = args.includes("--keep");
const named = args.find((arg) => !arg.startsWith("--"));

/**
 * With no argument, verify the newest dump. The filenames carry a timestamp
 * nobody remembers, and "check the backup I just took" is overwhelmingly the
 * reason to run this — making that the default removes a step that otherwise
 * ends in copying a filename by hand.
 */
function newestDump(): string | undefined {
  if (!existsSync("backups")) return undefined;
  const dumps = readdirSync("backups")
    .filter((entry) => entry.endsWith(".dump"))
    .map((entry) => join("backups", entry))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return dumps[0];
}

const file = named ?? newestDump();

const name = `supplies-restore-check-${Date.now()}`;
const DB = "restore_check";

function die(message: string, hint?: string): never {
  console.error(`\n✗ ${message}`);
  if (hint) console.error(`  ${hint}`);
  spawnSync("docker", ["rm", "-f", name], { encoding: "utf8" });
  process.exit(1);
}

function docker(argv: string[]) {
  const result = spawnSync("docker", argv, { encoding: "utf8" });
  if (result.error) die(`could not run docker: ${result.error.message}`);
  return result;
}

if (!file) {
  die(
    "no dump to verify.",
    "Run `pnpm backup:prod` first, or name a file:\n" +
      "  pnpm backup:verify backups/supplies-....dump [--keep]",
  );
}
if (!existsSync(file)) die(`no such file: ${file}`);
if (docker(["info", "--format", "{{.ServerVersion}}"]).status !== 0) {
  die("Docker is not running.", "Start Docker Desktop and try again.");
}

console.log(`\n→ Restoring ${file}${named ? "" : "   (newest in backups/)"}`);
console.log(`  into a disposable ${IMAGE} — not production, not your dev database\n`);

const started = docker([
  "run", "-d", "--name", name,
  "-e", "POSTGRES_PASSWORD=verify",
  IMAGE,
]);
if (started.status !== 0) die("could not start the scratch database.", started.stderr.trim());

// The container reports ready before Postgres accepts connections.
let ready = false;
for (let attempt = 0; attempt < 60 && !ready; attempt += 1) {
  ready = docker(["exec", name, "pg_isready", "-U", "postgres"]).status === 0;
  if (!ready) spawnSync("node", ["-e", "setTimeout(()=>{},500)"], { timeout: 700 });
}
if (!ready) die("the scratch database never became ready.");

docker(["exec", name, "createdb", "-U", "postgres", DB]);
docker(["cp", file, `${name}:/tmp/${basename(file)}`]);

const restored = docker([
  "exec", name, "pg_restore",
  "-U", "postgres", "-d", DB, "--no-owner", "--no-acl",
  `/tmp/${basename(file)}`,
]);
// pg_restore warns about absent roles and still succeeds; only surface real errors.
if (restored.status !== 0 && restored.stderr.trim()) {
  console.error(restored.stderr.trim());
}

/**
 * Exact counts, not pg_stat's estimates — those are filled in by ANALYZE and
 * read as zero straight after a restore, which would look like data loss.
 */
const countSql = `
SELECT relname AS table,
       (xpath('/row/c/text()',
         query_to_xml(format('SELECT count(*) AS c FROM %I.%I', schemaname, relname),
                      false, true, '')))[1]::text::bigint AS rows
FROM pg_stat_user_tables
ORDER BY rows DESC, relname;`;

const counts = docker([
  "exec", name, "psql", "-U", "postgres", "-d", DB, "-P", "pager=off", "-c", countSql,
]);
if (counts.status !== 0) die("restored, but could not read the tables back.", counts.stderr.trim());

console.log(counts.stdout.trim());

const total = [...counts.stdout.matchAll(/\|\s+(\d+)\s*$/gm)]
  .reduce((sum, match) => sum + Number(match[1]), 0);

if (total === 0) {
  die("the dump restored but every table is empty.", "This file is not a usable backup.");
}

console.log(`\n✓ Restored and verified — ${total} rows across all tables.`);

if (keep) {
  console.log(`  Kept running as container "${name}", database "${DB}".`);
  console.log(`  Remove it with:  docker rm -f ${name}\n`);
} else {
  docker(["rm", "-f", name]);
  console.log("  Scratch container removed. Nothing else was touched.\n");
}
