import { Controller, Get, Param } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser, type Caller } from "../auth/jwt-auth.guard";
import { unwrap } from "../common/unwrap";
import { findItemByBarcode, lookupBarcode } from "../db";
import { ApiContract } from "../common/openapi";
import { barcodeItemSchema, barcodeLookupSchema } from "../contracts";

/**
 * Feature 10 / 20 / 29 — what a scanned barcode turns into.
 *
 * The lookup chain is not here: it is in `@supplies/db/barcode-service`, and
 * that placement is the whole point. A phone scanning a code has to get the
 * same answer as the web app, in the same order — the household's own items
 * first, then Open Food Facts, then METRO Ukraine, then GS1 Ukraine — and out
 * of the same `BarcodeFact` cache, so a phone scan does not re-ask a third
 * party something the browser already asked this morning.
 *
 * A miss is not an error. Open Food Facts has patchy Ukrainian coverage and an
 * empty form is a perfectly good outcome; only a malformed code fails.
 */
@ApiTags("barcode")
@Controller("barcode")
export class BarcodeController {
  @Get(":code")
  @ApiOperation({
    summary: "Look a barcode up: own items, then OFF, then METRO, then GS1.",
  })
  @ApiContract(barcodeLookupSchema)
  async lookup(@CurrentUser() caller: Caller, @Param("code") code: string) {
    return unwrap(await lookupBarcode(caller, code));
  }

  @Get(":code/item")
  @ApiOperation({
    summary: "Just: does this household already have an item with this code?",
  })
  @ApiContract(barcodeItemSchema)
  async find(@CurrentUser() caller: Caller, @Param("code") code: string) {
    return unwrap(await findItemByBarcode(caller, code));
  }
}
