import { MESSAGES, type MessageKey } from "@supplies/core/messages";
import { Input } from "@supplies/ui/input";
import { Label } from "@supplies/ui/label";

/**
 * Zod messages are keys (§8) — the form is the place that renders them.
 *
 * Exported because every auth form needs it and the alternative was four
 * copies of a three-line function, which is how a catalogue lookup quietly
 * becomes a catalogue lookup and a fallback that differs.
 */
export function messageFor(key?: string): string | undefined {
  if (!key) return undefined;
  return MESSAGES[key as MessageKey] ?? key;
}

/** A labelled input with the room under it that its error message needs. */
export function AuthField({
  id,
  label,
  type = "text",
  autoComplete,
  inputMode,
  value,
  error,
  hint,
  onChange,
}: {
  id: string;
  label: string;
  type?: string;
  autoComplete?: string;
  inputMode?: "email" | "text";
  value: string;
  error?: string;
  hint?: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        autoComplete={autoComplete}
        inputMode={inputMode}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}

/** The refusal the server gave, in the place every auth form puts it. */
export function FormError({ children }: { children: string | null }) {
  if (!children) return null;
  return (
    <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {children}
    </p>
  );
}
