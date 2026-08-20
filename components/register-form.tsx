"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { registerAction } from "@/lib/actions/auth";
import { MESSAGES, renderMessage, type MessageKey } from "@/lib/messages";
import { registerSchema } from "@/lib/validation/auth";

type Values = z.infer<typeof registerSchema>;

function messageFor(key?: string) {
  if (!key) return undefined;
  return MESSAGES[key as MessageKey] ?? key;
}

/**
 * Feature 1 — with no `inviteToken` this creates a brand new household; with
 * one, the user joins the inviting household instead.
 */
export function RegisterForm({ inviteToken }: { inviteToken?: string }) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: "", email: "", password: "", inviteToken },
  });

  async function onSubmit(values: Values) {
    setFormError(null);
    const result = await registerAction({ ...values, inviteToken });

    if (!result.ok) {
      setFormError(renderMessage(result.error));
      return;
    }

    // Sign straight in — asking someone to type the password twice in a row
    // is friction with no security benefit.
    await signIn("credentials", {
      email: values.email,
      password: values.password,
      redirect: false,
    });
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="name">Ім&apos;я</Label>
        <Input id="name" autoComplete="name" {...register("name")} />
        {errors.name ? (
          <p className="text-sm text-destructive">{messageFor(errors.name.message)}</p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">Пошта</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          {...register("email")}
        />
        {errors.email ? (
          <p className="text-sm text-destructive">{messageFor(errors.email.message)}</p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Пароль</Label>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          {...register("password")}
        />
        <p className="text-xs text-muted-foreground">Щонайменше 8 символів.</p>
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
        {isSubmitting ? "Створюємо…" : inviteToken ? "Приєднатися" : "Створити акаунт"}
      </Button>
    </form>
  );
}
