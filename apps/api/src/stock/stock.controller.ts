import { Body, Controller, Post } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser, type Caller } from "../auth/jwt-auth.guard";
import { zodBody } from "../common/zod.pipe";
import { unwrap } from "../common/unwrap";
import { addStock, consume, consumeBatch, correctBatch, discardBatch } from "../db";
import {
  addStockSchema,
  consumeBatchSchema,
  consumeSchema,
  correctionSchema,
  discardSchema,
} from "../core";

/**
 * Feature 34 — the writes, and every one of them is three lines.
 *
 * That is the point. `bot/CLAUDE.md` says the same thing about `bot/actions.ts`:
 * if it ever grows business logic, that logic is in the wrong file. FEFO, the
 * shortfall message, the concurrency retry and the movement row all live in
 * `@supplies/db/stock-service`, and this controller's whole job is turning an
 * `ActionResult` into a status code.
 *
 * `Caller` is structurally an `Actor` — the same `{ userId, householdId }` the
 * bot passes — which is what "takes an actor instead of reading a session"
 * bought when it was written.
 *
 * Feature 4's discard and correct only became callable from here when they
 * moved out of `lib/actions/stock.ts` into the write path. They were the last
 * piece of stock logic living in a server action.
 */
@ApiTags("stock")
@Controller("stock")
export class StockController {
  @Post("add")
  @ApiOperation({ summary: "Add one or more batches of an item (PURCHASE)." })
  async add(
    @CurrentUser() caller: Caller,
    @Body(zodBody(addStockSchema))
    body: {
      itemId: string;
      rows: {
        quantity: string;
        expiresAt?: string;
        openedAt?: string;
        locationId?: string;
      }[];
      note?: string;
    },
  ) {
    return unwrap(await addStock(caller, body.itemId, body.rows, body.note));
  }

  @Post("consume")
  @ApiOperation({ summary: "Take a quantity of an item, FEFO across its batches." })
  async consume(
    @CurrentUser() caller: Caller,
    @Body(zodBody(consumeSchema))
    body: { itemId: string; quantity: string; note?: string },
  ) {
    return unwrap(await consume(caller, body.itemId, body.quantity, body.note));
  }

  @Post("consume-batch")
  @ApiOperation({ summary: "Take from ONE named batch, expiry notwithstanding." })
  async consumeBatch(
    @CurrentUser() caller: Caller,
    @Body(zodBody(consumeBatchSchema))
    body: { batchId: string; quantity: string; note?: string },
  ) {
    return unwrap(await consumeBatch(caller, body.batchId, body.quantity, body.note));
  }

  @Post("discard")
  @ApiOperation({ summary: "Throw a batch away (WASTE) — how expired stock leaves." })
  async discard(
    @CurrentUser() caller: Caller,
    @Body(zodBody(discardSchema)) body: { batchId: string; note?: string },
  ) {
    return unwrap(await discardBatch(caller, body.batchId, body.note));
  }

  @Post("correct")
  @ApiOperation({ summary: "Set a batch's absolute quantity, logging the delta." })
  async correct(
    @CurrentUser() caller: Caller,
    @Body(zodBody(correctionSchema))
    body: { batchId: string; quantity: string; note?: string },
  ) {
    return unwrap(await correctBatch(caller, body.batchId, body.quantity, body.note));
  }
}
