import { Controller, Get } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser, type Caller } from "../auth/jwt-auth.guard";
import {
  getAttentionCounts,
  getCategoriesAndLocations,
  getDashboard,
  getHousehold,
  getItemGroupViews,
  getMembers,
  getRecentMovements,
  getRestockEntries,
  hasTelegramLink,
} from "../db";

/**
 * Feature 34 — the composed reads.
 *
 * `/dashboard` is one request rather than four, because it is one screen. The
 * Next app gets the same shape from `getDashboard` in a server component; the
 * SPA and the phone would otherwise pay four round trips to render what the
 * web app renders in one.
 */
@ApiTags("dashboard")
@Controller()
export class DashboardController {
  @Get("dashboard")
  @ApiOperation({ summary: "Expired, expiring soon, running low, recent activity." })
  async dashboard(@CurrentUser() caller: Caller) {
    return getDashboard(caller.householdId);
  }

  @Get("attention")
  @ApiOperation({ summary: "Just the badge counts — what the nav needs." })
  async attention(@CurrentUser() caller: Caller) {
    return getAttentionCounts(caller.householdId);
  }

  @Get("household")
  @ApiOperation({ summary: "Household settings: warn days, digest hour, AI switch." })
  async household(@CurrentUser() caller: Caller) {
    return getHousehold(caller.householdId);
  }

  @Get("household/members")
  @ApiOperation({ summary: "Everyone in the household." })
  async members(@CurrentUser() caller: Caller) {
    return getMembers(caller.householdId);
  }

  @Get("movements")
  @ApiOperation({ summary: "The audit trail — who used the last of it." })
  async movements(@CurrentUser() caller: Caller) {
    return getRecentMovements(caller.householdId);
  }

  @Get("taxonomy")
  @ApiOperation({
    summary: "Categories and storage locations — what the item form needs.",
  })
  async taxonomy(@CurrentUser() caller: Caller) {
    return getCategoriesAndLocations(caller.householdId);
  }

  @Get("groups")
  @ApiOperation({ summary: "Feature 26 sets, with their combined totals." })
  async groups(@CurrentUser() caller: Caller) {
    return getItemGroupViews(caller.householdId);
  }

  @Get("restock")
  @ApiOperation({ summary: "What the shopping list suggests buying." })
  async restock(@CurrentUser() caller: Caller) {
    return getRestockEntries(caller.householdId);
  }

  @Get("telegram/linked")
  @ApiOperation({ summary: "Whether this user has a Telegram chat linked." })
  async telegram(@CurrentUser() caller: Caller): Promise<{ linked: boolean }> {
    return { linked: await hasTelegramLink(caller.userId) };
  }
}
