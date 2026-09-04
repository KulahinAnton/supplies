import type { ReactNode } from "react";
import type { ExpiryState, StockState } from "../api/types";

/**
 * The handful of primitives these screens need.
 *
 * Deliberately small. The Next app's 22 shadcn/Base UI primitives port to a
 * Vite build almost unchanged — they are DOM React and Tailwind and do not care
 * what rendered them — and SPA_API_PORT.md Phase 2.1 copies them across when
 * the screens that need them arrive. Reaching for the whole set now would be
 * carrying 22 files to render four.
 */

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-neutral-200 bg-white p-4 ${className}`}>
      {children}
    </div>
  );
}

export function Button({
  children,
  onClick,
  type = "button",
  variant = "primary",
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  variant?: "primary" | "ghost";
  disabled?: boolean;
}) {
  const styles =
    variant === "primary"
      ? "bg-emerald-700 text-white hover:bg-emerald-800 disabled:bg-neutral-300"
      : "border border-neutral-200 text-neutral-700 hover:bg-neutral-50";
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-md px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed ${styles}`}
    >
      {children}
    </button>
  );
}

/**
 * Stock and expiry are two independent axes (PROJECT_PROMPT.md §3.4): an item
 * whose only stock is expired reads OK by quantity while the expiry badge says
 * otherwise. Merging them into one badge would hide "you have 10 bottles, 2 of
 * which went off".
 */
export function StockBadge({ state }: { state: StockState }) {
  if (state === "OK") return null;
  const label = state === "OUT" ? "Немає" : "Закінчується";
  const tone = state === "OUT" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700";
  return <span className={`rounded-full px-2 py-0.5 text-xs ${tone}`}>{label}</span>;
}

export function ExpiryBadge({ state }: { state: ExpiryState }) {
  if (state === "FRESH" || state === "NONE") return null;
  const label = state === "EXPIRED" ? "Прострочено" : "Скоро зіпсується";
  const tone =
    state === "EXPIRED" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700";
  return <span className={`rounded-full px-2 py-0.5 text-xs ${tone}`}>{label}</span>;
}

/**
 * Renders whatever the API refused with.
 *
 * `ApiError.message` is the Ukrainian the API rendered from its own message
 * catalogue, so this shows the same sentence the web app would for the same
 * refusal. A non-Error value gets a generic line rather than
 * `String(value)` — stringifying an unknown object produces
 * "[object Object]", which is worse than saying nothing useful.
 */
export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  const message =
    error instanceof Error ? error.message : "Щось пішло не так. Спробуйте ще раз.";
  return <p className="text-sm text-red-600">{message}</p>;
}

export function Spinner({ label = "Завантаження…" }: { label?: string }) {
  return <p className="text-sm text-neutral-500">{label}</p>;
}
