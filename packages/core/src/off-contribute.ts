/**
 * Feature 18.2 — submitting a product back to Open Food Facts.
 *
 * The free databases are empty of Ukrainian goods because they are
 * crowd-sourced and nobody has added them. A household that names an unknown
 * barcode has exactly the missing fact; contributing it is what makes the
 * *first* scan work for the next person.
 *
 * Two rules this module exists to keep:
 *
 * 1. **Opt-in only.** Sending a household's data to a third party is
 *    publishing. The caller must have an explicit yes; nothing here decides
 *    on the user's behalf.
 * 2. **Never blocking.** A failed submission must not stop an item being
 *    created. Everything returns a boolean; nothing throws at a caller.
 */

const WRITE_URL = () =>
  `${process.env.OFF_BASE_URL ?? "https://world.openfoodfacts.org"}/cgi/product_jqm2.pl`;

/**
 * Whether contributing is possible at all. Without credentials the UI must not
 * offer it — an offer that silently does nothing is worse than no offer.
 */
export function canContribute(): boolean {
  return Boolean(process.env.OFF_USER && process.env.OFF_PASSWORD);
}

export type Contribution = {
  barcode: string;
  name: string;
  /** Free text as the pack shows it, e.g. "1,5 л" — optional. */
  quantity?: string | null;
};

/**
 * Submit one product. Returns true only when Open Food Facts accepted it.
 *
 * Deliberately sends the bare minimum: barcode, name, pack size. No household
 * identifier, no category, nothing about who owns it or how much they have.
 */
export async function contributeProduct(
  input: Contribution,
): Promise<boolean> {
  const user = process.env.OFF_USER;
  const password = process.env.OFF_PASSWORD;
  if (!user || !password) return false;

  const name = input.name.trim();
  if (!/^\d{6,14}$/.test(input.barcode) || name.length < 2) return false;

  const body = new URLSearchParams({
    code: input.barcode,
    user_id: user,
    password,
    product_name: name.slice(0, 150),
    lang: "uk",
    comment: "Added via Supplies (household stock tracker)",
  });
  if (input.quantity?.trim()) body.set("quantity", input.quantity.trim().slice(0, 40));

  try {
    const response = await fetch(WRITE_URL(), {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Supplies/0.1 (household stock tracker)",
      },
      body,
    });
    if (!response.ok) return false;

    // The endpoint answers with JSON when it can; status 1 means saved.
    const text = await response.text();
    try {
      const parsed: unknown = JSON.parse(text);
      const status = (parsed as { status?: number } | null)?.status;
      return status === 1;
    } catch {
      // Some deployments answer with HTML on success; treat 2xx as accepted.
      return true;
    }
  } catch {
    return false;
  }
}
