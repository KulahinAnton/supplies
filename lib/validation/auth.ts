import { z } from "zod";
import { key } from "@/lib/validation/shared";

export const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email(key("auth.emailInvalid")));

export const passwordField = z.string().min(8, key("auth.passwordTooShort"));

export const nameField = z.string().trim().min(1, key("auth.nameRequired"));

export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, key("auth.invalidCredentials")),
});

export const registerSchema = z.object({
  name: nameField,
  email: emailField,
  password: passwordField,
  /** Present only when arriving through /join/[token]. */
  inviteToken: z.string().trim().optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, key("auth.currentPasswordWrong")),
  newPassword: passwordField,
});

export const forgotPasswordSchema = z.object({ email: emailField });

export const resetPasswordSchema = z.object({
  token: z.string().min(1, key("auth.inviteInvalid")),
  password: passwordField,
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
