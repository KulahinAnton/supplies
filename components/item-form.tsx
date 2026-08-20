"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { BarcodeScanButton } from "@/components/barcode-scan-button";
import { createItemAction, updateItemAction } from "@/lib/actions/items";
import { MESSAGES, renderMessage, type MessageKey } from "@/lib/messages";
import { itemSchema } from "@/lib/validation/item";
import { UNIT_PLURAL } from "@/lib/format";
import type { Unit } from "@/lib/generated/prisma/enums";

type Values = z.infer<typeof itemSchema>;

function messageFor(key?: string) {
  if (!key) return undefined;
  return MESSAGES[key as MessageKey] ?? key;
}

const UNIT_OPTIONS: { value: Unit; label: string }[] = (
  Object.keys(UNIT_PLURAL) as Unit[]
).map((unit) => ({ value: unit, label: UNIT_PLURAL[unit].many }));

export function ItemForm({
  categories,
  locations,
  item,
  hasBatches,
}: {
  categories: { id: string; name: string }[];
  locations: { id: string; name: string }[];
  item?: {
    id: string;
    name: string;
    categoryId: string;
    locationId: string | null;
    unit: Unit;
    minQty: string;
    barcode: string | null;
    notes: string | null;
  };
  hasBatches?: boolean;
}) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(itemSchema),
    defaultValues: {
      name: item?.name ?? "",
      categoryId: item?.categoryId ?? categories[0]?.id ?? "",
      locationId: item?.locationId ?? "",
      unit: item?.unit ?? "PIECE",
      minQty: item?.minQty ?? "0",
      barcode: item?.barcode ?? undefined,
      notes: item?.notes ?? undefined,
    },
  });

  async function onSubmit(values: Values) {
    setFormError(null);
    const result = item
      ? await updateItemAction({ ...values, id: item.id })
      : await createItemAction(values);

    if (!result.ok) {
      setFormError(renderMessage(result.error));
      return;
    }

    toast.success(item ? "Збережено" : "Товар додано");
    const createdId = "data" in result ? result.data?.id : undefined;
    router.push(item ? `/items/${item.id}` : `/items/${createdId ?? ""}`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
      <div className="space-y-2">
        <Label htmlFor="name">Назва</Label>
        <Input id="name" placeholder="Вода негазована 1,5 л" {...register("name")} />
        {errors.name ? (
          <p className="text-sm text-destructive">{messageFor(errors.name.message)}</p>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="categoryId">Категорія</Label>
          <select
            id="categoryId"
            className="h-9 w-full rounded-md border bg-transparent px-3 text-sm shadow-xs"
            {...register("categoryId")}
          >
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="locationId">Де зберігається</Label>
          <select
            id="locationId"
            className="h-9 w-full rounded-md border bg-transparent px-3 text-sm shadow-xs"
            {...register("locationId")}
          >
            <option value="">Не вказано</option>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="unit">Одиниця виміру</Label>
          <select
            id="unit"
            className="h-9 w-full rounded-md border bg-transparent px-3 text-sm shadow-xs disabled:opacity-60"
            disabled={hasBatches}
            {...register("unit")}
          >
            {UNIT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {hasBatches ? (
            <p className="text-xs text-muted-foreground">
              Одиницю не можна змінити, поки є партії — інакше наявні кількості
              означали б інше.
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="minQty">Мінімальний запас</Label>
          <Input id="minQty" inputMode="decimal" {...register("minQty")} />
          <p className="text-xs text-muted-foreground">
            Нижче цього — потрапляє до списку покупок. 0 — не нагадувати.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="barcode">Штрихкод</Label>
        <div className="flex gap-2">
          <Input
            id="barcode"
            inputMode="numeric"
            placeholder="Необов&apos;язково"
            {...register("barcode")}
          />
          <BarcodeScanButton
            onScan={(code) => setValue("barcode", code, { shouldValidate: true })}
          />
        </div>
        {errors.barcode ? (
          <p className="text-sm text-destructive">
            {messageFor(errors.barcode.message)}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Нотатки</Label>
        <Textarea id="notes" rows={3} {...register("notes")} />
      </div>

      {formError ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {formError}
        </p>
      ) : null}

      <div className="flex gap-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Зберігаємо…" : "Зберегти"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.back()}>
          Скасувати
        </Button>
      </div>
    </form>
  );
}
