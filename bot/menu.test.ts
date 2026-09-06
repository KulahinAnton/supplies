import { describe, expect, it } from "vitest";
import {
  BUTTONS,
  KEYBOARD_VERSION,
  replyKeyboard,
  shortcutFor,
} from "./menu";

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

describe("replyKeyboard", () => {
  it("never asks to be persistent", () => {
    // Feature 30.2 — `is_persistent` removes the control that hides the
    // keyboard, and the Android back button is then spent trying to dismiss
    // it, so the chat cannot be left. This assertion is the guard rail.
    const built = replyKeyboard();
    expect(built.is_persistent).not.toBe(true);
  });

  it("offers only labels the bot can answer", () => {
    // A key the handler does not recognise falls through to "unmatched text",
    // which opens the main menu — the exact symptom of Feature 30.1.
    // grammy types a key as `string | KeyboardButton`; both carry a label.
    const labels = replyKeyboard()
      .keyboard.flat()
      .map((key) => (typeof key === "string" ? key : key.text));
    expect(labels.length).toBeGreaterThan(0);
    for (const label of labels) {
      expect(shortcutFor(label)).not.toBeNull();
    }
  });

  it("has a version to compare a chat against", () => {
    // 0 is the "linked before versioning" sentinel, so the current version
    // must be above it or nobody is ever owed a keyboard.
    expect(KEYBOARD_VERSION).toBeGreaterThan(0);
  });
});
