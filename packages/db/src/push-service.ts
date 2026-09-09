import { prisma } from "./prisma";
import {
  digestNotification,
  sendExpoPush,
  type PushToken,
} from "../../core/src/push";

/**
 * Feature 35 — the rows behind push, and the one place that sends to them.
 *
 * The message shapes and the transport are `@supplies/core/push`, which knows
 * nothing about a database; this knows which devices a household has and what
 * to do with a token the service says is dead. Same seam as everywhere else:
 * the rule is portable, the query is not.
 */

export type PushPlatform = "android" | "ios";

/**
 * Register a device, or refresh one that already exists.
 *
 * **Keyed by token, and the token can move between users.** Two people signing
 * into the same phone is a real thing in a family, and the OS gives the second
 * one the same token — so an upsert that only ever inserted would leave the
 * first user receiving the second one's reminders. Reassigning is the correct
 * answer, and it is why `userId` is updated rather than only set on create.
 */
export async function registerPushDevice(input: {
  userId: string;
  token: PushToken;
  platform: PushPlatform;
}): Promise<void> {
  await prisma.pushDevice.upsert({
    where: { token: input.token },
    create: {
      userId: input.userId,
      token: input.token,
      platform: input.platform,
    },
    update: {
      userId: input.userId,
      platform: input.platform,
      lastSeenAt: new Date(),
    },
  });
}

/**
 * Sign-out drops the device.
 *
 * Scoped by user as well as token so one phone cannot unregister another's —
 * the token is not a secret in any meaningful sense, but an endpoint that
 * deletes any row by a value a caller supplies is not one worth writing.
 */
export async function unregisterPushDevice(
  userId: string,
  token: PushToken,
): Promise<void> {
  await prisma.pushDevice.deleteMany({ where: { userId, token } });
}

export async function pushTokensForHousehold(
  householdId: string,
): Promise<PushToken[]> {
  const devices = await prisma.pushDevice.findMany({
    where: { user: { householdId, isActive: true } },
    select: { token: true },
  });
  return devices.map((device) => device.token);
}

export type PushDelivery = { devices: number; sent: number; failed: number };

/**
 * Send one household its daily digest as a notification.
 *
 * Called after the Telegram half, and deliberately not instead of it: somebody
 * with both linked wants the reminder wherever they happen to be looking, and
 * the app is not a replacement for the bot any more than the bot is for the
 * app.
 *
 * Dead tokens are deleted here rather than reported upward. `DeviceNotRegistered`
 * means the app is gone from that device; the row can only ever slow future
 * sends down, and nobody is going to act on a list of them.
 */
export async function pushDigestToHousehold(
  householdId: string,
  digestText: string,
): Promise<PushDelivery> {
  const tokens = await pushTokensForHousehold(householdId);
  if (tokens.length === 0) return { devices: 0, sent: 0, failed: 0 };

  const result = await sendExpoPush(
    tokens.map((token) => digestNotification(token, digestText)),
  );

  if (result.expired.length > 0) {
    await prisma.pushDevice.deleteMany({ where: { token: { in: result.expired } } });
  }

  const sent = result.tickets.filter((ticket) => ticket.status === "ok").length;
  return { devices: tokens.length, sent, failed: result.tickets.length - sent };
}
