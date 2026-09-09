import Constants from "expo-constants";
import * as Device from "expo-device";
import { Platform } from "react-native";
import { api } from "@/lib/api/client";
import { loadNotifications } from "@/lib/push/module";

/**
 * Feature 35 — asking for the device's push address and telling the API.
 *
 * Every step here can legitimately fail and none of them is worth an error
 * banner: a household that never turns notifications on should see nothing
 * about it, and the daily digest already reaches them by Telegram and by
 * opening the app. So this returns a reason rather than throwing, and the
 * settings screen is the only place that renders one.
 */
export type PushOutcome =
  | { state: "registered"; token: string }
  /** An emulator or simulator has no push service to register with. */
  | { state: "unsupported" }
  /** Asked and refused, or refused before and not asked again. */
  | { state: "denied"; canAskAgain: boolean }
  /** Expo Go on Android since SDK 53, or a build with no EAS project id. */
  | { state: "unavailable"; reason: string };

/**
 * The EAS project id, read defensively because `extra` is free-form by design.
 *
 * It has to be passed explicitly to `getExpoPushTokenAsync`, and Expo's own
 * docs are blunt about why: without it the call works in Expo Go and fails in
 * a standalone build, which is the worst possible place to find out.
 */
function easProjectId(): string | null {
  // `extra.eas.projectId` is what `eas init` writes into app.json, and
  // `app.config.ts` spreads it through — one source, rather than also
  // consulting the deprecated `Constants.easConfig`.
  const extra = Constants.expoConfig?.extra as
    | { eas?: { projectId?: unknown } }
    | undefined;
  const id = extra?.eas?.projectId;
  return typeof id === "string" && id.length > 0 ? id : null;
}

export async function registerForPush(): Promise<PushOutcome> {
  // False on an emulator and a simulator, where there is no push service to
  // hand out an address.
  if (!Device.isDevice) return { state: "unsupported" };

  const notifications = await loadNotifications();
  if (!notifications) {
    return {
      state: "unavailable",
      reason:
        "Expo Go на Android не отримує пуш-сповіщень — потрібна власна збірка.",
    };
  }

  /**
   * Android needs a channel before anything is delivered, and one created
   * after the first notification arrives is too late — the system files that
   * one under a default channel the user cannot configure.
   */
  if (Platform.OS === "android") {
    await notifications.setNotificationChannelAsync("digest", {
      name: "Щоденне нагадування",
      importance: notifications.AndroidImportance.DEFAULT,
      // No sound: this is one message a day about groceries, and a household
      // that gets woken by it turns the whole thing off.
      sound: null,
      vibrationPattern: [0, 200],
    });
  }

  const granted = notifications.PermissionStatus.GRANTED;
  const existing = await notifications.getPermissionsAsync();
  let status = existing.status;
  let canAskAgain = existing.canAskAgain;

  if (status !== granted) {
    // Only ever asked from a place where somebody pressed something. The OS
    // gives one prompt per install and spending it on a cold launch wastes it.
    const asked = await notifications.requestPermissionsAsync();
    status = asked.status;
    canAskAgain = asked.canAskAgain;
  }

  if (status !== granted) return { state: "denied", canAskAgain };

  const projectId = easProjectId();
  if (!projectId) {
    return {
      state: "unavailable",
      reason: "Застосунок зібрано без ідентифікатора EAS.",
    };
  }

  try {
    const { data: token } = await notifications.getExpoPushTokenAsync({ projectId });
    await api.post("/api/push/register", {
      token,
      platform: Platform.OS === "ios" ? "ios" : "android",
    });
    return { state: "registered", token };
  } catch (cause) {
    return {
      state: "unavailable",
      reason:
        cause instanceof Error ? cause.message : "Не вдалося отримати адресу пристрою.",
    };
  }
}

/**
 * Signing out drops this device, so the next person to use the phone does not
 * receive the previous household's reminders.
 *
 * Best effort by design: a device with no signal must still be able to sign
 * out of itself, and a row left behind stops mattering the moment the app is
 * reinstalled — Expo answers `DeviceNotRegistered` and the server deletes it.
 */
export async function unregisterFromPush(): Promise<void> {
  try {
    const notifications = await loadNotifications();
    const projectId = easProjectId();
    if (!notifications || !projectId) return;
    const { data: token } = await notifications.getExpoPushTokenAsync({ projectId });
    await api.post("/api/push/unregister", { token });
  } catch {
    // Nothing to do and nothing to say.
  }
}
