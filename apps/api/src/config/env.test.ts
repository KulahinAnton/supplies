import { describe, expect, it } from "vitest";
import { validateEnv } from "./env";

/**
 * The config is the one part of the API that runs before anything else, so a
 * mistake here is a mistake nothing downstream can compensate for. These tests
 * cover the two things a schema is actually for: sane defaults, and refusing
 * combinations that would fail silently at runtime.
 */

const MINIMAL = {
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5434/supplies",
  API_JWT_SECRET: "0".repeat(32),
};

describe("defaults", () => {
  it("boots on localhost with nothing but a database and a secret", () => {
    const env = validateEnv(MINIMAL);
    expect(env.API_PORT).toBe(3200);
    expect(env.CORS_ORIGINS).toEqual([
      "http://localhost:5173",
      "http://localhost:3000",
    ]);
    expect(env.COOKIE_SAMESITE).toBe("lax");
    expect(env.COOKIE_SECURE).toBe(false);
    expect(env.COOKIE_DOMAIN).toBeUndefined();
  });

  it("splits and trims an origin list, dropping blanks", () => {
    const env = validateEnv({
      ...MINIMAL,
      CORS_ORIGINS: " https://app.example.com , https://admin.example.com ,",
    });
    expect(env.CORS_ORIGINS).toEqual([
      "https://app.example.com",
      "https://admin.example.com",
    ]);
  });

  it("rejects an origin that is not a URL, rather than allowing nothing", () => {
    // A typo here would otherwise present as "CORS blocks my app" with a
    // perfectly healthy-looking API.
    expect(() => validateEnv({ ...MINIMAL, CORS_ORIGINS: "app.example.com" })).toThrow(
      /CORS_ORIGINS/,
    );
  });
});

describe("the secret", () => {
  it("has no default — a fallback secret is one that reaches production", () => {
    expect(() => validateEnv({ DATABASE_URL: MINIMAL.DATABASE_URL })).toThrow(
      /API_JWT_SECRET/,
    );
  });

  it("refuses a short one, and says how to make a real one", () => {
    expect(() => validateEnv({ ...MINIMAL, API_JWT_SECRET: "short" })).toThrow(
      /randomBytes/,
    );
  });
});

describe("cookie settings are a matched set", () => {
  it("refuses SameSite=None without Secure", () => {
    // Browsers drop that cookie silently. The only symptom is a login that
    // never sticks, with nothing in any log to explain it.
    expect(() =>
      validateEnv({ ...MINIMAL, COOKIE_SAMESITE: "none", COOKIE_SECURE: "false" }),
    ).toThrow(/COOKIE_SECURE/);
  });

  it("allows SameSite=None with Secure", () => {
    const env = validateEnv({
      ...MINIMAL,
      COOKIE_SAMESITE: "none",
      COOKIE_SECURE: "true",
    });
    expect(env.COOKIE_SECURE).toBe(true);
  });

  it("leaves lax alone, which is the localhost case", () => {
    expect(validateEnv(MINIMAL).COOKIE_SAMESITE).toBe("lax");
  });
});

describe("production tightens what development allows", () => {
  it("refuses an http origin once deployed", () => {
    expect(() =>
      validateEnv({
        ...MINIMAL,
        NODE_ENV: "production",
        CORS_ORIGINS: "https://app.example.com,http://staging.example.com",
      }),
    ).toThrow(/https/);
  });

  it("still allows http on localhost, which is the whole point of the default", () => {
    expect(validateEnv(MINIMAL).CORS_ORIGINS[0]).toBe("http://localhost:5173");
  });
});

describe("error reporting", () => {
  it("names every bad variable at once, not the first one", () => {
    // Fixing a config one restart at a time is how a five-minute job becomes
    // an hour. Every issue in the same message.
    let message = "";
    try {
      validateEnv({ API_PORT: "not-a-port" });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain("DATABASE_URL");
    expect(message).toContain("API_JWT_SECRET");
    expect(message).toContain("API_PORT");
  });
});
