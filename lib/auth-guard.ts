import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/**
 * The session as the app trusts it: re-read from the DB, not merely decoded
 * from the JWT (PROJECT_PROMPT.md Feature 1).
 *
 * A JWT lives 8 hours. In that time the user can be deactivated, deleted, or
 * moved to another household by a DB reseed — and the token would still decode
 * cleanly and still name the old `householdId`. Every guard below re-checks the
 * row, so a stale token cannot read another household's data.
 */
export type AppSession = {
  userId: string;
  householdId: string;
  name: string;
  email: string;
};

/** The session, or null. Never redirects — for pages that tolerate both. */
export async function validSessionOrNull(): Promise<AppSession | null> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      isActive: true,
      householdId: true,
    },
  });
  if (!user || !user.isActive) return null;

  return {
    userId: user.id,
    householdId: user.householdId,
    name: user.name,
    email: user.email,
  };
}

/**
 * The session or a redirect to /login. Used by the authed layout AND by every
 * server action — layouts protect pages, not mutations.
 */
export async function requireSession(): Promise<AppSession> {
  const session = await validSessionOrNull();
  if (!session) redirect("/login");
  return session;
}
