import { Controller, Get } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser, type Caller } from "../auth/jwt-auth.guard";
import { getShoppingView } from "../db";

/**
 * Feature 34 — the shopping list as one read.
 *
 * `getShoppingView` already returns the rows grouped the way Feature 11 defines
 * them, «Загальна група» included as the null group. Regrouping client-side
 * would be a second implementation of a rule that has an edge case (a group
 * that is not a row) worth having exactly once.
 */
@ApiTags("shopping")
@Controller("shopping")
export class ShoppingController {
  @Get()
  @ApiOperation({ summary: "The list, grouped, with archived rows separated." })
  async list(@CurrentUser() caller: Caller) {
    return getShoppingView(caller.householdId);
  }
}
