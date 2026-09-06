"use server";

import { requireSession } from "@/lib/auth-guard";
import type { ActionResult } from "@supplies/core/action-result";
import {
  findItemByBarcode,
  lookupBarcode,
  type BarcodeLookup,
  type BarcodeSearch,
} from "@supplies/db/barcode-service";

/**
 * Session guard only. The lookup chain — the household's own items first, then
 * Open Food Facts, then METRO Ukraine, then GS1 Ukraine, with the misses cached
 * — lives in `@supplies/db/barcode-service` (Feature 34), because a phone
 * scanning a barcode must get the same answer as the web app, in the same
 * order, from the same cache.
 */
export type { BarcodeLookup, BarcodeSearch };

export async function lookupBarcodeAction(
  barcode: string,
): Promise<ActionResult<BarcodeLookup>> {
  const session = await requireSession();
  return lookupBarcode(session, barcode);
}

export async function findItemByBarcodeAction(
  barcode: string,
): Promise<ActionResult<BarcodeSearch>> {
  const session = await requireSession();
  return findItemByBarcode(session, barcode);
}
