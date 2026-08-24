"use server";

import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-guard";
import { actionError, actionOk, type ActionResult } from "@/lib/action-result";
import { ruleMessage } from "@/lib/messages";
import { isBarcodeShaped } from "@/lib/validation/shared";
import { fetchProduct, suggestedItemName } from "@/lib/barcode-source";
import { canContribute } from "@/lib/off-contribute";
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
 * Feature 20 — the GEPIR fallback, cached.
 *
 * Cached in `GepirLookup` including the misses: "GS1 Ukraine has no record"
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

  const cached = await prisma.gepirLookup.findUnique({ where: { barcode } });
  if (cached) return cached.company;

  const result = await fetchGepirCompany(barcode);

  // Only "they answered" is worth remembering. Caching `unavailable` would
  // turn one timeout into a permanent blank for that barcode.
  if (result.kind === "company" || result.kind === "unregistered") {
    const company =
      result.kind === "company" ? shortenCompanyName(result.company.name) : null;
    await prisma.gepirLookup.upsert({
      where: { barcode },
      create: { barcode, company },
      update: { company, fetchedAt: new Date() },
    });
    return company;
  }

  return null;
}
