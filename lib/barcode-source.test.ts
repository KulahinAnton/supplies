import { describe, expect, it } from "vitest";
import { parseOffProduct, suggestedItemName } from "@/lib/barcode-source";

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
