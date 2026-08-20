"use client";

import { useCallback, useSyncExternalStore } from "react";
import { isItemSort, type ItemSort } from "@/lib/item-sort";

/**
 * Feature 12.2 — how this person likes the stock list ordered.
 *
 * Per-person, per-device, like the shopping group collapse state: it is a
 * reading preference, not household data. Read through `useSyncExternalStore`
 * so the server snapshot ("name") matches the first client render — setting it
 * from an effect would flash the wrong order and trip the lint rule.
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

export function useItemSort(): [ItemSort, (sort: ItemSort) => void] {
  const sort = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

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
