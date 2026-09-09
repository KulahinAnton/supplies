import Constants, { ExecutionEnvironment } from "expo-constants";
import { Platform } from "react-native";

/**
 * Feature 35 — `expo-notifications`, loaded so that it cannot take the app
 * down with it.
 *
 * **This wrapper is not defensive programming for its own sake.** Adding
 * `expo-notifications` to an SDK 57 app and importing it normally breaks the
 * entire application in Expo Go on Android:
 *
 *     expo-notifications: Android Push notifications (remote notifications)
 *     functionality provided by expo-notifications was removed from Expo Go
 *     with the release of SDK 53. Use a development build instead.
 *
 * Expo Router imports every route file to build its route table, so a single
 * throw turned all twenty-odd screens into «Route "./login.tsx" is missing the
 * required default export». The app did not lose push; it lost everything.
 *
 * **And it cannot be caught.** The throw is not in the entry module: importing
 * anything from the package pulls in `DevicePushTokenAutoRegistration.fx.js`,
 * whose *module scope* registers a push-token listener, which throws. That
 * happens inside Metro's `loadModuleImplementation`, several frames below the
 * `import()`, and neither `.catch()` on the promise nor a `try` around the
 * call site sees it — both were tried, and both still put a red box on screen
 * the moment somebody signed in.
 *
 * So the environment is checked BEFORE the import rather than after it. The
 * package tells you itself that it does not work there; asking first is the
 * only thing that actually avoids the failure.
 *
 * The type-only import is free — TypeScript erases it, so nothing is required
 * at load time.
 */
type NotificationsModule = typeof import("expo-notifications");

/**
 * Expo Go on Android, where remote push has not existed since SDK 53. A
 * development build or the APK reports a different execution environment and
 * takes the ordinary path.
 */
function knownUnsupported(): boolean {
  return (
    Platform.OS === "android" &&
    Constants.executionEnvironment === ExecutionEnvironment.StoreClient
  );
}

/** Cached, including the failure: retrying a module that threw throws again. */
let pending: Promise<NotificationsModule | null> | null = null;

export function loadNotifications(): Promise<NotificationsModule | null> {
  if (knownUnsupported()) return Promise.resolve(null);

  pending ??= import("expo-notifications")
    // A resolved import is still not proof of a working module — belt as well
    // as braces, for the next runtime that half-initialises it.
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
