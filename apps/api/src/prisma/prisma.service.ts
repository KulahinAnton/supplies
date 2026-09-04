import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { prisma } from "../db";

/**
 * Feature 34 — the API's handle on the one client in `packages/db`.
 *
 * It does not construct its own. `packages/db/prisma` is a module-level
 * singleton, and the queries and the stock write path the API shares with the
 * Next app and the bot all close over exactly that instance. A second client
 * here would mean a second connection pool and, worse, two clients where the
 * shared code only ever uses one — so this service would be managing the
 * lifecycle of something nothing else was using.
 *
 * What it does own is the lifecycle: eager connect at boot, disconnect on
 * shutdown. Neither is available to a bare module singleton, and both matter
 * for a long-lived process behind a health check.
 */
@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  readonly client = prisma;

  async onModuleInit(): Promise<void> {
    /**
     * Prisma would connect lazily on the first query, which means a bad
     * `DATABASE_URL` presents as one failed request rather than a process that
     * refused to start — and an orchestrator would route traffic to it in the
     * meantime.
     */
    await this.client.$connect();
    this.logger.log("Database connected");
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }
}
