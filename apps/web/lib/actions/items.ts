"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth-guard";
import { actionError, type ActionResult } from "@supplies/core/action-result";
import { itemSchema, updateItemSchema } from "@supplies/core/validation/item";
import { firstIssueAsRuleMessage } from "@supplies/core/validation/shared";
import { createItem, setItemArchived, updateItem } from "@supplies/db/item-service";

/**
 * Session guard, validation, and telling Next what went stale.
 *
 * The rules moved to `@supplies/db/item-service` when Feature 34 gave the app
 * a third front end: barcode uniqueness, §3.2's locked unit and Feature 26's
 * one-unit rule are not presentation, and a copy per caller is a copy that
 * eventually disagrees. What is left here is the three things only Next can do.
 */
function refresh(itemId?: string) {
  revalidatePath("/items");
  revalidatePath("/dashboard");
  if (itemId) revalidatePath(`/items/${itemId}`);
}

export async function createItemAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const session = await requireSession();
  const parsed = itemSchema.safeParse(input);
  if (!parsed.success) return actionError(firstIssueAsRuleMessage(parsed.error));

  const result = await createItem(session, parsed.data);
  if (result.ok) refresh(result.data.id);
  return result;
}

export async function updateItemAction(input: unknown): Promise<ActionResult> {
  const session = await requireSession();
  const parsed = updateItemSchema.safeParse(input);
  if (!parsed.success) return actionError(firstIssueAsRuleMessage(parsed.error));

  const { id, ...data } = parsed.data;
  const result = await updateItem(session, id, data);
  if (result.ok) refresh(id);
  return result;
}

export async function setItemArchivedAction(
  itemId: string,
  isArchived: boolean,
): Promise<ActionResult> {
  const session = await requireSession();
  const result = await setItemArchived(session, itemId, isArchived);
  if (result.ok) refresh(itemId);
  return result;
}

