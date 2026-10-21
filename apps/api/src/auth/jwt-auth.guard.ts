import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
  createParamDecorator,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import type { FastifyRequest } from "fastify";
import { ApiRuleError } from "../common/api-rule-error";
import type { AccessClaims } from "./tokens";

export const IS_PUBLIC = "isPublic";

/** Opts a route out of the global guard. Login cannot require a login. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export type Caller = {
  userId: string;
  householdId: string;
  email: string;
  /** The caller's session (`AccessClaims.sid`), absent on tokens minted before it existed. */
  sessionId?: string;
};

type AuthedRequest = FastifyRequest & { caller?: Caller };

/**
 * Feature 34 — applied globally in `AuthModule`, so a new controller is
 * protected by default and has to say otherwise out loud with `@Public()`.
 *
 * The opposite arrangement — opt in per route — is how endpoints end up
 * unprotected: forgetting a decorator produces no error, no test failure and no
 * log line, just an open door.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const header = request.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      throw new ApiRuleError(401, "auth.sessionRequired");
    }

    let claims: AccessClaims;
    try {
      claims = await this.jwt.verifyAsync<AccessClaims>(header.slice(7));
    } catch {
      // Expired and forged tokens are the same answer on purpose: a client
      // that is told "expired" learns the token was otherwise valid.
      throw new ApiRuleError(401, "auth.sessionRequired");
    }

    request.caller = {
      userId: claims.sub,
      householdId: claims.householdId,
      email: claims.email,
      sessionId: claims.sid,
    };
    return true;
  }
}

/**
 * `householdId` reaches a handler as an argument, never as something it looks
 * up. A handler that forgets to scope its query has to leave the parameter
 * unused, which is a lint error — the scoping rule is enforced rather than
 * remembered (PROJECT_PROMPT.md Feature 34).
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): Caller => {
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    if (!request.caller) {
      // Only reachable if a route is @Public() and still asks for a caller.
      throw new ApiRuleError(401, "auth.sessionRequired");
    }
    return request.caller;
  },
);
