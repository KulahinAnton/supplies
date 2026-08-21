import { describe, expect, it } from "vitest";
import { DIGEST_HOUR_KYIV, kyivHour } from "@/lib/digest";

/**
 * Feature 19 — the DST arithmetic behind the scheduled digest.
 *
 * Vercel cron fires in UTC and Kyiv shifts between UTC+3 (summer) and UTC+2
 * (winter), so `vercel.json` fires at BOTH candidate hours and the route picks
 * whichever is currently noon. These tests pin that correspondence: get it
 * wrong and the digest silently arrives an hour off for half the year, or
 * twice a day, or never.
 */
describe("kyivHour", () => {
  it("reads 12:00 Kyiv from 09:00 UTC in summer (EEST, UTC+3)", () => {
    expect(kyivHour(new Date("2026-07-15T09:00:00Z"))).toBe(DIGEST_HOUR_KYIV);
  });

  it("reads 12:00 Kyiv from 10:00 UTC in winter (EET, UTC+2)", () => {
    expect(kyivHour(new Date("2026-01-15T10:00:00Z"))).toBe(DIGEST_HOUR_KYIV);
  });

  it("makes the OTHER cron a no-op in each season", () => {
    // Summer: the 10:00 UTC firing is 13:00 in Kyiv, so it must skip.
    expect(kyivHour(new Date("2026-07-15T10:00:00Z"))).toBe(13);
    // Winter: the 09:00 UTC firing is 11:00 in Kyiv, so it must skip.
    expect(kyivHour(new Date("2026-01-15T09:00:00Z"))).toBe(11);
  });

  it("handles the changeover days themselves", () => {
    // Ukraine springs forward on the last Sunday of March, back in October.
    expect(kyivHour(new Date("2026-03-28T09:00:00Z"))).toBe(11); // still EET
    expect(kyivHour(new Date("2026-03-30T09:00:00Z"))).toBe(12); // now EEST
    expect(kyivHour(new Date("2026-10-24T10:00:00Z"))).toBe(13); // still EEST
    expect(kyivHour(new Date("2026-10-26T10:00:00Z"))).toBe(12); // now EET
  });

  it("exactly one of the two cron firings is noon on any given day", () => {
    for (const day of ["2026-01-15", "2026-04-15", "2026-07-15", "2026-11-15"]) {
      const noons = [`${day}T09:00:00Z`, `${day}T10:00:00Z`].filter(
        (iso) => kyivHour(new Date(iso)) === DIGEST_HOUR_KYIV,
      );
      expect(noons).toHaveLength(1);
    }
  });

  it("does not depend on the machine's own timezone", () => {
    // The same instant, expressed with a different offset, is the same hour.
    expect(kyivHour(new Date("2026-07-15T09:00:00Z"))).toBe(
      kyivHour(new Date("2026-07-15T12:00:00+03:00")),
    );
  });
});
