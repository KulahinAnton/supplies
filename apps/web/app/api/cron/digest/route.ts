import { DIGEST_HOUR_KYIV, kyivHour, sendDigests } from "@supplies/bot/digest";

/**
 * Feature 19 — the endpoint Vercel Cron calls.
 *
 * Node runtime: it touches Prisma and the Telegram API.
 *
 * Guarded by CRON_SECRET, which Vercel sends as `Authorization: Bearer …`.
 * The URL is not a secret, and without the guard anyone who found it could
 * spam the family's chats.
 *
 * **Why two cron entries.** Vercel schedules in UTC; Kyiv is UTC+3 in summer
 * and UTC+2 in winter, so no fixed UTC hour is noon all year. `vercel.json`
 * fires at both 09:00 and 10:00 UTC, and this route sends only on whichever
 * one is currently noon in Kyiv. The other returns `skipped` and does
 * nothing — cheap, and it keeps the delivery time steady across the DST
 * changeover without a paid plan's finer schedules.
 *
 * `lastDigestOn` makes a double fire harmless anyway.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return Response.json({ error: "CRON_SECRET is not set" }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const hour = kyivHour();
  const url = new URL(request.url);
  // `?force=1` sends regardless of the hour — for testing without waiting.
  const force = url.searchParams.get("force") === "1";

  if (!force && hour !== DIGEST_HOUR_KYIV) {
    return Response.json({
      ok: true,
      skipped: true,
      kyivHour: hour,
      wanted: DIGEST_HOUR_KYIV,
    });
  }

  try {
    const result = await sendDigests({ respectHour: false, force });
    return Response.json({ ok: true, kyivHour: hour, ...result });
  } catch (error) {
    console.error("[digest] run failed:", error);
    return Response.json({ ok: false, error: "digest failed" }, { status: 500 });
  }
}
