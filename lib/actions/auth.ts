"use server";

import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-guard";
import { actionError, actionOk, type ActionResult } from "@supplies/core/action-result";
import { ruleMessage } from "@supplies/core/messages";
import { inviteEmail, passwordResetEmail, sendEmail } from "@/lib/email";
import {
  changePasswordSchema,
  forgotPasswordSchema,
  registerSchema,
  resetPasswordSchema,
} from "@supplies/core/validation/auth";
import { firstIssueAsRuleMessage } from "@supplies/core/validation/shared";

const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");

const newToken = () => randomBytes(32).toString("base64url");

/** Ukrainian defaults every new household starts with (Feature 0/3). */
const DEFAULT_CATEGORIES = [
  { name: "Продукти", icon: "apple", sortOrder: 0 },
  { name: "Напої", icon: "cup-soda", sortOrder: 1 },
  { name: "Побутова хімія", icon: "spray-can", sortOrder: 2 },
  { name: "Гігієна", icon: "bath", sortOrder: 3 },
  { name: "Ліки", icon: "pill", sortOrder: 4 },
  { name: "Для тварин", icon: "paw-print", sortOrder: 5 },
  { name: "Інше", icon: "package", sortOrder: 6 },
];

const DEFAULT_LOCATIONS = [
  { name: "Комора", sortOrder: 0 },
  { name: "Холодильник", sortOrder: 1 },
  { name: "Морозильник", sortOrder: 2 },
  { name: "Ванна кімната", sortOrder: 3 },
  { name: "Гараж", sortOrder: 4 },
];

/**
 * Register. Without an invite token this creates a NEW household and seeds its
 * categories and storage locations; with one, the user joins the inviting
 * household instead (Feature 1).
 */
export async function registerAction(input: unknown): Promise<ActionResult> {
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) return actionError(firstIssueAsRuleMessage(parsed.error));

  const { name, email, password, inviteToken } = parsed.data;

  const taken = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (taken) return actionError(ruleMessage("auth.emailTaken"));

  const passwordHash = await bcrypt.hash(password, 12);

  if (inviteToken) {
    const invite = await prisma.householdInvite.findUnique({
      where: { tokenHash: hashToken(inviteToken) },
    });
    if (!invite || invite.usedAt) {
      return actionError(ruleMessage("auth.inviteInvalid"));
    }
    if (invite.expiresAt.getTime() < Date.now()) {
      return actionError(ruleMessage("auth.inviteExpired"));
    }

    await prisma.$transaction(async (tx) => {
      await tx.user.create({
        data: { name, email, passwordHash, householdId: invite.householdId },
      });
      await tx.householdInvite.update({
        where: { id: invite.id },
        data: { usedAt: new Date() },
      });
    });

    return actionOk();
  }

  await prisma.$transaction(async (tx) => {
    const household = await tx.household.create({
      data: { name: `Родина ${name}` },
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
    await tx.user.create({
      data: { name, email, passwordHash, householdId: household.id },
    });
  });

  return actionOk();
}

export async function changePasswordAction(input: unknown): Promise<ActionResult> {
  const session = await requireSession();
  const parsed = changePasswordSchema.safeParse(input);
  if (!parsed.success) return actionError(firstIssueAsRuleMessage(parsed.error));

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user) return actionError(ruleMessage("auth.sessionRequired"));

  const valid = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
  if (!valid) return actionError(ruleMessage("auth.currentPasswordWrong"));

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(parsed.data.newPassword, 12) },
  });

  return actionOk();
}

/**
 * Always reports success — an unknown address must look exactly like a known
 * one, or this becomes a way to test whether someone has an account.
 */
export async function requestPasswordResetAction(
  input: unknown,
): Promise<ActionResult> {
  const parsed = forgotPasswordSchema.safeParse(input);
  if (!parsed.success) return actionError(firstIssueAsRuleMessage(parsed.error));

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email },
    select: { id: true, email: true, isActive: true },
  });

  if (user && user.isActive) {
    const token = newToken();
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
    const mail = passwordResetEmail(token);
    await sendEmail({ to: user.email, ...mail });
  }

  return actionOk();
}

export async function resetPasswordAction(input: unknown): Promise<ActionResult> {
  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) return actionError(firstIssueAsRuleMessage(parsed.error));

  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(parsed.data.token) },
  });
  if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) {
    return actionError(ruleMessage("auth.inviteInvalid"));
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: record.userId },
      data: { passwordHash },
    });
    await tx.passwordResetToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    });
  });

  return actionOk();
}

/**
 * Create a single-use invite link. The raw token is returned once, here, and
 * never stored — only its SHA-256 goes to the DB.
 */
export async function createInviteAction(
  email?: string,
): Promise<ActionResult<{ url: string }>> {
  const session = await requireSession();
  const token = newToken();

  const household = await prisma.household.findUnique({
    where: { id: session.householdId },
    select: { name: true },
  });

  await prisma.householdInvite.create({
    data: {
      householdId: session.householdId,
      tokenHash: hashToken(token),
      email: email?.trim() || null,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      createdById: session.userId,
    },
  });

  if (email?.trim() && household) {
    const mail = inviteEmail(token, household.name);
    await sendEmail({ to: email.trim(), ...mail });
  }

  const base = process.env.APP_URL ?? "http://localhost:3000";
  return actionOk({ url: `${base}/join/${token}` });
}

/** Used by /join/[token] to show whose household the visitor is joining. */
export async function inviteHouseholdName(token: string): Promise<string | null> {
  const invite = await prisma.householdInvite.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { household: { select: { name: true } } },
  });
  if (!invite || invite.usedAt || invite.expiresAt.getTime() < Date.now()) {
    return null;
  }
  return invite.household.name;
}
