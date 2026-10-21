import { describe, expect, it } from "vitest";
import { webhookVerdict } from "./webhook-gate";

/**
 * Feature 9 — the webhook refuses anything Telegram did not sign, and refuses
 * everything when it has nothing to check a signature against.
 */
describe("webhookVerdict", () => {
  const configured = { token: "bot-token", secret: "s3cret-value" };

  it("lets through an update carrying the secret", () => {
    expect(webhookVerdict({ ...configured, provided: "s3cret-value" })).toBe("ok");
  });

  it("refuses an update with the wrong secret", () => {
    expect(webhookVerdict({ ...configured, provided: "s3cret-valuX" })).toBe("forbidden");
  });

  it("refuses a secret of a different length without throwing", () => {
    // `timingSafeEqual` throws on unequal lengths. A forged header must be a
    // 403, not a 500 that tells the sender something went wrong inside.
    expect(webhookVerdict({ ...configured, provided: "short" })).toBe("forbidden");
  });

  it("refuses an update with no secret header at all", () => {
    expect(webhookVerdict({ ...configured, provided: null })).toBe("forbidden");
  });

  /**
   * The case this module exists for. The route used to check the header only
   * when the variable was set, so a deployment that forgot it accepted
   * unsigned updates from anyone who found the URL.
   */
  it("refuses everything when no secret is configured, even a request without one", () => {
    expect(webhookVerdict({ token: "bot-token", secret: undefined, provided: null })).toBe(
      "unconfigured",
    );
    expect(webhookVerdict({ token: "bot-token", secret: "", provided: "" })).toBe(
      "unconfigured",
    );
  });

  it("refuses everything when no bot token is configured", () => {
    expect(
      webhookVerdict({ token: undefined, secret: "s3cret-value", provided: "s3cret-value" }),
    ).toBe("unconfigured");
  });
});
