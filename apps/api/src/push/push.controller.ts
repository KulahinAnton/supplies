import { Body, Controller, Post } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser, type Caller } from "../auth/jwt-auth.guard";
import { zodBody } from "../common/zod.pipe";
import { registerPushDevice, unregisterPushDevice, type PushPlatform } from "../db";
import { registerPushSchema, unregisterPushSchema } from "../core";
import { ApiRefusal } from "../common/openapi";

/**
 * Feature 35 — where a phone says «notify this device» and «stop».
 *
 * Two endpoints and no read: nothing in any client needs the list of devices,
 * and an endpoint that returned every address a household can be reached at
 * would be a worse thing to leak than it is a useful thing to have.
 *
 * The caller's id comes from the token, never from the body. A registration
 * that named its own user would let anybody point a household's reminders at
 * their own phone.
 */
@ApiTags("push")
@Controller("push")
@ApiRefusal(422)
export class PushController {
  @Post("register")
  @ApiOperation({ summary: "Register this device for reminders, or refresh it." })
  async register(
    @CurrentUser() caller: Caller,
    @Body(zodBody(registerPushSchema))
    body: { token: string; platform: PushPlatform },
  ) {
    await registerPushDevice({
      userId: caller.userId,
      token: body.token,
      platform: body.platform,
    });
    return { ok: true };
  }

  @Post("unregister")
  @ApiOperation({ summary: "Stop reminders to this device." })
  async unregister(
    @CurrentUser() caller: Caller,
    @Body(zodBody(unregisterPushSchema)) body: { token: string },
  ) {
    await unregisterPushDevice(caller.userId, body.token);
    return { ok: true };
  }
}
