import type { ReactNode } from "react";
import { Label } from "@supplies/ui/label";

/**
 * A labelled `<select>`.
 *
 * Native rather than a Base UI listbox on purpose: on a phone this opens the
 * platform's own picker, which is bigger, scrollable with one thumb, and
 * already familiar. A custom popover would look more consistent with the rest
 * of the form and be worse to use in a kitchen, which is where this form is
 * used.
 *
 * The four selects on this screen were four copies of the same markup and the
 * same 190-character class string before this existed.
 */
export function SelectField({
  id,
  label,
  value,
  onChange,
  disabled,
  hint,
  children,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-60"
        disabled={disabled}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {children}
      </select>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
