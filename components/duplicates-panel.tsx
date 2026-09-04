import Link from "next/link";
import { Copy } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { NamedItem } from "@supplies/core/duplicates";

/**
 * Feature 16.3 — items whose names look like each other.
 *
 * Reports only. Merging batches and movements across two items is a separate,
 * larger job; the tool available today is archiving the emptier of a pair,
 * which keeps its history and is reversible.
 *
 * A server component: the grouping is already done on the server and nothing
 * here is interactive.
 */
export function DuplicatesPanel({ groups }: { groups: NamedItem[][] }) {
  // No duplicates is the normal state — an empty card would be noise.
  if (groups.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Copy className="size-4 text-warning" />
          Схожі товари
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        <p className="text-xs text-muted-foreground">
          Назви цих товарів схожі — можливо, це одне й те саме, додане двічі.
          Якщо так, перенесіть зайвий в архів на його сторінці: запас і історія
          збережуться.
        </p>

        <ul className="space-y-2">
          {groups.map((group) => (
            <li
              key={group[0].id}
              className="rounded-md border px-3 py-2"
            >
              <ul className="flex flex-wrap gap-x-2 gap-y-1">
                {group.map((item, index) => (
                  <li key={item.id} className="text-sm">
                    <Link
                      href={`/items/${item.id}`}
                      className="text-primary underline underline-offset-4"
                    >
                      {item.name}
                    </Link>
                    {index < group.length - 1 ? (
                      <span className="text-muted-foreground"> ·</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
