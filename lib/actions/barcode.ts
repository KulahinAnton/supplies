"use server";

import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-guard";
import { actionError, actionOk, type ActionResult } from "@/lib/action-result";
import { ruleMessage } from "@/lib/messages";
import { fetchProduct, suggestedItemName } from "@/lib/barcode-source";

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
 * A miss is NOT an error: Open Food Facts has patchy Ukrainian coverage, and
 * an empty form is a perfectly good outcome. Only a signed-out caller or a
 * malformed code fails.
 */
export type BarcodeLookup =
  | { kind: "existing"; itemId: string; name: string }
  | { kind: "product"; suggestedName: string; packSize: string | null }
  | { kind: "unknown" };

export async function lookupBarcodeAction(
  barcode: string,
): Promise<ActionResult<BarcodeLookup>> {
  const session = await requireSession();

  const code = barcode.trim();
  if (!/^\d{6,14}$/.test(code)) {
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
    return actionOk<BarcodeLookup>({ kind: "unknown" });
  }

  return actionOk<BarcodeLookup>({
    kind: "product",
    suggestedName,
    packSize: product.quantityText,
  });
}
