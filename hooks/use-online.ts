"use client";

import { useSyncExternalStore } from "react";

/**
 * Feature 31 — whether the browser believes it has a connection.
 *
 * Read through `useSyncExternalStore` for the same reason as the shopping
 * list's collapsed groups: setting it from an effect flashes the wrong state
 * on first paint and trips the react-hooks lint rule. The server snapshot is
 * `true` deliberately — assuming online means a connected user never sees the
 * offline banner blink past on load, and a disconnected one sees it a frame
 * later, which is the right way round.
 *
 * `navigator.onLine` reports the network ADAPTER, not the internet: a phone on
 * café wi-fi with no route out still says true. That is why it is used only to
 * describe the situation on screen, and never to decide whether a write should
 * be attempted — see `submitOrQueue`, which always tries the server first.
 */
function subscribe(onChange: () => void): () => void {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
}
