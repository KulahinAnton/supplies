"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth-guard";
import type { ActionResult } from "@supplies/core/action-result";
import {
  createShoppingGroup,
  deleteShoppingGroup,
  moveListRowToGroup,
  renameShoppingGroup,
  reorderShoppingGroups,
} from "@supplies/db/shopping-groups-service";

/**
 * Session guard and `revalidatePath`, nothing else.
 *
 * Feature 11's rules — «Загальна група» being `groupId = null` rather than a
 * row, names being unique within a household, deleting a group returning its
 * rows to the default rather than destroying them — live in
 * `@supplies/db/shopping-groups-service`, because the API serves the same
 * screen to the SPA and must inherit them rather than re-derive them.
 */

function refresh() {
  revalidatePath("/shopping");
}

async function run<T>(work: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  const result = await work();
  if (result.ok) refresh();
  return result;
}

export async function createShoppingGroupAction(
  name: string,
): Promise<ActionResult<{ id: string }>> {
  const session = await requireSession();
  return run(() => createShoppingGroup(session, name));
}

export async function renameShoppingGroupAction(
  groupId: string,
  name: string,
): Promise<ActionResult> {
  const session = await requireSession();
  return run(() => renameShoppingGroup(session, groupId, name));
}

export async function deleteShoppingGroupAction(groupId: string): Promise<ActionResult> {
  const session = await requireSession();
  return run(() => deleteShoppingGroup(session, groupId));
}

/** Drag-and-drop and the "move to" menu both land here. */
export async function moveListRowToGroupAction(
  rowId: string,
  targetGroupId: string,
): Promise<ActionResult> {
  const session = await requireSession();
  return run(() => moveListRowToGroup(session, rowId, targetGroupId));
}

export async function reorderShoppingGroupsAction(
  orderedIds: string[],
): Promise<ActionResult> {
  const session = await requireSession();
  return run(() => reorderShoppingGroups(session, orderedIds));
}
