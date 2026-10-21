import { Body, Controller, Post } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser, type Caller } from "../auth/jwt-auth.guard";
import type { Env } from "../config/env";
import { unwrap } from "../common/unwrap";
import { changePassword, createInvite } from "../db";
import { ApiRefusal } from "../common/openapi";

/**
 * The two things Settings lets you do to an account: change your password,
 * and invite someone into the household.
 *
 * Separate from `AuthController`, which is about *this session* — logging in,
 * rotating a refresh token, logging out. These need a caller who is already
 * signed in, and the guard is what distinguishes them.
 */
@ApiTags("account")
@Controller("account")
@ApiRefusal(422)
export class AccountController {
  constructor(private readonly config: ConfigService<Env, true>) {}

  @Post("password")
  @ApiOperation({
    summary:
      "Change your own password. The current one has to be right. Signs out every other session.",
  })
  async password(
    @CurrentUser() caller: Caller,
    @Body() body: { currentPassword?: string; newPassword?: string },
  ) {
    // The zod schema in `@supplies/core/validation/auth` is applied inside the
    // service, so the web form and this endpoint refuse the same passwords for
    // the same reasons — and both answer with a message key.
    // Every other session for this user ends; this one stays signed in.
    return unwrap(
      await changePassword(caller, body, { keepSessionId: caller.sessionId }),
    );
  }

  @Post("invite")
  @ApiOperation({ summary: "A single-use invite link, valid 7 days." })
  async invite(@CurrentUser() caller: Caller, @Body() body: { email?: string }) {
    /**
     * The link points at `APP_URL`, and now that the SPA has a `/join/:token`
     * of its own that is a CHOICE rather than a constraint.
     *
     * An invitation goes to someone who has no account yet, so they have no
     * preference between the two clients — but the person sending it does,
     * and it is the one they are looking at. `APP_URL` is a single setting
     * either client can be pointed at; two links for one invite would be a
     * second token or a second answer to "which one is canonical".
     */
    return unwrap(
      await createInvite(caller, {
        appUrl: this.config.get("APP_URL", { infer: true }),
        email: body.email,
      }),
    );
  }
}
