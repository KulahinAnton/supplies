import "dotenv/config";
import { prisma } from "@supplies/db/prisma";
import { sendDigests } from "@supplies/bot/digest";

/**
 * Feature 19 — the digest from the command line.
 *
 * Shares lib/digest.ts with the cron route, so the two cannot drift. Unlike
 * the route this DOES respect each household's `digestHour`, because a shell
 * can be scheduled hourly and Vercel's Hobby cron cannot.
 *
 *   pnpm digest:run            send to households whose hour has come
 *   pnpm digest:run -- --force send regardless of hour or of already-sent
 */
const force = process.argv.includes("--force");

async function main() {
  const result = await sendDigests({ respectHour: true, force });
  console.log(
    `Digest done — ${result.households} household(s), ` +
      `${result.messages} message(s), ${result.failures} failure(s).`,
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
