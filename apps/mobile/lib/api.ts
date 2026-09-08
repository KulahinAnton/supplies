import Constants from "expo-constants";
import { Platform } from "react-native";

/**
 * The one place this app knows a URL.
 *
 * **`localhost` is a lie on a phone.** On an Android emulator it means the
 * emulator's own loopback, not the machine running the API, and `10.0.2.2` is
 * the alias for the host. On the iOS simulator `localhost` does work, because
 * it shares the host's network stack. On a REAL device neither helps: it needs
 * the machine's LAN address, which is why `apps/spa`'s Vite config already
 * sets `host: true` and why this reads a configured value first.
 *
 * Getting this wrong is indistinguishable from a dead API — the request fails
 * with the same opaque error — so `app/index.tsx` prints the resolved URL on
 * screen rather than making anyone guess.
 */
export function apiUrl(): string {
  const configured = Constants.expoConfig?.extra?.apiUrl as string | undefined;
  if (configured && !configured.includes("10.0.2.2")) return configured;
  return Platform.OS === "android" ? "http://10.0.2.2:3200" : "http://localhost:3200";
}

async function get<T>(path: string): Promise<T> {
  const response = await fetch(`${apiUrl()}${path}`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return (await response.json()) as T;
}

/** Both are `@Public()` and outside the `/api` prefix — see the API's main.ts. */
export const health = () => get<{ status: "ok"; uptime: number }>("/health");
export const ready = () =>
  get<{ status: "ok" | "degraded"; database: boolean }>("/health/ready");
