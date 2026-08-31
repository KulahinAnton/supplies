import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { validSessionOrNull } from "@/lib/auth-guard";
import { syncRequestSchema, type SyncResponse } from "@/lib/offline/operations";
import { replayOperations } from "@/lib/offline/replay";

/**
 * Feature 31 — where a phone's outbox lands when the signal comes back.
 *
 * A route rather than a server action because the client calls it from a
 * plain `fetch` on an `online` event, outside any React render — and because
 * an offline queue wants an ordinary HTTP contract it can retry.
 *
 * Node runtime: this reaches Prisma.
 */
export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  /**
   * `validSessionOrNull` rather than `requireSession`, which redirects — a
   * redirect to /login answered to `fetch` would be parsed as a failed sync
   * and the queue retried forever. 401 is the truth and the client can act on
   * it: keep the queue, tell the user to sign in.
   */
  const session = await validSessionOrNull();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const parsed = syncRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid operations" }, { status: 400 });
  }

  const results = await replayOperations(
    { userId: session.userId, householdId: session.householdId },
    parsed.data.ops,
  );

  /**
   * Every page that shows stock is now wrong in the server's cache. Revalidate
   * once for the whole flush rather than per operation — twenty queued takes
   * of the same item should not invalidate the same four pages twenty times.
   */
  if (results.some((result) => result.ok && !result.duplicate)) {
    revalidatePath("/dashboard");
    revalidatePath("/items");
    revalidatePath("/shopping");
  }

  return NextResponse.json<SyncResponse>({ results });
}
