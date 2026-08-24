import { describe, expect, it } from "vitest";
import { BARCODE_PATTERN, isBarcodeShaped } from "@/lib/validation/shared";

/**
 * Regression: this pattern existed as three separate literals, and one of them
 * lost its backslash — /^d{6,14}$/ instead of /^\d{6,14}$/. That matches the
 * letter "d" repeated and no digit whatsoever, so every scan from the items
 * list was rejected as malformed and reported to the user as "not found",
 * while the identical scan in the item form succeeded because its copy was
 * intact. Nothing failed loudly; the two screens simply disagreed.
 *
 * These tests exist to make that class of typo impossible to ship again.
 */
describe("isBarcodeShaped", () => {
  it("accepts real barcodes of every length in range", () => {
    expect(isBarcodeShaped("4823063114912")).toBe(true); // EAN-13
    expect(isBarcodeShaped("5449000000996")).toBe(true); // EAN-13
    expect(isBarcodeShaped("40084626")).toBe(true); // EAN-8
    expect(isBarcodeShaped("012345678905")).toBe(true); // UPC-A
    expect(isBarcodeShaped("00012345600012")).toBe(true); // GTIN-14
  });

  it("matches digits, not the letter d — the exact bug this guards", () => {
    expect(isBarcodeShaped("dddddddddddd")).toBe(false);
    expect(BARCODE_PATTERN.source).toContain("\d");
  });

  it("rejects lengths outside 6–14", () => {
    expect(isBarcodeShaped("12345")).toBe(false);
    expect(isBarcodeShaped("123456789012345")).toBe(false);
    expect(isBarcodeShaped("")).toBe(false);
  });

  it("rejects anything with non-digits, including spacing", () => {
    expect(isBarcodeShaped("482306311491x")).toBe(false);
    expect(isBarcodeShaped("482 3063 11491")).toBe(false);
    expect(isBarcodeShaped(" 4823063114912")).toBe(false);
    expect(isBarcodeShaped("4823063114912\n")).toBe(false);
  });

  it("has no global flag, so repeated calls cannot go stale", () => {
    // A /g regex carries lastIndex between calls and would alternate
    // true/false on the same input — a bug that only shows on the second scan.
    expect(BARCODE_PATTERN.global).toBe(false);
    expect(isBarcodeShaped("4823063114912")).toBe(true);
    expect(isBarcodeShaped("4823063114912")).toBe(true);
  });
});
