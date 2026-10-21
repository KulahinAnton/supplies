import { useState } from "react";
import { Link, Navigate } from "react-router";
import { forgotPasswordSchema } from "@supplies/core/validation/auth";
import { Button } from "@supplies/ui/button";
import { api } from "../api/client";
import { useAuth } from "../auth/auth-context";
import { AuthPageShell } from "../components/auth-page-shell";
import { AuthField, FormError } from "../components/auth/field";
import { useAuthForm } from "../hooks/use-auth-form";

/**
 * «Забули пароль» — the counterpart of
 * `apps/web/app/forgot-password/page.tsx`.
 *
 * The confirmation is the same whether or not the address has an account, and
 * it is shown even if the request itself failed. That is not sloppiness: the
 * endpoint deliberately answers identically for both cases, and a client that
 * distinguished them here would hand back the membership oracle the API just
 * refused to be. The wording says «якщо така пошта зареєстрована» rather than
 * «перевірте пошту», so it never promises a letter that is not coming.
 */
export function ForgotPasswordRoute() {
  const auth = useAuth();
  const [sent, setSent] = useState(false);

  const form = useAuthForm({
    schema: forgotPasswordSchema,
    initial: { email: "" },
    submit: async (values) => {
      await api.post("/api/auth/forgot-password", values).catch(() => undefined);
      setSent(true);
    },
  });

  if (auth.status === "signed-in") return <Navigate to="/dashboard" replace />;

  return (
    <AuthPageShell
      title="Відновлення пароля"
      subtitle="Надішлемо посилання на пошту."
      footer={
        <Link to="/login" className="text-primary underline-offset-4 hover:underline">
          До входу
        </Link>
      }
    >
      {sent ? (
        <p className="rounded-md bg-muted px-3 py-3 text-sm text-muted-foreground">
          Якщо така пошта зареєстрована, ми надіслали лист із посиланням. Воно
          дійсне одну годину.
        </p>
      ) : (
        <form
          onSubmit={(event) => void form.onSubmit(event)}
          className="space-y-4"
          noValidate
        >
          <AuthField
            id="email"
            label="Пошта"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={form.values.email}
            error={form.errors.email}
            onChange={(value) => form.set("email", value)}
          />

          <FormError>{form.formError}</FormError>

          <Button type="submit" className="w-full" disabled={form.submitting}>
            {form.submitting ? "Надсилаємо…" : "Надіслати посилання"}
          </Button>
        </form>
      )}
    </AuthPageShell>
  );
}
