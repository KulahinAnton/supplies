import Constants from "expo-constants";
import { Platform } from "react-native";

const API_PORT = 3200;

/**
 * The one place this app knows a URL.
 *
 * `EXPO_PUBLIC_API_URL` is inlined at build time, exactly as `VITE_API_URL` is
 * for the SPA — one pattern for both clients, and no domain written into this
 * source tree (docs/ARCHITECTURE.md §5). When it is set, it wins, always.
 *
 * **`localhost` is a lie on a phone**, which is why the fallbacks exist. On an
 * Android emulator it means the emulator's own loopback and the host machine is
 * `10.0.2.2`; on the iOS simulator `localhost` works, because it shares the
 * host's network stack; on a REAL device neither helps — and `10.0.2.2` is
 * worse than useless there, because it is routable-looking: the request leaves
 * for the Wi-Fi router, nothing answers, and without the timeout in `client.ts`
 * the sign-in button spun forever. That is how this was found.
 *
 * Getting this wrong is indistinguishable from a dead API, so the error a
 * request fails with names the address it tried, and the status screen prints
 * the resolved value rather than making anyone guess.
 */
export function apiUrl(): string {
  const configured = process.env.EXPO_PUBLIC_API_URL;
  if (configured) return configured;

  const devHost = devServerHost();
  if (devHost) return `http://${devHost}:${API_PORT}`;

  return Platform.OS === "android"
    ? `http://10.0.2.2:${API_PORT}`
    : `http://localhost:${API_PORT}`;
}

/**
 * In development, the address this device already used to reach Metro.
 *
 * `hostUri` is `192.168.50.34:8081` on a phone over Wi-Fi, `10.0.2.2:8081` on
 * an emulator opened that way, `localhost:8081` in a browser. The API runs on
 * the same machine as Metro, so the same host on the API's port is right in
 * every one of those cases — which no fixed fallback can be.
 *
 * Only an IPv4 address or `localhost` is trusted. Under `expo start --tunnel`
 * the host is a tunnel's hostname that forwards Metro's port and nothing else,
 * and a release build has no `hostUri` at all; both fall through to the
 * fallback, and a release build is expected to carry `EXPO_PUBLIC_API_URL`.
 */
function devServerHost(): string | null {
  if (!__DEV__) return null;
  const host = Constants.expoConfig?.hostUri?.split(":")[0];
  if (!host) return null;
  return /^(?:\d{1,3}\.){3}\d{1,3}$/.test(host) || host === "localhost" ? host : null;
}
