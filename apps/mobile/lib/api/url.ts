import { Platform } from "react-native";

/**
 * The one place this app knows a URL.
 *
 * `EXPO_PUBLIC_API_URL` is inlined at build time, exactly as `VITE_API_URL` is
 * for the SPA — one pattern for both clients, and no domain written into this
 * source tree (SPA_API_PORT.md §4.2).
 *
 * **`localhost` is a lie on a phone**, which is why there is a fallback at all.
 * On an Android emulator it means the emulator's own loopback and the host
 * machine is `10.0.2.2`; on the iOS simulator `localhost` works, because it
 * shares the host's network stack; on a REAL device neither helps and it needs
 * the machine's LAN address, which is what the environment variable is for.
 *
 * Getting this wrong is indistinguishable from a dead API — the request fails
 * with the same opaque error — so the status screen prints the resolved value
 * rather than making anyone guess.
 */
export function apiUrl(): string {
  const configured = process.env.EXPO_PUBLIC_API_URL;
  if (configured) return configured;
  return Platform.OS === "android" ? "http://10.0.2.2:3200" : "http://localhost:3200";
}
