/**
 * Feature 35 — Expo push, described here and sent from wherever has the rows.
 *
 * Portable by the same contract as everything else in this package: no
 * database, no framework, and nothing a phone cannot run. `fetch` is the only
 * thing it needs, which every runtime this project targets has — the same
 * bargain `claude.ts` makes.
 *
 * **Expo's push service, not FCM or APNs directly.** One address format, one
 * endpoint, and the credentials live on EAS rather than in this repo. The cost
 * is a dependency on a service Expo runs; the alternative is two platform
 * integrations and two sets of secrets for a household app that sends one
 * message a day.
 */

/** Expo's address for one device. */
export type PushToken = string;

export type PushMessage = {
  to: PushToken;
  title: string;
  body: string;
  /**
   * What the app should open. Read by `expo-notifications`' response listener,
   * so a tap on «2 товари псуються» lands on the dashboard rather than on
   * whatever screen was last open.
   */
  data?: Record<string, string>;
};

/**
 * The endpoint, overridable for tests. No domain is hardcoded anywhere else in
 * this repo (docs/ARCHITECTURE.md §5); this one is Expo's own and cannot be
 * configured per deployment, so it is a constant with an escape hatch rather
 * than an environment variable nobody would ever set.
 */
export const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

/**
 * What Expo says about one message. `ok` means accepted for delivery — NOT
 * delivered; delivery is a second round trip against the receipt id, which
 * this app does not make. A household app that sent a reminder nobody received
 * finds out when somebody says so.
 */
export type PushTicket =
  | { status: "ok"; id: string }
  | { status: "error"; message: string; code?: string; token: PushToken };

/**
 * Expo answers 200 with a per-message result array even when individual
 * messages failed, so a non-2xx is a transport problem and a 2xx still has to
 * be read message by message.
 */
export type PushResult = {
  tickets: PushTicket[];
  /**
   * Tokens Expo says are dead — the app was uninstalled, or the OS reissued
   * the token. The caller deletes these rows; leaving them makes every future
   * send slower and noisier for no chance of delivery.
   */
  expired: PushToken[];
};

/** Expo accepts at most 100 messages per request. */
const CHUNK = 100;

export function chunkMessages(messages: readonly PushMessage[]): PushMessage[][] {
  const chunks: PushMessage[][] = [];
  for (let i = 0; i < messages.length; i += CHUNK) {
    chunks.push(messages.slice(i, i + CHUNK));
  }
  return chunks;
}

/**
 * Read one response body into tickets, tolerating a shape that is not what was
 * promised. A push service returning something unexpected must not take the
 * caller down with it — the digest has already been sent to Telegram by then.
 */
export function parsePushResponse(
  body: unknown,
  sent: readonly PushMessage[],
): PushResult {
  const data = (body as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) {
    return {
      tickets: sent.map((message) => ({
        status: "error" as const,
        message: "Push service returned an unexpected response",
        token: message.to,
      })),
      expired: [],
    };
  }

  const tickets: PushTicket[] = [];
  const expired: PushToken[] = [];

  data.forEach((entry, index) => {
    const token = sent[index]?.to ?? "";
    const row = entry as {
      status?: string;
      id?: string;
      message?: string;
      details?: { error?: string };
    };

    if (row.status === "ok" && row.id) {
      tickets.push({ status: "ok", id: row.id });
      return;
    }

    const code = row.details?.error;
    // The one error worth acting on. Everything else is transient or a bug in
    // the message, and both are for a human to read rather than for the code
    // to delete rows over.
    if (code === "DeviceNotRegistered" && token) expired.push(token);

    tickets.push({
      status: "error",
      message: row.message ?? "Push failed",
      code,
      token,
    });
  });

  return { tickets, expired };
}

/**
 * Send, in chunks, and report what came back.
 *
 * It never throws: a failed reminder is not worth failing a digest run over,
 * and the caller already has a `failures` counter for exactly this.
 */
export async function sendExpoPush(
  messages: readonly PushMessage[],
  options: { url?: string; fetchImpl?: typeof fetch } = {},
): Promise<PushResult> {
  if (messages.length === 0) return { tickets: [], expired: [] };

  const url = options.url ?? EXPO_PUSH_URL;
  const send = options.fetchImpl ?? fetch;

  const tickets: PushTicket[] = [];
  const expired: PushToken[] = [];

  for (const chunk of chunkMessages(messages)) {
    try {
      const response = await send(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify(chunk),
      });

      if (!response.ok) {
        for (const message of chunk) {
          tickets.push({
            status: "error",
            message: `Push service answered ${response.status}`,
            token: message.to,
          });
        }
        continue;
      }

      const parsed = parsePushResponse(await response.json(), chunk);
      tickets.push(...parsed.tickets);
      expired.push(...parsed.expired);
    } catch (cause) {
      for (const message of chunk) {
        tickets.push({
          status: "error",
          message: cause instanceof Error ? cause.message : "Push failed",
          token: message.to,
        });
      }
    }
  }

  return { tickets, expired };
}

/**
 * The daily reminder as a notification.
 *
 * The body is the digest's own text with its formatting flattened: a push
 * notification shows two or three lines in a system font and cannot do
 * headings, so sending the Telegram message verbatim would show its markup as
 * literal characters.
 */
export function digestNotification(
  token: PushToken,
  digestText: string,
): PushMessage {
  return {
    to: token,
    title: "Запаси",
    body: flattenForNotification(digestText),
    data: { screen: "dashboard" },
  };
}

/** Markdown out, single spaces in, and short enough that nothing is cut mid-word. */
export function flattenForNotification(text: string, limit = 178): string {
  const flat = text
    .replace(/[*_`]/g, "")
    .replace(/^[-•]\s*/gm, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" · ");

  if (flat.length <= limit) return flat;
  // Cut on a word boundary; a notification ending mid-word reads as broken
  // rather than as truncated.
  const cut = flat.slice(0, limit);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}
