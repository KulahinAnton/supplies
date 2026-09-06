import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import type { Actor } from "./stock-service";
import { inviteEmail, sendEmail } from "./email";
import { actionError, actionOk, type ActionResult } from "../../core/src/action-result";
import { ruleMessage } from "../../core/src/messages";
import { changePasswordSchema } from "../../core/src/validation/auth";
import { firstIssueAsRuleMessage } from "../../core/src/validation/shared";

/**
 * The two account actions the Settings screen offers: change your password,
 * and invite someone into the household.
 *
 * Moved out of `apps/web/lib/actions/auth.ts` when the SPA's Settings screen
 * needed them. Registration and password reset stay there for now — they are
 * public flows the SPA has not ported yet, and moving code nothing calls
 * twice buys nothing.
 *
 * `bcrypt` and the invite token live here rather than in `packages/core`
 * because both are server-only: core has to survive a React Native bundle,
 * and neither `node:crypto` at this scale nor a database write belongs in it.
 */

/** 7 days. Long enough to reach someone on holiday, short enough to expire. */
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function newToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Only the hash is stored, so a leaked database row cannot be redeemed. */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function changePassword(
  actor: Actor,
  input: unknown,
): Promise<ActionResult> {
  const parsed = changePasswordSchema.safeParse(input);
  if (!parsed.success) return actionError(firstIssueAsRuleMessage(parsed.error));

  const user = await prisma.user.findUnique({ where: { id: actor.userId } });
  if (!user) return actionError(ruleMessage("auth.sessionRequired"));

  const valid = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
  if (!valid) return actionError(ruleMessage("auth.currentPasswordWrong"));

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(parsed.data.newPassword, 12) },
  });

  return actionOk();
}

/**
 * A single-use invite link, optionally emailed.
 *
 * `appUrl` is passed in rather than read from `process.env` here: the Next app
 * and the API are separate processes with their own environments, and the link
 * has to point at wherever `/join/:token` is actually served — which is the
 * web app, for both callers.
 */
export async function createInvite(
  actor: Actor,
  options: { appUrl: string; email?: string },
): Promise<ActionResult<{ url: string }>> {
  const token = newToken();
  const email = options.email?.trim();

  const household = await prisma.household.findUnique({
    where: { id: actor.householdId },
    select: { name: true },
  });

  await prisma.householdInvite.create({
    data: {
      householdId: actor.householdId,
      tokenHash: hashToken(token),
      email: email || null,
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      createdById: actor.userId,
    },
  });

  if (email && household) {
    // Best-effort: with no RESEND_API_KEY this logs and returns false, and the
    // link below is still the real one. Failing the whole action because mail
    // is unconfigured would break the copy-the-link path that works offline.
    await sendEmail({ to: email, ...inviteEmail(token, household.name) });
  }

  return actionOk({ url: `${options.appUrl}/join/${token}` });
}
