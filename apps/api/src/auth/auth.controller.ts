import { Body, Controller, Get, Post, Req, Res } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { FastifyReply, FastifyRequest } from "fastify";
import { ConfigService } from "@nestjs/config";
import type { Env } from "../config/env";
import { zodBody } from "../common/zod.pipe";
import { ApiRuleError } from "../common/api-rule-error";
import { loginSchema, registerSchema } from "../core";
import { AuthService, type SessionUser, type TokenPair } from "./auth.service";
import { RegistrationService } from "./registration.service";
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

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly registration: RegistrationService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Public()
  @Post("register")
  @ApiOperation({ summary: "Create an account, and a household unless invited." })
  async register(
    @Body(zodBody(registerSchema)) body: { name: string; email: string; password: string; inviteToken?: string },
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const user = await this.registration.register(body);
    return this.respond(user, request, reply);
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

  private async respond(
    user: SessionUser,
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
