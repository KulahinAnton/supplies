import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { validateEnv } from "./config/env";
import { HealthController } from "./health/health.controller";
import { MetaController } from "./meta/meta.controller";
import { PrismaModule } from "./prisma/prisma.module";
import { AuthModule } from "./auth/auth.module";
import { BarcodeController } from "./barcode/barcode.controller";
import { DashboardController } from "./dashboard/dashboard.controller";
import { ItemsController } from "./items/items.controller";
import { RecipesController } from "./recipes/recipes.controller";
import { SettingsController } from "./settings/settings.controller";
import { ShoppingController } from "./shopping/shopping.controller";
import { ShoppingGroupsController } from "./shopping/shopping-groups.controller";
import { StockController } from "./stock/stock.controller";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      /**
       * The repo root's `.env`, so the API, the Next app, the bot and the
       * Prisma CLI all read one file. Four copies of `DATABASE_URL` that can
       * disagree is not a configuration system.
       */
      envFilePath: ["../../.env.local", "../../.env"],
      validate: validateEnv,
    }),

    /**
     * A blunt default over everything, tightened per-route later — the auth
     * endpoints in particular, where the useful limit is per-email rather than
     * per-IP.
     *
     * In-memory, which is correct for one long-lived process and is one of the
     * reasons this API does not belong on a serverless platform: every request
     * would be a fresh instance and the counter would always read zero.
     */
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),

    PrismaModule,
    AuthModule,
  ],
  controllers: [
    HealthController,
    MetaController,
    BarcodeController,
    DashboardController,
    ItemsController,
    RecipesController,
    SettingsController,
    ShoppingController,
    ShoppingGroupsController,
    StockController,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
