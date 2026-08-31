"use client";

import { useEffect } from "react";

/**
 * Feature 31, stage 0 — registers `public/sw.js`.
 *
 * Development is excluded on purpose. Turbopack rewrites chunk URLs on every
 * edit, so a cache-first rule for `/_next/static/` would serve yesterday's
 * module and produce hydration errors that look like application bugs. To try
 * it locally, build and start:
 *
 *     pnpm build && AUTH_TRUST_HOST=true pnpm start
 *
 * and delete `.next` afterwards, or the dev server inherits a production build
 * and rejects its own host.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    // Registration failing is not worth an error anyone sees: the app works
    // exactly as it did before, it simply will not open offline.
    navigator.serviceWorker
      .register("/sw.js")
      .catch((error) => console.error("[sw] registration failed:", error));
  }, []);

  return null;
}

/**
 * Empties the caches on sign-out. The cached pages are one household's private
 * data rendered on the server; leaving them readable to whoever signs in next
 * on this device would be a leak, not an inconvenience.
 *
 * Exported separately because it has to run BEFORE `signOut` navigates away.
 */
export async function clearOfflineCaches(): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    registration?.active?.postMessage("clear-caches");
  } catch (error) {
    console.error("[sw] cache clear failed:", error);
  }
}
