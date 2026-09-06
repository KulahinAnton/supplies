"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth-guard";
import { actionError, type ActionResult } from "@supplies/core/action-result";
import {
  categorySchema,
  householdSettingsSchema,
  itemGroupSchema,
  locationSchema,
} from "@supplies/core/validation/settings";
import { firstIssueAsRuleMessage } from "@supplies/core/validation/shared";
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
} from "@supplies/db/settings-service";

/**
 * Session guard, validation, and telling Next what went stale.
 *
 * The rules moved to `@supplies/db/settings-service` for Feature 34 — "at most
 * one default", the whole-list reorder rewrite and refusing to delete a set
 * with members all have to hold for the API too, and none of them survive
 * being written twice.
 */
function refresh() {
  revalidatePath("/settings");
  revalidatePath("/dashboard");
  revalidatePath("/items");
}

type Session = Awaited<ReturnType<typeof requireSession>>;

async function run(work: (actor: Session) => Promise<ActionResult>) {
  const session = await requireSession();
  const result = await work(session);
  if (result.ok) refresh();
  return result;
}

/** Validate with a shared schema, then hand the parsed data to the service. */
async function runParsed<T>(
  schema: { safeParse: (input: unknown) => { success: true; data: T } | { success: false; error: Parameters<typeof firstIssueAsRuleMessage>[0] } },
  input: unknown,
  work: (actor: Session, data: T) => Promise<ActionResult>,
) {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return actionError(firstIssueAsRuleMessage(parsed.error));
  return run((actor) => work(actor, parsed.data));
}

export async function updateHouseholdAction(input: unknown): Promise<ActionResult> {
  return runParsed(householdSettingsSchema, input, updateHousehold);
}

export async function saveCategoryAction(input: unknown): Promise<ActionResult> {
  return runParsed(categorySchema, input, saveCategory);
}

export async function deleteCategoryAction(id: string): Promise<ActionResult> {
  return run((actor) => deleteCategory(actor, id));
}

export async function saveLocationAction(input: unknown): Promise<ActionResult> {
  return runParsed(locationSchema, input, saveLocation);
}

export async function deleteLocationAction(id: string): Promise<ActionResult> {
  return run((actor) => deleteLocation(actor, id));
}

export async function reorderCategoriesAction(ids: string[]): Promise<ActionResult> {
  return run((actor) => reorderCategories(actor, ids));
}

export async function reorderLocationsAction(ids: string[]): Promise<ActionResult> {
  return run((actor) => reorderLocations(actor, ids));
}

export async function setDefaultCategoryAction(id: string): Promise<ActionResult> {
  return run((actor) => setDefaultCategory(actor, id));
}

export async function setDefaultLocationAction(id: string): Promise<ActionResult> {
  return run((actor) => setDefaultLocation(actor, id));
}

export async function saveItemGroupAction(input: unknown): Promise<ActionResult> {
  return runParsed(itemGroupSchema, input, saveItemGroup);
}

export async function deleteItemGroupAction(id: string): Promise<ActionResult> {
  return run((actor) => deleteItemGroup(actor, id));
}

export async function reorderItemGroupsAction(ids: string[]): Promise<ActionResult> {
  return run((actor) => reorderItemGroups(actor, ids));
}

export async function addItemToGroupAction(
  groupId: string,
  itemId: string,
): Promise<ActionResult> {
  return run((actor) => addItemToGroup(actor, groupId, itemId));
}

export async function removeItemFromGroupAction(itemId: string): Promise<ActionResult> {
  return run((actor) => removeItemFromGroup(actor, itemId));
}
