"use client";

import { useCallback, useSyncExternalStore } from "react";
import { isItemSort, type ItemSort } from "@supplies/core/item-sort";

/**
 * Feature 12.2 — how this person likes the stock list ordered.
 *
 * Per-person, per-device, like the shopping group collapse state: it is a
 * reading preference, not household data. Read through `useSyncExternalStore`
 * so the server snapshot ("name") matches the first client render — setting it
 * from an effect would flash the wrong order and trip the lint rule.
 *
 * Shared rather than app-local: both web clients offer the same sort menu, and
 * a second copy of this would be a second answer to "what did this person
 * choose last time". The `"use client"` above is a no-op under Vite and load
 * bearing under Next, which is why it stays.
 */

const KEY = "supplies.items.sort";
const DEFAULT: ItemSort = "name";

const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  if (listeners.size === 0) window.addEventListener("storage", notify);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener("storage", notify);
  };
}

function getSnapshot(): ItemSort {
  try {
    const stored = window.localStorage.getItem(KEY);
    // A stale or hand-edited value must not break the list.
    return isItemSort(stored) ? stored : DEFAULT;
  } catch {
    return DEFAULT;
  }
}

const getServerSnapshot = (): ItemSort => DEFAULT;

/**
 * Feature 27 — `initial` comes from the URL and wins for this render.
 *
 * The two are not in conflict: localStorage is "how I like lists ordered",
 * the URL is "how this particular list was ordered when I left it". Coming
 * Back must restore what was on screen, not a preference set weeks ago; but
 * opening /items fresh, with no sort in the URL, should still honour the
 * preference. So the URL takes precedence only when it says something.
 */
export function useItemSort(
  initial?: string,
): [ItemSort, (sort: ItemSort) => void] {
  const stored = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const sort = isItemSort(initial) ? initial : stored;

  const setSort = useCallback((next: ItemSort) => {
    try {
      window.localStorage.setItem(KEY, next);
    } catch {
      // Storage unavailable: the choice simply will not persist.
    }
    notify();
  }, []);

  return [sort, setSort];
}
