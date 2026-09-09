import { z } from "zod";
import { key } from "./shared";

/**
 * Feature 35 — the shape of a device registration.
 *
 * The token pattern is Expo's own — `ExponentPushToken[…]`, or `ExpoPushToken[…]`
 * from older SDKs. Checked rather than accepted as any string because a
 * device that registers a malformed token is silently never notified again,
 * and the only symptom is somebody saying "I don't get reminders".
 */
export const pushTokenPattern = /^Expo(nent)?PushToken\[[^\]]+\]$/;

export const registerPushSchema = z.object({
  token: z.string().trim().regex(pushTokenPattern, key("push.tokenInvalid")),
  platform: z.enum(["android", "ios"]),
});

export const unregisterPushSchema = z.object({
  token: z.string().trim().min(1, key("push.tokenInvalid")),
});

export type RegisterPushInput = z.infer<typeof registerPushSchema>;
export type UnregisterPushInput = z.infer<typeof unregisterPushSchema>;
