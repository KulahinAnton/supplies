import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth-guard";
import { getHousehold, getItemViews } from "@/lib/queries.rsc";
import { pantryLines } from "@/lib/recipes";
import { RecipePanel } from "@/components/recipe-panel";

/**
 * Feature 32 — «Рецепти».
 *
 * The page renders without asking Claude anything. The model is consulted only
 * when someone presses the button, because every render would otherwise be a
 * charge — and a suggestion nobody asked for is not worth paying for.
 *
 * What the page DOES show for free is how many things it would consider and
 * what is about to spoil, so the button's answer is not a surprise.
 */
/**
 * The one route in this app that waits on a third party. 30s gives the Claude
 * call (12s, one retry) room to fail on its own terms and return the Ukrainian
 * error, rather than being cut off mid-request by the platform default.
 */
export const maxDuration = 30;

export default async function RecipesPage() {
  const session = await requireSession();

  // Feature 32.1 — reachable by typing the URL even with the tab hidden.
  // Redirect rather than 404: the page exists, this household just has the
  // helper switched off, and Settings is where that is changed.
  const household = await getHousehold(session.householdId);
  if (!household.aiEnabled) redirect("/settings");

  const items = await getItemViews(session.householdId);
  const lines = pantryLines(items);
  const urgent = items.filter((item) => item.expiry === "SOON");

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Рецепти</h1>
        <p className="text-sm text-muted-foreground">
          Підкажемо страву з того, що вже є вдома.
        </p>
      </div>

      <div className="rounded-lg border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
        Врахуємо позицій: {lines.length}
        {urgent.length > 0 ? (
          <>
            {" · "}
            <span className="text-warning-foreground dark:text-warning">
              скоро зіпсується: {urgent.length}
            </span>
          </>
        ) : null}
        {/* Said plainly, because a recipe suggesting spoiled food would be
            worse than no recipe at all. */}
        <div className="mt-1 text-xs">
          Прострочене не пропонуємо.
        </div>
      </div>

      <RecipePanel />
    </div>
  );
}
