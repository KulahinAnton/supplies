"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Search, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@supplies/ui/button";
import { Input } from "@supplies/ui/input";
import { BarcodeScanButton } from "@supplies/ui/barcode-scan-button";
import {
  addItemToGroupAction,
  removeItemFromGroupAction,
} from "@/lib/actions/settings";
import { renderMessage } from "@supplies/core/messages";

export type MemberRow = { id: string; name: string; quantityLabel: string };
export type CandidateRow = {
  id: string;
  name: string;
  unitLabel: string;
  barcode: string | null;
  currentGroupName: string | null;
  compatible: boolean;
};

/**
 * Feature 26.2 — the membership editor for one set.
 *
 * Deliberately cannot create items. A set is a way of counting things you
 * already track; letting it mint new items would put a second, thinner item
 * form in front of the user and produce items with no category, no location
 * and no stock.
 */
export function GroupMembers({
  groupId,
  members,
  candidates,
}: {
  groupId: string;
  members: MemberRow[];
  candidates: CandidateRow[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState(false);
  const [scanMiss, setScanMiss] = useState<string | null>(null);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    return candidates
      .filter((row) => row.name.toLowerCase().includes(needle))
      .slice(0, 8);
  }, [candidates, query]);

  async function run(work: () => Promise<{ ok: boolean; error?: Parameters<typeof renderMessage>[0] }>) {
    setPending(true);
    const result = await work();
    setPending(false);
    if (!result.ok && result.error) {
      toast.error(renderMessage(result.error));
      return;
    }
    router.refresh();
  }

  /**
   * The search term deliberately SURVIVES an add.
   *
   * Adding used to clear it, which emptied the results after every single
   * item — so filling a set of six meant typing «горошок» six times. The added
   * item leaves the candidate list on its own once the page refreshes, since
   * it is a member now, so what remains on screen is exactly what is still
   * left to add.
   */
  async function add(itemId: string) {
    setScanMiss(null);
    await run(() => addItemToGroupAction(groupId, itemId));
  }

  /**
   * Scanning finds an item the household already has. A code we do not know
   * is NOT an invitation to create one here — say so and stop.
   */
  function onScan(code: string) {
    const found = candidates.find((row) => row.barcode === code);
    if (!found) {
      setScanMiss(code);
      return;
    }
    if (!found.compatible) {
      toast.error("У наборі всі товари мають бути в однакових одиницях виміру.");
      return;
    }
    void add(found.id);
  }

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setScanMiss(null);
              }}
              placeholder="Знайти товар за назвою…"
              className="pl-9"
              type="search"
            />
          </div>
          <BarcodeScanButton onScan={onScan} />
        </div>

        {scanMiss ? (
          <p className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
            Штрихкоду{" "}
            <span className="font-medium text-foreground">{scanMiss}</span> немає
            серед ваших товарів. Спочатку створіть товар у{" "}
            <Link href="/items/new" className="text-primary underline underline-offset-4">
              «Запаси»
            </Link>
            , потім додайте його сюди.
          </p>
        ) : null}

        {matches.length > 0 ? (
          <ul className="divide-y rounded-lg border">
            {matches.map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{row.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {row.unitLabel}
                    {/* Say where it is now, so a move is never a surprise. */}
                    {row.currentGroupName ? ` · зараз у «${row.currentGroupName}»` : ""}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending || !row.compatible}
                  title={row.compatible ? undefined : "Інша одиниця виміру"}
                  onClick={() => add(row.id)}
                >
                  <Plus className="size-3.5" />
                  Додати
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {members.length === 0 ? (
        <p className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
          У наборі поки нічого немає. Порожній набір не нагадує про себе.
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {members.map((member) => (
            <li key={member.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
              <Link href={`/items/${member.id}`} className="min-w-0 hover:underline">
                <div className="truncate text-sm font-medium">{member.name}</div>
                <div className="text-xs text-muted-foreground">
                  {member.quantityLabel}
                </div>
              </Link>
              <Button
                size="icon"
                variant="ghost"
                aria-label={`Прибрати ${member.name} з набору`}
                disabled={pending}
                onClick={() => run(() => removeItemFromGroupAction(member.id))}
              >
                <X className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
