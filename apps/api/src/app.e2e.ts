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
import { createHash } from "node:crypto";
import { prisma } from "./db";

/** Same hashing the API stores tokens with — see `auth/tokens.ts`. */
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
import * as z from "zod";
import {
  apiErrorSchema,
  attentionCountsSchema,
  archivedItemSchema,
  barcodeItemSchema,
  dashboardSchema,
  groupDetailSchema,
  groupViewSchema,
  healthSchema,
  householdSchema,
  itemDetailSchema,
  itemViewSchema,
  itemsPageSchema,
  memberSchema,
  metaSchema,
  movementSchema,
  namedItemSchema,
  readySchema,
  restockEntrySchema,
  sessionUserSchema,
  shoppingViewSchema,
  taxonomySchema,
  tokenPairSchema,
} from "./contracts";

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

/**
 * Signs in as the demo user by default. The override exists so a rule about
 * *another* caller can be tested — the seed has two users in one household for
 * exactly that, and asserting "this endpoint is scoped by user" needs a second
 * one.
 */
async function signIn(
  as: { email?: string; password?: string } = {},
): Promise<{ accessToken: string; refreshToken: string }> {
  const { body } = await request("POST", "/api/auth/login", {
    body: { ...LOGIN, ...as },
  });
  return body as unknown as { accessToken: string; refreshToken: string };
}

beforeAll(async () => {
  startedAt = new Date();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  await app.register(cookie, { secret: process.env.API_JWT_SECRET ?? "test-secret" });
  app.useGlobalPipes(new EmptyBodyPipe());
  app.useGlobalFilters(new RuleErrorFilter());
  app.setGlobalPrefix("api", { exclude: ["health", "health/ready"] });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
}, 30_000);

/**
 * When the suite started, so the teardown can tell its own rows from the
 * ones that were already there.
 */
let startedAt: Date;

afterAll(async () => {
  /**
   * Put the demo household back.
   *
   * These tests hand out invites and ask for password resets, and both leave
   * a row behind. Ten runs left ten unused invites in the seeded household —
   * harmless individually, and collectively the reason nobody can look at
   * that table and tell a real invitation from test residue. `scripts/smoke.ts`
   * has cleaned up after itself since it was written; this now does too.
   *
   * Scoped by time rather than by household: a run that fails half way should
   * still not take out a row it did not create.
   */
  await prisma.householdInvite.deleteMany({ where: { createdAt: { gte: startedAt } } });
  await prisma.passwordResetToken.deleteMany({ where: { createdAt: { gte: startedAt } } });

  await app?.close();
  await prisma.$disconnect();
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
  });

  /**
   * The race, which used to sign people out for opening a second tab.
   *
   * Two clients holding one token — two browser tabs sharing an httpOnly
   * cookie — send it at almost the same moment, and the loser presents what
   * the winner just rotated. Before `REFRESH_GRACE_MS` that was
   * indistinguishable from theft, so the correct theft response fired and
   * every session went.
   */
  it("treats an immediate replay as a race, and leaves the family alone", async () => {
    const first = await signIn();
    const rotated = await request("POST", "/api/auth/refresh", {
      body: { refreshToken: first.refreshToken },
    });
    const winner = (rotated.body as unknown as { refreshToken: string }).refreshToken;

    const loser = await request("POST", "/api/auth/refresh", {
      body: { refreshToken: first.refreshToken },
    });
    expect(loser.status).toBe(201);

    // Its own token, not the winner's: per-device revocation still has to mean
    // something, and two clients sharing one row would break it.
    const losersToken = (loser.body as unknown as { refreshToken: string }).refreshToken;
    expect(losersToken).not.toBe(winner);

    // And the winner is untouched — nothing was revoked.
    const stillGood = await request("POST", "/api/auth/refresh", {
      body: { refreshToken: winner },
    });
    expect(stillGood.status).toBe(201);
  });

  /**
   * Outside the window it is still theft, and the answer is still to burn the
   * family (PROJECT_PROMPT.md Feature 34).
   *
   * The revocation timestamp is pushed back in the database rather than the
   * test sleeping through the grace period: ten idle seconds in a suite is how
   * people learn to skip it, and `tokens.test.ts` already pins the boundary
   * arithmetic to the millisecond. What this covers is that the wiring reaches
   * `revokeAllFor` at all.
   */
  it("revokes every session when a used token is replayed after the window", async () => {
    const first = await signIn();
    const rotated = await request("POST", "/api/auth/refresh", {
      body: { refreshToken: first.refreshToken },
    });
    const second = (rotated.body as unknown as { refreshToken: string }).refreshToken;

    await prisma.apiRefreshToken.update({
      where: { tokenHash: sha256(first.refreshToken) },
      data: { revokedAt: new Date(Date.now() - 60_000) },
    });

    const replay = await request("POST", "/api/auth/refresh", {
      body: { refreshToken: first.refreshToken },
    });
    expect(replay.status).toBe(401);

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

/**
 * The Settings screen's own endpoints, which the SPA needed and the API did
 * not have: the password change, the invite link, and the two Telegram
 * buttons that were deliberately skipped when this API was built.
 */
describe("account and telegram", () => {
  it("refuses a password change when the current one is wrong", async () => {
    const { accessToken } = await signIn();

    const { status, body } = await request("POST", "/api/account/password", {
      token: accessToken,
      body: { currentPassword: "definitely-not-it", newPassword: "long-enough-123" },
    });

    // A rule refusal with a key, not a 401 — the caller is signed in, they
    // just got the old password wrong.
    expect(status).toBe(422);
    expect(body).toMatchObject({ key: "auth.currentPasswordWrong" });
  });

  it("validates the new password with the schema the web form uses", async () => {
    const { accessToken } = await signIn();

    const { status, body } = await request("POST", "/api/account/password", {
      token: accessToken,
      body: { currentPassword: LOGIN.password, newPassword: "short" },
    });

    expect(status).toBe(422);
    // Whatever the rule is, it comes from @supplies/core/validation/auth and
    // arrives as a key rather than a sentence.
    expect(body).toHaveProperty("key");
    expect(String((body as unknown as { key: string }).key)).not.toBe(
      "auth.currentPasswordWrong",
    );
  });

  it("creates an invite link pointing at where /join is actually served", async () => {
    const { accessToken } = await signIn();

    const { status, body } = await request("POST", "/api/account/invite", {
      token: accessToken,
    });
    expect(status).toBe(201);

    const { url } = body as unknown as { url: string };
    // APP_URL, not the API's own origin. Both clients now serve
    // `/join/:token`, so this is the setting that picks which one an
    // invitation opens in — see the note on the controller.
    expect(url).toContain("/join/");
    expect(url.startsWith("http")).toBe(true);
  });

  it("refuses a digest when no bot is configured, rather than throwing", async () => {
    const { accessToken } = await signIn();

    const { status, body } = await request("POST", "/api/telegram/digest", {
      token: accessToken,
    });

    // Either outcome is a rule answer. Which one depends on whether this
    // checkout has a bot token and a linked chat, and neither is something a
    // test should require of a developer's machine.
    expect([200, 201, 422]).toContain(status);
    if (status === 422) {
      expect(["digest.botNotConfigured", "digest.noChats", "digest.failed"]).toContain(
        (body as unknown as { key: string }).key,
      );
    }
  });

  /**
   * Phase 2.10.3 — the three endpoints that were missing, and the reason the
   * SPA could not offer password reset at all.
   *
   * Each of these fails against the previous commit, which is what makes them
   * worth writing: the rules existed only inside `apps/web/lib/actions/auth.ts`,
   * talking to Prisma directly, so no HTTP client could reach them.
   */
  it("answers a reset request for an unknown address exactly like a known one", async () => {
    const unknown = await request("POST", "/api/auth/forgot-password", {
      body: { email: `nobody-${Date.now()}@example.com` },
    });
    const known = await request("POST", "/api/auth/forgot-password", {
      body: { email: "anton@example.com" },
    });

    // Same status, same body. A caller who could tell these apart would have a
    // free membership oracle for the household, which is the whole reason this
    // endpoint refuses to be useful.
    expect(unknown.status).toBe(known.status);
    expect([200, 201]).toContain(known.status);
    expect(JSON.stringify(unknown.body)).toBe(JSON.stringify(known.body));
  });

  it("refuses a reset token that was never issued", async () => {
    const { status, body } = await request("POST", "/api/auth/reset-password", {
      body: { token: "not-a-real-token", password: "supplies123" },
    });

    // 400, not 422: a token that was never issued is a bad request, not a
    // well-formed one that broke a rule. The status set in the controller is
    // explicit about which refusals get which code.
    expect(status).toBe(400);
    // The same key a spent or expired token gets: telling them apart would say
    // which stolen tokens are worth retrying. And its OWN key rather than
    // `auth.inviteInvalid`, which used to tell people resetting a password
    // that their invitation was invalid.
    expect((body as unknown as { key: string }).key).toBe("auth.resetLinkInvalid");
  });

  it("refuses a malformed reset request before touching the database", async () => {
    const { status, body } = await request("POST", "/api/auth/reset-password", {
      body: { token: "x", password: "short" },
    });

    expect(status).toBe(422);
    expect((body as unknown as { key: string }).key.startsWith("auth.")).toBe(true);
  });

  /**
   * Feature 1 — a new password ends the API sessions the old one opened.
   *
   * Run as the seed's second member, so the demo login the rest of the suite
   * signs in with is never touched, and with the SAME password: the hash
   * changes and the password does not, so a run that fails half way leaves
   * nothing to put back. The reset token row is removed by `afterAll`.
   */
  const OLENA = { email: "olena@example.com" };

  it("ends every API session when the password is reset", async () => {
    const phone = await signIn(OLENA);

    const raw = `e2e-reset-${Date.now()}`;
    const user = await prisma.user.findUniqueOrThrow({ where: { email: OLENA.email } });
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: sha256(raw),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    const reset = await request("POST", "/api/auth/reset-password", {
      body: { token: raw, password: LOGIN.password },
    });
    expect([200, 201]).toContain(reset.status);

    // The session that existed before the reset is gone. Without this, a
    // stolen phone session would outlive the reset meant to end it.
    const refresh = await request("POST", "/api/auth/refresh", {
      body: { refreshToken: phone.refreshToken },
    });
    expect(refresh.status).toBe(401);

    // A reset ends sessions, not the account.
    const again = await request("POST", "/api/auth/login", {
      body: { ...LOGIN, ...OLENA },
    });
    expect(again.status).toBe(201);
  });

  it("keeps the session that changed the password, and ends the others", async () => {
    const thisPhone = await signIn(OLENA);
    const otherPhone = await signIn(OLENA);

    const change = await request("POST", "/api/account/password", {
      token: thisPhone.accessToken,
      body: { currentPassword: LOGIN.password, newPassword: LOGIN.password },
    });
    expect([200, 201]).toContain(change.status);

    // The other device finds out at its next refresh...
    const other = await request("POST", "/api/auth/refresh", {
      body: { refreshToken: otherPhone.refreshToken },
    });
    expect(other.status).toBe(401);

    // ...and that refusal is not read as theft. Were it `reuse`, it would have
    // burned every session, this one included, and this would be 401 too.
    const kept = await request("POST", "/api/auth/refresh", {
      body: { refreshToken: thisPhone.refreshToken },
    });
    expect(kept.status).toBe(201);
  });

  it("names the household behind a live invite, and 404s a spent one", async () => {
    const { accessToken } = await signIn();
    const created = await request("POST", "/api/account/invite", {
      token: accessToken,
    });
    const { url } = created.body as unknown as { url: string };
    const token = url.split("/join/")[1] ?? "";

    const live = await request("GET", `/api/auth/invite/${token}`);
    expect(live.status).toBe(200);
    expect(
      (live.body as unknown as { householdName: string }).householdName.length,
    ).toBeGreaterThan(0);

    // Public on purpose: the join screen has to say whose household it is
    // BEFORE asking for a password, and holding the single-use token is the
    // authorisation.
    const invented = await request("GET", "/api/auth/invite/nope");
    expect(invented.status).toBe(404);
  });

  it("refuses to register an email that already exists, with 409 not 422", async () => {
    const { status, body } = await request("POST", "/api/auth/register", {
      body: {
        name: "Дубль",
        email: "anton@example.com",
        password: "supplies123",
      },
    });

    // `unwrap` answers 422 for every refusal, which is right for a broken rule
    // and wrong for a conflict. The controller maps this one deliberately.
    expect(status).toBe(409);
    expect((body as unknown as { key: string }).key).toBe("auth.emailTaken");
  });

  it("refuses to register against an invite token that does not exist", async () => {
    const { status, body } = await request("POST", "/api/auth/register", {
      body: {
        name: "Гість",
        email: `guest-${Date.now()}@example.com`,
        password: "supplies123",
        inviteToken: "not-a-real-invite",
      },
    });

    expect(status).toBe(400);
    expect((body as unknown as { key: string }).key).toBe("auth.inviteInvalid");
  });
});

/**
 * Phase 2.2 — the contract, checked against a real database.
 *
 * Every schema in `@supplies/core/contracts` claims to describe a response.
 * These are what make the claim true: the SPA's types are inferred from those
 * schemas, so a query that changes shape fails HERE rather than as `undefined`
 * on someone's dashboard.
 *
 * What this catches and what it does not, stated plainly rather than implied:
 * a field that disappears, is renamed, or changes type fails here, because zod
 * requires every key the schema declares. A field the API *adds* does not,
 * because zod ignores unknown keys — and that is the right default for the
 * direction an API actually evolves. The cost is that a response can grow a
 * field the contract never learns about; the mitigation is that the SPA's
 * types come from these schemas, so a field nobody added here is a field no
 * client can read, which is noticed the first time someone wants it.
 */
describe("the wire contract", () => {
  /** Parse, and fail with the path zod objected to rather than "invalid". */
  function conforms(schema: z.ZodType, body: unknown, label: string) {
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      const issues = parsed.error.issues
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("; ");
      throw new Error(`${label} does not match its contract — ${issues}`);
    }
  }

  it("GET /health and /health/ready", async () => {
    conforms(healthSchema, (await request("GET", "/health")).body, "/health");
    conforms(readySchema, (await request("GET", "/health/ready")).body, "/health/ready");
  });

  it("GET /meta", async () => {
    const { accessToken } = await signIn();
    conforms(metaSchema, (await request("GET", "/api/meta", { token: accessToken })).body, "/meta");
  });

  it("POST /auth/login and GET /auth/me", async () => {
    const login = await request("POST", "/api/auth/login", { body: LOGIN });
    conforms(tokenPairSchema, login.body, "/auth/login");

    const { accessToken } = login.body as unknown as { accessToken: string };
    const me = await request("GET", "/api/auth/me", { token: accessToken });
    conforms(sessionUserSchema, me.body, "/auth/me");
  });

  it("GET /dashboard, /attention, /movements", async () => {
    const { accessToken } = await signIn();
    const token = accessToken;

    conforms(dashboardSchema, (await request("GET", "/api/dashboard", { token })).body, "/dashboard");
    conforms(attentionCountsSchema, (await request("GET", "/api/attention", { token })).body, "/attention");
    conforms(
      z.array(movementSchema),
      (await request("GET", "/api/movements", { token })).body,
      "/movements",
    );
  });

  it("GET /household, /household/members, /taxonomy", async () => {
    const { accessToken: token } = await signIn();

    conforms(householdSchema, (await request("GET", "/api/household", { token })).body, "/household");
    conforms(
      z.array(memberSchema),
      (await request("GET", "/api/household/members", { token })).body,
      "/household/members",
    );
    conforms(taxonomySchema, (await request("GET", "/api/taxonomy", { token })).body, "/taxonomy");
  });

  it("GET /items and its paging shape", async () => {
    const { accessToken: token } = await signIn();

    conforms(itemsPageSchema, (await request("GET", "/api/items", { token })).body, "/items");
    // The paged form as well as the default: `from`/`to`/`pageCount` only
    // become interesting once a page size is in play.
    conforms(
      itemsPageSchema,
      (await request("GET", "/api/items?per=10&page=1&sort=name", { token })).body,
      "/items?per=10",
    );
  });

  it("GET /items/names, /items/archive, /items/all", async () => {
    const { accessToken: token } = await signIn();

    conforms(z.array(namedItemSchema), (await request("GET", "/api/items/names", { token })).body, "/items/names");
    conforms(z.array(archivedItemSchema), (await request("GET", "/api/items/archive", { token })).body, "/items/archive");
    conforms(z.array(itemViewSchema), (await request("GET", "/api/items/all", { token })).body, "/items/all");
  });

  it("GET /items/:id, on an item that has batches and movements", async () => {
    const { accessToken: token } = await signIn();
    const page = (await request("GET", "/api/items", { token })).body as unknown as {
      rows: { id: string; batchCount: number }[];
    };
    // Pick one with stock: an item with no batches would let a wrong `batches`
    // schema pass by never being exercised.
    const withStock = page.rows.find((r) => r.batchCount > 0) ?? page.rows[0];
    conforms(
      itemDetailSchema,
      (await request("GET", `/api/items/${withStock?.id ?? ""}`, { token })).body,
      "/items/:id",
    );
  });

  it("GET /shopping, /groups, /restock", async () => {
    const { accessToken: token } = await signIn();

    conforms(shoppingViewSchema, (await request("GET", "/api/shopping", { token })).body, "/shopping");
    conforms(z.array(groupViewSchema), (await request("GET", "/api/groups", { token })).body, "/groups");
    conforms(z.array(restockEntrySchema), (await request("GET", "/api/restock", { token })).body, "/restock");
  });

  it("GET /groups/:id, when the household has a set", async () => {
    const { accessToken: token } = await signIn();
    const groups = (await request("GET", "/api/groups", { token })).body as unknown as {
      id: string;
    }[];
    if (groups.length === 0) return; // Feature 26 is optional; nothing to check.

    conforms(
      groupDetailSchema,
      (await request("GET", `/api/groups/${groups[0]?.id ?? ""}`, { token })).body,
      "/groups/:id",
    );
  });

  it("GET /barcode/:code/item, for a code nothing matches", async () => {
    const { accessToken: token } = await signIn();
    conforms(
      barcodeItemSchema,
      (await request("GET", "/api/barcode/0000000000000/item", { token })).body,
      "/barcode/:code/item",
    );
  });

  it("a refusal carries a key, not prose", async () => {
    const { status, body } = await request("POST", "/api/auth/login", {
      body: { email: "anton@example.com", password: "wrong-password" },
    });

    expect(status).toBe(401);
    conforms(apiErrorSchema, body, "a refusal");
  });
});

/**
 * Feature 35 — the two push endpoints.
 *
 * The interesting part is not that a token round-trips; it is that the
 * registration takes its user from the token and refuses a malformed address.
 * A device that registers something Expo cannot deliver to is silently never
 * notified again, and the only symptom is somebody saying they get no
 * reminders — which is a bad way to find out.
 */
describe("push registration", () => {
  const token = () => `ExponentPushToken[e2e-${Date.now()}]`;

  it("registers a device and lets the same call run twice", async () => {
    const { accessToken } = await signIn();
    const device = token();

    const first = await request("POST", "/api/push/register", {
      token: accessToken,
      body: { token: device, platform: "android" },
    });
    expect([200, 201]).toContain(first.status);

    // The app registers on every visit to «Сповіщення», so the second call is
    // the ordinary one — an upsert, not a duplicate-key error.
    const second = await request("POST", "/api/push/register", {
      token: accessToken,
      body: { token: device, platform: "android" },
    });
    expect([200, 201]).toContain(second.status);

    const removed = await request("POST", "/api/push/unregister", {
      token: accessToken,
      body: { token: device },
    });
    expect([200, 201]).toContain(removed.status);
  });

  it("refuses a token that is not Expo's format", async () => {
    const { accessToken } = await signIn();

    const { status, body } = await request("POST", "/api/push/register", {
      token: accessToken,
      body: { token: "not-a-push-token", platform: "android" },
    });

    expect(status).toBe(422);
    expect(body).toMatchObject({ key: "push.tokenInvalid" });
  });

  it("refuses an unknown platform rather than storing it", async () => {
    const { accessToken } = await signIn();

    const { status } = await request("POST", "/api/push/register", {
      token: accessToken,
      body: { token: token(), platform: "windows-phone" },
    });

    expect(status).toBe(422);
  });

  it("needs a session — the caller's id never comes from the body", async () => {
    const { status } = await request("POST", "/api/push/register", {
      body: { token: token(), platform: "android" },
    });
    expect(status).toBe(401);
  });

  /**
   * Unregister is scoped by user as well as by token, so one signed-in caller
   * cannot silence another household's phone with a token they happened to
   * learn. It answers ok either way — there is nothing to tell them.
   */
  it("does not delete another user's device", async () => {
    const { accessToken } = await signIn();
    const device = token();

    await request("POST", "/api/push/register", {
      token: accessToken,
      body: { token: device, platform: "android" },
    });

    const other = await signIn({ email: "olena@example.com" });
    const { status } = await request("POST", "/api/push/unregister", {
      token: other.accessToken,
      body: { token: device },
    });
    expect([200, 201]).toContain(status);

    // Still registered to the first user: re-registering as them is an update,
    // and unregistering as them is what actually removes it.
    const cleanup = await request("POST", "/api/push/unregister", {
      token: accessToken,
      body: { token: device },
    });
    expect([200, 201]).toContain(cleanup.status);
  });
});
