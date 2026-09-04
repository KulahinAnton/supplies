import { describe, expect, it } from "vitest";
import { parseSearchIds, parseVariantName } from "./metro";

/**
 * Shapes captured from the live shop, trimmed. The nesting is the point: both
 * levels are keyed by ids nothing knows in advance, so the parser walks them.
 */
const search = { amount: 1, resultIds: ["BTY-X2143450032"], results: {} };
const variants = {
  result: {
    "BTY-X317163": {
      variants: {
        "0032": { description: "METRO Chef Курага 500г", availability: "AVAILABLE" },
      },
    },
  },
};

describe("parseSearchIds", () => {
  it("reads the result ids", () => {
    expect(parseSearchIds(search)).toEqual(["BTY-X2143450032"]);
  });

  /** Metro simply not selling it is an answer, and must not read as an error. */
  it("is empty when the shop knows nothing", () => {
    expect(parseSearchIds({ amount: 0, resultIds: [] })).toEqual([]);
  });

  it("survives anything that is not the shape it expects", () => {
    for (const junk of [null, undefined, "", 42, {}, { resultIds: "nope" }]) {
      expect(parseSearchIds(junk)).toEqual([]);
    }
  });

  it("drops non-string entries rather than passing them on as ids", () => {
    expect(parseSearchIds({ resultIds: ["A", 7, null, "B"] })).toEqual(["A", "B"]);
  });
});

describe("parseVariantName", () => {
  it("finds the description through both unknown keys", () => {
    expect(parseVariantName(variants)).toBe("METRO Chef Курага 500г");
  });

  it("trims, and treats blank as absent", () => {
    expect(parseVariantName({ result: { a: { variants: { b: { description: "  X  " } } } } })).toBe("X");
    expect(parseVariantName({ result: { a: { variants: { b: { description: "   " } } } } })).toBe(null);
  });

  /**
   * Returning null here matters: the caller treats "cannot name it" as a shape
   * change and refuses to cache it as "Metro has no such product".
   */
  it("returns null on a shape it does not recognise", () => {
    for (const junk of [null, {}, { result: {} }, { result: { a: {} } }, { result: { a: { variants: {} } } }]) {
      expect(parseVariantName(junk)).toBe(null);
    }
  });
});
