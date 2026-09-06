import { getHousehold, getItemViews } from "./queries";
import type { Actor } from "./stock-service";
import { actionError, actionOk, type ActionResult } from "../../core/src/action-result";
import { askClaude } from "../../core/src/claude";
import { ruleMessage } from "../../core/src/messages";
import { todayUTC } from "../../core/src/period";
import {
  MIN_PANTRY_LINES,
  RECIPE_SYSTEM_PROMPT,
  buildRecipePrompt,
  estimateCostUsd,
  pantryLines,
} from "../../core/src/recipes";

/**
 * Feature 32 — ask Claude what to cook from what the household actually has.
 *
 * Here rather than in a server action because Feature 34 gave the app a third
 * front end, and the two refusals below are the reason that matters: they are
 * what stops the button spending money, and a client that skipped them would
 * be a client that spends money the others do not.
 *
 * The pantry comes from `getItemViews`, so "what we have" means exactly what
 * the items list means — stock summed from live batches, expiry resolved
 * through the category window. A second notion of the pantry is the one thing
 * this feature must not introduce.
 */
export type RecipeSuggestion = {
  text: string;
  /** Shown so the cost of pressing the button is never a mystery. */
  usage: { input: number; output: number };
  /** Null when the configured model has no price on file — see `estimateCostUsd`. */
  costUsd: number | null;
};

export async function suggestRecipe(
  actor: Actor,
): Promise<ActionResult<RecipeSuggestion>> {
  /**
   * Feature 32.1 — the switch is checked HERE, not only in the navigation.
   * A hidden link is not an access control: this is reachable by anyone signed
   * in to the household, and it is the thing that spends money.
   */
  const household = await getHousehold(actor.householdId);
  if (!household.aiEnabled) return actionError(ruleMessage("recipe.disabled"));

  const lines = pantryLines(await getItemViews(actor.householdId));

  /**
   * Refuse before spending anything. An almost-empty pantry cannot produce a
   * useful answer, and paying a model to say so is worse than saying it here.
   */
  if (lines.length < MIN_PANTRY_LINES) {
    return actionError(ruleMessage("recipe.notEnoughFood"));
  }

  const result = await askClaude(
    RECIPE_SYSTEM_PROMPT,
    buildRecipePrompt(lines, todayUTC()),
  );
  if (!result.ok) return actionError(result.error);

  return actionOk({
    text: result.text,
    usage: result.usage,
    costUsd: estimateCostUsd(result.model, result.usage),
  });
}
