"use server";

import { requireSession } from "@/lib/auth-guard";
import { actionOk, type ActionResult } from "@supplies/core/action-result";
import {
  changePassword,
  createInvite,
  inviteHouseholdName as readInviteHouseholdName,
  registerUser,
  requestPasswordReset,
  resetPassword,
} from "@supplies/db/account-service";

/**
 * A session guard and an `appUrl` — the two things only this app can supply.
 *
 * Every rule below lives in `@supplies/db/account-service`: the password
 * hashing, the invite's single use, the reset token's one-hour life, and the
 * always-ok answer that stops `forgot-password` being a membership oracle. It
 * is there rather than here because the API needs the same flows, and a second
 * copy of a security property is a second copy that eventually disagrees —
 * which is exactly what had already happened to registration.
 *
 * Nothing here calls `revalidatePath`: none of these change a page's data.
 * Registration and reset both end at /login.
 */
const appUrl = () => process.env.APP_URL ?? "http://localhost:3000";

/**
 * Register. Without an invite token this creates a NEW household and seeds its
 * categories and storage locations; with one, the user joins the inviting
 * household instead (Feature 1).
 */
export async function registerAction(input: unknown): Promise<ActionResult> {
  const result = await registerUser(input);
  // The caller signs in with the credentials it just submitted; nothing here
  // needs the row, so the payload is dropped rather than widened into the
  // action's public type.
  return result.ok ? actionOk() : result;
}

export async function changePasswordAction(input: unknown): Promise<ActionResult> {
  const session = await requireSession();
  return changePassword(session, input);
}

export async function requestPasswordResetAction(
  input: unknown,
): Promise<ActionResult> {
  return requestPasswordReset(input, { appUrl: appUrl() });
}

export async function resetPasswordAction(input: unknown): Promise<ActionResult> {
  return resetPassword(input);
}

/**
 * Create a single-use invite link. The raw token is returned once, here, and
 * never stored — only its SHA-256 goes to the DB.
 */
export async function createInviteAction(
  email?: string,
): Promise<ActionResult<{ url: string }>> {
  const session = await requireSession();
  return createInvite(session, {
    appUrl: appUrl(),
    email,
  });
}

/** Used by /join/[token] to show whose household the visitor is joining. */
export async function inviteHouseholdName(token: string): Promise<string | null> {
  return readInviteHouseholdName(token);
}
