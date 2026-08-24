/**
 * `pnpm backup:prod` — a portable dump of the production database.
 *
 * Why this exists alongside Neon's own protection: the history window and the
 * Free plan's single snapshot both live inside the project they protect. This
 * writes a file you hold, which is the only copy that survives losing the
 * account.
 *
 * The client comes from a throwaway `postgres:18` container rather than from
 * the dev database container. Two reasons, one of them learned the hard way:
 *
 *  - **Versions must match.** pg_dump refuses to dump a server newer than
 *    itself. Neon runs 18.6; the dev container ships 17.11, so borrowing its
 *    binary failed outright with "server version mismatch". The image tag here
 *    must be >= whatever Neon is running.
 *  - Backing up production has no business depending on the local dev database
 *    being up.
 *
 * Nothing local is read or written except the dump file.
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

/** Must be >= the Neon server version. Override if Neon moves ahead. */
const CLIENT_IMAGE = process.env.BACKUP_PG_IMAGE ?? "postgres:18-alpine";
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

function docker(args: string[], env?: Record<string, string>) {
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
// Honour the URL. Neon's strings carry sslmode=require; forcing it
// unconditionally would make this unusable against a server without TLS.
const sslmode = parsed.searchParams.get("sslmode") ?? "require";

if (!user || !password || !database) {
  die(`${VAR} is missing a username, password or database name.`);
}

if (docker(["info", "--format", "{{.ServerVersion}}"]).status !== 0) {
  die("Docker is not running.", "Start Docker Desktop and try again.");
}

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
const mount = `${resolve(OUT_DIR)}:/out`;

const stamp = new Date()
  .toLocaleString("sv-SE", { hour12: false })
  .replace(/[: ]/g, "-")
  .slice(0, 16);
const filename = `supplies-${stamp}.dump`;

console.log(`\n→ Source  ${host}/${database} (direct, unpooled)`);
console.log(`→ Client  ${CLIENT_IMAGE}`);
console.log("→ Dumping…");
const started = Date.now();

/**
 * `-e PGPASSWORD` with no value forwards it from this process's environment,
 * so the password never appears in the docker command line or in `ps`.
 */
const dump = docker(
  [
    "run", "--rm",
    "-e", "PGPASSWORD",
    "-e", "PGSSLMODE",
    "-v", mount,
    CLIENT_IMAGE,
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
    "-f", `/out/${filename}`,
  ],
  { PGPASSWORD: password, PGSSLMODE: sslmode },
);

if (dump.status !== 0) {
  const stderr = dump.stderr.trim();
  if (stderr.includes("server version mismatch")) {
    const server = stderr.match(/server version: ([\d.]+)/)?.[1] ?? "newer";
    die(
      `Neon is running Postgres ${server}, newer than ${CLIENT_IMAGE}.`,
      `pg_dump cannot dump a server newer than itself. Use a matching image:\n` +
        `  BACKUP_PG_IMAGE=postgres:${server.split(".")[0]}-alpine pnpm backup:prod`,
    );
  }
  die("pg_dump failed.", stderr || "no output from pg_dump");
}

/**
 * A dump that wrote an empty schema is byte-plausible and looks fine on disk.
 * Reopening it and counting what is actually inside is the difference between
 * having a backup and believing you have one.
 */
const listed = docker([
  "run", "--rm", "-v", mount, CLIENT_IMAGE,
  "pg_restore", "-l", `/out/${filename}`,
]);
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

const local = `${OUT_DIR}/${filename}`;
const kb = Math.round(statSync(local).size / 1024);
const seconds = ((Date.now() - started) / 1000).toFixed(1);

console.log(`\n✓ ${local}  (${kb} KB, ${seconds}s)`);
console.log(`  tables with data: ${tablesWithData}`);
console.log(`\n  Verify it restores:  pnpm backup:verify ${local}`);
console.log("  Then keep a copy off this machine — one copy is not a backup.\n");
