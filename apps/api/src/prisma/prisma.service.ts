import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import type { Env } from "../config/env";

/**
 * The same database the Next app and the Telegram bot use, reached the same way
 * — driver adapter over `pg`, one schema, one set of migrations. Nothing here
 * owns any rules: those live in `@supplies/core`, and the write path they serve
 * is being ported module by module.
 *
 * **Wraps a client rather than extending one.** The usual Nest recipe is
 * `class PrismaService extends PrismaClient`, and it does not work with Prisma
 * 7's `prisma-client` generator: `PrismaClient` there is
 * `getPrismaClientClass()`, a value produced by a factory in a `@ts-nocheck`
 * file, so the base class TypeScript sees carries none of the model delegates
 * or even `$connect`. Composition sidesteps that, and costs one `.client`.
 *
 * It reads better anyway. `PrismaService` is not a database client with some
 * lifecycle bolted on; it is the thing that owns the connection's lifetime.
 *
 * Nest owns that lifetime rather than a module-level singleton. The Next app
 * needs its `globalThis` trick because hot reload re-evaluates modules and
 * would otherwise open a connection per edit; a long-lived API process has one
 * container, constructs this once, and gets a real shutdown hook — which is the
 * half the singleton could never offer.
 */
@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  readonly client: PrismaClient;

  constructor(config: ConfigService<Env, true>) {
    this.client = new PrismaClient({
      adapter: new PrismaPg({
        connectionString: config.get("DATABASE_URL", { infer: true }),
      }),
    });
  }

  async onModuleInit(): Promise<void> {
    /**
     * Connect eagerly. Prisma would connect lazily on the first query, which
     * means a bad `DATABASE_URL` presents as one failed request rather than a
     * process that refused to start — and a container orchestrator would
     * happily route traffic to it in the meantime.
     */
    await this.client.$connect();
    this.logger.log("Database connected");
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }
}
