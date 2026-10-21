import { expect, test, type Page } from "@playwright/test";

/**
 * Feature 33 — the round trip nothing else covers: a form in a browser, a
 * server action, a database write, and the number on screen changing to match.
 *
 * Deliberately narrow. FEFO, shortfalls and expiry states are proven in
 * `lib/stock.test.ts` in milliseconds without a browser, and re-asserting them
 * here would buy nothing but minutes and flakes. What these tests own is the
 * wiring between the layers.
 *
 * They assume the seeded demo household (`pnpm db:seed`) and mutate it, so they
 * pick their own item and restore what they changed.
 */

const LOGIN = { email: "anton@example.com", password: "supplies123" };

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Пошта").fill(LOGIN.email);
  await page.getByLabel("Пароль").fill(LOGIN.password);
  await page.getByRole("button", { name: "Увійти" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

test.describe("signing in", () => {
  test("lands on the dashboard with the nav in place", async ({ page }) => {
    await signIn(page);

    await expect(page.getByRole("heading", { name: "Огляд" })).toBeVisible();
    // Scoped to the nav landmark: the header logo is also a link reading
    // «Запаси», and an ambiguous locator is a test that fails for the wrong
    // reason. This asserts the authed shell rendered, not just the page.
    await expect(
      page.getByRole("navigation").getByRole("link", { name: "Запаси" }),
    ).toBeVisible();
  });

  test("refuses a wrong password without leaking which half was wrong", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.getByLabel("Пошта").fill(LOGIN.email);
    await page.getByLabel("Пароль").fill("definitely-not-the-password");
    await page.getByRole("button", { name: "Увійти" }).click();

    await expect(page.getByText("Невірна пошта або пароль.")).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("taking stock", () => {
  test("the number on the item page falls by what was taken", async ({ page }) => {
    await signIn(page);

    // Водa is the §3.1 example item: several batches, plenty of stock, and
    // nothing about it is near an edge case — which is what this test wants.
    await page.goto("/items");
    await page.getByRole("link", { name: /Вода негазована/ }).first().click();

    const quantity = page.getByTestId("item-quantity");
    await expect(quantity).toBeVisible();
    const before = parseQuantity(await quantity.innerText());

    await page.getByRole("button", { name: "Взяли" }).click();
    await page.getByRole("spinbutton").or(page.getByRole("textbox")).last().fill("1");
    await page.getByRole("button", { name: "Записати" }).click();

    // The action revalidates and the server re-renders; the number is the
    // assertion because it is what the user actually looks at.
    await expect
      .poll(async () => parseQuantity(await quantity.innerText()), {
        timeout: 15_000,
      })
      .toBe(before - 1);

    // Put it back, so the suite can run twice in a row.
    await page.getByRole("button", { name: "Поповнити" }).click();
    await page.getByRole("spinbutton").or(page.getByRole("textbox")).first().fill("1");
    await page.getByRole("button", { name: /Додати|Зберегти/ }).first().click();
    await expect
      .poll(async () => parseQuantity(await quantity.innerText()), {
        timeout: 15_000,
      })
      .toBe(before);
  });
});

test.describe("the recipes tab", () => {
  test("is absent until the household turns the helper on", async ({ page }) => {
    // Feature 32.1 — the tab is hidden AND the route redirects. This checks the
    // half a user sees; the action's own refusal is covered in the smoke test,
    // because a hidden link is not an access control.
    await signIn(page);
    await page.goto("/recipes");
    await expect(page).toHaveURL(/\/settings/);
  });
});

/** "264 шт." → 264. Ukrainian uses a decimal comma and thin space grouping. */
function parseQuantity(text: string): number {
  const cleaned = text.replace(/\s| | /g, "").replace(",", ".");
  const match = /-?\d+(\.\d+)?/.exec(cleaned);
  if (!match) throw new Error(`no number in quantity text: ${JSON.stringify(text)}`);
  return Number(match[0]);
}
