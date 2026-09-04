import { Controller, Get, Param, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser, type Caller } from "../auth/jwt-auth.guard";
import { ApiRuleError } from "../common/api-rule-error";
import {
  getArchivedItems,
  getItemDetail,
  getItemNames,
  getItemViews,
  getItemsPage,
} from "../db";
import { parseFilter, parsePage, parsePerPage, parseSort } from "../core";

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
  @Get()
  @ApiOperation({ summary: "Paged, filtered, sorted items for this household." })
  async list(
    @CurrentUser() caller: Caller,
    @Query() query: Record<string, string | undefined>,
  ) {
    return getItemsPage(caller.householdId, {
      query: query.q?.trim() ?? "",
      filter: parseFilter(query.filter),
      category: query.category ?? "all",
      sort: parseSort(query.sort, "name"),
      page: parsePage(query.page),
      perPage: parsePerPage(query.perPage),
    });
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
}
