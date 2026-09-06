import { Body, Controller, Delete, Param, Patch, Post } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser, type Caller } from "../auth/jwt-auth.guard";
import { unwrap } from "../common/unwrap";
import {
  createShoppingGroup,
  deleteShoppingGroup,
  moveListRowToGroup,
  renameShoppingGroup,
  reorderShoppingGroups,
} from "../db";

/**
 * Feature 11 — the groups a shopping list is organised into: «Сільпо»,
 * «Аптека», whatever the household shops by.
 *
 * Their own controller rather than more routes on `ShoppingController`,
 * because `/shopping/:id/...` already means "a row of the list" — a
 * `/shopping/groups/:id` hung off that would collide with the row routes on
 * the day someone adds `/shopping/groups`, and Nest resolves those by
 * declaration order, which is the kind of bug that only appears in
 * production.
 *
 * Nothing here owns a rule. `@supplies/db/shopping-groups-service` does, and
 * the Next app's server actions call the same functions — these had lived
 * only in `apps/web/lib/actions/` until the SPA needed them, which would have
 * made this file a second copy of "a group name is unique in a household".
 */
@ApiTags("shopping")
@Controller("shopping-groups")
export class ShoppingGroupsController {
  @Post()
  @ApiOperation({ summary: "Create a group." })
  async create(@CurrentUser() caller: Caller, @Body() body: { name?: string }) {
    return unwrap(await createShoppingGroup(caller, body.name ?? ""));
  }

  @Patch(":id")
  @ApiOperation({ summary: "Rename a group. «Загальна група» is not one." })
  async rename(
    @CurrentUser() caller: Caller,
    @Param("id") id: string,
    @Body() body: { name?: string },
  ) {
    return unwrap(await renameShoppingGroup(caller, id, body.name ?? ""));
  }

  @Post("reorder")
  @ApiOperation({ summary: "Reorder the named groups." })
  async reorder(@CurrentUser() caller: Caller, @Body() body: { ids?: string[] }) {
    return unwrap(await reorderShoppingGroups(caller, body.ids ?? []));
  }

  /**
   * `reorder` and `rows/…` are literal segments and must stay above any
   * future `@Post(":id")`, or Nest will match them as group ids — the trap
   * `/shopping/archived` and `/settings/groups/items/:id` already have e2e
   * checks for. Nothing collides today; the order is what keeps that true.
   */
  @Post("rows/:rowId/move")
  @ApiOperation({ summary: "Move a row to a group — drag, or the move menu." })
  async move(
    @CurrentUser() caller: Caller,
    @Param("rowId") rowId: string,
    @Body() body: { groupId?: string },
  ) {
    return unwrap(await moveListRowToGroup(caller, rowId, body.groupId ?? ""));
  }

  @Delete(":id")
  @ApiOperation({
    summary: "Delete a group. Its rows fall back to «Загальна група», intact.",
  })
  async remove(@CurrentUser() caller: Caller, @Param("id") id: string) {
    return unwrap(await deleteShoppingGroup(caller, id));
  }
}
