import { describe, expect, it } from "vitest";
import {
  createLinkToken,
  verifyLinkToken,
  TELEGRAM_START_PARAM_MAX,
  TOKEN_LEN,
} from "@/lib/telegram-link";

const SECRET = "test-secret";
const USER = "5f2b8c1e-0000-4000-8000-000000000001";
const NOW = 1_800_000_000_000;

describe("telegram link tokens", () => {
  it("round-trips a freshly issued token", () => {
    const token = createLinkToken(USER, SECRET, NOW)!;
    expect(verifyLinkToken(token, SECRET, NOW + 1000)).toBe(USER);
  });

  /**
   * The regression this file exists for. Telegram allows at most 64 characters
   * from A-Za-z0-9_- in a `?start=` payload; anything else is silently dropped
   * and the bot receives a bare /start, which is indistinguishable from a user
   * who never used the link. The first implementation was 94 characters with
   * dots as separators, and linking simply never worked.
   */
  it("fits inside Telegram's deep-link limits", () => {
    const token = createLinkToken(USER, SECRET, NOW)!;
    expect(token).toHaveLength(TOKEN_LEN);
    expect(token.length).toBeLessThanOrEqual(TELEGRAM_START_PARAM_MAX);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("stays inside the limit for any uuid and any plausible time", () => {
    const uuids = [
      "00000000-0000-0000-0000-000000000000",
      "ffffffff-ffff-ffff-ffff-ffffffffffff",
      "a80979b9-0b3e-42c4-8ccc-4854421cf79d",
    ];
    const times = [0, NOW, Date.UTC(2099, 11, 31)];
    for (const uuid of uuids) {
      for (const time of times) {
        const token = createLinkToken(uuid, SECRET, time)!;
        expect(token.length).toBeLessThanOrEqual(TELEGRAM_START_PARAM_MAX);
        expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
        expect(verifyLinkToken(token, SECRET, time)).toBe(uuid);
      }
    }
  });

  it("expires after 15 minutes", () => {
    const token = createLinkToken(USER, SECRET, NOW)!;
    // Minute granularity, so allow the rounding before asserting expiry.
    expect(verifyLinkToken(token, SECRET, NOW + 16 * 60 * 1000)).toBeNull();
  });

  it("is still valid just after issue", () => {
    const token = createLinkToken(USER, SECRET, NOW)!;
    expect(verifyLinkToken(token, SECRET, NOW + 60 * 1000)).toBe(USER);
  });

  it("rejects a token signed with another secret", () => {
    const token = createLinkToken(USER, SECRET, NOW)!;
    expect(verifyLinkToken(token, "other-secret", NOW)).toBeNull();
  });

  it("rejects a tampered user id", () => {
    const token = createLinkToken(USER, SECRET, NOW)!;
    const forged = "AAAAAAAAAAAAAAAAAAAAAA" + token.slice(22);
    expect(verifyLinkToken(forged, SECRET, NOW)).toBeNull();
  });

  it("rejects an extended expiry", () => {
    const token = createLinkToken(USER, SECRET, NOW)!;
    const later = (Math.ceil(NOW / 60_000) + 10_000).toString(36).padStart(8, "0");
    const forged = token.slice(0, 22) + later + token.slice(30);
    expect(verifyLinkToken(forged, SECRET, NOW)).toBeNull();
  });

  it("returns null for junk instead of throwing", () => {
    expect(verifyLinkToken("", SECRET, NOW)).toBeNull();
    expect(verifyLinkToken("nonsense", SECRET, NOW)).toBeNull();
    expect(verifyLinkToken("a".repeat(TOKEN_LEN), SECRET, NOW)).toBeNull();
    expect(verifyLinkToken("!".repeat(TOKEN_LEN), SECRET, NOW)).toBeNull();
  });

  it("rejects a token of the wrong length outright", () => {
    const token = createLinkToken(USER, SECRET, NOW)!;
    expect(verifyLinkToken(token + "x", SECRET, NOW)).toBeNull();
    expect(verifyLinkToken(token.slice(0, -1), SECRET, NOW)).toBeNull();
  });

  it("refuses to build a token for something that is not a uuid", () => {
    expect(createLinkToken("not-a-uuid", SECRET, NOW)).toBeNull();
    expect(createLinkToken("", SECRET, NOW)).toBeNull();
  });
});
