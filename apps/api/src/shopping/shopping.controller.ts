import { Body, Controller, Delete, Get, Param, Post } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser, type Caller } from "../auth/jwt-auth.guard";
import { unwrap } from "../common/unwrap";
import {
  addListRow,
  archiveCheckedRows,
  checkListRow,
  deleteArchivedRows,
  deleteListRow,
  getShoppingView,
  setListRowArchived,
  uncheckListRow,
  updateListRow,
} from "../db";
import { ApiContract, ApiRefusal } from "../common/openapi";
import { shoppingViewSchema } from "../contracts";

/**
 * Feature 34 — the shopping list.
 *
 * `getShoppingView` already returns the rows grouped the way Feature 11
 * defines them, «Загальна група» included as the null group. Regrouping
 * client-side would be a second implementation of a rule whose whole
 * interesting case is that one group is not a row.
 *
 * Checking a row is a stock-in (Feature 6), and it goes through the same
 * `addStock` the item screen and the Telegram bot use — which is why it lives
 * in the service rather than here.
 */
@ApiTags("shopping")
@Controller("shopping")
@ApiRefusal(422)
export class ShoppingController {
  @Get()
  @ApiOperation({ summary: "The list, grouped, with archived rows separated." })
  @ApiContract(shoppingViewSchema)
  async list(@CurrentUser() caller: Caller) {
    return getShoppingView(caller.householdId);
  }

  @Post()
  @ApiOperation({ summary: "Add a row — an item, or free text." })
  async add(
    @CurrentUser() caller: Caller,
    @Body()
    body: {
      itemId?: string | null;
      freeText?: string | null;
      quantity?: string | null;
      groupId?: string | null;
    },
  ) {
    return unwrap(await addListRow(caller, body));
  }

  @Post(":id/check")
  @ApiOperation({
    summary: "Tick a row. For an item row, this is also a stock-in (Feature 6).",
  })
  async check(
    @CurrentUser() caller: Caller,
    @Param("id") id: string,
    @Body()
    body: { rows?: { quantity: string; expiresAt?: string; openedAt?: string }[] },
  ) {
    return unwrap(await checkListRow(caller, id, body.rows));
  }

  @Post(":id/uncheck")
  @ApiOperation({ summary: "Untick a row." })
  async uncheck(@CurrentUser() caller: Caller, @Param("id") id: string) {
    return unwrap(await uncheckListRow(caller, id));
  }

  @Post(":id/update")
  @ApiOperation({
    summary: "Edit a row. An item row's name comes from the item and is refused here.",
  })
  async update(
    @CurrentUser() caller: Caller,
    @Param("id") id: string,
    @Body() body: { freeText?: string | null; note?: string | null },
  ) {
    return unwrap(await updateListRow(caller, id, body));
  }

  @Post(":id/archive")
  @ApiOperation({ summary: "Archive or restore a row (Feature 14.2)." })
  async archive(
    @CurrentUser() caller: Caller,
    @Param("id") id: string,
    @Body() body: { archived?: boolean },
  ) {
    return unwrap(await setListRowArchived(caller, id, body.archived !== false));
  }

  @Post("archive-checked")
  @ApiOperation({
    summary: "Tidy up after a shop — archives every ticked row, recoverably.",
  })
  async archiveChecked(@CurrentUser() caller: Caller) {
    return unwrap(await archiveCheckedRows(caller));
  }

  @Delete("archived")
  @ApiOperation({ summary: "Permanently remove every archived row." })
  async deleteArchived(@CurrentUser() caller: Caller) {
    return unwrap(await deleteArchivedRows(caller));
  }

  @Delete(":id")
  @ApiOperation({ summary: "Delete one row." })
  async remove(@CurrentUser() caller: Caller, @Param("id") id: string) {
    return unwrap(await deleteListRow(caller, id));
  }
}
