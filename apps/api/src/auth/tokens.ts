import { createHash, randomBytes } from "node:crypto";

/**
 * Feature 34 — the token primitives, kept pure so they can be tested without a
 * database, a Nest container or a clock.
 */

/** The claims an access token carries. Deliberately the same shape as the
 * Auth.js JWT (`auth.ts` callbacks), so one mental model covers both. */
export type AccessClaims = {
  sub: string;
  householdId: string;
  email: string;
};

/**
 * Opaque, not a JWT. A refresh token needs no claims — it is a lookup key for a
 * row, and the row is what makes it revocable. 256 bits from the CSPRNG.
 */
export function newRefreshToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Only the hash is stored, like `HouseholdInvite.tokenHash` and
 * `PasswordResetToken.tokenHash`. SHA-256 rather than bcrypt on purpose: the
 * input is 256 bits of entropy, so there is no dictionary to slow down, and a
 * refresh happens on a hot path where a deliberate 100ms would be felt.
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function refreshExpiry(days: number, now = new Date()): Date {
  const expiry = new Date(now);
  expiry.setUTCDate(expiry.getUTCDate() + days);
  return expiry;
}

/**
 * Why a token was revoked. Mirrors the `RefreshRevocation` enum in the schema,
 * declared here so this module stays free of the generated client — the same
 * reason `@supplies/core/units` restates `Unit`.
 */
export type RevocationReason = "rotated" | "reuse" | "logout";

export type StoredToken = {
  expiresAt: Date;
  revokedAt: Date | null;
  /** NULL on rows written before the column existed: no grace, safely. */
  revokedReason?: RevocationReason | null;
};

export type RefreshVerdict =
  /** Fresh and valid — rotate it. */
  | { status: "ok" }
  /** Past its expiry. Ordinary; the client signs in again. */
  | { status: "expired" }
  /**
   * Revoked, but only just — see `REFRESH_GRACE_MS`. Two callers holding the
   * same token started within a few seconds of each other and the loser is
   * presenting what the winner already rotated. Issue a fresh pair; do NOT
   * burn the family.
   */
  | { status: "raced" }
  /**
   * Already revoked, and presented anyway. Either a bug or a stolen token being
   * replayed, and there is no way to tell which from here — so every token for
   * the user goes, and they sign in again. A legitimate user re-authenticating
   * is a smaller harm than an attacker keeping a session alive.
   */
  | { status: "reused" };

/**
 * How long a just-rotated refresh token still answers, instead of being read
 * as theft.
 *
 * The race this closes is real and was found in Phase 2.8: **rotation plus
 * shared storage is not safe on its own.** Two browser tabs share one httpOnly
 * cookie, and restoring together sends the same token twice — the second
 * arrival looks exactly like a replay, and the correct answer to a replay is
 * to revoke every session. The user gets signed out of everything for opening
 * a second tab.
 *
 * The client-side alternative was `navigator.locks`. Rejected for being
 * browser-only and for putting the fix in one of three clients; this is the
 * one place that sees every caller.
 *
 * **A correction worth recording:** the React Native app was said to need this
 * too. It does not. Each device has its own token, and concurrent refreshes
 * inside one JS context are already handled by the single-flight guard in the
 * client. The window is here for the cookie clients; the phone simply costs
 * nothing by it.
 *
 * Ten seconds is chosen to be long enough for two page loads on a slow
 * connection and short enough that a stolen token is nearly always outside it.
 * The tradeoff is explicit: an attacker who replays within ten seconds of a
 * legitimate rotation is not detected. That is a far narrower window than
 * "any time before the user notices", which is what no-rotation would give.
 */
export const REFRESH_GRACE_MS = 10_000;

export function classifyRefresh(
  stored: StoredToken,
  now = new Date(),
  graceMs: number = REFRESH_GRACE_MS,
): RefreshVerdict {
  if (stored.revokedAt) {
    /**
     * **Only a rotation earns grace**, and the API's own e2e suite is what
     * forced this clause.
     *
     * `revokeAllFor` stamps `revokedAt = now()` on every token it kills, so
     * without the reason check a theft response put the whole family inside
     * the window — and the attacker who triggered it could simply refresh
     * again with any of them. The window neutered the very thing it was
     * bolted onto.
     */
    if (stored.revokedReason !== "rotated") return { status: "reused" };

    const since = now.getTime() - stored.revokedAt.getTime();
    // `since >= 0` guards a clock that went backwards: a revocation timestamped
    // in the future is not evidence of a race, so it falls through to `reused`.
    return since >= 0 && since <= graceMs ? { status: "raced" } : { status: "reused" };
  }
  if (stored.expiresAt.getTime() <= now.getTime()) return { status: "expired" };
  return { status: "ok" };
}
