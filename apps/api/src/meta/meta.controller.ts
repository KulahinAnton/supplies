import { Controller, Get } from "@nestjs/common";
import { Public } from "../auth/jwt-auth.guard";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { MOVEMENT_REASONS, UNITS } from "../core";

/**
 * The enumerations a client needs before it can render a form.
 *
 * Served rather than duplicated on purpose. The SPA and the React Native app
 * both need the unit list for their «Одиниця» dropdowns, and a hardcoded copy
 * in either of them is a copy that will still say six units on the day the
 * schema has seven — with the only symptom being a save that fails validation
 * for reasons the form cannot explain.
 *
 * These come from `@supplies/core/units`, which is the same module the zod
 * schemas validate against and the same one `lib/units.test.ts` pins to the
 * Prisma enum. One list, one source, four clients.
 */
@Public()
@ApiTags("meta")
@Controller("meta")
export class MetaController {
  @Get()
  @ApiOperation({
    summary: "Enumerations the clients need — units and movement reasons.",
  })
  meta(): { units: readonly string[]; movementReasons: readonly string[] } {
    return { units: UNITS, movementReasons: MOVEMENT_REASONS };
  }
}
