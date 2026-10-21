import { useState } from "react";
import { ArrowUpRight, Check } from "lucide-react";
import { Link } from "react-router";
import { toast } from "sonner";
import { UNIT_SHORT, formatQuantityWithUnit } from "@supplies/core/format";
import { Button } from "@supplies/ui/button";
import { Input } from "@supplies/ui/input";
import { SettingsListPanel } from "@supplies/ui/settings-list-panel";
import { api } from "../../api/client";
import type { GroupView } from "../../api/types";
import { useWrite } from "../../hooks/use-settings-write";

/**
 * Feature 26 — sets of interchangeable items. Same panel minus the default
 * star (a set has no "default" to be) and plus the threshold, which is the
 * whole point: one minimum for the set instead of one per brand.
 */
export function ItemGroupPanel({ groups }: { groups: GroupView[] }) {
  const { write, pending } = useWrite();
  const [edited, setEdited] = useState<Record<string, string>>({});

  return (
    <SettingsListPanel
      title="Набори товарів"
      dndId="settings-item-groups"
      rows={groups.map((group) => ({
        id: group.id,
        name: group.name,
        itemCount: group.memberCount,
        isDefault: false,
        // Feature 26.4 — how much, not only how many. The minimum being typed
        // two fields away is chosen by comparing it against this number.
        subtitle:
          group.unit === null
            ? undefined
            : `товарів: ${group.memberCount} · разом ${formatQuantityWithUnit(group.quantity, group.unit)}`,
      }))}
      addPlaceholder="Новий набір"
      defaultHint="Один мінімум на кілька взаємозамінних товарів — наприклад, молоко різних марок. Перетягніть, щоб змінити порядок."
      onReorder={(ids) => write(() => api.post("/api/settings/groups/reorder", { ids }))}
      onDelete={(id) => write(() => api.del(`/api/settings/groups/${id}`))}
      onAdd={(name) =>
        write(() => api.post("/api/settings/groups", { name, minQty: "0" }))
      }
      renderExtra={(base) => {
        const group = groups.find((g) => g.id === base.id);
        if (!group) return null;

        const value = edited[group.id] ?? group.minQty;
        const dirty = edited[group.id] !== undefined && edited[group.id] !== group.minQty;

        return (
          <div className="flex items-center gap-1.5">
            {/* The threshold lives here; what is IN the set lives on its own
                page, which is where you add and remove members. */}
            <Button
              size="icon"
              variant="ghost"
              aria-label={`Відкрити набір ${group.name}`}
              nativeButton={false}
              render={<Link to={`/groups/${group.id}`} />}
            >
              <ArrowUpRight className="size-4" />
            </Button>
            <Input
              className="h-8 w-20"
              inputMode="decimal"
              aria-label={`Мінімум для набору ${group.name}`}
              value={value}
              onChange={(event) => setEdited({ ...edited, [group.id]: event.target.value })}
            />
            <span className="w-8 text-xs text-muted-foreground">
              {/* No members yet means no unit to count in — say nothing rather
                  than guess one. */}
              {group.unit ? UNIT_SHORT[group.unit] : "—"}
            </span>
            {dirty ? (
              <Button
                size="icon"
                variant="ghost"
                aria-label="Зберегти мінімум"
                disabled={pending}
                onClick={() =>
                  void write(async () => {
                    await api.post("/api/settings/groups", {
                      id: group.id,
                      name: group.name,
                      minQty: edited[group.id],
                    });
                    const next = { ...edited };
                    delete next[group.id];
                    setEdited(next);
                    toast.success("Збережено");
                  })
                }
              >
                <Check className="size-4" />
              </Button>
            ) : null}
          </div>
        );
      }}
    />
  );
}
