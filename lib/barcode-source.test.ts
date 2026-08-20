import { describe, expect, it } from "vitest";
import {
  parseOffProduct,
  parsePackSize,
  suggestedItemName,
} from "@/lib/barcode-source";

/**
 * Captured shape of an Open Food Facts v2 response — trimmed to the fields the
 * parser reads. Kept here so the parser can be tested without the network.
 */
const HIT = {
  status: 1,
  product: {
    product_name: "Naturally sparkling water",
    product_name_uk: "Вода мінеральна негазована",
    brands: "Моршинська, Morshynska",
    quantity: "1.5 l",
  },
};

const MISS = { status: 0, status_verbose: "product not found" };

describe("parseOffProduct", () => {
  it("prefers the Ukrainian name over the Latin one", () => {
    expect(parseOffProduct(HIT)?.name).toBe("Вода мінеральна негазована");
  });

  it("takes only the first brand", () => {
    expect(parseOffProduct(HIT)?.brand).toBe("Моршинська");
  });

  it("keeps the pack size as free text", () => {
    expect(parseOffProduct(HIT)?.quantityText).toBe("1.5 l");
  });

  it("returns null for a miss rather than an empty product", () => {
    expect(parseOffProduct(MISS)).toBeNull();
  });

  it("returns null for junk instead of throwing", () => {
    expect(parseOffProduct(null)).toBeNull();
    expect(parseOffProduct("nonsense")).toBeNull();
    expect(parseOffProduct({})).toBeNull();
  });

  it("falls back to the generic name when there is no product name", () => {
    const product = parseOffProduct({
      status: 1,
      product: { generic_name: "Питна вода" },
    });
    expect(product?.name).toBe("Питна вода");
  });

  it("reports a nameless hit as null name, not empty string", () => {
    const product = parseOffProduct({ status: 1, product: { brands: "Кока-Кола" } });
    expect(product?.name).toBeNull();
    expect(product?.brand).toBe("Кока-Кола");
  });
});

describe("parsePackSize", () => {
  it("formats litres the Ukrainian way", () => {
    expect(parsePackSize("1.5 l")).toBe("1,5 л");
    expect(parsePackSize("1,5 L")).toBe("1,5 л");
  });

  it("handles grams and kilograms", () => {
    expect(parsePackSize("500 g")).toBe("500 г");
    expect(parsePackSize("1 kg")).toBe("1 кг");
  });

  it("accepts Cyrillic units already", () => {
    // JS word boundaries are ASCII-only, so these need an explicit lookahead.
    expect(parsePackSize("900 мл")).toBe("900 мл");
    expect(parsePackSize("1,5 л")).toBe("1,5 л");
    expect(parsePackSize("500 мг")).toBe("500 мг");
    expect(parsePackSize("2 кг")).toBe("2 кг");
  });

  it("does not mistake a longer unit for a shorter one", () => {
    expect(parsePackSize("1 kg")).toBe("1 кг");
    expect(parsePackSize("250 ml")).toBe("250 мл");
  });

  it("takes the unit size out of a multipack, not the total", () => {
    // "6 x 1.5 l" describes one bottle of 1.5 l, six times over.
    expect(parsePackSize("6 x 1.5 l")).toBe("1,5 л");
    expect(parsePackSize("4×500 g")).toBe("500 г");
  });

  it("normalises centilitres to millilitres", () => {
    expect(parsePackSize("33 cl")).toBe("330 мл");
  });

  it("tolerates a missing space", () => {
    expect(parsePackSize("750ml")).toBe("750 мл");
  });

  it("returns null for text with no size in it", () => {
    expect(parsePackSize(null)).toBeNull();
    expect(parsePackSize("")).toBeNull();
    expect(parsePackSize("family pack")).toBeNull();
    expect(parsePackSize("12 pcs")).toBeNull();
  });

  it("rejects a zero or negative size", () => {
    expect(parsePackSize("0 l")).toBeNull();
  });
});

describe("suggestedItemName", () => {
  it("joins brand and name", () => {
    expect(
      suggestedItemName({ brand: "Моршинська", name: "Вода", quantityText: null }),
    ).toBe("Моршинська Вода");
  });

  it("does not repeat a brand already inside the name", () => {
    expect(
      suggestedItemName({
        brand: "Моршинська",
        name: "Моршинська негазована",
        quantityText: null,
      }),
    ).toBe("Моршинська негазована");
  });

  it("appends the pack size, the way the seed data reads", () => {
    expect(
      suggestedItemName({
        brand: "Моршинська",
        name: "Вода негазована",
        quantityText: "1.5 l",
      }),
    ).toBe("Моршинська Вода негазована 1,5 л");
  });

  it("does not append a size the name already carries", () => {
    expect(
      suggestedItemName({
        brand: null,
        name: "Вода негазована 1,5 л",
        quantityText: "1.5 l",
      }),
    ).toBe("Вода негазована 1,5 л");
  });

  it("capitalises the first letter — Open Food Facts names are often lowercase", () => {
    // A real response: barcode 5449000000996 comes back as "coca-cola".
    expect(
      suggestedItemName({ brand: null, name: "coca-cola", quantityText: "330 ml" }),
    ).toBe("Coca-cola 330 мл");
  });

  it("leaves an already-capitalised name alone", () => {
    expect(
      suggestedItemName({ brand: null, name: "Nutella", quantityText: null }),
    ).toBe("Nutella");
  });

  it("ignores an unparseable pack size rather than appending junk", () => {
    expect(
      suggestedItemName({ brand: null, name: "Вода", quantityText: "family pack" }),
    ).toBe("Вода");
  });

  it("copes with only one half present", () => {
    expect(suggestedItemName({ brand: null, name: "Вода", quantityText: null })).toBe(
      "Вода",
    );
    expect(suggestedItemName({ brand: "Живчик", name: null, quantityText: null })).toBe(
      "Живчик",
    );
  });

  it("is null when there is nothing to suggest", () => {
    expect(
      suggestedItemName({ brand: null, name: null, quantityText: null }),
    ).toBeNull();
  });
});
