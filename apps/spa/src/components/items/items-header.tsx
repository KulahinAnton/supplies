import { Boxes, Plus } from "lucide-react";
import { Link } from "react-router";
import { Button } from "@supplies/ui/button";

/**
 * The title, the count, and the three ways off this screen.
 *
 * «Набори» appears only once there is a set to look at — an empty page reached
 * from a button that is always there is a dead end (Feature 26).
 */
export function ItemsHeader({
  total,
  hasGroups,
}: {
  total: number | undefined;
  hasGroups: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Запаси</h1>
        <p className="text-sm text-muted-foreground">
          {total && total > 0 ? `${total} позицій` : "Поки порожньо"}
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        {hasGroups ? (
          <Button
            variant="outline"
            size="icon"
            aria-label="Набори"
            nativeButton={false}
            render={<Link to="/groups" />}
          >
            <Boxes className="size-4" />
          </Button>
        ) : null}
        <Button nativeButton={false} render={<Link to="/items/new" />}>
          <Plus className="size-4" />
          Додати
        </Button>
      </div>
    </div>
  );
}

/**
 * Feature 3 — the only way back to an archived item.
 *
 * Hidden when the archive is empty, so the link never promises a page with
 * nothing on it, and it carries the count so nobody has to open it to find out
 * whether it is worth opening.
 */
export function ArchiveLink({ count }: { count: number }) {
  if (count === 0) return null;

  return (
    <div className="pt-1 text-center">
      <Link
        to="/items/archive"
        className="text-sm text-muted-foreground hover:text-foreground hover:underline"
      >
        Архів ({count})
      </Link>
    </div>
  );
}

/**
 * Not "no results" — no items at all. A household with an empty cupboard needs
 * a first step, not a filter hint, which is why this replaces the controls
 * rather than sitting under them.
 */
export function EmptyHousehold() {
  return (
    <div className="rounded-lg border border-dashed py-16 text-center">
      <p className="text-sm text-muted-foreground">
        Ще нічого немає. Додайте перший товар — наприклад, воду.
      </p>
      <Button className="mt-4" nativeButton={false} render={<Link to="/items/new" />}>
        <Plus className="size-4" />
        Додати товар
      </Button>
    </div>
  );
}
