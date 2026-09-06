import { cn } from "./utils";
import type { ExpiryState } from "@supplies/core/expiry";
import type { StockState } from "@supplies/core/stock";
import { formatExpiryLabel } from "@supplies/core/format";

/**
 * The two state axes are shown as two separate chips on purpose (§3.4/§3.5):
 * an item can be well stocked AND half-expired, and collapsing that into one
 * badge would hide whichever half is worse.
 */

const STOCK_LABEL: Record<StockState, string> = {
  OUT: "Закінчився",
  LOW: "Закінчується",
  OK: "Вистачає",
};

const STOCK_CLASS: Record<StockState, string> = {
  OUT: "bg-destructive/12 text-destructive border-destructive/25",
  LOW: "bg-warning/15 text-warning-foreground border-warning/30 dark:text-warning",
  OK: "bg-success/12 text-success-foreground border-success/25 dark:text-success",
};

export function StockBadge({
  state,
  className,
}: {
  state: StockState;
  className?: string;
}) {
  return (
    <span className={cn(chipBase, STOCK_CLASS[state], className)}>
      {STOCK_LABEL[state]}
    </span>
  );
}

const EXPIRY_CLASS: Record<ExpiryState, string> = {
  EXPIRED: "bg-destructive/12 text-destructive border-destructive/25",
  SOON: "bg-warning/15 text-warning-foreground border-warning/30 dark:text-warning",
  FRESH: "bg-muted text-muted-foreground border-border",
  NONE: "bg-muted text-muted-foreground border-border",
};

const chipBase =
  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap";

export function ExpiryBadge({
  state,
  date,
  today,
  className,
}: {
  state: ExpiryState;
  date: Date | null;
  today: Date;
  className?: string;
}) {
  if (state === "NONE" || !date) return null;

  // The phrase names its own state, so there is no prefix here to disagree
  // with `state` — that disagreement was the bug. Only the capital is ours.
  const phrase = formatExpiryLabel(date, today);
  const label = phrase.charAt(0).toUpperCase() + phrase.slice(1);

  return (
    <span className={cn(chipBase, EXPIRY_CLASS[state], className)}>{label}</span>
  );
}
