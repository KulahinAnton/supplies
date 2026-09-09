/**
 * Feature 35 — `expo-notifications`, loaded so that it cannot take the app
 * down with it.
 *
 * **This wrapper is not defensive programming for its own sake.** Adding
 * `expo-notifications` to an SDK 57 app and importing it normally breaks the
 * entire application in Expo Go on Android: the module throws while it is
 * being evaluated —
 *
 *     expo-notifications: Android Push notifications (remote notifications)
 *     functionality provided by expo-notifications was removed from Expo Go
 *     with the release of SDK 53. Use a development build instead.
 *
 * — and Expo Router imports every route file to build its route table, so a
 * single throw turned all twenty-odd screens into «Route "./login.tsx" is
 * missing the required default export». The app did not lose push; it lost
 * everything.
 *
 * A dynamic import inside a try/catch is what makes that survivable, because
 * the failure happens during evaluation and there is nowhere else to catch it.
 * The result is also the right behaviour in production: a device whose
 * notification module will not initialise should lose its reminders, not its
 * inventory.
 *
 * The type-only import is free — TypeScript erases it, so nothing is required
 * at load time.
 */
type NotificationsModule = typeof import("expo-notifications");

/** Cached, including the failure: retrying a module that threw throws again. */
let pending: Promise<NotificationsModule | null> | null = null;

/**
 * **A resolved import is not a working module.** In Expo Go the `import()`
 * settles fine and hands back a half-built namespace whose functions are
 * `undefined` — the throw happened partway through evaluating it. Catching the
 * rejection was not enough; the first call then died with «undefined is not a
 * function» inside a promise nobody was watching, and the settings screen sat
 * on its spinner forever.
 *
 * So "loaded" means "has the API", not "did not reject".
 */
export function loadNotifications(): Promise<NotificationsModule | null> {
  pending ??= import("expo-notifications")
    .then((module) =>
      typeof module?.getPermissionsAsync === "function" ? module : null,
    )
    .catch(() => null);
  return pending;
}

/**
 * Whether this device will show a notification, in terms this app can render.
 *
 * `unavailable` is its own answer rather than an error: in Expo Go on Android
 * it is the *expected* one, and a screen that showed a failure there would be
 * reporting a fact about the development client as if it were a fault.
 */
export type PermissionState = "granted" | "denied" | "undetermined" | "unavailable";

export async function permissionState(): Promise<PermissionState> {
  const notifications = await loadNotifications();
  if (!notifications) return "unavailable";

  try {
    const permission = await notifications.getPermissionsAsync();
    if (permission.status === notifications.PermissionStatus.GRANTED) return "granted";
    if (permission.status === notifications.PermissionStatus.DENIED) return "denied";
    return "undetermined";
  } catch {
    // The screen that asks this renders a spinner until it answers, so it has
    // to answer. A rejection here is one more way of saying "not available".
    return "unavailable";
  }
}
