import type { ConfigContext, ExpoConfig } from "expo/config";

/**
 * The half of the app config that cannot be static.
 *
 * `app.json` is still the source of truth — name, scheme, package, plugins,
 * and the `extra.eas.projectId` that `eas init` writes — and arrives here as
 * `config`. This file only layers on what depends on **which build is being
 * made**, which a JSON file cannot express.
 */

/**
 * EAS sets this on its builders. Locally — `expo start`, `expo export` — it is
 * undefined, and a developer's own machine is the same situation as a preview
 * build, so that is what it falls back to.
 */
const profile = process.env.EAS_BUILD_PROFILE ?? "preview";

/**
 * **Cleartext HTTP, and only outside production.**
 *
 * Android 9 blocks `http://` from an APK by default, and Expo Go hides that
 * because Expo Go's own manifest permits it. So the moment this app is a
 * standalone build talking to `http://192.168.x.x:3200`, every request fails
 * with `CLEARTEXT communication not permitted` — a failure that looks exactly
 * like a dead API from inside the app.
 *
 * Allowing it is a real weakening: it is app-wide, not scoped to one host,
 * because the only alternative Expo exposes is a network security config
 * naming a domain, and the LAN address belongs to whoever is building — it
 * cannot live in this repo (SPA_API_PORT.md §4.2).
 *
 * Hence the profile check. A production build gets **no** cleartext and will
 * therefore refuse to talk to a dev machine at all, which is the correct
 * failure: production has to point at the deployed HTTPS API (Phase 4.3).
 */
const allowCleartext = profile !== "production";

export default function appConfig({ config }: ConfigContext): ExpoConfig {
  return {
    ...config,
    // `ConfigContext` types these as optional; `app.json` always supplies them.
    name: config.name ?? "Запаси",
    slug: config.slug ?? "supplies",
    plugins: [
      ...(config.plugins ?? []),
      ["expo-build-properties", { android: { usesCleartextTraffic: allowCleartext } }],
    ],
  };
}
