/**
 * Date-only helpers (PROJECT_PROMPT.md §7).
 *
 * Expiry and "opened" dates mean a CALENDAR DAY, not an instant. They are
 * stored as Postgres `date` and handled here as `Date` objects pinned to UTC
 * midnight. Every getter below is a UTC getter: local-time getters would shift
 * the day for anyone east or west of UTC, which is exactly the bug that makes
 * "expires today" render as "expired yesterday" for half the family.
 *
 * Nothing in this file looks at the machine's timezone.
 */

/** A `Date` at UTC midnight of the given calendar day. `month` is 1-based. */
export function dateOnlyUTC(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

/** Strip any time component, keeping the UTC calendar day. */
export function toDateOnly(value: Date): Date {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );
}

/** Parse `YYYY-MM-DD` into a UTC-midnight `Date`. Throws on anything else. */
export function parseDateOnly(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error(`Not a YYYY-MM-DD date: ${value}`);
  const [, y, m, d] = match;
  const date = dateOnlyUTC(Number(y), Number(m), Number(d));
  // Rejects 2026-02-31 and friends, which Date.UTC would silently roll over.
  if (formatDateKey(date) !== value) throw new Error(`Not a real date: ${value}`);
  return date;
}

/** `YYYY-MM-DD` — the storage/comparison key, never shown to the user. */
export function formatDateKey(value: Date): string {
  const y = String(value.getUTCFullYear()).padStart(4, "0");
  const m = String(value.getUTCMonth() + 1).padStart(2, "0");
  const d = String(value.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Today as a UTC-midnight date. Pass an explicit `today` in pure code. */
export function todayUTC(now: Date = new Date()): Date {
  return toDateOnly(now);
}

/** Negative if `a` is earlier, 0 if the same day, positive if later. */
export function compareDateOnly(a: Date, b: Date): number {
  return a.getTime() - b.getTime();
}

export function isSameDay(a: Date, b: Date): boolean {
  return compareDateOnly(a, b) === 0;
}

/** `days` may be negative. */
export function addDays(value: Date, days: number): Date {
  return new Date(
    Date.UTC(
      value.getUTCFullYear(),
      value.getUTCMonth(),
      value.getUTCDate() + days,
    ),
  );
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Whole days from `from` to `to`. Positive when `to` is in the future.
 * Both sides are normalised first, so this is never off-by-one from a stray
 * time component.
 */
export function daysBetween(from: Date, to: Date): number {
  return Math.round(
    (toDateOnly(to).getTime() - toDateOnly(from).getTime()) / MS_PER_DAY,
  );
}
