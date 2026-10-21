import { UNIT_PLURAL } from "@supplies/core/format";
import { MESSAGES, type MessageKey } from "@supplies/core/messages";
import type { Unit } from "@supplies/core/units";

/**
 * What a barcode turned out to be — the shape `@supplies/db/barcode-service`
 * answers with, which the API passes through unchanged.
 */
export type BarcodeLookup =
  | { kind: "existing"; itemId: string; name: string }
  | { kind: "product"; suggestedName: string }
  | { kind: "unknown"; manufacturer: string | null; canShare: boolean };

export type Values = {
  name: string;
  categoryId: string;
  locationId: string;
  groupId: string;
  unit: Unit;
  minQty: string;
  barcode: string;
  notes: string;
  shareToOff: boolean;
};

export const UNIT_OPTIONS: { value: Unit; label: string }[] = (
  Object.keys(UNIT_PLURAL) as Unit[]
).map((unit) => ({ value: unit, label: UNIT_PLURAL[unit].many }));

/** Zod messages are keys (§8) — the form is the place that renders them. */
export function messageFor(key?: string): string | undefined {
  if (!key) return undefined;
  return MESSAGES[key as MessageKey] ?? key;
}
