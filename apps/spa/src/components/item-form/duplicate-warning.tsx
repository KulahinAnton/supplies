import { Link } from "react-router";
import type { NamedItem } from "@supplies/core/duplicates";

/**
 * Feature 16.1 — warn while typing, never block.
 *
 * Most duplicates exist because someone could not find the item they already
 * had, so the warning links to the matches: the useful action is almost always
 * "go top that one up", not "do not create this". Blocking would be wrong —
 * two genuinely different products can have similar names, and the person
 * holding both knows better than the matcher does.
 */
export function DuplicateWarning({ matches }: { matches: NamedItem[] }) {
  if (matches.length === 0) return null;

  return (
    <div className="rounded-md bg-warning/12 px-3 py-2 text-sm">
      <p className="text-warning-foreground dark:text-warning">
        {matches.length === 1
          ? "Схоже, такий товар уже є:"
          : "Схоже, такі товари вже є:"}
      </p>
      <ul className="mt-1 space-y-0.5">
        {matches.slice(0, 3).map((match) => (
          <li key={match.id}>
            <Link
              to={`/items/${match.id}`}
              className="text-primary underline underline-offset-4"
            >
              {match.name}
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-1 text-xs text-muted-foreground">
        Якщо це той самий товар — краще поповнити його запас.
      </p>
    </div>
  );
}
