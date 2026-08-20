/**
 * Feature 10 — barcode product lookup via Open Food Facts.
 *
 * Split the way `lib/nbu.ts` is in Kvartal: `parseOffProduct` is pure and
 * tested against a captured fixture, `fetchProduct` is the only part that
 * touches the network. A lookup failure is NEVER blocking — the item form just
 * opens empty, because the family knows what they bought even if the database
 * does not.
 */

export type OffProduct = {
  name: string | null;
  brand: string | null;
  quantityText: string | null;
};

const BASE_URL = () => process.env.OFF_BASE_URL ?? "https://world.openfoodfacts.org";

type OffResponse = {
  status?: number;
  product?: {
    product_name?: string;
    product_name_uk?: string;
    generic_name?: string;
    brands?: string;
    quantity?: string;
  };
};

/**
 * Pure. Prefers the Ukrainian product name when the entry has one, since the
 * app is Ukrainian-only and a Latin-script name is worse than nothing for
 * someone scanning a shelf at home.
 */
export function parseOffProduct(payload: unknown): OffProduct | null {
  const data = payload as OffResponse | null;
  if (!data || data.status !== 1 || !data.product) return null;

  const product = data.product;
  const name =
    product.product_name_uk?.trim() ||
    product.product_name?.trim() ||
    product.generic_name?.trim() ||
    null;

  return {
    name: name || null,
    brand: product.brands?.split(",")[0]?.trim() || null,
    quantityText: product.quantity?.trim() || null,
  };
}

/** Suggested item name: "Бренд Назва", skipping whichever half is missing. */
export function suggestedItemName(product: OffProduct): string | null {
  const parts = [product.brand, product.name].filter(Boolean);
  if (parts.length === 0) return null;
  // Avoid "Моршинська Моршинська" when the brand is already in the name.
  if (
    product.brand &&
    product.name &&
    product.name.toLowerCase().includes(product.brand.toLowerCase())
  ) {
    return product.name;
  }
  return parts.join(" ");
}

/** Network. Returns null for anything unexpected — never throws at a caller. */
export async function fetchProduct(barcode: string): Promise<OffProduct | null> {
  try {
    const response = await fetch(
      `${BASE_URL()}/api/v2/product/${encodeURIComponent(barcode)}.json`,
      { headers: { "User-Agent": "Supplies/0.1 (household stock tracker)" } },
    );
    if (!response.ok) return null;
    return parseOffProduct(await response.json());
  } catch {
    return null;
  }
}
