import type { ReactNode } from "react";
import { cn } from "@supplies/ui/utils";

/**
 * A filter pill. Lives here rather than in `packages/ui` on purpose: it is one
 * screen's control with one screen's active state, and moving it would be
 * sharing for the sake of sharing.
 */
export function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-full border px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-accent",
      )}
    >
      {children}
    </button>
  );
}
