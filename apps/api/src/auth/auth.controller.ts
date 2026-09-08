import { Body, Controller, Get, Param, Post, Req, Res } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { FastifyReply, FastifyRequest } from "fastify";
import { ConfigService } from "@nestjs/config";
import type { Env } from "../config/env";
import { zodBody } from "../common/zod.pipe";
import { ApiRuleError } from "../common/api-rule-error";
import type { ActionResult } from "../core";
import { loginSchema } from "../core";
import {
  inviteHouseholdName,
  registerUser,
  requestPasswordReset,
  resetPassword,
  type RegisteredUser,
} from "../db";
import { AuthService, type SessionUser, type TokenPair } from "./auth.service";
import { CurrentUser, Public, type Caller } from "./jwt-auth.guard";

/**
 * Feature 34.
 *
 * The refresh token goes back **two ways at once**, and that is deliberate:
 * as an httpOnly cookie, which a browser stores where JavaScript cannot read
 * it, and in the JSON body, which is the only place a React Native app can
 * take it from. Each client uses one and ignores the other.
 */
const REFRESH_COOKIE = "supplies_refresh";

/** Refusals whose HTTP status is not the default 422. */
const REFUSAL_STATUS: Record<string, number | undefined> = {
  "auth.emailTaken": 409,
  "auth.inviteInvalid": 400,
  "auth.inviteExpired": 400,
  "auth.resetLinkInvalid": 400,
};

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Public()
  @Post("register")
  @ApiOperation({ summary: "Create an account, and a household unless invited." })
  async register(
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    /**
     * The rules — including the schema — are in
     * `@supplies/db/account-service`, so a phone that registers and a browser
     * that registers produce households that are indistinguishable. There
     * used to be a `RegistrationService` here with a second copy of them, and
     * the two had already drifted: only this one consumed the invite
     * race-safely, which is the version that survived the merge.
     */
    const result = await registerUser(body);
    return this.respond(this.orRefuse(result), request, reply);
  }

  @Public()
  @Post("forgot-password")
  @ApiOperation({
    summary: "Email a reset link. Always 200, even for an unknown address.",
  })
  async forgotPassword(@Body() body: unknown): Promise<{ ok: true }> {
    /**
     * The always-ok answer is the security property, not an oversight: a
     * caller who could tell "no such user" from "sent" would have a free
     * membership oracle. The link points at `APP_URL`, which is where
     * `/reset-password` is served.
     */
    this.orRefuse(
      await requestPasswordReset(body, {
        appUrl: this.config.get("APP_URL", { infer: true }),
      }),
    );
    return { ok: true };
  }

  @Public()
  @Post("reset-password")
  @ApiOperation({ summary: "Redeem a reset token and set a new password." })
  async resetPassword(@Body() body: unknown): Promise<{ ok: true }> {
    this.orRefuse(await resetPassword(body));
    return { ok: true };
  }

  @Public()
  @Get("invite/:token")
  @ApiOperation({
    summary: "Whose household an invite leads to. 404 once it is spent.",
  })
  async invite(@Param("token") token: string): Promise<{ householdName: string }> {
    const householdName = await inviteHouseholdName(token);
    // A spent, expired or invented token are one answer on purpose — telling
    // them apart would make this a lookup service for guessed tokens.
    if (!householdName) throw new ApiRuleError(404, "auth.inviteInvalid");
    return { householdName };
  }

  @Public()
  @Post("login")
  @ApiOperation({ summary: "Exchange a password for a token pair." })
  async login(
    @Body(zodBody(loginSchema)) body: { email: string; password: string },
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const user = await this.auth.validateUser(body.email, body.password);
    return this.respond(user, request, reply);
  }

  @Public()
  @Post("refresh")
  @ApiOperation({
    summary: "Rotate a refresh token. Replaying a used one revokes every session.",
  })
  async refresh(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Body() body?: { refreshToken?: string },
  ) {
    const presented = this.presentedToken(request, body);
    const pair = await this.auth.refresh(presented, request.headers["user-agent"]);
    this.setCookie(reply, pair.refreshToken);
    return pair;
  }

  @Public()
  @Post("logout")
  @ApiOperation({ summary: "Revoke this device's refresh token." })
  async logout(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Body() body?: { refreshToken?: string },
  ): Promise<{ ok: true }> {
    // No 401 for a missing token: logging out is idempotent, and a client
    // clearing state after its token already expired is not an error.
    const presented = this.cookieOrBody(request, body);
    if (presented) await this.auth.revoke(presented);
    this.clearCookie(reply);
    return { ok: true };
  }

  @Get("me")
  @ApiOperation({ summary: "The signed-in user, re-read from the database." })
  async me(@CurrentUser() caller: Caller): Promise<SessionUser> {
    // Re-read rather than echo the token's claims: a 15-minute access token
    // can outlive a deactivated account (lib/auth-guard.ts makes the same
    // choice for the web app).
    return this.auth.currentUser(caller.userId);
  }

  /**
   * Turn a service refusal into the right status.
   *
   * `unwrap` answers 422 for everything, which is correct for a rule the
   * caller broke and wrong here: a taken email is a conflict, and a token that
   * is spent, expired or invented is a bad request rather than a
   * well-formed-but-wrong one. The mapping lives in the controller because
   * status codes are HTTP's business and not the service's.
   *
   * Listed explicitly rather than matched by prefix. `auth.invite*` happened
   * to mean "dead token" for both keys that existed, and a prefix would have
   * quietly claimed the next one that did not.
   */
  private orRefuse<T>(result: ActionResult<T>): T {
    if (result.ok) return result.data as T;
    throw new ApiRuleError(
      REFUSAL_STATUS[result.error.key] ?? 422,
      result.error.key,
      result.error.params,
    );
  }

  private async respond(
    user: RegisteredUser,
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<TokenPair & { user: SessionUser }> {
    const pair = await this.auth.issue(user, request.headers["user-agent"]);
    this.setCookie(reply, pair.refreshToken);
    return { ...pair, user };
  }

  private cookieOrBody(
    request: FastifyRequest,
    body?: { refreshToken?: string },
  ): string | undefined {
    const fromCookie = request.cookies?.[REFRESH_COOKIE];
    return fromCookie ?? body?.refreshToken;
  }

  private presentedToken(
    request: FastifyRequest,
    body?: { refreshToken?: string },
  ): string {
    const token = this.cookieOrBody(request, body);
    if (!token) throw new ApiRuleError(401, "auth.sessionRequired");
    return token;
  }

  private setCookie(reply: FastifyReply, token: string): void {
    reply.setCookie(REFRESH_COOKIE, token, {
      httpOnly: true,
      path: "/api/auth",
      sameSite: this.config.get("COOKIE_SAMESITE", { infer: true }),
      secure: this.config.get("COOKIE_SECURE", { infer: true }),
      domain: this.config.get("COOKIE_DOMAIN", { infer: true }) || undefined,
      maxAge: this.config.get("REFRESH_TOKEN_TTL_DAYS", { infer: true }) * 86400,
    });
  }

  private clearCookie(reply: FastifyReply): void {
    reply.clearCookie(REFRESH_COOKIE, { path: "/api/auth" });
  }
}
