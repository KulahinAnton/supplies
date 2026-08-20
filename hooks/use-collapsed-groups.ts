"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

/**
 * Feature 11 — which shopping groups this person has folded away.
 *
 * A per-person, per-device preference, not household data: one person
 * collapsing "Аптека" must not collapse it for everyone else mid-shop. That
 * makes localStorage the right home, and `useSyncExternalStore` the right way
 * to read it — it gives a server snapshot (nothing collapsed) so the markup
 * matches on hydration, rather than setting state from an effect.
 *
 * Subscribing to `storage` also keeps two open tabs in agreement.
 */

const KEY = "supplies.shopping.collapsed";
const EMPTY = "[]";

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

function getSnapshot(): string {
  try {
    return window.localStorage.getItem(KEY) ?? EMPTY;
  } catch {
    // Private mode or blocked storage — behave as "nothing collapsed".
    return EMPTY;
  }
}

/** The server has no preference, so everything renders expanded. */
const getServerSnapshot = () => EMPTY;

export function useCollapsedGroups(): [
  ReadonlySet<string>,
  (groupId: string) => void,
] {
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const collapsed = useMemo<ReadonlySet<string>>(() => {
    try {
      const parsed: unknown = JSON.parse(raw);
      return new Set(Array.isArray(parsed) ? (parsed as string[]) : []);
    } catch {
      // A corrupt preference is not worth an error; start expanded.
      return new Set<string>();
    }
  }, [raw]);

  const toggle = useCallback((groupId: string) => {
    const current = new Set<string>(JSON.parse(getSnapshot() || EMPTY));
    if (current.has(groupId)) current.delete(groupId);
    else current.add(groupId);

    try {
      window.localStorage.setItem(KEY, JSON.stringify([...current]));
    } catch {
      // Storage unavailable: the toggle simply will not persist.
    }
    notify();
  }, []);

  return [collapsed, toggle];
}
