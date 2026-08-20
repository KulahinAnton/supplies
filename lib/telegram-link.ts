import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Feature 9 — the token that binds a Telegram chat to an app user.
 *
 * Stateless on purpose: a signed `userId.expiry.signature` triple needs no
 * table and no cleanup job, and it cannot be replayed after it expires. The
 * secret is AUTH_SECRET, so rotating that invalidates every outstanding link
 * token — which is the correct behaviour, not a bug.
 */

const TTL_MS = 15 * 60 * 1000;

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createLinkToken(
  userId: string,
  secret: string,
  now: number = Date.now(),
): string {
  const payload = `${userId}.${now + TTL_MS}`;
  return `${payload}.${sign(payload, secret)}`;
}

/**
 * Returns the userId, or null for anything malformed, mis-signed or expired.
 * Never throws — a bot user can type whatever they like after /start.
 */
export function verifyLinkToken(
  token: string,
  secret: string,
  now: number = Date.now(),
): string | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [userId, expiryRaw, signature] = parts;
  if (!userId || !expiryRaw || !signature) return null;

  const expected = sign(`${userId}.${expiryRaw}`, secret);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  const expiry = Number(expiryRaw);
  if (!Number.isFinite(expiry) || expiry < now) return null;

  return userId;
}
