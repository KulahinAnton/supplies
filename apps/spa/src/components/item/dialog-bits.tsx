import type { ReactNode } from "react";

/**
 * The contract every write on the item page is handed.
 *
 * `null` when it worked; the Ukrainian refusal when it did not — *returned*
 * rather than reported, because most writes here happen inside a dialog with a
 * field the message belongs next to. A shortfall names exactly how much is
 * missing (§3.3), and that sentence has no business appearing in a corner of
 * the screen away from the number that caused it.
 */
export type Write = (work: () => Promise<unknown>) => Promise<string | null>;

export function QuantityField({
  id,
  label,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        inputMode="decimal"
        autoFocus
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="h-8 w-full rounded-lg border border-border bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      />
    </div>
  );
}

export function DialogError({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {children}
    </p>
  );
}
