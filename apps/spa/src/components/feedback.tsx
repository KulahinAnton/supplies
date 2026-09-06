import { Loader2 } from "lucide-react";
import { cn } from "@supplies/ui/utils";

/**
 * Renders whatever the API refused with.
 *
 * `ApiError.message` is the Ukrainian the API rendered from
 * `@supplies/core/messages`, so this shows the same sentence the Next app
 * would for the same refusal — the whole reason the API answers with message
 * keys instead of prose. A non-Error value gets a generic line rather than
 * `String(value)`, which produces "[object Object]" and is worse than saying
 * nothing useful.
 */
export function ErrorNote({ error, className }: { error: unknown; className?: string }) {
  if (!error) return null;
  const message =
    error instanceof Error ? error.message : "Щось пішло не так. Спробуйте ще раз.";

  return (
    <p
      role="alert"
      className={cn(
        "rounded-md border border-destructive/25 bg-destructive/8 px-3 py-2 text-sm text-destructive",
        className,
      )}
    >
      {message}
    </p>
  );
}

/**
 * The Next app has no equivalent, because a server component has nothing to
 * show while it loads — the page arrives rendered. Every screen here needs
 * one, which is the most visible structural difference between the two
 * clients and the one place the SPA is allowed to have a component the web
 * app does not.
 */
export function Spinner({ label = "Завантаження…" }: { label?: string }) {
  return (
    <p className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" />
      {label}
    </p>
  );
}

/** What a card says when its list is empty. Matches the web app's phrasing. */
export function EmptyNote({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-sm text-muted-foreground">{children}</p>;
}
