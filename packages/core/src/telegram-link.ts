import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Feature 9 — the token that binds a Telegram chat to an app user.
 *
 * Stateless on purpose: a signed token needs no table and no cleanup job, and
 * it cannot be replayed after it expires. The secret is AUTH_SECRET, so
 * rotating that invalidates every outstanding link token — which is correct
 * behaviour, not a bug.
 *
 * **The encoding is constrained by Telegram, not by us.** A `t.me/bot?start=…`
 * deep-link payload may be at most **64 characters** from `A-Za-z0-9_-`.
 * Telegram silently drops anything longer or containing other characters, and
 * the bot then receives a bare `/start` with no payload — which looks exactly
 * like a user who never used the link at all. So the token is packed into
 * fixed-width base64url fields with no separators:
 *
 *   [0,22)  user id   — the UUID's 16 raw bytes, base64url
 *   [22,30) expiry    — whole minutes since the epoch, base36, zero-padded
 *   [30,50) signature — HMAC-SHA256 over the two above, truncated
 *
 * 50 characters total. The signature keeps 120 bits, which is far more than a
 * single-use token that dies in 15 minutes needs.
 */

const UID_LEN = 22;
const EXP_LEN = 8;
const SIG_LEN = 20;
export const TOKEN_LEN = UID_LEN + EXP_LEN + SIG_LEN;

/** Telegram's hard limit on a deep-link start payload. */
export const TELEGRAM_START_PARAM_MAX = 64;

const TTL_MS = 15 * 60 * 1000;
const MS_PER_MINUTE = 60_000;

function encodeUserId(userId: string): string | null {
  const hex = userId.replace(/-/g, "");
  if (!/^[0-9a-fA-F]{32}$/.test(hex)) return null;
  return Buffer.from(hex, "hex").toString("base64url");
}

function decodeUserId(encoded: string): string | null {
  let hex: string;
  try {
    hex = Buffer.from(encoded, "base64url").toString("hex");
  } catch {
    return null;
  }
  if (hex.length !== 32) return null;
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url").slice(0, SIG_LEN);
}

export function createLinkToken(
  userId: string,
  secret: string,
  now: number = Date.now(),
): string | null {
  const uid = encodeUserId(userId);
  if (!uid) return null;

  const expiryMinutes = Math.ceil((now + TTL_MS) / MS_PER_MINUTE);
  const exp = expiryMinutes.toString(36).padStart(EXP_LEN, "0");
  if (exp.length !== EXP_LEN) return null;

  return `${uid}${exp}${sign(uid + exp, secret)}`;
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
  if (token.length !== TOKEN_LEN) return null;

  const uid = token.slice(0, UID_LEN);
  const exp = token.slice(UID_LEN, UID_LEN + EXP_LEN);
  const signature = token.slice(UID_LEN + EXP_LEN);

  const expected = sign(uid + exp, secret);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  const expiryMinutes = Number.parseInt(exp, 36);
  if (!Number.isFinite(expiryMinutes)) return null;
  if (expiryMinutes * MS_PER_MINUTE < now) return null;

  return decodeUserId(uid);
}
