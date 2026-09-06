import { Body, Controller, Post } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser, type Caller } from "../auth/jwt-auth.guard";
import type { Env } from "../config/env";
import { unwrap } from "../common/unwrap";
import { changePassword, createInvite } from "../db";

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
export class AccountController {
  constructor(private readonly config: ConfigService<Env, true>) {}

  @Post("password")
  @ApiOperation({
    summary: "Change your own password. The current one has to be right.",
  })
  async password(
    @CurrentUser() caller: Caller,
    @Body() body: { currentPassword?: string; newPassword?: string },
  ) {
    // The zod schema in `@supplies/core/validation/auth` is applied inside the
    // service, so the web form and this endpoint refuse the same passwords for
    // the same reasons — and both answer with a message key.
    return unwrap(await changePassword(caller, body));
  }

  @Post("invite")
  @ApiOperation({ summary: "A single-use invite link, valid 7 days." })
  async invite(@CurrentUser() caller: Caller, @Body() body: { email?: string }) {
    /**
     * The link points at `APP_URL` — the Next app — because that is where
     * `/join/:token` is actually served. The SPA has no join page yet, and
     * handing out a link to a route that does not exist would be worse than
     * pointing both clients at one canonical place to accept an invitation.
     */
    return unwrap(
      await createInvite(caller, {
        appUrl: this.config.get("APP_URL", { infer: true }),
        email: body.email,
      }),
    );
  }
}
