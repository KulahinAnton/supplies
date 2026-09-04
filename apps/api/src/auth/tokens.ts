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

export type StoredToken = {
  expiresAt: Date;
  revokedAt: Date | null;
};

export type RefreshVerdict =
  /** Fresh and valid — rotate it. */
  | { status: "ok" }
  /** Past its expiry. Ordinary; the client signs in again. */
  | { status: "expired" }
  /**
   * Already revoked, and presented anyway. Either a bug or a stolen token being
   * replayed, and there is no way to tell which from here — so every token for
   * the user goes, and they sign in again. A legitimate user re-authenticating
   * is a smaller harm than an attacker keeping a session alive.
   */
  | { status: "reused" };

export function classifyRefresh(stored: StoredToken, now = new Date()): RefreshVerdict {
  if (stored.revokedAt) return { status: "reused" };
  if (stored.expiresAt.getTime() <= now.getTime()) return { status: "expired" };
  return { status: "ok" };
}
