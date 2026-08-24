/**
 * `pnpm backup:prod` — a portable dump of the production database.
 *
 * Why this exists alongside Neon's own snapshots: everything Neon retains
 * (the 6-hour history window and the Free plan's single snapshot) lives inside
 * the same project it protects. This writes a file you hold, which is the only
 * copy that survives the account going away.
 *
 * It borrows `pg_dump` from the local Docker container rather than requiring
 * Postgres client tools on Windows. That also pins the version: pg_dump
 * refuses to run against a server newer than itself.
 *
 * It never touches the local dev database. The only thing taken from the
 * container is the binary.
 */

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";

const CONTAINER = process.env.BACKUP_CONTAINER ?? "supplies-db";
const OUT_DIR = "backups";
const ENV_FILE = ".env.backup";
const VAR = "DATABASE_URL_PROD";

function die(message: string, hint?: string): never {
  console.error(`\n✗ ${message}`);
  if (hint) console.error(`  ${hint}`);
  process.exit(1);
}

/** Reads .env.backup without pulling in a dotenv dependency. */
function readEnvFile(): string | undefined {
  if (!existsSync(ENV_FILE)) return undefined;
  for (const line of readFileSync(ENV_FILE, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (match && match[1] === VAR) return match[2].replace(/^["']|["']$/g, "");
  }
  return undefined;
}

function run(args: string[], env?: Record<string, string>) {
  const result = spawnSync("docker", args, {
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
  if (result.error) die(`could not run docker: ${result.error.message}`);
  return result;
}

const url = process.env[VAR] ?? readEnvFile();
if (!url) {
  die(
    `${VAR} is not set.`,
    `Put the DIRECT (unpooled) Neon connection string in ${ENV_FILE}:\n` +
      `  ${VAR}="postgresql://user:password@ep-xxxx.region.aws.neon.tech/dbname?sslmode=require"`,
  );
}

let parsed: URL;
try {
  parsed = new URL(url);
} catch {
  die(`${VAR} is not a valid connection URL.`);
}

/**
 * The pooled endpoint runs PgBouncer in transaction mode, which cannot hold
 * the session state and consistent snapshot pg_dump needs. It fails, or worse
 * succeeds with an inconsistent file — so refuse rather than warn.
 */
if (parsed.hostname.includes("-pooler")) {
  die(
    "that is the POOLED connection string.",
    `Use the direct one — the same host without "-pooler":\n` +
      `  ${parsed.hostname.replace("-pooler", "")}`,
  );
}

const host = parsed.hostname;
const port = parsed.port || "5432";
const user = decodeURIComponent(parsed.username);
const password = decodeURIComponent(parsed.password);
const database = parsed.pathname.replace(/^\//, "");
// Honour the URL. Neon needs sslmode=require and its strings carry it;
// forcing it unconditionally would make this script unusable against any
// server without TLS, including a local one used to test this script.
const sslmode = parsed.searchParams.get("sslmode") ?? "require";
if (!user || !password || !database) {
  die(`${VAR} is missing a username, password or database name.`);
}

// Docker must be up: the container is where pg_dump lives.
const alive = run(["ps", "--filter", `name=${CONTAINER}`, "--format", "{{.Names}}"]);
if (alive.status !== 0) {
  die(
    "Docker is not running.",
    "Start Docker Desktop, then `pnpm db:up`. This script uses the container's pg_dump.",
  );
}
if (!alive.stdout.includes(CONTAINER)) {
  die(`container "${CONTAINER}" is not running.`, "Run `pnpm db:up` first.");
}

const stamp = new Date()
  .toLocaleString("sv-SE", { hour12: false })
  .replace(/[: ]/g, "-")
  .slice(0, 16);
const filename = `supplies-${stamp}.dump`;
const remote = `/tmp/${filename}`;

console.log(`\n→ Source  ${host}/${database} (direct, unpooled)`);
console.log("→ Dumping…");
const started = Date.now();

/**
 * `-e PGPASSWORD` with no value forwards it from this process's environment,
 * so the password never appears in the docker command line or in `ps`.
 */
const dump = run(
  [
    "exec",
    "-e", "PGPASSWORD",
    "-e", "PGSSLMODE",
    CONTAINER,
    "pg_dump",
    "-h", host,
    "-p", port,
    "-U", user,
    "-d", database,
    // Neon's role names will not exist wherever this is restored.
    "--no-owner",
    "--no-acl",
    // Custom format: compressed, and pg_restore can list or selectively restore.
    "-Fc",
    "-f", remote,
  ],
  { PGPASSWORD: password, PGSSLMODE: sslmode },
);

if (dump.status !== 0) {
  die("pg_dump failed.", dump.stderr.trim() || "no output from pg_dump");
}

/**
 * A dump that wrote an empty schema is byte-plausible and looks fine on disk.
 * Reopening it and counting what is actually inside is the difference between
 * having a backup and believing you have one.
 */
const listed = run(["exec", CONTAINER, "pg_restore", "-l", remote]);
if (listed.status !== 0) {
  die("the dump was written but cannot be read back.", listed.stderr.trim());
}
const tablesWithData = listed.stdout
  .split("\n")
  .filter((line) => line.includes("TABLE DATA")).length;

if (tablesWithData === 0) {
  die(
    "the dump contains no table data.",
    "The connection succeeded but the database looks empty — check you used the production branch.",
  );
}

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
const local = `${OUT_DIR}/${filename}`;
execFileSync("docker", ["cp", `${CONTAINER}:${remote}`, local], { stdio: "inherit" });
run(["exec", CONTAINER, "rm", "-f", remote]);

const kb = Math.round(statSync(local).size / 1024);
const seconds = ((Date.now() - started) / 1000).toFixed(1);

console.log(`\n✓ ${local}  (${kb} KB, ${seconds}s)`);
console.log(`  tables with data: ${tablesWithData}`);
console.log(`\n  Verify it restores:  pnpm backup:verify ${local}`);
console.log("  Then keep a copy off this machine — one copy is not a backup.\n");
