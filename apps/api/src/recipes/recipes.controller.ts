import { Controller, Post } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { CurrentUser, type Caller } from "../auth/jwt-auth.guard";
import { unwrap } from "../common/unwrap";
import { suggestRecipe } from "../db";
import { ApiRefusal } from "../common/openapi";

/**
 * Feature 32 — «Рецепти».
 *
 * POST, not GET: it is not idempotent in the way that matters, because every
 * call costs money at an external provider. A GET invites a browser, a proxy
 * or a prefetch to make one nobody asked for.
 *
 * Tightened well below the global limit for the same reason. 120 requests a
 * minute is a sensible default for reads; 120 Claude calls a minute is a bill.
 * The household switch and the almost-empty-pantry refusal both live in the
 * service, so they hold for every client — but neither of them is a rate limit.
 */
@ApiTags("recipes")
@Controller("recipes")
@ApiRefusal(422)
export class RecipesController {
  @Post("suggest")
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  @ApiOperation({
    summary: "Ask Claude for one Ukrainian dish from what the household has.",
  })
  async suggest(@CurrentUser() caller: Caller) {
    return unwrap(await suggestRecipe(caller));
  }
}
