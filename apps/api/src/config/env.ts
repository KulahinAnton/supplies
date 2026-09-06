import { z } from "zod";

/**
 * Every origin this API knows about is a variable with a localhost default
 * (SPA_API_PORT.md §4.2). No domain appears in source, so the first deploy is
 * a matter of filling values in rather than editing code.
 *
 * Validated **once, at boot**, and loudly. A missing or malformed origin has
 * to be a refusal to start naming the variable — not a CORS failure at 2am
 * that reads like a browser bug.
 */

/**
 * "a, b ,c" → ["a", "b", "c"], dropping blanks, then checked as URLs.
 *
 * The fallback is applied to the *input* rather than after the pipe. Zod's
 * `.default()` substitutes for the schema's OUTPUT, so writing
 * `csv.default("http://…")` hands the parsed value straight through as a
 * string — and `CORS_ORIGINS[0]` becomes `"h"`. The unit test found that,
 * which is the whole reason a config schema deserves tests.
 */
const originList = (fallback: string) =>
  z
    .string()
    .default(fallback)
    .transform((value) =>
      value
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean),
    )
    .pipe(z.array(z.url()).min(1));

const booleanish = z
  .enum(["true", "false", "1", "0"])
  .transform((value) => value === "true" || value === "1");

const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

    /** The same Postgres the Next app and the bot use. One database, four clients. */
    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

    /**
     * 3200 on purpose. 3000 is `pnpm dev`, 3100 is the Playwright build, 5173
     * is Vite — a collision here would look like the API silently not
     * restarting.
     */
    API_PORT: z.coerce.number().int().min(1).max(65535).default(3200),

    /**
     * Who may call this API from a browser. The SPA and the Next app locally;
     * real origins once they exist.
     */
    CORS_ORIGINS: originList("http://localhost:5173,http://localhost:3000"),

    /**
     * Empty means a host-only cookie, which is what you want on localhost.
     * Set it to a shared parent (".supplies.app") when the SPA and the API
     * live on sibling subdomains.
     */
    COOKIE_DOMAIN: z.string().optional(),
    COOKIE_SAMESITE: z.enum(["lax", "strict", "none"]).default("lax"),
    COOKIE_SECURE: booleanish.default(false),

    /**
     * Signs access and refresh tokens. Deliberately NOT `AUTH_SECRET`: that one
     * signs Auth.js sessions and the Telegram link tokens, and rotating it to
     * fix one system should not silently sign every user out of the other two.
     *
     * No default. A fallback secret is a fallback that reaches production.
     */
    API_JWT_SECRET: z
      .string()
      .min(
        32,
        'API_JWT_SECRET must be at least 32 characters. Generate one with:\n  node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"',
      ),

    /** Short, because a stolen one cannot be revoked before it expires. */
    ACCESS_TOKEN_TTL: z.string().default("15m"),
    /** Long, and rotated on every use — revocable, unlike the access token. */
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).default(30),

    /**
     * Where `/join/:token` is actually served — the Next app. An invitation
     * created through this API still has to be accepted somewhere, and the
     * SPA has no join page; handing out a link to a route that does not exist
     * would be worse than one canonical place to accept an invitation.
     */
    APP_URL: z.url().default("http://localhost:3000"),

    /**
     * Feature 9 — signs the Telegram deep-link token. This is `AUTH_SECRET`
     * on purpose and not `API_JWT_SECRET`: the bot verifies these tokens with
     * the secret the Next app signs them with, and a link minted here must be
     * redeemable there. Optional, because a household with no bot configured
     * should not stop the API booting — the endpoint refuses instead.
     */
    AUTH_SECRET: z.string().optional(),
    TELEGRAM_BOT_USERNAME: z.string().optional(),
    TELEGRAM_BOT_TOKEN: z.string().optional(),
  })
  /**
   * The cookie settings are a matched set, not three independent switches.
   * `SameSite=None` without `Secure` is dropped silently by every current
   * browser — the login simply never sticks, with nothing in any log to say
   * why. Refusing to boot is the kinder failure.
   */
  .refine((env) => env.COOKIE_SAMESITE !== "none" || env.COOKIE_SECURE, {
    message:
      "COOKIE_SAMESITE=none requires COOKIE_SECURE=true — browsers drop the cookie otherwise, and the only symptom is a login that never sticks.",
    path: ["COOKIE_SECURE"],
  })
  /**
   * A cross-site cookie needs HTTPS origins to be worth anything, and an
   * http:// origin in a deployed allowlist is nearly always a paste error.
   */
  .refine(
    (env) =>
      env.NODE_ENV !== "production" ||
      env.CORS_ORIGINS.every((origin) => origin.startsWith("https://")),
    {
      message: "CORS_ORIGINS must be https:// in production",
      path: ["CORS_ORIGINS"],
    },
  );

export type Env = z.infer<typeof schema>;

/**
 * Wired into `ConfigModule.forRoot({ validate })`, which calls this before a
 * single provider is constructed.
 */
export function validateEnv(raw: Record<string, unknown>): Env {
  const result = schema.safeParse(raw);
  if (result.success) return result.data;

  const lines = result.error.issues.map(
    (issue) => `  ${issue.path.join(".") || "(root)"}: ${issue.message}`,
  );
  throw new Error(
    `Invalid environment for @supplies/api:\n${lines.join("\n")}\n\n` +
      "See .env.example — every value has a working localhost default except the secret.",
  );
}
