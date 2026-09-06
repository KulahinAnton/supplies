import "./env-first";
import { Test } from "@nestjs/testing";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import cookie from "@fastify/cookie";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "./app.module";
import { EmptyBodyPipe } from "./common/empty-body.pipe";
import { RuleErrorFilter } from "./common/rule-error.filter";

/**
 * Feature 34 — the API against a **live seeded database**, the same bargain
 * `scripts/smoke.ts` makes for the web app.
 *
 * `pnpm test:api:e2e`, deliberately not part of `pnpm test` or the commit hook:
 * it needs Docker and `pnpm db:seed`, and a hook that fails because Docker is
 * not running teaches people to reach for --no-verify.
 *
 * What it covers is the wiring no unit test can see — the guard actually
 * refusing, zod actually rejecting, an ActionResult actually becoming a 422,
 * and rotation actually revoking. `tokens.test.ts` covers the arithmetic
 * underneath in microseconds; this covers whether it is plugged in.
 *
 * It mutates the demo household and puts back what it changed, so it can run
 * twice in a row.
 */

const LOGIN = { email: "anton@example.com", password: "supplies123" };

let app: NestFastifyApplication;

async function request(
  method: "GET" | "POST" | "DELETE" | "PATCH",
  url: string,
  options: { token?: string; body?: unknown } = {},
) {
  const response = await app.inject({
    method,
    url,
    headers: options.token ? { authorization: `Bearer ${options.token}` } : {},
    payload: options.body as Record<string, unknown> | undefined,
  });
  return { status: response.statusCode, body: response.json<Record<string, never>>() };
}

async function signIn(): Promise<{ accessToken: string; refreshToken: string }> {
  const { body } = await request("POST", "/api/auth/login", { body: LOGIN });
  return body as unknown as { accessToken: string; refreshToken: string };
}

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  await app.register(cookie, { secret: process.env.API_JWT_SECRET ?? "test-secret" });
  app.useGlobalPipes(new EmptyBodyPipe());
  app.useGlobalFilters(new RuleErrorFilter());
  app.setGlobalPrefix("api", { exclude: ["health", "health/ready"] });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
}, 30_000);

afterAll(async () => {
  await app?.close();
});

describe("health", () => {
  it("reports the database it is actually connected to", async () => {
    const { status, body } = await request("GET", "/health/ready");
    expect(status).toBe(200);
    expect(body).toMatchObject({ status: "ok", database: true });
  });
});

describe("the guard", () => {
  it("refuses an unauthenticated read", async () => {
    const { status, body } = await request("GET", "/api/dashboard");
    expect(status).toBe(401);
    expect(body).toMatchObject({ key: "auth.sessionRequired" });
  });

  it("refuses a forged token", async () => {
    const { status } = await request("GET", "/api/dashboard", {
      token: "not.a.jwt",
    });
    expect(status).toBe(401);
  });

  it("lets a signed-in caller through", async () => {
    const { accessToken } = await signIn();
    const { status } = await request("GET", "/api/dashboard", { token: accessToken });
    expect(status).toBe(200);
  });
});

describe("login", () => {
  it("answers identically for a wrong password and an unknown email", async () => {
    // The point is that neither response says which half was wrong — that is
    // how an attacker enumerates which addresses have accounts.
    const wrongPassword = await request("POST", "/api/auth/login", {
      body: { email: LOGIN.email, password: "definitely-not-it" },
    });
    const unknownEmail = await request("POST", "/api/auth/login", {
      body: { email: "nobody@example.com", password: "definitely-not-it" },
    });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body).toEqual(unknownEmail.body);
  });

  it("rejects a malformed email as a validation failure, not a credential one", async () => {
    const { status, body } = await request("POST", "/api/auth/login", {
      body: { email: "not-an-email", password: "x" },
    });
    expect(status).toBe(422);
    expect(body).toMatchObject({ key: "auth.emailInvalid" });
  });
});

describe("refresh rotation", () => {
  it("issues a different token and kills the old one", async () => {
    const first = await signIn();

    const rotated = await request("POST", "/api/auth/refresh", {
      body: { refreshToken: first.refreshToken },
    });
    expect(rotated.status).toBe(201);
    const second = rotated.body as unknown as { refreshToken: string };
    expect(second.refreshToken).not.toBe(first.refreshToken);

    const replay = await request("POST", "/api/auth/refresh", {
      body: { refreshToken: first.refreshToken },
    });
    expect(replay.status).toBe(401);
  });

  it("revokes every session when a used token is replayed", async () => {
    // The theft response. Presenting a revoked token means either a bug or a
    // replay and the API cannot tell which, so the whole family goes — see
    // PROJECT_PROMPT.md Feature 34.
    const first = await signIn();
    const rotated = await request("POST", "/api/auth/refresh", {
      body: { refreshToken: first.refreshToken },
    });
    const second = (rotated.body as unknown as { refreshToken: string }).refreshToken;

    await request("POST", "/api/auth/refresh", { body: { refreshToken: first.refreshToken } });

    const survivor = await request("POST", "/api/auth/refresh", {
      body: { refreshToken: second },
    });
    expect(survivor.status).toBe(401);
  });
});

describe("stock, through HTTP", () => {
  it("takes one and puts it back, and the number follows", async () => {
    const { accessToken } = await signIn();
    const items = await request("GET", "/api/items/all", { token: accessToken });
    const list = items.body as unknown as { id: string; name: string; quantity: string }[];
    const item = list.find((row) => Number(row.quantity) > 5);
    expect(item, "seed has an item with stock to take").toBeDefined();
    if (!item) return;

    const before = Number(item.quantity);

    const taken = await request("POST", "/api/stock/consume", {
      token: accessToken,
      body: { itemId: item.id, quantity: "1" },
    });
    expect(taken.status).toBe(201);

    const mid = await request("GET", `/api/items/${item.id}`, { token: accessToken });
    expect(Number((mid.body as unknown as { quantity: string }).quantity)).toBe(before - 1);

    // Put it back, so the suite runs twice in a row.
    const restored = await request("POST", "/api/stock/add", {
      token: accessToken,
      body: { itemId: item.id, rows: [{ quantity: "1" }] },
    });
    expect(restored.status).toBe(201);

    const after = await request("GET", `/api/items/${item.id}`, { token: accessToken });
    expect(Number((after.body as unknown as { quantity: string }).quantity)).toBe(before);
  });

  it("refuses a shortfall with the numbers as params, not prose", async () => {
    // PROJECT_PROMPT.md §8 over HTTP: the API sends a key and its values, and
    // three clients render one Ukrainian sentence from one catalogue.
    const { accessToken } = await signIn();
    const items = await request("GET", "/api/items/all", { token: accessToken });
    const list = items.body as unknown as { id: string; quantity: string }[];
    const item = list.find((row) => Number(row.quantity) > 0);
    if (!item) return;

    const { status, body } = await request("POST", "/api/stock/consume", {
      token: accessToken,
      body: { itemId: item.id, quantity: "999999" },
    });

    expect(status).toBe(422);
    expect(body).toMatchObject({ key: "stock.shortfall" });
    expect((body as unknown as { params: Record<string, string> }).params).toHaveProperty(
      "missing",
    );
  });

  it("will not write into another household", async () => {
    const { accessToken } = await signIn();
    const { status, body } = await request("POST", "/api/stock/consume", {
      token: accessToken,
      // A well-formed id that belongs to nobody. The query is scoped by
      // householdId, so this is indistinguishable from "does not exist" —
      // which is the correct thing for a caller to be told.
      body: { itemId: "00000000-0000-4000-8000-000000000000", quantity: "1" },
    });
    expect(status).toBe(422);
    expect(body).toMatchObject({ key: "item.notFound" });
  });
});

describe("settings rules, over HTTP", () => {
  it("refuses to delete a category that still has items", async () => {
    // Cascading would silently strip the category off every item using it.
    const { accessToken } = await signIn();
    const taxonomy = await request("GET", "/api/taxonomy", { token: accessToken });
    const { categories } = taxonomy.body as unknown as {
      categories: { id: string; name: string }[];
    };
    const inUse = categories[0];

    const { status, body } = await request(
      "DELETE",
      `/api/settings/categories/${inUse.id}`,
      { token: accessToken },
    );
    expect(status).toBe(422);
    expect(body).toMatchObject({ key: "settings.categoryInUse" });
  });

  it("refuses a reorder containing an id the household does not own", async () => {
    // Feature 15.1 — every id is proved first, or a forged list reorders
    // another family's categories.
    const { accessToken } = await signIn();
    const { status, body } = await request("POST", "/api/settings/categories/reorder", {
      token: accessToken,
      body: { ids: ["00000000-0000-4000-8000-000000000000"] },
    });
    expect(status).toBe(422);
    expect(body).toMatchObject({ key: "auth.forbidden" });
  });

  it("creates a location, refuses the duplicate, then removes it", async () => {
    const { accessToken } = await signIn();
    const name = `E2E ${Date.now()}`;

    const created = await request("POST", "/api/settings/locations", {
      token: accessToken,
      body: { name },
    });
    expect(created.status).toBe(201);

    const duplicate = await request("POST", "/api/settings/locations", {
      token: accessToken,
      body: { name },
    });
    expect(duplicate.status).toBe(422);
    expect(duplicate.body).toMatchObject({ key: "settings.locationNameTaken" });

    // Put the household back the way it was found.
    const taxonomy = await request("GET", "/api/taxonomy", { token: accessToken });
    const { locations } = taxonomy.body as unknown as { locations: { id: string; name: string }[] };
    const mine = locations.find((l) => l.name === name);
    expect(mine).toBeDefined();
    if (mine) {
      const removed = await request("DELETE", `/api/settings/locations/${mine.id}`, {
        token: accessToken,
      });
      expect(removed.status).toBe(200);
    }
  });
});

describe("route shapes that are easy to get wrong", () => {
  it("treats /shopping/archived as the bulk delete, not as a row id", async () => {
    // Declared before @Delete(":id") on purpose. If the order were reversed
    // this would try to delete a row called "archived" and 422.
    const { accessToken } = await signIn();
    const { status } = await request("DELETE", "/api/shopping/archived", {
      token: accessToken,
    });
    expect(status).toBe(200);
  });

  it("routes /settings/groups/items/:id to the remove handler", async () => {
    const { accessToken } = await signIn();
    const { status, body } = await request(
      "DELETE",
      "/api/settings/groups/items/00000000-0000-4000-8000-000000000000",
      { token: accessToken },
    );
    // 422 item.notFound proves it reached the handler; a 404 would mean the
    // path had been swallowed by @Delete("groups/:id").
    expect(status).toBe(422);
    expect(body).toMatchObject({ key: "item.notFound" });
  });
});

describe("barcode and recipes", () => {
  it("refuses a code that is not barcode-shaped, before any network call", async () => {
    const { accessToken } = await signIn();
    const { status, body } = await request("GET", "/api/barcode/abc", {
      token: accessToken,
    });
    expect(status).toBe(422);
    expect(body).toMatchObject({ key: "item.barcodeInvalid" });
  });

  it("answers 'does this household have it' without asking anyone else", async () => {
    // The cheap half of Feature 10, and the one a scan hits first: restocking
    // is far commoner than cataloguing.
    const { accessToken } = await signIn();
    const { status, body } = await request("GET", "/api/barcode/4823063113939/item", {
      token: accessToken,
    });
    expect(status).toBe(200);
    expect(body).toHaveProperty("kind");
  });

  it("refuses a recipe while the household has the helper switched off", async () => {
    // Feature 32.1 — the check that actually guards the spend. A hidden tab is
    // not an access control, and this endpoint is what costs money.
    const { accessToken } = await signIn();
    const household = await request("GET", "/api/household", { token: accessToken });
    const { aiEnabled } = household.body as unknown as { aiEnabled: boolean };

    const { status, body } = await request("POST", "/api/recipes/suggest", {
      token: accessToken,
    });

    if (aiEnabled) {
      // Nothing to assert about the model's answer; only that the switch let
      // it through rather than refusing.
      expect(body).not.toMatchObject({ key: "recipe.disabled" });
      return;
    }
    expect(status).toBe(422);
    expect(body).toMatchObject({ key: "recipe.disabled" });
  });
});

/**
 * Feature 27 + 28 — the list URL is a contract between three clients.
 *
 * `itemListSearch` in `@supplies/core` writes it; the Next page, this API and
 * the SPA all read it back with `parseItemListSearch`. This endpoint used to
 * spell two of the six itself — `category` and `perPage` against the written
 * `cat` and `per` — which meant the link in the web app's address bar asked
 * for a different list than the one on screen, with no error anywhere. These
 * check the two that had drifted, and one that had not, so a future rename
 * cannot pass by only being consistent with itself.
 */
describe("the items list URL", () => {
  it("filters by the category name the URL actually carries", async () => {
    const { accessToken } = await signIn();

    const all = await request("GET", "/api/items?per=all", { token: accessToken });
    const categories = (all.body as unknown as { categories: string[] }).categories;
    expect(categories.length).toBeGreaterThan(1);

    const [first] = categories;
    const filtered = await request(
      "GET",
      `/api/items?per=all&cat=${encodeURIComponent(first ?? "")}`,
      { token: accessToken },
    );

    const rows = (filtered.body as unknown as { rows: { categoryName: string }[] }).rows;
    expect(rows.length).toBeGreaterThan(0);
    // The bug this replaces: `cat` was ignored, so this came back as the whole
    // household and looked like a category that happened to hold everything.
    expect(rows.every((row) => row.categoryName === first)).toBe(true);
    expect(rows.length).toBeLessThan(
      (all.body as unknown as { total: number }).total,
    );
  });

  it("pages with `per`, and reports the slice it sent", async () => {
    const { accessToken } = await signIn();

    const { body } = await request("GET", "/api/items?per=10&page=2", {
      token: accessToken,
    });
    const page = body as unknown as {
      rows: unknown[];
      page: number;
      from: number;
      to: number;
      total: number;
    };

    expect(page.page).toBe(2);
    expect(page.rows.length).toBeLessThanOrEqual(10);
    // 1-based and inclusive, which is what the «11–20 з 42» label reads from.
    expect(page.from).toBe(11);
    expect(page.to).toBe(10 + page.rows.length);
  });

  it("falls back on a hand-edited parameter rather than failing", async () => {
    const { accessToken } = await signIn();

    const { status, body } = await request(
      "GET",
      "/api/items?filter=nonsense&sort=by-price&per=9999&page=-4",
      { token: accessToken },
    );

    // A URL is untrusted input from anywhere. The default list is the right
    // answer; a 500 or an empty list would both be worse.
    expect(status).toBe(200);
    const page = body as unknown as { page: number; rows: unknown[] };
    expect(page.page).toBe(1);
    expect(page.rows.length).toBeGreaterThan(0);
  });
});

/**
 * Feature 11 — the shopping groups, which had lived only in the Next app's
 * server actions until the SPA needed them.
 *
 * The interesting rules are the two that are easy to get wrong in a second
 * implementation: «Загальна група» is `groupId = null` and not a row, and
 * deleting a group returns its rows to that default rather than destroying
 * them. Both are now in `@supplies/db/shopping-groups-service`, and these
 * check them over HTTP.
 */

/**
 * `addListRow` answers `{ ok: true }` and no id — the web form never needed
 * one, because the page re-renders the whole list afterwards. A client that
 * wants the row it just created reads the list back, which is what this does.
 */
async function addRowAndFind(
  token: string,
  body: { freeText: string; groupId?: string },
): Promise<{ id: string; groupId: string | null }> {
  await request("POST", "/api/shopping", { token, body });

  const { body: list } = await request("GET", "/api/shopping", { token });
  const rows = (list as unknown as {
    rows: { id: string; freeText: string | null; groupId: string | null }[];
  }).rows;

  // Last match wins: these run against a shared demo household that may
  // already hold a row with the same text from an earlier run.
  const found = [...rows].reverse().find((row) => row.freeText === body.freeText);
  if (!found) throw new Error(`row not found after adding: ${body.freeText}`);
  return { id: found.id, groupId: found.groupId };
}

describe("shopping groups, over HTTP", () => {
  it("creates, refuses the duplicate name, renames, and deletes", async () => {
    const { accessToken } = await signIn();
    const name = `Тест ${Date.now()}`;

    const created = await request("POST", "/api/shopping-groups", {
      token: accessToken,
      body: { name },
    });
    expect(created.status).toBe(201);
    const { id } = created.body as unknown as { id: string };

    const clash = await request("POST", "/api/shopping-groups", {
      token: accessToken,
      body: { name },
    });
    // A rule refusal, not a crash: well-formed request, declined.
    expect(clash.status).toBe(422);
    expect(clash.body).toMatchObject({ key: "shoppingGroup.nameTaken" });

    const blank = await request("POST", "/api/shopping-groups", {
      token: accessToken,
      body: { name: "   " },
    });
    expect(blank.body).toMatchObject({ key: "shoppingGroup.nameRequired" });

    const renamed = await request("PATCH", `/api/shopping-groups/${id}`, {
      token: accessToken,
      body: { name: `${name} (2)` },
    });
    expect(renamed.status).toBe(200);

    const removed = await request("DELETE", `/api/shopping-groups/${id}`, {
      token: accessToken,
    });
    expect(removed.status).toBe(200);
  });

  it("returns a deleted group's rows to «Загальна група» rather than losing them", async () => {
    const { accessToken } = await signIn();
    const name = `Тест ${Date.now()}`;

    const created = await request("POST", "/api/shopping-groups", {
      token: accessToken,
      body: { name },
    });
    const { id: groupId } = created.body as unknown as { id: string };

    const { id: rowId } = await addRowAndFind(accessToken, {
      freeText: "Свічки",
      groupId,
    });

    await request("DELETE", `/api/shopping-groups/${groupId}`, { token: accessToken });

    const after = await request("GET", "/api/shopping", { token: accessToken });
    const rows = (after.body as unknown as { rows: { id: string; groupId: string | null }[] })
      .rows;
    const survivor = rows.find((r) => r.id === rowId);

    // The row is still there, and back in the default group — which is null,
    // not an id. That is the whole of Feature 11 in one assertion.
    expect(survivor).toBeDefined();
    expect(survivor?.groupId).toBeNull();

    await request("DELETE", `/api/shopping/${rowId}`, { token: accessToken });
  });

  it("routes /shopping-groups/rows/:id/move to the move handler, not to :id", async () => {
    const { accessToken } = await signIn();
    const name = `Тест ${Date.now()}`;

    const created = await request("POST", "/api/shopping-groups", {
      token: accessToken,
      body: { name },
    });
    const { id: groupId } = created.body as unknown as { id: string };

    const { id: rowId } = await addRowAndFind(accessToken, { freeText: "Батарейки" });

    const moved = await request("POST", `/api/shopping-groups/rows/${rowId}/move`, {
      token: accessToken,
      body: { groupId },
    });
    expect(moved.status).toBe(201);

    const after = await request("GET", "/api/shopping", { token: accessToken });
    const rows = (after.body as unknown as { rows: { id: string; groupId: string | null }[] })
      .rows;
    expect(rows.find((r) => r.id === rowId)?.groupId).toBe(groupId);

    await request("DELETE", `/api/shopping/${rowId}`, { token: accessToken });
    await request("DELETE", `/api/shopping-groups/${groupId}`, { token: accessToken });
  });

  it("refuses to file a row into another household's group", async () => {
    const { accessToken } = await signIn();

    const { id: rowId } = await addRowAndFind(accessToken, { freeText: "Скотч" });

    const forged = await request("POST", `/api/shopping-groups/rows/${rowId}/move`, {
      token: accessToken,
      body: { groupId: "00000000-0000-0000-0000-000000000000" },
    });
    expect(forged.body).toMatchObject({ key: "shoppingGroup.notFound" });

    await request("DELETE", `/api/shopping/${rowId}`, { token: accessToken });
  });
});

/**
 * A POST with no body at all must never be a 500.
 *
 * Several endpoints take a body whose fields are all optional, so a client
 * with nothing to say sends nothing. Fastify hands Nest `undefined` for that,
 * and `body.archived` on `undefined` throws — a server error for a request
 * that was perfectly valid. `EmptyBodyPipe` normalises it to `{}` globally;
 * these are the two that were actually reachable from a screen.
 */
describe("a POST with no body", () => {
  it("ticks a free-text row off and back, rather than erroring", async () => {
    const { accessToken } = await signIn();
    const { id } = await addRowAndFind(accessToken, { freeText: "Сірники" });

    // The SPA sends no body here: a one-off has no stock to record.
    const checked = await request("POST", `/api/shopping/${id}/check`, {
      token: accessToken,
    });
    expect(checked.status).toBe(201);

    const unchecked = await request("POST", `/api/shopping/${id}/uncheck`, {
      token: accessToken,
    });
    expect(unchecked.status).toBe(201);

    await request("DELETE", `/api/shopping/${id}`, { token: accessToken });
  });

  it("archives a row on the handler's default rather than throwing", async () => {
    const { accessToken } = await signIn();
    const { id } = await addRowAndFind(accessToken, { freeText: "Губка" });

    // No body means `archived !== false`, i.e. archive it — the handler's
    // stated default, which it can only apply if the body is an object.
    const archived = await request("POST", `/api/shopping/${id}/archive`, {
      token: accessToken,
    });
    expect(archived.status).toBe(201);

    const list = await request("GET", "/api/shopping", { token: accessToken });
    const rows = (list.body as unknown as { rows: { id: string; archivedAt: string | null }[] })
      .rows;
    expect(rows.find((row) => row.id === id)?.archivedAt).not.toBeNull();

    await request("DELETE", `/api/shopping/${id}`, { token: accessToken });
  });
});
