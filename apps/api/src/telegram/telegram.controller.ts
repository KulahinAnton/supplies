import { Controller, Post } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser, type Caller } from "../auth/jwt-auth.guard";
import type { Env } from "../config/env";
import { unwrap } from "../common/unwrap";
import { createTelegramLink } from "../db";
import { sendDigestNow } from "../bot";

/**
 * Feature 9 and 19.1 — the two Telegram buttons on the Settings screen.
 *
 * **These were deliberately skipped when the API was built**, on the grounds
 * that they were settings-page conveniences next to a bot the web app already
 * links, and that serving them would drag grammy into this process for one
 * button. The Settings screen changed that: parity means the SPA offers the
 * same two buttons, and the alternative was telling someone to go and use the
 * other client.
 *
 * The cost is real and worth naming: this API now depends on `@supplies/bot`,
 * and therefore on grammy, to send a digest. Reading whether a chat is linked
 * (`GET /api/telegram/linked`) never did — that is a database row.
 */
@ApiTags("telegram")
@Controller("telegram")
export class TelegramController {
  constructor(private readonly config: ConfigService<Env, true>) {}

  @Post("link")
  @ApiOperation({ summary: "A 15-minute deep link that binds a chat to you." })
  link(@CurrentUser() caller: Caller) {
    /**
     * `AUTH_SECRET`, not `API_JWT_SECRET`. The bot verifies this token with
     * the secret the Next app signs them with, so a link minted here has to
     * be redeemable there — signing it with the API's own key would produce
     * a link that looks right and is rejected on arrival.
     */
    return unwrap(
      createTelegramLink(caller, {
        authSecret: this.config.get("AUTH_SECRET", { infer: true }),
        botUsername: this.config.get("TELEGRAM_BOT_USERNAME", { infer: true }),
      }),
    );
  }

  @Post("digest")
  @ApiOperation({
    summary: "Send the daily digest now. Does not cancel the scheduled one.",
  })
  async digest(@CurrentUser() caller: Caller) {
    return unwrap(
      await sendDigestNow(
        caller.householdId,
        this.config.get("TELEGRAM_BOT_TOKEN", { infer: true }),
      ),
    );
  }
}
