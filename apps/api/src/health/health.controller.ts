import { Controller, Get } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { PrismaService } from "../prisma/prisma.service";

/**
 * What a platform polls to decide whether to send this instance traffic.
 *
 * Two endpoints, because they answer different questions and conflating them
 * causes real outages: a liveness probe that touches the database will restart
 * a perfectly healthy container during a brief database blip, and a readiness
 * probe that does not will route requests to an instance that cannot serve
 * them.
 */
@ApiTags("health")
@Controller("health")
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({
    summary: "Liveness — the process is up. Touches nothing.",
  })
  live(): { status: "ok"; uptime: number } {
    return { status: "ok", uptime: Math.round(process.uptime()) };
  }

  @Get("ready")
  @ApiOperation({
    summary: "Readiness — the process can serve requests, database included.",
  })
  async ready(): Promise<{ status: "ok" | "degraded"; database: boolean }> {
    try {
      await this.prisma.client.$queryRaw`SELECT 1`;
      return { status: "ok", database: true };
    } catch {
      // Deliberately 200 with a body that says otherwise: a readiness endpoint
      // that throws gives the platform a stack trace where it wanted a fact.
      return { status: "degraded", database: false };
    }
  }
}
