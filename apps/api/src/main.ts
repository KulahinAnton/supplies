import "reflect-metadata";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";
import { RuleErrorFilter } from "./common/rule-error.filter";
import type { Env } from "./config/env";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );

  const config = app.get<ConfigService<Env, true>>(ConfigService);
  const origins = config.get("CORS_ORIGINS", { infer: true });
  const jwtSecret = config.get("API_JWT_SECRET", { infer: true });

  await app.register(helmet, {
    // The API serves JSON and an OpenAPI page, never a document that embeds
    // third-party script. CSP off here would be one fewer thing lying.
    contentSecurityPolicy: false,
  });
  await app.register(cookie, {
    secret: jwtSecret,
  });

  /**
   * `credentials` because the refresh token travels as an httpOnly cookie for
   * browser clients. The React Native app sends a bearer token instead and
   * needs none of this — see SPA_API_PORT.md §4.2 for why the cookie settings
   * are environment variables rather than constants.
   */
  app.enableCors({ origin: origins, credentials: true });

  /**
   * No global `ValidationPipe` here, deliberately. Nest's default one is built
   * on class-validator, and this API validates with the zod schemas in
   * `@supplies/core/validation` — the same objects the Next app's forms, and
   * soon the SPA's and the phone's, resolve against. Two validation libraries
   * would mean two definitions of a valid item, and the second one always
   * drifts.
   *
   * The zod pipe lands with the first endpoint that takes a body (Phase 1.5).
   */
  app.useGlobalFilters(new RuleErrorFilter());

  app.setGlobalPrefix("api", { exclude: ["health", "health/ready"] });
  app.enableShutdownHooks();

  SwaggerModule.setup(
    "docs",
    app,
    SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle("Supplies API")
        .setDescription(
          "Household stock and expiry tracking. The rules behind these endpoints live in @supplies/core and are shared with the Next.js app, the SPA, the React Native app and the Telegram bot.",
        )
        .setVersion("0.0.0")
        .addBearerAuth()
        .build(),
    ),
  );

  const port = config.get("API_PORT", { infer: true });
  // 0.0.0.0, not localhost: a phone on the same network has to reach this, and
  // so does a container's own health check.
  await app.listen(port, "0.0.0.0");

  const logger = new Logger("bootstrap");
  logger.log(`Listening on http://localhost:${port}`);
  logger.log(`OpenAPI at http://localhost:${port}/docs`);
  logger.log(`CORS allows ${origins.join(", ")}`);
}

void bootstrap();
