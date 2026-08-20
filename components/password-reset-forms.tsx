"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  requestPasswordResetAction,
  resetPasswordAction,
} from "@/lib/actions/auth";
import { MESSAGES, renderMessage, type MessageKey } from "@/lib/messages";
import { forgotPasswordSchema, resetPasswordSchema } from "@/lib/validation/auth";

function messageFor(key?: string) {
  if (!key) return undefined;
  return MESSAGES[key as MessageKey] ?? key;
}

type ForgotValues = z.infer<typeof forgotPasswordSchema>;

export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  // Always the same confirmation, whether or not the address exists — the
  // alternative is a way to probe who has an account.
  if (sent) {
    return (
      <p className="rounded-md bg-muted px-3 py-3 text-sm text-muted-foreground">
        Якщо така пошта зареєстрована, ми надіслали лист із посиланням. Воно
        дійсне одну годину.
      </p>
    );
  }

  return (
    <form
      onSubmit={handleSubmit(async (values) => {
        await requestPasswordResetAction(values);
        setSent(true);
      })}
      className="space-y-4"
      noValidate
    >
      <div className="space-y-2">
        <Label htmlFor="email">Пошта</Label>
        <Input id="email" type="email" inputMode="email" {...register("email")} />
        {errors.email ? (
          <p className="text-sm text-destructive">{messageFor(errors.email.message)}</p>
        ) : null}
      </div>
      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? "Надсилаємо…" : "Надіслати посилання"}
      </Button>
    </form>
  );
}

type ResetValues = z.infer<typeof resetPasswordSchema>;

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { token, password: "" },
  });

  return (
    <form
      onSubmit={handleSubmit(async (values) => {
        setFormError(null);
        const result = await resetPasswordAction(values);
        if (!result.ok) {
          setFormError(renderMessage(result.error));
          return;
        }
        router.push("/login");
      })}
      className="space-y-4"
      noValidate
    >
      <input type="hidden" {...register("token")} />
      <div className="space-y-2">
        <Label htmlFor="password">Новий пароль</Label>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          {...register("password")}
        />
        {errors.password ? (
          <p className="text-sm text-destructive">
            {messageFor(errors.password.message)}
          </p>
        ) : null}
      </div>

      {formError ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {formError}
        </p>
      ) : null}

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? "Зберігаємо…" : "Зберегти пароль"}
      </Button>
    </form>
  );
}
