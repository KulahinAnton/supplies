import { Body, Controller, Delete, Param, Patch, Post } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser, type Caller } from "../auth/jwt-auth.guard";
import { unwrap } from "../common/unwrap";
import { zodBody } from "../common/zod.pipe";
import {
  addItemToGroup,
  deleteCategory,
  deleteItemGroup,
  deleteLocation,
  removeItemFromGroup,
  reorderCategories,
  reorderItemGroups,
  reorderLocations,
  saveCategory,
  saveItemGroup,
  saveLocation,
  setDefaultCategory,
  setDefaultLocation,
  updateHousehold,
} from "../db";
import {
  categorySchema,
  householdSettingsSchema,
  itemGroupSchema,
  locationSchema,
} from "../core";

/**
 * Feature 34 — settings.
 *
 * Reads live on `/household` and `/taxonomy` in the dashboard controller;
 * these are the writes. Three rules they carry are worth knowing about because
 * they are the reason none of this is a plain CRUD generator:
 *
 * - **Reordering is a whole-list rewrite** (Feature 15.1). The client sends
 *   every id in its new order. A partial patch invites gaps and ties.
 * - **Defaults are a toggle** (Feature 15.2). Starring the starred row clears
 *   it; "at most one" holds because a transaction clears all of them first.
 * - **Deletes refuse when the row is in use.** Cascading would silently strip
 *   a category, a location or a restock threshold off the items.
 */
@ApiTags("settings")
@Controller("settings")
export class SettingsController {
  @Patch("household")
  @ApiOperation({ summary: "Warn days, digest hour, AI switch — household data." })
  async household(
    @CurrentUser() caller: Caller,
    @Body(zodBody(householdSettingsSchema))
    body: { expiryWarnDays?: number; digestHour?: number; aiEnabled?: boolean },
  ) {
    return unwrap(await updateHousehold(caller, body));
  }

  @Post("categories")
  @ApiOperation({ summary: "Create or rename a category (send `id` to rename)." })
  async saveCategory(
    @CurrentUser() caller: Caller,
    @Body(zodBody(categorySchema))
    body: { id?: string; name: string; icon: string; expiryWarnDays: number | null },
  ) {
    return unwrap(await saveCategory(caller, body));
  }

  @Delete("categories/:id")
  @ApiOperation({ summary: "Delete a category. Refused while items still use it." })
  async deleteCategory(@CurrentUser() caller: Caller, @Param("id") id: string) {
    return unwrap(await deleteCategory(caller, id));
  }

  @Post("categories/reorder")
  @ApiOperation({ summary: "Whole-list rewrite — send every id in its new order." })
  async reorderCategories(
    @CurrentUser() caller: Caller,
    @Body() body: { ids: string[] },
  ) {
    return unwrap(await reorderCategories(caller, body.ids));
  }

  @Post("categories/:id/default")
  @ApiOperation({ summary: "Toggle the default category for new items." })
  async defaultCategory(@CurrentUser() caller: Caller, @Param("id") id: string) {
    return unwrap(await setDefaultCategory(caller, id));
  }

  @Post("locations")
  @ApiOperation({ summary: "Create or rename a storage location." })
  async saveLocation(
    @CurrentUser() caller: Caller,
    @Body(zodBody(locationSchema)) body: { id?: string; name: string },
  ) {
    return unwrap(await saveLocation(caller, body));
  }

  @Delete("locations/:id")
  @ApiOperation({ summary: "Delete a location. Refused while items still use it." })
  async deleteLocation(@CurrentUser() caller: Caller, @Param("id") id: string) {
    return unwrap(await deleteLocation(caller, id));
  }

  @Post("locations/reorder")
  @ApiOperation({ summary: "Whole-list rewrite — send every id in its new order." })
  async reorderLocations(
    @CurrentUser() caller: Caller,
    @Body() body: { ids: string[] },
  ) {
    return unwrap(await reorderLocations(caller, body.ids));
  }

  @Post("locations/:id/default")
  @ApiOperation({ summary: "Toggle the default location for new items." })
  async defaultLocation(@CurrentUser() caller: Caller, @Param("id") id: string) {
    return unwrap(await setDefaultLocation(caller, id));
  }

  @Post("groups")
  @ApiOperation({ summary: "Feature 26 — create or rename a set." })
  async saveGroup(
    @CurrentUser() caller: Caller,
    @Body(zodBody(itemGroupSchema)) body: { id?: string; name: string; minQty: string },
  ) {
    return unwrap(await saveItemGroup(caller, body));
  }

  @Delete("groups/:id")
  @ApiOperation({
    summary: "Delete a set. Refused while it has members — they would lose their threshold.",
  })
  async deleteGroup(@CurrentUser() caller: Caller, @Param("id") id: string) {
    return unwrap(await deleteItemGroup(caller, id));
  }

  @Post("groups/reorder")
  @ApiOperation({ summary: "Whole-list rewrite — send every id in its new order." })
  async reorderGroups(@CurrentUser() caller: Caller, @Body() body: { ids: string[] }) {
    return unwrap(await reorderItemGroups(caller, body.ids));
  }

  @Post("groups/:id/items")
  @ApiOperation({
    summary: "Add an item to a set. Refused if its unit differs from the members'.",
  })
  async addToGroup(
    @CurrentUser() caller: Caller,
    @Param("id") id: string,
    @Body() body: { itemId: string },
  ) {
    return unwrap(await addItemToGroup(caller, id, body.itemId));
  }

  @Delete("groups/items/:itemId")
  @ApiOperation({ summary: "Take an item out of its set. The item is untouched." })
  async removeFromGroup(
    @CurrentUser() caller: Caller,
    @Param("itemId") itemId: string,
  ) {
    return unwrap(await removeItemFromGroup(caller, itemId));
  }
}
