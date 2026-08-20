import { sendDigests } from "@/lib/digest";

/**
 * Feature 19 — the endpoint Vercel Cron calls.
 *
 * Node runtime: it touches Prisma and the Telegram API.
 *
 * Guarded by CRON_SECRET, which Vercel sends as `Authorization: Bearer …`.
 * Without the guard anyone who found this URL could spam the family's chats,
 * and the URL is not a secret.
 *
 * `respectHour` is false here: Vercel's Hobby plan runs cron at most once a
 * day, so the digest arrives when the cron fires rather than at each
 * household's `digestHour`. Calling it twice in a day is harmless —
 * `lastDigestOn` makes the second call a no-op.
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

  try {
    const result = await sendDigests({ respectHour: false });
    return Response.json({ ok: true, ...result });
  } catch (error) {
    console.error("[digest] run failed:", error);
    return Response.json({ ok: false, error: "digest failed" }, { status: 500 });
  }
}
