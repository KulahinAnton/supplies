import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import type { Actor } from "./stock-service";
import { inviteEmail, passwordResetEmail, sendEmail } from "./email";
import { actionError, actionOk, type ActionResult } from "../../core/src/action-result";
import { ruleMessage } from "../../core/src/messages";
import {
  changePasswordSchema,
  forgotPasswordSchema,
  registerSchema,
  resetPasswordSchema,
} from "../../core/src/validation/auth";
import {
  DEFAULT_CATEGORIES,
  DEFAULT_LOCATIONS,
  defaultHouseholdName,
} from "../../core/src/household-defaults";
import { firstIssueAsRuleMessage } from "../../core/src/validation/shared";

/**
 * Accounts: passwords, invites, and the two halves of a password reset.
 *
 * All of it moved out of `apps/web/lib/actions/auth.ts`, in two goes. The
 * settings actions came first, when the SPA's Settings screen needed them;
 * the reset flow followed when Phase 2.10 found it was the last business rule
 * living only in the Next app — token hashing, the one-hour expiry, the
 * single-use marking and the enumeration-safe always-ok response were
 * unreachable from the API, so the API simply could not offer the feature.
 *
 * Registration is the one that stays in the app, and deliberately: it is the
 * only flow whose two implementations genuinely differ. The Next app writes a
 * NextAuth session; the API issues a token pair. Sharing the seeding would
 * mean a service that returns a user and lets each caller invent the session,
 * which is what `RegistrationService` in apps/api already does.
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

/**
 * Feature 1 — what a new password does to the API sessions the old one opened.
 *
 * Every live refresh token for the user ends, except `keepSessionId`: the
 * session that made a change, so the device in someone's hand stays signed in.
 * Marked `password` rather than `reuse`, because those devices will still try
 * to refresh and that must be refused, not read as theft — which would burn the
 * kept session along with the rest (see `RefreshRevocation` in the schema).
 *
 * Auth.js sessions on the web app are JWTs and cannot be revoked here; they
 * expire on their own within eight hours.
 */
function apiSessionsToEnd(userId: string, keepSessionId?: string) {
  return {
    where: {
      userId,
      revokedAt: null,
      ...(keepSessionId ? { id: { not: keepSessionId } } : {}),
    },
    data: { revokedAt: new Date(), revokedReason: "password" as const },
  };
}

/**
 * Change your own password. The current one has to be right.
 *
 * `keepSessionId` is the caller's API session, when there is one. The web app
 * has none to pass, so a change made there signs out every phone and SPA
 * session; a change made in the SPA or on a phone keeps that one.
 */
export async function changePassword(
  actor: Actor,
  input: unknown,
  options: { keepSessionId?: string } = {},
): Promise<ActionResult> {
  const parsed = changePasswordSchema.safeParse(input);
  if (!parsed.success) return actionError(firstIssueAsRuleMessage(parsed.error));

  const user = await prisma.user.findUnique({ where: { id: actor.userId } });
  if (!user) return actionError(ruleMessage("auth.sessionRequired"));

  const valid = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
  if (!valid) return actionError(ruleMessage("auth.currentPasswordWrong"));

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
    await tx.apiRefreshToken.updateMany(apiSessionsToEnd(user.id, options.keepSessionId));
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
    await sendEmail({
      to: email,
      ...inviteEmail(token, household.name, options.appUrl),
    });
  }

  return actionOk({ url: `${options.appUrl}/join/${token}` });
}

/** One hour. A reset link is used within minutes or not at all. */
const RESET_TTL_MS = 60 * 60 * 1000;

/**
 * Start a password reset.
 *
 * **Always answers `ok`, even for an address that has no account.** That is
 * the whole security property: a caller who could tell "no such user" from
 * "email sent" would have a free membership oracle for the household. The
 * cost is that a typo looks exactly like a success, which is why the screen
 * says "if that address is registered" rather than "check your inbox".
 *
 * `appUrl` is passed in for the same reason `createInvite` takes one — the
 * link has to point at whichever client actually serves `/reset-password`,
 * and the Next app and the API do not share an environment.
 */
export async function requestPasswordReset(
  input: unknown,
  options: { appUrl: string },
): Promise<ActionResult> {
  const parsed = forgotPasswordSchema.safeParse(input);
  if (!parsed.success) return actionError(firstIssueAsRuleMessage(parsed.error));

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email },
    select: { id: true, email: true, isActive: true },
  });

  if (user && user.isActive) {
    const token = newToken();
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + RESET_TTL_MS),
      },
    });
    await sendEmail({
      to: user.email,
      ...passwordResetEmail(token, options.appUrl),
    });
  }

  return actionOk();
}

/**
 * Finish a password reset.
 *
 * Three ways the token can be no good — never issued, already used, expired —
 * and all three answer with the same message on purpose. (Its own message: this
 * used to borrow `auth.inviteInvalid` and tell people resetting a password
 * that their invitation was invalid.) Distinguishing them
 * would tell someone holding a stolen token which ones are worth trying
 * again, and none of the three is actionable by the person who owns the
 * account anyway: the answer is always "ask for a new link".
 *
 * The update and the marking are one transaction. Without that, a crash
 * between them leaves a changed password and a token that still works.
 *
 * It also ends **every** API session the user had. A reset is what someone
 * does when they believe the account is compromised, and a stolen phone
 * session surviving it would make the reset a formality.
 */
export async function resetPassword(input: unknown): Promise<ActionResult> {
  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) return actionError(firstIssueAsRuleMessage(parsed.error));

  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(parsed.data.token) },
  });
  if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) {
    return actionError(ruleMessage("auth.resetLinkInvalid"));
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: record.userId },
      data: { passwordHash },
    });
    await tx.passwordResetToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    });
    await tx.apiRefreshToken.updateMany(apiSessionsToEnd(record.userId));
  });

  return actionOk();
}

/**
 * Whose household an invite leads to, or null if the link is no longer good.
 *
 * Used by the join screen to say «Вас запрошують до ‹родини›» before asking
 * for a password. Returning the name of a household to someone holding a
 * valid single-use token is the point of the token; returning null for a
 * spent or expired one is what stops it being a lookup service.
 */
export async function inviteHouseholdName(token: string): Promise<string | null> {
  const invite = await prisma.householdInvite.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { household: { select: { name: true } } },
  });
  if (!invite || invite.usedAt || invite.expiresAt.getTime() < Date.now()) {
    return null;
  }
  return invite.household.name;
}

/** The row both callers need in order to build a session of their own kind. */
export type RegisteredUser = {
  id: string;
  email: string;
  name: string;
  householdId: string;
};

/**
 * Feature 1 — create an account, and a household unless invited.
 *
 * This was the last flow with two implementations: `apps/web/lib/actions/auth.ts`
 * had one and `apps/api`'s `RegistrationService` had another, and they had
 * already drifted — the API's consumed the invite with a conditional
 * `updateMany` inside the transaction, the web app's did not, so two people
 * opening the same link at the same moment could both join on one token. The
 * version that kept its guarantee is the one that survived.
 *
 * What deliberately stays with the callers is the session: the Next app writes
 * a NextAuth cookie and the API issues a token pair. Both are built from the
 * row returned here, so a person who signs up on their phone signs in on the
 * web with the same password — same bcrypt cost, same row.
 */
export async function registerUser(input: unknown): Promise<ActionResult<RegisteredUser>> {
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) return actionError(firstIssueAsRuleMessage(parsed.error));

  const { name, email, password, inviteToken } = parsed.data;

  const taken = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (taken) return actionError(ruleMessage("auth.emailTaken"));

  const passwordHash = await bcrypt.hash(password, 12);

  return inviteToken
    ? joinExistingHousehold({ name, email, passwordHash, inviteToken })
    : createOwnHousehold({ name, email, passwordHash });
}

type NewUser = { name: string; email: string; passwordHash: string };

async function joinExistingHousehold(
  args: NewUser & { inviteToken: string },
): Promise<ActionResult<RegisteredUser>> {
  const invite = await prisma.householdInvite.findUnique({
    where: { tokenHash: hashToken(args.inviteToken) },
  });
  if (!invite || invite.usedAt) return actionError(ruleMessage("auth.inviteInvalid"));
  if (invite.expiresAt.getTime() < Date.now()) {
    return actionError(ruleMessage("auth.inviteExpired"));
  }

  try {
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          name: args.name,
          email: args.email,
          passwordHash: args.passwordHash,
          householdId: invite.householdId,
        },
      });
      /**
       * Inside the transaction, and conditional on the invite still being
       * unused. The check above is a courtesy that gives a good message; THIS
       * is the one that holds, because between reading the invite and writing
       * the user someone else may have redeemed it. `count === 0` means they
       * did, and rolling back is the only correct answer.
       */
      const { count } = await tx.householdInvite.updateMany({
        where: { id: invite.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (count === 0) throw new InviteRaceLost();
      return created;
    });
    return actionOk(toRegistered(user));
  } catch (cause) {
    if (cause instanceof InviteRaceLost) {
      return actionError(ruleMessage("auth.inviteInvalid"));
    }
    throw cause;
  }
}

/** Thrown only to roll the transaction back; never leaves this module. */
class InviteRaceLost extends Error {}

async function createOwnHousehold(
  args: NewUser,
): Promise<ActionResult<RegisteredUser>> {
  const user = await prisma.$transaction(async (tx) => {
    const household = await tx.household.create({
      data: { name: defaultHouseholdName(args.name) },
    });
    await tx.category.createMany({
      data: DEFAULT_CATEGORIES.map((category) => ({
        ...category,
        householdId: household.id,
      })),
    });
    await tx.storageLocation.createMany({
      data: DEFAULT_LOCATIONS.map((location) => ({
        ...location,
        householdId: household.id,
      })),
    });
    return tx.user.create({
      data: {
        name: args.name,
        email: args.email,
        passwordHash: args.passwordHash,
        householdId: household.id,
      },
    });
  });

  return actionOk(toRegistered(user));
}

function toRegistered(user: RegisteredUser): RegisteredUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    householdId: user.householdId,
  };
}
