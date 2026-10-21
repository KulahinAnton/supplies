import { describe, expect, it, vi } from "vitest";
import {
  chunkMessages,
  digestNotification,
  flattenForNotification,
  parsePushResponse,
  sendExpoPush,
  type PushMessage,
} from "./push";

const message = (to: string): PushMessage => ({ to, title: "Запаси", body: "…" });

describe("chunkMessages", () => {
  it("keeps a small list in one request", () => {
    expect(chunkMessages([message("a"), message("b")])).toHaveLength(1);
  });

  it("splits at Expo's limit of 100", () => {
    const many = Array.from({ length: 250 }, (_, i) => message(`t${i}`));
    const chunks = chunkMessages(many);
    expect(chunks.map((chunk) => chunk.length)).toEqual([100, 100, 50]);
  });
});

describe("parsePushResponse", () => {
  const sent = [message("good"), message("dead"), message("broken")];

  it("reads tickets positionally, because Expo does not echo the token", () => {
    const result = parsePushResponse(
      {
        data: [
          { status: "ok", id: "ticket-1" },
          { status: "error", message: "…", details: { error: "DeviceNotRegistered" } },
          { status: "error", message: "Message too big" },
        ],
      },
      sent,
    );

    expect(result.tickets[0]).toEqual({ status: "ok", id: "ticket-1" });
    expect(result.tickets[1]).toMatchObject({ status: "error", token: "dead" });
    expect(result.tickets[2]).toMatchObject({ status: "error", token: "broken" });
  });

  it("collects only DeviceNotRegistered as expired", () => {
    const result = parsePushResponse(
      {
        data: [
          { status: "ok", id: "ticket-1" },
          { status: "error", details: { error: "DeviceNotRegistered" } },
          { status: "error", details: { error: "MessageRateExceeded" } },
        ],
      },
      sent,
    );

    // A rate limit is transient. Deleting the row would lose a live device
    // over a busy minute.
    expect(result.expired).toEqual(["dead"]);
  });

  it("survives a response that is not the promised shape", () => {
    const result = parsePushResponse({ errors: ["nope"] }, sent);
    expect(result.expired).toEqual([]);
    expect(result.tickets).toHaveLength(3);
    expect(result.tickets.every((ticket) => ticket.status === "error")).toBe(true);
  });
});

describe("sendExpoPush", () => {
  it("sends nothing and calls nothing for an empty list", async () => {
    const fetchImpl = vi.fn();
    await sendExpoPush([], { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("does not throw when the service is unreachable", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    const result = await sendExpoPush([message("a")], {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    // The digest has already gone to Telegram by the time this runs; a dead
    // push service must not take the run down with it.
    expect(result.tickets).toEqual([
      { status: "error", message: "ECONNREFUSED", token: "a" },
    ]);
  });

  it("reports a non-2xx as an error per message rather than throwing", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    const result = await sendExpoPush([message("a"), message("b")], {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.tickets).toHaveLength(2);
    expect(result.tickets[0]).toMatchObject({ status: "error", token: "a" });
  });
});

describe("flattenForNotification", () => {
  it("turns the digest's lines into one readable string", () => {
    const text = "*Псується*\n- Молоко 2,5%\n- Йогурт\n\n*Закінчується*\n- Хліб";
    expect(flattenForNotification(text)).toBe(
      "Псується · Молоко 2,5% · Йогурт · Закінчується · Хліб",
    );
  });

  it("keeps markdown characters out, because a notification shows them literally", () => {
    expect(flattenForNotification("*bold* `code` _italic_")).not.toMatch(/[*_`]/);
  });

  it("cuts on a word boundary", () => {
    const long = `${"слово ".repeat(60)}кінець`;
    const cut = flattenForNotification(long, 40);

    expect(cut.endsWith("…")).toBe(true);
    expect(cut.length).toBeLessThanOrEqual(41);

    /**
     * The property is not "the last character is a letter" — it is either way.
     * It is that what survives is a whole prefix of the original: the next
     * character in the source has to be a space, or "сло…" would pass too.
     */
    const kept = cut.slice(0, -1);
    expect(long.startsWith(kept)).toBe(true);
    expect(long[kept.length]).toBe(" ");
  });

  it("leaves a short message alone", () => {
    expect(flattenForNotification("Усе на місці.")).toBe("Усе на місці.");
  });
});

describe("digestNotification", () => {
  it("carries the screen to open, so a tap is not a guess", () => {
    expect(digestNotification("tok", "Псується\n- Молоко")).toEqual({
      to: "tok",
      title: "Запаси",
      body: "Псується · Молоко",
      data: { screen: "dashboard" },
    });
  });
});
