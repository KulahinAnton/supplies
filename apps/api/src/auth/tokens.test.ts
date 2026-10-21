import { describe, expect, it } from "vitest";
import {
  REFRESH_GRACE_MS,
  classifyRefresh,
  hashToken,
  newRefreshToken,
  refreshExpiry,
} from "./tokens";

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

describe("classifyRefresh — the grace window", () => {
  const future = new Date("2026-12-31T00:00:00Z");
  const now = new Date("2026-06-01T00:00:00Z");
  const ago = (ms: number) => new Date(now.getTime() - ms);

  const rotated = (at: Date) => ({
    expiresAt: future,
    revokedAt: at,
    revokedReason: "rotated" as const,
  });

  it("calls a token rotated one second ago a race, not reuse", () => {
    // Two browser tabs restoring together send the same cookie. Reading the
    // loser as theft signs the person out of everything for opening a tab.
    expect(classifyRefresh(rotated(ago(1_000)), now)).toEqual({ status: "raced" });
  });

  it("still calls a token rotated long ago reuse", () => {
    expect(classifyRefresh(rotated(ago(60_000)), now)).toEqual({ status: "reused" });
  });

  it("puts the boundary exactly at REFRESH_GRACE_MS", () => {
    expect(classifyRefresh(rotated(ago(REFRESH_GRACE_MS)), now)).toEqual({
      status: "raced",
    });
    expect(classifyRefresh(rotated(ago(REFRESH_GRACE_MS + 1)), now)).toEqual({
      status: "reused",
    });
  });

  it("does not let a future revocation buy a grace period", () => {
    // A clock that went backwards, or a row written by a machine ahead of this
    // one. Either way it is not evidence of a race, and treating it as one
    // would let a skewed clock disable theft detection entirely.
    expect(classifyRefresh(rotated(new Date(now.getTime() + 5_000)), now)).toEqual({
      status: "reused",
    });
  });

  /**
   * The clause the API's e2e suite forced, and the one most worth keeping.
   *
   * `revokeAllFor` stamps `revokedAt = now()` on the whole family, so without
   * the reason check every token it killed would be inside the grace window —
   * and the attacker who triggered the theft response could refresh again with
   * any of them. The window would have neutered the thing it was bolted onto.
   */
  it("gives no grace to a token killed by the theft response", () => {
    expect(
      classifyRefresh(
        { expiresAt: future, revokedAt: ago(1_000), revokedReason: "reuse" },
        now,
      ),
    ).toEqual({ status: "reused" });
  });

  it("gives no grace to a token killed by signing out", () => {
    expect(
      classifyRefresh(
        { expiresAt: future, revokedAt: ago(1_000), revokedReason: "logout" },
        now,
      ),
    ).toEqual({ status: "reused" });
  });

  it("gives no grace to a row written before the column existed", () => {
    // NULL is the pre-migration state, and the safe reading of it is "not a
    // rotation" rather than "probably fine".
    expect(
      classifyRefresh({ expiresAt: future, revokedAt: ago(1_000) }, now),
    ).toEqual({ status: "reused" });
  });

  it("takes the window as an argument, so the rule is testable without waiting", () => {
    expect(classifyRefresh(rotated(ago(50)), now, 10)).toEqual({ status: "reused" });
  });
});

/**
 * Feature 1 — a token ended by a password reset or change.
 *
 * The device it belonged to was signed out on purpose and will still try to
 * refresh. Reading that as theft would burn every session, including the one a
 * password change deliberately kept, so it is refused and nothing more.
 */
describe("classifyRefresh — a password reset or change", () => {
  const future = new Date("2026-12-31T00:00:00Z");
  const now = new Date("2026-06-01T00:00:00Z");
  const byPassword = (revokedAt: Date) => ({
    expiresAt: future,
    revokedAt,
    revokedReason: "password" as const,
  });

  it("refuses it without calling it reuse", () => {
    expect(classifyRefresh(byPassword(new Date("2026-05-01T00:00:00Z")), now)).toEqual({
      status: "revoked",
    });
  });

  it("gives it no grace, however recent", () => {
    // A grace window here would hand the device that was just signed out a
    // fresh pair, which is exactly what the reset was for.
    expect(classifyRefresh(byPassword(new Date(now.getTime() - 1_000)), now)).toEqual({
      status: "revoked",
    });
  });
});
