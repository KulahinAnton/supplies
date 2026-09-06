import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser, type Caller } from "../auth/jwt-auth.guard";
import { ApiRuleError } from "../common/api-rule-error";
import {
  createItem,
  getArchivedItems,
  getItemDetail,
  getItemNames,
  getItemViews,
  getItemsPage,
  setItemArchived,
  updateItem,
  type ItemInput,
} from "../db";
import { itemSchema, parseItemListSearch, updateItemSchema } from "../core";
import { zodBody } from "../common/zod.pipe";
import { unwrap } from "../common/unwrap";

/**
 * Feature 34 — reads, and nothing more.
 *
 * Every handler is a call into `@supplies/db/queries`, which is the same module
 * the Next app's pages and the Telegram bot read through. None of these compute
 * a stock or expiry state; `queries.ts` is the only place the database meets
 * the engine, and an endpoint that did its own arithmetic would be a second
 * definition of "low".
 *
 * The list parameters are parsed by `@supplies/core/item-list-params`, the same
 * functions the web app uses to read them out of the URL (Feature 27). One
 * definition of what `?sort=expiring` means, whether it arrives as a query
 * string on a page or on an endpoint.
 */
@ApiTags("items")
@Controller("items")
export class ItemsController {
  /**
   * The query string is the one `itemListSearch` writes — `q`, `filter`,
   * `cat`, `sort`, `page`, `per` — so a filtered list in any client is the
   * same URL here.
   *
   * This used to spell two of them itself, `category` and `perPage`, which
   * meant the link the web app puts in the address bar asked this endpoint for
   * a different list than it displayed: all categories, default page size, no
   * error anywhere. `parseItemListSearch` is now the only reader.
   */
  @Get()
  @ApiOperation({ summary: "Paged, filtered, sorted items for this household." })
  async list(
    @CurrentUser() caller: Caller,
    @Query() query: Record<string, string | string[] | undefined>,
  ) {
    return getItemsPage(caller.householdId, parseItemListSearch(query));
  }

  @Get("names")
  @ApiOperation({
    summary: "Id and name only — for pickers, without loading every batch.",
  })
  async names(@CurrentUser() caller: Caller) {
    return getItemNames(caller.householdId);
  }

  @Get("archive")
  @ApiOperation({ summary: "Archived items." })
  async archived(@CurrentUser() caller: Caller) {
    return getArchivedItems(caller.householdId);
  }

  @Get("all")
  @ApiOperation({
    summary: "Every item with its computed state — what the dashboard reads.",
  })
  async all(@CurrentUser() caller: Caller) {
    return getItemViews(caller.householdId);
  }

  @Get(":id")
  @ApiOperation({ summary: "One item, its batches and its recent movements." })
  async detail(@CurrentUser() caller: Caller, @Param("id") id: string) {
    /**
     * `getItemDetail` is already scoped by `householdId`, so this returns null
     * rather than another household's row — the 404 is about the caller's
     * world, which is the only one they can be told about.
     */
    const item = await getItemDetail(caller.householdId, id);
    if (!item) throw new ApiRuleError(404, "item.notFound");
    return item;
  }

  @Post()
  @ApiOperation({ summary: "Create an item." })
  async create(
    @CurrentUser() caller: Caller,
    @Body(zodBody(itemSchema)) body: ItemInput,
  ) {
    return unwrap(await createItem(caller, body));
  }

  @Patch(":id")
  @ApiOperation({
    summary: "Update an item. The unit is locked once it has batches (§3.2).",
  })
  async update(
    @CurrentUser() caller: Caller,
    @Param("id") id: string,
    @Body(zodBody(updateItemSchema)) body: ItemInput & { id: string },
  ) {
    // The body carries an id too, because the schema is shared with a form
    // that has no URL to read it from. The PATH wins: it is the addressed
    // resource, and letting a body redirect a PATCH is how one gets written
    // that edits a different item than the URL says.
    return unwrap(await updateItem(caller, id, body));
  }

  @Post(":id/archive")
  @ApiOperation({
    summary: "Archive or restore. Never deletes — movements reference the item.",
  })
  async archive(
    @CurrentUser() caller: Caller,
    @Param("id") id: string,
    @Body() body: { archived?: boolean },
  ) {
    return unwrap(await setItemArchived(caller, id, body.archived !== false));
  }
}
