/**
 * Feature 29 — METRO Ukraine as a barcode source.
 *
 * Metro's own labels (METRO Chef, aro, METRO Professional) are in no open
 * database: Open Food Facts does not have them, and GEPIR only ever knows the
 * company. Their shop does know them, and its search is **exact on EAN** —
 * verified by querying five valid-check-digit codes that no product uses, all
 * of which returned nothing, while a real code returned the right product.
 * That matters: a fuzzy search would confidently prefill the wrong name, which
 * is worse than finding nothing at all.
 *
 * Two calls, because the shop splits them: search resolves a barcode to an
 * internal id, and a second endpoint turns that id into a description. Neither
 * needs a login, and neither exposes an EAN — which is why the exactness of
 * the search had to be established by experiment rather than by checking the
 * answer against the question.
 *
 * This is an undocumented internal API, so it carries scraping's lifespan:
 * every failure path here is "no suggestion", never an error the user sees.
 */

const BASE = process.env.METRO_BASE_URL ?? "https://shop.metro.ua";
/** METRO Kyiv. Only affects which assortment is searched, not the naming. */
const STORE = process.env.METRO_STORE_ID ?? "00010";
const TIMEOUT_MS = 6000;

export type MetroProduct = { name: string };

export type MetroResult =
  | { kind: "product"; product: MetroProduct }
  | { kind: "unknown" }
  | { kind: "unavailable" };

/** The first result id, or null when the shop knows nothing about the code. */
export function parseSearchIds(payload: unknown): string[] {
  if (typeof payload !== "object" || payload === null) return [];
  const ids = (payload as { resultIds?: unknown }).resultIds;
  return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : [];
}

/**
 * The description sits at result → <articleId> → variants → <variantNumber>.
 * Both levels are keyed by ids we do not know in advance, so this walks rather
 * than indexes.
 */
export function parseVariantName(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) return null;
  const result = (payload as { result?: Record<string, unknown> }).result;
  if (!result) return null;

  for (const article of Object.values(result)) {
    const variants = (article as { variants?: Record<string, unknown> })?.variants;
    if (!variants) continue;
    for (const variant of Object.values(variants)) {
      const description = (variant as { description?: unknown })?.description;
      if (typeof description === "string" && description.trim()) {
        return description.trim();
      }
    }
  }
  return null;
}

async function getJson(url: string, signal: AbortSignal): Promise<unknown | null> {
  const response = await fetch(url, {
    signal,
    headers: {
      accept: "application/json",
      "accept-language": "uk-UA,uk;q=0.9",
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36",
    },
  });
  if (!response.ok) return null;
  return response.json();
}

/** Never throws: a scan must not fail because someone else's shop is down. */
export async function fetchMetroProduct(barcode: string): Promise<MetroResult> {
  if (!/^\d{8,14}$/.test(barcode)) return { kind: "unavailable" };

  const signal = AbortSignal.timeout(TIMEOUT_MS);

  try {
    const search = await getJson(
      `${BASE}/searchdiscover/articlesearch/search?storeId=${STORE}` +
        `&language=uk-UA&country=UA&query=${encodeURIComponent(barcode)}` +
        `&rows=1&page=1&facets=false&categories=false`,
      signal,
    );
    if (search === null) return { kind: "unavailable" };

    const [id] = parseSearchIds(search);
    // No result is a real answer: Metro does not sell it.
    if (!id) return { kind: "unknown" };

    const details = await getJson(
      `${BASE}/evaluate.article.v1/betty-variants?storeIds=${STORE}` +
        `&ids=${encodeURIComponent(id)}&country=UA&locale=uk-UA`,
      signal,
    );
    if (details === null) return { kind: "unavailable" };

    const name = parseVariantName(details);
    // An id we cannot name is a shape change, not an absence — do not cache it
    // as "Metro has no such product".
    return name ? { kind: "product", product: { name } } : { kind: "unavailable" };
  } catch {
    return { kind: "unavailable" };
  }
}
