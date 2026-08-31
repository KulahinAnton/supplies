import { describe, expect, it } from "vitest";
import { BUTTONS, shortcutFor } from "@/bot/menu";

/**
 * Feature 30.1 — the reply keyboard's labels are a wire format.
 *
 * Telegram keeps a custom keyboard in the client until a message replaces it,
 * so a chat linked years ago keeps sending the label it was given. These
 * assertions exist to make a rename fail here rather than in someone's chat,
 * where the symptom is a button that answers with the wrong screen.
 */
describe("shortcutFor", () => {
  it("matches every label the keyboard can send", () => {
    for (const [shortcut, label] of Object.entries(BUTTONS)) {
      expect(shortcutFor(label)).toBe(shortcut);
    }
  });

  it("still matches the labels shipped before Feature 17.5", () => {
    // Verbatim from commit 5fd1e8c, which is what old clients still show.
    expect(shortcutFor("🛒 Список покупок")).toBe("shopping");
    expect(shortcutFor("📉 Що закінчується")).toBe("low");
    expect(shortcutFor("⏳ Що псується")).toBe("expiring");
  });

  it("tolerates the whitespace a client may add", () => {
    expect(shortcutFor(` ${BUTTONS.low} `)).toBe("low");
  });

  it("leaves ordinary text alone, so a flow still receives it", () => {
    expect(shortcutFor("Молоко")).toBeNull();
    expect(shortcutFor("Що закінчується")).toBeNull();
    expect(shortcutFor("")).toBeNull();
  });
});
