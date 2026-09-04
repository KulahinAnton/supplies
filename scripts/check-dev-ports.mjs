import { execSync } from "node:child_process";

/**
 * Preflight for `pnpm dev:all`.
 *
 * Without it, a busy port produces one of the least helpful failures in the
 * repo. Vite has `strictPort: true`, so it exits 1; concurrently's `-k` then
 * SIGTERMs the other two; and a SIGTERMed `pnpm` reports "exited with code 1"
 * of its own — so the log blames whichever process printed last and says
 * nothing about a port.
 *
 * Checking 3000 matters for a subtler reason than the other two. Next does not
 * fail on a busy port, it quietly moves to 3001 — and the API's CORS allowlist
 * names 3000. Everything would start, look healthy, and have every request from
 * the browser rejected for reasons neither process logs.
 *
 * **This asks the OS who is listening rather than trying to bind.** The obvious
 * implementation — `net.createServer().listen(port)` and watch for EADDRINUSE —
 * was tried and is wrong on Windows: it reported 3000 and 5173 free while
 * `netstat` showed all three listening on 0.0.0.0. A check that says "free"
 * about a busy port is worse than no check.
 */

const PORTS = [
  {
    port: 3000,
    who: "web",
    note: "Next dev — moves to 3001 if taken, which silently breaks the API's CORS allowlist",
  },
  { port: 3200, who: "api", note: "NestJS" },
  { port: 5173, who: "spa", note: "Vite — strictPort, so it exits rather than moving" },
];

function run(command) {
  try {
    return execSync(command, { stdio: ["ignore", "pipe", "ignore"] }).toString();
  } catch {
    // Both tools exit non-zero when nothing matches, which is not an error.
    return "";
  }
}

/** port → PID of whatever is listening, for every port at once. */
function listeners() {
  const found = new Map();

  if (process.platform === "win32") {
    // "  TCP    0.0.0.0:3000    0.0.0.0:0    LISTENING    6368"
    // Parsed here rather than filtered with findstr, so that :3000 cannot
    // match :30000 or a foreign address that happens to contain it.
    for (const line of run("netstat -ano -p tcp").split(/\r?\n/)) {
      const match = /^\s*TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)\s*$/i.exec(line);
      if (match) found.set(Number(match[1]), match[2]);
    }
    return found;
  }

  for (const { port } of PORTS) {
    const pid = run(`lsof -nP -iTCP:${port} -sTCP:LISTEN -t`).trim().split(/\r?\n/)[0];
    if (pid) found.set(port, pid);
  }
  return found;
}

const held = listeners();
const busy = PORTS.filter((entry) => held.has(entry.port)).map((entry) => ({
  ...entry,
  pid: held.get(entry.port),
}));

const kill = process.platform === "win32" ? "taskkill /F /PID" : "kill";

/**
 * `pnpm dev:stop`. The reporting path below prints the commands to run, which
 * is fine once and tedious the third time — most often the holder is a dev
 * server from an earlier session that nobody meant to leave running.
 */
if (process.argv.includes("--kill")) {
  if (busy.length === 0) {
    console.log("Nothing listening on 3000, 3200 or 5173.");
    process.exit(0);
  }
  for (const { port, who, pid } of busy) {
    run(`${kill} ${pid}`);
    console.log(`stopped ${who} on ${port} (PID ${pid})`);
  }
  process.exit(0);
}

if (busy.length === 0) process.exit(0);

console.error("\n  Cannot start: these ports are already in use.\n");
for (const { port, who, note, pid } of busy) {
  console.error(`    ${port}  ${who.padEnd(4)}  PID ${pid}`);
  console.error(`            ${note}`);
}
console.error("\n  Stop them all with:\n");
console.error("    pnpm dev:stop\n");
console.error("  Or individually:\n");
console.error(`    ${busy.map(({ pid }) => `${kill} ${pid}`).join("\n    ")}\n`);
process.exit(1);
