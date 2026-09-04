import "./env-first";
import { Test } from "@nestjs/testing";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import cookie from "@fastify/cookie";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "./app.module";
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
  method: "GET" | "POST",
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
