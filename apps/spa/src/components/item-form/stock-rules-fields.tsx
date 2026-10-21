import { Input } from "@supplies/ui/input";
import { Label } from "@supplies/ui/label";
import type { GroupView } from "../../api/types";
import { SelectField } from "./select-field";
import { UNIT_OPTIONS, type Values } from "./types";

/**
 * The three fields that decide how this item is counted: its unit, its
 * threshold, and the set it belongs to.
 *
 * They are one component because two rules bind them together, and splitting
 * them would put those rules in a parent that has no other reason to know:
 *
 * - **§3.2** locks the unit once there are batches, because changing it would
 *   silently reinterpret every quantity already recorded.
 * - **Feature 26** moves the threshold to the SET when the item joins one.
 *   Showing the field anyway would be showing a setting that does nothing,
 *   which is worse than not offering it — so the field is *replaced* by a
 *   pointer to where the number actually lives.
 */
export function StockRulesFields({
  values,
  itemGroups,
  hasBatches,
  onChange,
}: {
  values: Values;
  itemGroups: GroupView[];
  hasBatches: boolean;
  onChange: <K extends keyof Values>(key: K, value: Values[K]) => void;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <SelectField
        id="unit"
        label="Одиниця виміру"
        value={values.unit}
        disabled={hasBatches}
        onChange={(value) => onChange("unit", value as Values["unit"])}
        hint={
          hasBatches
            ? "Одиницю не можна змінити, поки є партії — інакше наявні кількості означали б інше."
            : undefined
        }
      >
        {UNIT_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </SelectField>

      {values.groupId ? (
        <div className="space-y-2">
          <Label>Мінімальний запас</Label>
          <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
            Задається для набору — у «Налаштування → Набори товарів».
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <Label htmlFor="minQty">Мінімальний запас</Label>
          <Input
            id="minQty"
            inputMode="decimal"
            value={values.minQty}
            onChange={(event) => onChange("minQty", event.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Нижче цього — потрапляє до списку покупок. 0 — не нагадувати, навіть
            коли товар закінчиться.
          </p>
        </div>
      )}

      {/* No sets in the household, no picker: an empty dropdown is a question
          with no answers. */}
      {itemGroups.length > 0 ? (
        <SelectField
          id="groupId"
          label="Набір"
          value={values.groupId}
          onChange={(value) => onChange("groupId", value)}
          hint="Взаємозамінні товари рахуються разом — мінімум один на весь набір."
        >
          <option value="">Без набору</option>
          {itemGroups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.name}
            </option>
          ))}
        </SelectField>
      ) : null}
    </div>
  );
}
