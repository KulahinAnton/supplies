import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import bcrypt from "bcryptjs";
import type { Env } from "../config/env";
import { PrismaService } from "../prisma/prisma.service";
import { ApiRuleError } from "../common/api-rule-error";
import {
  classifyRefresh,
  hashToken,
  newRefreshToken,
  refreshExpiry,
  type AccessClaims,
} from "./tokens";

export type TokenPair = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
};

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  householdId: string;
};

/**
 * Feature 34. The same `User` rows and the same bcrypt hashes the Next app
 * uses — one password per person, whichever client they sign in from.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async validateUser(email: string, password: string): Promise<SessionUser> {
    const user = await this.prisma.client.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });

    /**
     * One message for "no such user" and for "wrong password", and the bcrypt
     * comparison runs either way. Branching early would leak which emails have
     * accounts through response timing — the same reason `auth.ts` returns a
     * bare null for both.
     */
    const hash = user?.passwordHash ?? DUMMY_HASH;
    const correct = await bcrypt.compare(password, hash);

    if (!user || !user.isActive || !correct) {
      throw new ApiRuleError(401, "auth.invalidCredentials");
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      householdId: user.householdId,
    };
  }

  /**
   * Issues a pair and records the refresh token's hash.
   *
   * The row is written first so the access token can carry its id as `sid`:
   * that is how a password change knows which session is the caller's own and
   * keeps it (Feature 1).
   */
  async issue(user: SessionUser, userAgent?: string): Promise<TokenPair> {
    const refreshToken = newRefreshToken();
    const days = this.config.get("REFRESH_TOKEN_TTL_DAYS", { infer: true });
    const session = await this.prisma.client.apiRefreshToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(refreshToken),
        expiresAt: refreshExpiry(days),
        userAgent: userAgent?.slice(0, 255),
      },
      select: { id: true },
    });

    const claims: AccessClaims = {
      sub: user.id,
      householdId: user.householdId,
      email: user.email,
      sid: session.id,
    };
    const accessToken = await this.jwt.signAsync(claims);

    return { accessToken, refreshToken, expiresIn: this.accessTtlSeconds() };
  }

  /**
   * Rotate. The presented token is revoked and a new pair issued, both inside
   * one transaction — a crash between the two would otherwise leave a client
   * holding a token the database has already retired.
   */
  async refresh(presented: string, userAgent?: string): Promise<TokenPair> {
    const stored = await this.prisma.client.apiRefreshToken.findUnique({
      where: { tokenHash: hashToken(presented) },
      include: { user: true },
    });
    if (!stored) throw new ApiRuleError(401, "auth.sessionRequired");

    const verdict = classifyRefresh(stored);

    if (verdict.status === "reused") {
      /**
       * Either a bug or a stolen token being replayed, and this cannot tell
       * which — so the whole family goes. See PROJECT_PROMPT.md Feature 34: a
       * legitimate user signing in again is a smaller harm than an attacker
       * keeping a session alive.
       */
      await this.revokeAllFor(stored.userId);
      this.logger.warn(
        `Refresh token reuse for user ${stored.userId}; all sessions revoked`,
      );
      throw new ApiRuleError(401, "auth.sessionRequired");
    }
    if (verdict.status === "raced") {
      /**
       * Two callers holding the same token, started within `REFRESH_GRACE_MS`
       * of each other — the loser is presenting what the winner already
       * rotated. Issue it a pair of its own and leave the family alone.
       *
       * Not the winner's token: each caller ends up with its own row, so
       * per-device revocation still means what it says. The cost is that a
       * family briefly has two live tokens, which rotation on the next use
       * settles.
       *
       * Logged at `debug` rather than `warn`. This is expected traffic — two
       * browser tabs restoring together — and a warning per tab pair would
       * train whoever reads the logs to skip the real reuse warning above.
       */
      this.logger.debug(
        `Refresh race for user ${stored.userId}; issuing a pair inside the grace window`,
      );
    }
    // Ended by a password reset or change. Refused, and deliberately not read
    // as theft: that device was signed out on purpose and does not know it yet.
    if (verdict.status === "revoked") throw new ApiRuleError(401, "auth.sessionRequired");
    if (verdict.status === "expired") throw new ApiRuleError(401, "auth.sessionRequired");
    if (!stored.user.isActive) throw new ApiRuleError(401, "auth.sessionRequired");

    // Only the winner's row needs retiring. A raced token is already revoked,
    // and re-stamping `revokedAt` would slide the grace window forward on
    // every replay — turning a ten-second allowance into an open one.
    if (verdict.status === "ok") {
      await this.prisma.client.apiRefreshToken.update({
        where: { id: stored.id },
        data: { revokedAt: new Date(), revokedReason: "rotated" },
      });
    }

    return this.issue(
      {
        id: stored.user.id,
        email: stored.user.email,
        name: stored.user.name,
        householdId: stored.user.householdId,
      },
      userAgent,
    );
  }

  /** Sign out this device. Unknown tokens are a no-op — nothing to leak. */
  async revoke(presented: string): Promise<void> {
    await this.prisma.client.apiRefreshToken.updateMany({
      where: { tokenHash: hashToken(presented), revokedAt: null },
      // `logout`, not `rotated`: signing out and then refreshing must fail,
      // grace window or not.
      data: { revokedAt: new Date(), revokedReason: "logout" },
    });
  }

  async revokeAllFor(userId: string): Promise<void> {
    await this.prisma.client.apiRefreshToken.updateMany({
      where: { userId, revokedAt: null },
      // `reuse`, so none of these gets the rotation grace window. Stamping them
      // as rotations would hand the attacker who triggered this a fresh pair.
      data: { revokedAt: new Date(), revokedReason: "reuse" },
    });
  }

  /**
   * Re-read the user rather than trusting the token's claims, exactly as
   * `lib/auth-guard.ts` `validSessionOrNull()` does. A 15-minute access token
   * can outlive a deactivated account, and the API must not be the one surface
   * where that still works.
   */
  async currentUser(userId: string): Promise<SessionUser> {
    const user = await this.prisma.client.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive) throw new ApiRuleError(401, "auth.sessionRequired");
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      householdId: user.householdId,
    };
  }

  private accessTtlSeconds(): number {
    const ttl = this.config.get("ACCESS_TOKEN_TTL", { infer: true });
    const match = /^(\d+)([smhd])$/.exec(ttl);
    if (!match) return 900;
    const size = { s: 1, m: 60, h: 3600, d: 86400 }[match[2]] ?? 60;
    return Number(match[1]) * size;
  }
}

/**
 * A real bcrypt hash of a value nobody knows, compared against when the email
 * does not exist so that both branches cost the same. `bcrypt.compare` returns
 * false for it; what matters is that it takes as long as a real check.
 */
const DUMMY_HASH = "$2b$12$C6UzMDM.H6dfI/f/IKcEe.7bYPhbHfhrEV3FhE1P5Uk6HgYbXTQBK";
