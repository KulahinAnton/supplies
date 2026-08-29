"use server";

import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-guard";
import { actionError, actionOk, type ActionResult } from "@/lib/action-result";
import { ruleMessage } from "@/lib/messages";
import { isBarcodeShaped } from "@/lib/validation/shared";
import {
  fetchProduct,
  needsLocalName,
  suggestedItemName,
} from "@/lib/barcode-source";
import { canContribute } from "@/lib/off-contribute";
import { fetchMetroProduct } from "@/lib/metro";
import {
  fetchGepirCompany,
  isUkrainianGtin,
  shortenCompanyName,
} from "@/lib/gepir";

/**
 * Feature 10 — what a scanned barcode turns into.
 *
 * Two outcomes, in this order:
 *
 * 1. The household ALREADY has an item with this barcode. That is the more
 *    useful answer by far — the family is restocking, not cataloguing — so it
 *    short-circuits before any network call and hands back the existing item.
 *    It also stops a duplicate being created, which the unique index would
 *    reject anyway, but with a far worse message.
 * 2. Otherwise, look the code up in Open Food Facts for a suggested name.
 *
 * 2a. Feature 29 — if OFF misses, or answers in untranslated English, ask
 *    METRO Ukraine. Their own labels (METRO Chef, aro) are in no open
 *    database, and OFF holds them as English stubs; METRO names them in
 *    Ukrainian, pack size included, and its search is exact on EAN.
 *
 * 3. Feature 20 — if that misses too, ask GS1 Ukraine who owns the number.
 *    Strictly a fallback, and strictly a hint: GEPIR is a registry of GTIN
 *    licensees, not a product catalogue, so it yields a manufacturer and
 *    never a product name. «Виробник: ТОВ «САНДОРА»» beats a blank "not
 *    found" when the user is about to type the name themselves.
 *
 * A miss is NOT an error: Open Food Facts has patchy Ukrainian coverage, and
 * an empty form is a perfectly good outcome. Only a signed-out caller or a
 * malformed code fails.
 */
export type BarcodeLookup =
  | { kind: "existing"; itemId: string; name: string }
  | { kind: "product"; suggestedName: string; packSize: string | null }
  /** Feature 18.2 — `canShare` is false unless OFF credentials exist, so the
   *  UI never offers something that would silently do nothing.
   *  Feature 20 — `manufacturer` is the GEPIR hint, null when GS1 Ukraine
   *  has no record, was not asked, or did not answer. The UI must treat all
   *  three the same: there is simply no hint to show. */
  | { kind: "unknown"; canShare: boolean; manufacturer: string | null };

export async function lookupBarcodeAction(
  barcode: string,
): Promise<ActionResult<BarcodeLookup>> {
  const session = await requireSession();

  const code = barcode.trim();
  if (!isBarcodeShaped(code)) {
    return actionError(ruleMessage("item.barcodeInvalid"));
  }

  const existing = await prisma.item.findFirst({
    where: { householdId: session.householdId, barcode: code },
    select: { id: true, name: true },
  });
  if (existing) {
    return actionOk<BarcodeLookup>({
      kind: "existing",
      itemId: existing.id,
      name: existing.name,
    });
  }

  const product = await fetchProduct(code);
  const suggestedName = product ? suggestedItemName(product) : null;

  /**
   * Feature 29 — METRO before GEPIR, because it answers a better question.
   * METRO gives the product («METRO Chef Картопляні трикутники 2,5кг»); GEPIR
   * only ever gives the company that licensed the number. If METRO knows it,
   * the name is filled in and there is nothing left for a hint to add.
   *
   * Feature 29.1 — asked not only when OFF MISSES, but also when OFF answers
   * with untranslated English. Own-label goods are where that happens: OFF has
   * 4337182256663 as «METRO Chef HASH BROWN TRIANGLES» and no pack size, while
   * METRO has «METRO Chef Картопляні трикутники 2,5кг». An English name in a
   * Ukrainian-only UI is the outcome `parseOffProduct` already avoids INSIDE
   * OFF by preferring `product_name_uk`; this extends the same preference
   * across sources. `needsLocalName` draws the line — a Latin name that is
   * the brand ("Nutella") is a proper noun and stays.
   *
   * OFF still wins when it answers in Ukrainian, and still wins when METRO
   * does not stock the code — a Latin name beats an empty form. METRO is
   * asked at most once per barcode ever, since `metroName` caches misses too.
   *
   * No `packSize`: METRO writes the size at the END of the name («…2,5кг»),
   * where `parsePackSize` — anchored at the start, for OFF's "1.5 l" — cannot
   * see it. It is already part of the name the user gets, and nothing reads
   * this field, so pretending to fill it would be the only thing lost.
   */
  if (!product || !suggestedName || needsLocalName(product)) {
    const metro = await metroName(code);
    if (metro) {
      return actionOk<BarcodeLookup>({
        kind: "product",
        suggestedName: metro,
        packSize: null,
      });
    }
  }

  if (!product || !suggestedName) {
    return actionOk<BarcodeLookup>({
      kind: "unknown",
      canShare: canContribute(),
      manufacturer: await manufacturerHint(code),
    });
  }

  return actionOk<BarcodeLookup>({
    kind: "product",
    suggestedName,
    packSize: product.quantityText,
  });
}

/**
 * Feature 21 — the /items search scanning a code to jump straight to an item.
 *
 * Separate from `lookupBarcodeAction` on purpose. That one is for the item
 * FORM and, on a miss, asks Open Food Facts and then GS1 Ukraine — up to
 * several seconds of network for a question the search bar never asked. Here
 * the only question is "do we already have this?", which is one indexed
 * query, so searching stays instant.
 *
 * Archived items count as found. Their barcode still occupies the
 * `[householdId, barcode]` unique index, so offering to create a new item
 * would walk the user into a constraint error; showing them the archived
 * item they already have is both truthful and what they actually need.
 */
export type BarcodeSearch =
  | { kind: "found"; itemId: string }
  | { kind: "missing" };

export async function findItemByBarcodeAction(
  barcode: string,
): Promise<ActionResult<BarcodeSearch>> {
  const session = await requireSession();

  const code = barcode.trim();
  if (!isBarcodeShaped(code)) {
    return actionError(ruleMessage("item.barcodeInvalid"));
  }

  const item = await prisma.item.findFirst({
    where: { householdId: session.householdId, barcode: code },
    select: { id: true },
  });

  return actionOk<BarcodeSearch>(
    item ? { kind: "found", itemId: item.id } : { kind: "missing" },
  );
}

/**
 * Feature 20 + 29 — ask an external source once, then remember the answer.
 *
 * Caches misses as well as hits: "nobody has heard of this code" is the common
 * reply for anything the open databases lack, and re-asking someone else's
 * service on every scan is the traffic worth not sending. `unavailable` is
 * never cached, so one timeout cannot become a permanent blank.
 */
async function cachedFact(
  barcode: string,
  source: "gepir" | "metro",
  ask: () => Promise<{ known: boolean; value: string | null }>,
): Promise<string | null> {
  const cached = await prisma.barcodeFact.findUnique({
    where: { barcode_source: { barcode, source } },
  });
  if (cached) return cached.value;

  const answer = await ask();
  if (!answer.known) return null;

  await prisma.barcodeFact.upsert({
    where: { barcode_source: { barcode, source } },
    create: { barcode, source, value: answer.value },
    update: { value: answer.value, fetchedAt: new Date() },
  });
  return answer.value;
}

/**
 * Feature 29 — METRO's own labels (METRO Chef, aro) are in no open database,
 * and GEPIR can only ever name the company. Their shop knows the product, and
 * its search is exact on EAN, so a hit is the product rather than a guess.
 */
async function metroName(barcode: string): Promise<string | null> {
  return cachedFact(barcode, "metro", async () => {
    const result = await fetchMetroProduct(barcode);
    if (result.kind === "product") return { known: true, value: result.product.name };
    if (result.kind === "unknown") return { known: true, value: null };
    return { known: false, value: null };
  });
}

/**
 * Feature 20 — the GEPIR fallback, cached.

 *
 * Cached in `BarcodeFact` including the misses: "GS1 Ukraine has no record"
 * is the common answer for a code Open Food Facts also lacks, and re-asking a
 * scraped third-party site on every scan is traffic worth not sending. The
 * cache is global rather than per-household because a barcode has the same
 * manufacturer for everyone.
 *
 * Returns null on every failure path. A scan must not fail, or even slow
 * down noticeably, because someone else's registry is unhappy.
 */
async function manufacturerHint(barcode: string): Promise<string | null> {
  if (!isUkrainianGtin(barcode)) return null;

  return cachedFact(barcode, "gepir", async () => {
    const result = await fetchGepirCompany(barcode);
    if (result.kind === "company") {
      return { known: true, value: shortenCompanyName(result.company.name) };
    }
    if (result.kind === "unregistered") return { known: true, value: null };
    return { known: false, value: null };
  });
}
