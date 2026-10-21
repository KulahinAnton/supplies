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

/**
 * Feature 18.1 — Open Food Facts and its siblings, tried in order.
 *
 * They share one API shape, so a miss simply falls through to the next and the
 * first hit wins. Food first because it is by far the largest; the others
 * cover shampoo, cleaning products and pet food, which this app definitely
 * holds and OFF proper does not.
 *
 * `OFF_BASE_URL` overrides the first entry, which is what the tests use.
 */
const SOURCES = () => [
  process.env.OFF_BASE_URL ?? "https://world.openfoodfacts.org",
  "https://world.openbeautyfacts.org",
  "https://world.openproductsfacts.org",
  "https://world.openpetfoodfacts.org",
];

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

/**
 * Open Food Facts reports pack size as free text: "1.5 l", "500 g", "6 x 1.5 L",
 * "1,5 л". Pure, so it is tested without the network.
 *
 * Returns the size formatted the Ukrainian way ("1,5 л") for appending to an
 * item name — NOT a stock quantity. The distinction matters: the app counts
 * bottles, not the litres inside them, so 1.5 l belongs in the name of a
 * PIECE-unit item, never in its `minQty`.
 */
export function parsePackSize(text: string | null): string | null {
  if (!text) return null;

  const cleaned = text.trim().toLowerCase().replace(",", ".");
  // "6 x 1.5 l" → take the unit size, not the multipack total.
  const withoutMultiplier = cleaned.replace(/^\s*\d+\s*[x×]\s*/, "");

  // `\b` is ASCII-only in JS, so it never fires after "мл" or "кг" — hence the
  // explicit Unicode lookahead. Longer units come first so "kg" is not read
  // as "g" with a stray "k" in front.
  const match = /^(\d+(?:\.\d+)?)\s*(mg|kg|ml|cl|g|l|мг|кг|мл|г|л)(?![\p{L}\p{N}])/u.exec(
    withoutMultiplier,
  );
  if (!match) return null;

  const [, rawValue, rawUnit] = match;
  const value = Number(rawValue);
  if (!Number.isFinite(value) || value <= 0) return null;

  const LABELS: Record<string, string> = {
    mg: "мг",
    мг: "мг",
    g: "г",
    г: "г",
    kg: "кг",
    кг: "кг",
    ml: "мл",
    мл: "мл",
    cl: "мл",
    l: "л",
    л: "л",
  };

  const label = LABELS[rawUnit];
  if (!label) return null;

  // Centilitres are rare but real on European labels; normalise to ml.
  const scaled = rawUnit === "cl" ? value * 10 : value;
  const formatted = String(scaled).replace(".", ",");

  return `${formatted} ${label}`;
}

/** Suggested item name: "Бренд Назва", skipping whichever half is missing. */
export function suggestedItemName(product: OffProduct): string | null {
  const parts = [product.brand, product.name].filter(Boolean);
  if (parts.length === 0) return null;

  // Avoid "Моршинська Моршинська" when the brand is already in the name.
  const base =
    product.brand &&
    product.name &&
    product.name.toLowerCase().includes(product.brand.toLowerCase())
      ? product.name
      : parts.join(" ");

  // Open Food Facts is crowd-sourced and its names are often all-lowercase
  // ("coca-cola"). Capitalise the first letter only — anything cleverer would
  // mangle "eco-Ватта" and the like.
  const titled = base.charAt(0).toLocaleUpperCase("uk-UA") + base.slice(1);

  // Append the pack size, the way the seed data reads ("Вода негазована 1,5 л"):
  // it is what distinguishes two otherwise identical shelf items.
  const size = parsePackSize(product.quantityText);
  if (!size) return titled;

  const normalised = titled.toLowerCase().replace(",", ".");
  const sizeNormalised = size.toLowerCase().replace(",", ".");
  if (normalised.includes(sizeNormalised)) return titled;

  return `${titled} ${size}`;
}

const USER_AGENT = "Supplies/0.1 (household stock tracker)";

async function fetchFrom(base: string, barcode: string): Promise<OffProduct | null> {
  try {
    const response = await fetch(
      `${base}/api/v2/product/${encodeURIComponent(barcode)}.json`,
      { headers: { "User-Agent": USER_AGENT } },
    );
    // 404 is the ordinary "not in this database" answer, not an error.
    if (!response.ok) return null;
    return parseOffProduct(await response.json());
  } catch {
    return null;
  }
}

/**
 * Network. Walks the sources in order and returns the first hit, or null.
 * Never throws at a caller: a lookup failure must not block adding an item.
 */
export async function fetchProduct(barcode: string): Promise<OffProduct | null> {
  for (const base of SOURCES()) {
    const product = await fetchFrom(base, barcode);
    // A hit with no usable name is no better than a miss — keep looking.
    if (product && (product.name || product.brand)) return product;
  }
  return null;
}

/**
 * Feature 29.1 — is OFF's answer good enough, or worth a second opinion?
 *
 * `parseOffProduct` already prefers `product_name_uk` "since the app is
 * Ukrainian-only and a Latin-script name is worse than nothing for someone
 * scanning a shelf at home". That preference stops at the edge of OFF: when
 * the entry has only an English name, the caller can go ask a source that
 * answers in Ukrainian instead.
 *
 * A Latin name is not automatically bad, though — brands are proper nouns and
 * nobody wants "Nutella" translated. What is bad is untranslated PROSE, and
 * real OFF entries separate the two cleanly:
 *
 *     Nutella      brand "Nutella"    name "Nutella"                → keep
 *     Coca-Cola    brand "Coca-Cola"  name "Coca-Cola"              → keep
 *     METRO Chef   brand "METRO Chef" name "HASH BROWN TRIANGLES"   → ask
 *
 * So: Cyrillic anywhere in the name means OFF answered in Ukrainian; failing
 * that, a name led by its own brand is the product's actual name rather than a
 * description left in English. `product_name_uk` is NOT usable as the signal —
 * none of the three entries above has one, including the two worth keeping.
 *
 * Reads the NAME alone, never the composed suggestion: `suggestedItemName`
 * appends a localised pack size, so "Coca-Cola 330 мл" contains Cyrillic
 * without being any more Ukrainian than "HASH BROWN TRIANGLES" is. A missing
 * name counts as needing one — a bare brand is exactly the case to ask about.
 */
export function needsLocalName(product: OffProduct): boolean {
  const name = product.name?.trim();
  if (!name) return true;
  if (/\p{Script=Cyrillic}/u.test(name)) return false;

  const brand = product.brand?.trim();
  return !brand || !name.toLowerCase().startsWith(brand.toLowerCase());
}
