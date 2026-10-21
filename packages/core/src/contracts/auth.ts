import * as z from "zod";

/**
 * The signed-in user, re-read from the database rather than decoded from the
 * token — a 15-minute access token can outlive a deactivated account.
 */
export const sessionUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  householdId: z.string(),
});

/**
 * Feature 34 — the refresh token goes back **two ways at once**, and that is
 * deliberate: as an httpOnly cookie a browser stores where JavaScript cannot
 * reach it, and in this body, which is the only place a React Native app can
 * take it from. Each client uses one and ignores the other.
 */
export const tokenPairSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number().int(),
  user: sessionUserSchema.optional(),
});

/** Whose household an invite leads to. 404 once the token is spent. */
export const inviteHouseholdSchema = z.object({ householdName: z.string() });

/** An idempotent write with nothing to say back. */
export const okSchema = z.object({ ok: z.literal(true) });

export const healthSchema = z.object({
  status: z.literal("ok"),
  uptime: z.number(),
});

export const readySchema = z.object({
  status: z.enum(["ok", "degraded"]),
  database: z.boolean(),
});

/** What the API knows that no client should hard-code. */
export const metaSchema = z.object({
  units: z.array(z.string()),
  movementReasons: z.array(z.string()),
});

export type SessionUser = z.infer<typeof sessionUserSchema>;
export type TokenPair = z.infer<typeof tokenPairSchema>;
export type InviteHousehold = z.infer<typeof inviteHouseholdSchema>;
export type Health = z.infer<typeof healthSchema>;
export type Ready = z.infer<typeof readySchema>;
export type Meta = z.infer<typeof metaSchema>;
