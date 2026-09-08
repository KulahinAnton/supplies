import { expect, test, type Page } from "@playwright/test";

/**
 * Phase 2.8 — what only a browser can see, in the client that has no server.
 *
 * Deliberately narrow, for the same reason `apps/web/e2e` is: FEFO, shortfalls
 * and expiry states are proven in `packages/core` in milliseconds, and the
 * endpoints are proven against a live database in `apps/api/src/app.e2e.ts`.
 * Re-asserting either here buys minutes and flakes.
 *
 * What these own is the machinery the Next app does not have. There, a form
 * posts to a server action and the server re-renders. Here the client holds a
 * token in memory, refreshes it from an httpOnly cookie, invalidates a query
 * cache and re-renders itself — four things that can each fail silently.
 *
 * They assume the seeded demo household (`pnpm db:seed`) and mutate it, so
 * they pick their own item and restore what they changed.
 */

const LOGIN = { email: "anton@example.com", password: "supplies123" };

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Пошта").fill(LOGIN.email);
  await page.getByLabel("Пароль").fill(LOGIN.password);
  await page.getByRole("button", { name: "Увійти" }).click();
  await expect(page.getByRole("heading", { name: "Огляд" })).toBeVisible();
}

test.describe("signing in", () => {
  test("lands on the dashboard with the nav in place", async ({ page }) => {
    await signIn(page);

    // Scoped to the nav landmark: the header logo is also a link reading
    // «Запаси», and an ambiguous locator is a test that fails for the wrong
    // reason. This asserts the authed shell rendered, not just the page.
    await expect(
      page.getByRole("navigation").getByRole("link", { name: "Запаси" }),
    ).toBeVisible();
  });

  test("refuses a wrong password with the same sentence the web app shows", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.getByLabel("Пошта").fill(LOGIN.email);
    await page.getByLabel("Пароль").fill("definitely-not-the-password");
    await page.getByRole("button", { name: "Увійти" }).click();

    // Rendered from `@supplies/core/messages` by key, so this is literally the
    // same string `apps/web/e2e/stock.spec.ts` asserts — one catalogue, two
    // clients (§8). If they ever diverge, one of these two tests fails.
    await expect(page.getByText("Невірна пошта або пароль.")).toBeVisible();
  });

  /**
   * The access token lives in memory and cannot survive a reload; the httpOnly
   * cookie is what does, and this is the only place that path runs end to end.
   *
   * **What this cannot claim.** A bug shipped where `AuthProvider` posted to
   * `/auth/refresh` directly instead of through the single-flight guard, so
   * StrictMode's double-invoked effect replayed a rotated token and the API
   * revoked every session. This suite runs a PRODUCTION build, where React
   * does not double-invoke effects, so it cannot reproduce that — verified by
   * reverting the fix and watching this pass anyway. It guards the property
   * (one refresh, session survives), not the bug, and saying so is cheaper
   * than someone later trusting it to.
   */
  test("a reload keeps the session, on one refresh", async ({ page }) => {
    const refreshes: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/auth/refresh")) refreshes.push(request.url());
    });

    await signIn(page);
    refreshes.length = 0;

    await page.reload();
    await expect(page.getByRole("heading", { name: "Огляд" })).toBeVisible();
    await expect(page).not.toHaveURL(/\/login/);

    // Two would mean the second replayed the token the first rotated.
    expect(refreshes.length).toBeLessThanOrEqual(1);
  });
});

test.describe("taking stock", () => {
  test("the number on the item page falls by what was taken", async ({ page }) => {
    await signIn(page);

    // Вода is the §3.1 example item: several batches, plenty of stock, and
    // nothing about it near an edge case — which is what this test wants.
    await page.goto("/items");
    await page.getByRole("link", { name: /Вода негазована/ }).first().click();

    const quantity = page.getByTestId("item-quantity");
    await expect(quantity).toBeVisible();
    const before = parseQuantity(await quantity.innerText());

    await page.getByRole("button", { name: "Взяли" }).click();
    await page.getByRole("textbox").last().fill("1");
    await page.getByRole("button", { name: "Записати" }).click();

    /**
     * The assertion that matters. In the Next app this number changes because
     * the server re-rendered; here it changes because a mutation invalidated
     * `keys.item(id)` and the query refetched. Nothing else proves the
     * invalidation map is right — a forgotten key looks exactly like a
     * successful write until someone notices the screen disagreeing with the
     * database.
     */
    await expect
      .poll(async () => parseQuantity(await quantity.innerText()), { timeout: 15_000 })
      .toBe(before - 1);

    // Put it back, so the suite can run twice in a row.
    await page.getByRole("button", { name: "Поповнити" }).click();
    await page.getByRole("textbox").first().fill("1");
    await page.getByRole("button", { name: "Додати до запасів" }).click();
    await expect
      .poll(async () => parseQuantity(await quantity.innerText()), { timeout: 15_000 })
      .toBe(before);
  });

  /**
   * §3.3 — the refusal renders **inside the dialog, next to the field**, not
   * as a toast. The sentence names how much is missing, so it belongs beside
   * the number that caused it; this asserts the placement as much as the rule.
   */
  test("a shortfall is refused in the dialog, naming what is missing", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/items");
    await page.getByRole("link", { name: /Вода негазована/ }).first().click();

    const quantity = page.getByTestId("item-quantity");
    const before = parseQuantity(await quantity.innerText());

    await page.getByRole("button", { name: "Взяли" }).click();
    await page.getByRole("textbox").last().fill("999999");
    await page.getByRole("button", { name: "Записати" }).click();

    await expect(page.getByText(/Не вистачає/)).toBeVisible();
    // Still open, and nothing was taken.
    await expect(page.getByRole("button", { name: "Записати" })).toBeVisible();
    await page.keyboard.press("Escape");
    expect(parseQuantity(await quantity.innerText())).toBe(before);
  });
});

test.describe("the shell", () => {
  test("hides the recipes tab until the household turns the helper on", async ({
    page,
  }) => {
    // Feature 32.1 — a hidden link is presentation, not access control. The
    // endpoint's own refusal is covered in the API suite; this is the half a
    // person sees.
    await signIn(page);
    await expect(
      page.getByRole("navigation").getByRole("link", { name: "Рецепти" }),
    ).toHaveCount(0);
  });

  /**
   * Phase 2.10.2 — twelve routes behind `lazy()`. A chunk that fails to load
   * shows the Suspense fallback forever, and nothing but a browser can tell
   * the difference between that and a slow query.
   */
  test("a lazy route loads when navigated to", async ({ page }) => {
    await signIn(page);
    await page.getByRole("navigation").getByRole("link", { name: "Покупки" }).click();
    await expect(page.getByRole("heading", { name: "Покупки" })).toBeVisible();
  });
});

/** "264 шт." → 264. Ukrainian uses a decimal comma and thin space grouping. */
function parseQuantity(text: string): number {
  const cleaned = text.replace(/\s| | /g, "").replace(",", ".");
  const match = /-?\d+(\.\d+)?/.exec(cleaned);
  if (!match) throw new Error(`no number in quantity text: ${JSON.stringify(text)}`);
  return Number(match[0]);
}
