"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Plus, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@supplies/ui/button";
import { Input } from "@supplies/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@supplies/ui/card";
import { moveIdInList } from "@supplies/core/ordering";
import { renderMessage, type RuleMessage } from "@supplies/core/messages";
import { cn } from "@supplies/ui/utils";

export type SettingsRow = {
  id: string;
  name: string;
  itemCount: number;
  isDefault: boolean;
  /**
   * Replaces the "товарів: N" line. Feature 26.4 — a set says how much it
   * holds as well as how many products it holds, which categories and
   * locations have no equivalent of.
   */
  subtitle?: string;
};

type Result = { ok: boolean; error?: RuleMessage };

/**
 * Feature 15 — the shared Settings list: drag to reorder, star a default,
 * delete, add.
 *
 * One component for both categories and storage locations, because the two
 * behaved identically before this feature and would otherwise grow two
 * near-identical drag implementations. The one real difference — a category's
 * expiry window — arrives through `renderExtra` rather than a prop the
 * locations panel would have to ignore.
 */
export function SettingsListPanel({
  title,
  rows,
  addPlaceholder,
  defaultHint,
  dndId,
  onReorder,
  onSetDefault,
  onDelete,
  onAdd,
  renderExtra,
  children,
}: {
  title: string;
  rows: SettingsRow[];
  addPlaceholder: string;
  defaultHint: string;
  /** Explicit, or dnd-kit's aria ids differ between server and client. */
  dndId: string;
  onReorder: (orderedIds: string[]) => Promise<Result>;
  /** Omit where the concept does not apply — Feature 26 groups have no default. */
  onSetDefault?: (id: string) => Promise<Result>;
  onDelete: (id: string) => Promise<Result>;
  onAdd: (name: string) => Promise<Result>;
  renderExtra?: (row: SettingsRow) => ReactNode;
  children?: ReactNode;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  /** Optimistic order, so a drag does not wait for the round trip to show. */
  const [order, setOrder] = useState<string[] | null>(null);

  const ids = order ?? rows.map((row) => row.id);
  const byId = new Map(rows.map((row) => [row.id, row]));
  const ordered = ids.map((id) => byId.get(id)).filter((row) => row !== undefined);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );

  async function run(work: () => Promise<Result>, onOk?: () => void) {
    setPending(true);
    const result = await work();
    setPending(false);
    if (!result.ok && result.error) {
      toast.error(renderMessage(result.error));
      return false;
    }
    onOk?.();
    router.refresh();
    return true;
  }

  async function onDragEnd(event: DragEndEvent) {
    const over = event.over?.id;
    if (!over) return;

    const next = moveIdInList(ids, String(event.active.id), String(over));
    if (next.join() === ids.join()) return;

    setOrder(next);
    const ok = await run(() => onReorder(next));
    // On failure drop back to the server's order rather than showing a lie.
    if (!ok) setOrder(null);
  }

  async function add() {
    if (!draft.trim()) return;
    await run(() => onAdd(draft), () => {
      setDraft("");
      setOrder(null);
      toast.success("Додано");
    });
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        {children}

        <p className="text-xs text-muted-foreground">{defaultHint}</p>

        <DndContext
          id={dndId}
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
        >
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            <ul className="divide-y">
              {ordered.map((row) => (
                <SortableSettingsRow
                  key={row.id}
                  row={row}
                  pending={pending}
                  extra={renderExtra?.(row)}
                  onSetDefault={
                    onSetDefault ? () => run(() => onSetDefault(row.id)) : undefined
                  }
                  onDelete={() =>
                    run(() => onDelete(row.id), () => {
                      setOrder(null);
                      toast.success("Видалено");
                    })
                  }
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>

        <div className="flex gap-2">
          <Input
            value={draft}
            placeholder={addPlaceholder}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void add();
              }
            }}
          />
          <Button disabled={pending || !draft.trim()} onClick={add}>
            <Plus className="size-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function SortableSettingsRow({
  row,
  pending,
  extra,
  onSetDefault,
  onDelete,
}: {
  row: SettingsRow;
  pending: boolean;
  extra?: ReactNode;
  onSetDefault?: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: row.id });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex items-center gap-2 bg-card py-2",
        isDragging && "z-10 opacity-80 shadow-sm",
      )}
    >
      {/* Only the handle drags, or the list could not be scrolled on a phone. */}
      <button
        type="button"
        aria-label={`Перемістити ${row.name}`}
        className="cursor-grab touch-none text-muted-foreground active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>

      <div className="min-w-0 flex-1">
        <div className="truncate text-sm">{row.name}</div>
        <div className="text-xs text-muted-foreground">
          {row.subtitle ??
            (row.itemCount > 0 ? `товарів: ${row.itemCount}` : "порожньо")}
        </div>
      </div>

      {extra}

      {/* No star where "default" is meaningless — a disabled one would still
          look like a setting the user had failed to reach. */}
      {onSetDefault ? (
      <Button
        size="icon"
        variant="ghost"
        aria-label={
          row.isDefault
            ? `Прибрати за замовчуванням: ${row.name}`
            : `Зробити за замовчуванням: ${row.name}`
        }
        aria-pressed={row.isDefault}
        disabled={pending}
        onClick={onSetDefault}
      >
        <Star
          className={cn(
            "size-4",
            row.isDefault
              ? "fill-warning text-warning"
              : "text-muted-foreground",
          )}
        />
      </Button>
      ) : null}

      <Button
        size="icon"
        variant="ghost"
        aria-label={`Видалити ${row.name}`}
        disabled={pending}
        onClick={onDelete}
      >
        <Trash2 className="size-4" />
      </Button>
    </li>
  );
}
