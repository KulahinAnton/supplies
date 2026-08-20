import { describe, expect, it } from "vitest";
import { createLinkToken, verifyLinkToken } from "@/lib/telegram-link";

const SECRET = "test-secret";
const USER = "5f2b8c1e-0000-4000-8000-000000000001";
const NOW = 1_800_000_000_000;

describe("telegram link tokens", () => {
  it("round-trips a freshly issued token", () => {
    const token = createLinkToken(USER, SECRET, NOW);
    expect(verifyLinkToken(token, SECRET, NOW + 1000)).toBe(USER);
  });

  it("expires after 15 minutes", () => {
    const token = createLinkToken(USER, SECRET, NOW);
    expect(verifyLinkToken(token, SECRET, NOW + 15 * 60 * 1000 + 1)).toBeNull();
  });

  it("rejects a token signed with another secret", () => {
    const token = createLinkToken(USER, SECRET, NOW);
    expect(verifyLinkToken(token, "other-secret", NOW)).toBeNull();
  });

  it("rejects a tampered user id", () => {
    const token = createLinkToken(USER, SECRET, NOW);
    const [, expiry, signature] = token.split(".");
    expect(verifyLinkToken(`someone-else.${expiry}.${signature}`, SECRET, NOW)).toBeNull();
  });

  it("rejects an extended expiry", () => {
    const token = createLinkToken(USER, SECRET, NOW);
    const [userId, , signature] = token.split(".");
    const forged = `${userId}.${NOW + 10 ** 9}.${signature}`;
    expect(verifyLinkToken(forged, SECRET, NOW)).toBeNull();
  });

  it("returns null for junk instead of throwing", () => {
    expect(verifyLinkToken("", SECRET, NOW)).toBeNull();
    expect(verifyLinkToken("nonsense", SECRET, NOW)).toBeNull();
    expect(verifyLinkToken("a.b", SECRET, NOW)).toBeNull();
    expect(verifyLinkToken("a.b.c.d", SECRET, NOW)).toBeNull();
    expect(verifyLinkToken("..", SECRET, NOW)).toBeNull();
  });

  it("rejects a non-numeric expiry", () => {
    const payload = `${USER}.later`;
    // Signature is valid for this payload, but the expiry is not a number.
    const token = createLinkToken(USER, SECRET, NOW);
    const signature = token.split(".")[2];
    expect(verifyLinkToken(`${payload}.${signature}`, SECRET, NOW)).toBeNull();
  });
});
