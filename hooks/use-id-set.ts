"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

/**
 * A set of ids remembered per person, per device (localStorage).
 *
 * Used for the shopping list's collapsed groups and its "show archived"
 * toggles. Both are reading preferences, not household data: one person
 * folding away "Аптека" must not fold it for everyone else mid-shop.
 *
 * Read through `useSyncExternalStore` so the server snapshot (empty set)
 * matches the first client render — setting it from an effect would flash the
 * wrong state and trip the react-hooks lint rule. Subscribing to `storage`
 * also keeps two open tabs in agreement.
 */

const EMPTY = "[]";

export type IdSetStore = {
  useIdSet: () => [ReadonlySet<string>, (id: string) => void];
};

export function createIdSetStore(storageKey: string): IdSetStore {
  const listeners = new Set<() => void>();

  const notify = () => {
    for (const listener of listeners) listener();
  };

  const subscribe = (listener: () => void) => {
    if (listeners.size === 0) window.addEventListener("storage", notify);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) window.removeEventListener("storage", notify);
    };
  };

  const getSnapshot = (): string => {
    try {
      return window.localStorage.getItem(storageKey) ?? EMPTY;
    } catch {
      // Private mode or blocked storage — behave as "nothing remembered".
      return EMPTY;
    }
  };

  const getServerSnapshot = () => EMPTY;

  function useIdSet(): [ReadonlySet<string>, (id: string) => void] {
    const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

    const ids = useMemo<ReadonlySet<string>>(() => {
      try {
        const parsed: unknown = JSON.parse(raw);
        return new Set(Array.isArray(parsed) ? (parsed as string[]) : []);
      } catch {
        // A corrupt preference is not worth an error.
        return new Set<string>();
      }
    }, [raw]);

    const toggle = useCallback((id: string) => {
      const current = new Set<string>(JSON.parse(getSnapshot() || EMPTY));
      if (current.has(id)) current.delete(id);
      else current.add(id);

      try {
        window.localStorage.setItem(storageKey, JSON.stringify([...current]));
      } catch {
        // Storage unavailable: the toggle will not persist.
      }
      notify();
    }, []);

    return [ids, toggle];
  }

  return { useIdSet };
}
