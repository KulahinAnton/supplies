import { Plus } from "lucide-react";
import { Link } from "react-router";
import { Button } from "@supplies/ui/button";

/**
 * Feature 16.2 — searching is the first act, creating is the fallback.
 *
 * Most duplicates exist because the person could not find the item they
 * already had, so the create affordance appears *next to the search results*
 * rather than being the obvious path at the top of the page. The query is
 * carried into the form so nothing is retyped.
 *
 * The wording changes with the outcome: after a fruitless search it names what
 * was not found, and after a successful one it asks the quieter question,
 * because offering to create something when eight matches are on screen should
 * not shout.
 */
export function CreateItemPrompt({
  query,
  hasResults,
}: {
  query: string;
  hasResults: boolean;
}) {
  const trimmed = query.trim();
  if (trimmed.length === 0) return null;

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed px-3 py-2">
      <p className="min-w-0 text-xs text-muted-foreground">
        {hasResults ? "Не те, що шукали?" : `Нічого не знайшли за запитом «${trimmed}».`}
      </p>
      <Button
        size="sm"
        variant="outline"
        nativeButton={false}
        render={<Link to={`/items/new?name=${encodeURIComponent(trimmed)}`} />}
      >
        <Plus className="size-3.5" />
        Створити «{trimmed}»
      </Button>
    </div>
  );
}
