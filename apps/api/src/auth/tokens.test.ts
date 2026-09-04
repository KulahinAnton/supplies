import { describe, expect, it } from "vitest";
import { classifyRefresh, hashToken, newRefreshToken, refreshExpiry } from "./tokens";

describe("newRefreshToken", () => {
  it("is 256 bits, url-safe, and never repeats", () => {
    const tokens = new Set(Array.from({ length: 500 }, () => newRefreshToken()));
    expect(tokens.size).toBe(500);
    for (const token of tokens) expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});

describe("hashToken", () => {
  it("is stable, so a lookup finds the row", () => {
    expect(hashToken("abc")).toBe(hashToken("abc"));
  });

  it("does not resemble its input — the stored value is not a credential", () => {
    const token = newRefreshToken();
    const hash = hashToken(token);
    expect(hash).not.toContain(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("refreshExpiry", () => {
  it("adds whole days in UTC", () => {
    const at = refreshExpiry(30, new Date("2026-01-01T12:00:00Z"));
    expect(at.toISOString()).toBe("2026-01-31T12:00:00.000Z");
  });

  it("crosses a month and a leap day without arithmetic of its own", () => {
    expect(refreshExpiry(1, new Date("2028-02-28T00:00:00Z")).toISOString()).toBe(
      "2028-02-29T00:00:00.000Z",
    );
  });
});

describe("classifyRefresh", () => {
  const future = new Date("2026-12-31T00:00:00Z");
  const past = new Date("2020-01-01T00:00:00Z");
  const now = new Date("2026-06-01T00:00:00Z");

  it("accepts a live token", () => {
    expect(classifyRefresh({ expiresAt: future, revokedAt: null }, now)).toEqual({
      status: "ok",
    });
  });

  it("calls an expired token expired, not reused", () => {
    // Ordinary and harmless: the client signs in again. Conflating it with
    // reuse would log everyone out of every device once a month.
    expect(classifyRefresh({ expiresAt: past, revokedAt: null }, now)).toEqual({
      status: "expired",
    });
  });

  it("calls a revoked token reused, even when it is also expired", () => {
    // Revocation is checked FIRST. A token that was rotated and then presented
    // after its expiry is still a replay, and reporting it as a plain expiry
    // would hide the one signal that says a token may have been stolen.
    expect(classifyRefresh({ expiresAt: past, revokedAt: past }, now)).toEqual({
      status: "reused",
    });
  });

  it("treats the exact expiry instant as expired", () => {
    expect(classifyRefresh({ expiresAt: now, revokedAt: null }, now)).toEqual({
      status: "expired",
    });
  });
});
