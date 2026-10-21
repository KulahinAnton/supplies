"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth-guard";
import type { ActionResult } from "@supplies/core/action-result";
import {
  addListRow,
  archiveCheckedRows,
  checkListRow,
  deleteArchivedRows,
  deleteListRow,
  setListRowArchived,
  uncheckListRow,
  updateListRow,
} from "@supplies/db/shopping-service";

/**
 * Session guard and cache invalidation. The rules live in
 * `@supplies/db/shopping-service` (Feature 34) — «Загальна група» being null
 * rather than a row, an item-linked row taking its name from the item, and
 * checking a row being a stock-in are rules, and the API inherits them rather
 * than re-deriving them.
 */
function refresh() {
  revalidatePath("/shopping");
  revalidatePath("/dashboard");
}

async function run(work: (actor: Awaited<ReturnType<typeof requireSession>>) => Promise<ActionResult>) {
  const session = await requireSession();
  const result = await work(session);
  if (result.ok) refresh();
  return result;
}

export async function addListRowAction(input: {
  itemId?: string | null;
  freeText?: string | null;
  quantity?: string | null;
  groupId?: string | null;
}): Promise<ActionResult> {
  return run((actor) => addListRow(actor, input));
}

export async function checkListRowAction(input: {
  rowId: string;
  rows?: { quantity: string; expiresAt?: string; openedAt?: string }[];
}): Promise<ActionResult> {
  return run((actor) => checkListRow(actor, input.rowId, input.rows));
}

export async function updateListRowAction(input: {
  rowId: string;
  freeText?: string | null;
  note?: string | null;
}): Promise<ActionResult> {
  return run((actor) => updateListRow(actor, input.rowId, input));
}

export async function uncheckListRowAction(rowId: string): Promise<ActionResult> {
  return run((actor) => uncheckListRow(actor, rowId));
}

export async function deleteListRowAction(rowId: string): Promise<ActionResult> {
  return run((actor) => deleteListRow(actor, rowId));
}

export async function setListRowArchivedAction(
  rowId: string,
  archived: boolean,
): Promise<ActionResult> {
  return run((actor) => setListRowArchived(actor, rowId, archived));
}

export async function archiveCheckedRowsAction(): Promise<ActionResult> {
  return run((actor) => archiveCheckedRows(actor));
}

export async function deleteArchivedRowsAction(): Promise<ActionResult> {
  return run((actor) => deleteArchivedRows(actor));
}
