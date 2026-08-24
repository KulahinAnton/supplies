"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { BarcodeScanButton } from "@/components/barcode-scan-button";
import { createItemAction, updateItemAction } from "@/lib/actions/items";
import {
  lookupBarcodeAction,
  type BarcodeLookup,
} from "@/lib/actions/barcode";
import { MESSAGES, renderMessage, type MessageKey } from "@/lib/messages";
import { itemSchema } from "@/lib/validation/item";
import { defaultRowId } from "@/lib/ordering";
import { findSimilar } from "@/lib/duplicates";
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
  existingItems = [],
  initialName,
  initialBarcode,
}: {
  categories: { id: string; name: string; isDefault: boolean }[];
  /** Feature 16.1 — every item name in the household, for the duplicate check. */
  existingItems?: { id: string; name: string }[];
  /** Feature 16.2 — carried from the /items search, so nothing is retyped. */
  initialName?: string;
  /** Feature 21 — carried from a scan on /items that matched nothing. */
  initialBarcode?: string;
  locations: { id: string; name: string; isDefault: boolean }[];
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
  const [lookup, setLookup] = useState<BarcodeLookup | null>(null);
  const [looking, setLooking] = useState(false);
  /** Last code already looked up, so a blur without an edit does not refetch. */
  const [lookedUp, setLookedUp] = useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    setValue,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(itemSchema),
    defaultValues: {
      name: item?.name ?? initialName ?? "",
      // Feature 15.2 — a new item opens on the starred category and location.
      // An existing item keeps its own, obviously.
      categoryId:
        item?.categoryId ?? defaultRowId(categories, true) ?? "",
      locationId: item?.locationId ?? defaultRowId(locations, false) ?? "",
      unit: item?.unit ?? "PIECE",
      minQty: item?.minQty ?? "0",
      barcode: item?.barcode ?? initialBarcode ?? undefined,
      notes: item?.notes ?? undefined,
    },
  });

  // Feature 16.1 — recomputed as the name changes; excludes the item being
  // edited so it never flags itself. `useWatch` rather than `watch()`: it
  // subscribes to one field instead of re-rendering the whole form on every
  // keystroke, and it does not trip the React Compiler lint rule.
  const typedName = useWatch({ control, name: "name" });
  const similar = findSimilar(typedName ?? "", existingItems, item?.id);

  /**
   * A scan writes the code, then asks the server what it is. The name is only
   * pre-filled when the field is still EMPTY — silently overwriting something
   * the user typed would be worse than not helping at all.
   */
  async function onBarcodeScanned(code: string) {
    setValue("barcode", code, { shouldValidate: true });
    setLookedUp(code);
    setLookup(null);
    setLooking(true);

    const result = await lookupBarcodeAction(code);
    setLooking(false);

    if (!result.ok) {
      setLookup(null);
      return;
    }

    setLookup(result.data);

    if (result.data.kind === "product" && !getValues("name").trim()) {
      setValue("name", result.data.suggestedName, { shouldValidate: true });
    }
  }

  /**
   * Feature 21 — arriving here from a scan should behave like scanning here.
   * The field is already filled, so the blur handler that normally starts the
   * lookup never fires; without this the user would have to click into the
   * barcode box and back out to get the name suggestion they just earned.
   *
   * Scheduled rather than called directly because the lookup sets state, and
   * doing that synchronously inside an effect is what causes cascading
   * renders — the React Compiler lint is right to reject it. A task boundary
   * makes this identical to the user having triggered it. It runs once:
   * `lookedUp` stops any re-render from re-asking.
   */
  useEffect(() => {
    if (!initialBarcode || item) return;
    const handle = setTimeout(() => void onBarcodeScanned(initialBarcode), 0);
    return () => clearTimeout(handle);
    // Mount only: a one-shot handover from the previous page, not a reaction
    // to state that could loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

        {/*
          Feature 16.1 — warn while typing, never block. Matching runs on the
          client against names already sent with the page: the list is small,
          and a warning that needs a round trip arrives too late to be read.
        */}
        {similar.length > 0 ? (
          <div className="rounded-md bg-warning/12 px-3 py-2 text-sm">
            <p className="text-warning-foreground dark:text-warning">
              {similar.length === 1
                ? "Схоже, такий товар уже є:"
                : "Схоже, такі товари вже є:"}
            </p>
            <ul className="mt-1 space-y-0.5">
              {similar.slice(0, 3).map((match) => (
                <li key={match.id}>
                  <Link
                    href={`/items/${match.id}`}
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
        ) : null}

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
            {...register("barcode", {
              // Typing or pasting a code should do exactly what scanning does —
              // the camera is a convenience, not the only way in.
              onBlur: (event: React.FocusEvent<HTMLInputElement>) => {
                const code = event.target.value.trim();
                if (code && code !== lookedUp) void onBarcodeScanned(code);
              },
            })}
          />
          <BarcodeScanButton onScan={onBarcodeScanned} />
        </div>

        {/*
          Feature 10 — a scan is only worth the camera if it saves typing, so
          it fills the name from Open Food Facts. The lookup NEVER blocks: a
          miss (their Ukrainian coverage is patchy) just leaves the field as
          you found it.
        */}
        {lookup ? (
          <p
            className={
              lookup.kind === "existing"
                ? "text-sm text-warning-foreground dark:text-warning"
                : "text-sm text-muted-foreground"
            }
          >
            {lookup.kind === "existing" ? (
              <>
                Такий штрихкод уже має{" "}
                <Link
                  href={`/items/${lookup.itemId}`}
                  className="text-primary underline underline-offset-4"
                >
                  {lookup.name}
                </Link>
                . Можливо, варто просто поповнити його запас.
              </>
            ) : lookup.kind === "product" ? (
              "Назву підставлено з Open Food Facts — перевірте й виправте за потреби."
            ) : lookup.manufacturer ? (
              /*
                Feature 20 — GS1 Ukraine knows who licensed the number even
                when no product database knows the product. Naming the maker
                is a real head start on typing the name; claiming it IS the
                name would be a lie, so it is worded as a separate fact.
              */
              <>
                Цього штрихкоду немає у відкритих базах. За даними GS1 Україна,
                виробник — <strong className="font-medium">{lookup.manufacturer}</strong>.
                Введіть назву вручну.
              </>
            ) : (
              "Цього штрихкоду немає у відкритих базах. Введіть назву вручну."
            )}
          </p>
        ) : null}

        {/*
          Feature 18.2 — opt-in, unchecked by default. Publishing a product to
          Open Food Facts sends data to a third party, which must be a decision
          rather than a side effect of saving an item. Only offered when the
          lookup missed AND credentials exist, so it never silently does
          nothing.
        */}
        {lookup?.kind === "unknown" && lookup.canShare ? (
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 size-4"
              {...register("shareToOff")}
            />
            <span className="text-muted-foreground">
              Поділитися назвою й штрихкодом з Open Food Facts — щоб наступного
              разу цей товар знайшовся сам, і не лише у вас.
            </span>
          </label>
        ) : null}
        {looking ? (
          <p className="text-sm text-muted-foreground">Шукаємо товар…</p>
        ) : null}

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
