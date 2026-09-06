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
import { MESSAGES, type MessageKey } from "@supplies/core/messages";
import { loginSchema } from "@supplies/core/validation/auth";

type Values = z.infer<typeof loginSchema>;

/** Zod messages are keys (§8) — the form is the place that renders them. */
function messageFor(key?: string) {
  if (!key) return undefined;
  return MESSAGES[key as MessageKey] ?? key;
}

export function LoginForm() {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: Values) {
    setFormError(null);
    const result = await signIn("credentials", {
      email: values.email,
      password: values.password,
      redirect: false,
    });

    if (!result || result.error) {
      setFormError(MESSAGES["auth.invalidCredentials"]);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
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
          autoComplete="current-password"
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
        {isSubmitting ? "Входимо…" : "Увійти"}
      </Button>
    </form>
  );
}
