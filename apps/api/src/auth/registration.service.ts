import { createHash } from "node:crypto";
import { Injectable } from "@nestjs/common";
import bcrypt from "bcryptjs";
import { PrismaService } from "../prisma/prisma.service";
import { ApiRuleError } from "../common/api-rule-error";
import type { SessionUser } from "./auth.service";
import {
  DEFAULT_CATEGORIES,
  DEFAULT_LOCATIONS,
  defaultHouseholdName,
} from "../core";

type RegisterInput = {
  name: string;
  email: string;
  password: string;
  inviteToken?: string;
};

/**
 * Feature 34 — registration over HTTP, producing a household indistinguishable
 * from one created through the web app's server action.
 *
 * The category and location lists come from `@supplies/core/household-defaults`
 * rather than being repeated here, which is the whole reason they were moved
 * out of `lib/actions/auth.ts`. Same bcrypt cost (12), so a person who signs up
 * on their phone can sign in on the web with the same password.
 */
@Injectable()
export class RegistrationService {
  constructor(private readonly prisma: PrismaService) {}

  async register(input: RegisterInput): Promise<SessionUser> {
    const { name, email, password, inviteToken } = input;

    const taken = await this.prisma.client.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (taken) throw new ApiRuleError(409, "auth.emailTaken");

    const passwordHash = await bcrypt.hash(password, 12);

    const user = inviteToken
      ? await this.joinExisting({ name, email, passwordHash, inviteToken })
      : await this.createHousehold({ name, email, passwordHash });

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      householdId: user.householdId,
    };
  }

  /** Feature 1 — a single-use invite, consumed in the same transaction. */
  private async joinExisting(args: {
    name: string;
    email: string;
    passwordHash: string;
    inviteToken: string;
  }) {
    const tokenHash = createHash("sha256").update(args.inviteToken).digest("hex");
    const invite = await this.prisma.client.householdInvite.findUnique({
      where: { tokenHash },
    });
    if (!invite || invite.usedAt) throw new ApiRuleError(400, "auth.inviteInvalid");
    if (invite.expiresAt.getTime() < Date.now()) {
      throw new ApiRuleError(400, "auth.inviteExpired");
    }

    return this.prisma.client.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: args.name,
          email: args.email,
          passwordHash: args.passwordHash,
          householdId: invite.householdId,
        },
      });
      // Inside the transaction, and conditional on the invite still being
      // unused: two people opening the same link at once must not both join.
      const { count } = await tx.householdInvite.updateMany({
        where: { id: invite.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (count === 0) throw new ApiRuleError(400, "auth.inviteInvalid");
      return user;
    });
  }

  private async createHousehold(args: {
    name: string;
    email: string;
    passwordHash: string;
  }) {
    return this.prisma.client.$transaction(async (tx) => {
      const household = await tx.household.create({
        data: { name: defaultHouseholdName(args.name) },
      });
      await tx.category.createMany({
        data: DEFAULT_CATEGORIES.map((category) => ({
          ...category,
          householdId: household.id,
        })),
      });
      await tx.storageLocation.createMany({
        data: DEFAULT_LOCATIONS.map((location) => ({
          ...location,
          householdId: household.id,
        })),
      });
      return tx.user.create({
        data: {
          name: args.name,
          email: args.email,
          passwordHash: args.passwordHash,
          householdId: household.id,
        },
      });
    });
  }
}
