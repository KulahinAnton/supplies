import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { JwtModule } from "@nestjs/jwt";
import type { Env } from "../config/env";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { RegistrationService } from "./registration.service";

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        secret: config.get("API_JWT_SECRET", { infer: true }),
        signOptions: { expiresIn: config.get("ACCESS_TOKEN_TTL", { infer: true }) },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    RegistrationService,
    // Global, so a new controller is protected by default and has to opt out
    // loudly with @Public(). Opt-in protection fails silently when forgotten.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
