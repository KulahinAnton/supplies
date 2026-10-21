import { useNavigate } from "react-router";
import { registerSchema } from "@supplies/core/validation/auth";
import { Button } from "@supplies/ui/button";
import { api } from "../../api/client";
import { useAuth } from "../../auth/auth-context";
import { useAuthForm } from "../../hooks/use-auth-form";
import { AuthField, FormError } from "./field";

/**
 * Feature 1 — with no `inviteToken` this creates a brand new household and
 * seeds its categories and locations; with one, the person joins the inviting
 * household instead.
 *
 * Signs straight in afterwards. Asking someone to type the password they just
 * chose a second time is friction with no security benefit — and here it is
 * one call, because `POST /auth/register` already answers with a token pair.
 * The Next version needs a separate `signIn()` only because Auth.js owns its
 * session.
 */
export function RegisterForm({ inviteToken }: { inviteToken?: string }) {
  const navigate = useNavigate();
  const auth = useAuth();

  const form = useAuthForm({
    schema: registerSchema,
    initial: { name: "", email: "", password: "", inviteToken },
    submit: async (values) => {
      await api.post("/api/auth/register", { ...values, inviteToken });
      // The register response carries a token pair, but going through the
      // normal sign-in is what puts the user into the auth context and the
      // refresh cookie into the jar — one path into a session, not two.
      await auth.signIn(values.email, values.password);
      void navigate("/dashboard", { replace: true });
    },
  });

  return (
    <form onSubmit={(event) => void form.onSubmit(event)} className="space-y-4" noValidate>
      <AuthField
        id="name"
        label="Ім'я"
        autoComplete="name"
        value={form.values.name}
        error={form.errors.name}
        onChange={(value) => form.set("name", value)}
      />

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

      <AuthField
        id="password"
        label="Пароль"
        type="password"
        autoComplete="new-password"
        hint="Щонайменше 8 символів."
        value={form.values.password}
        error={form.errors.password}
        onChange={(value) => form.set("password", value)}
      />

      <FormError>{form.formError}</FormError>

      <Button type="submit" className="w-full" disabled={form.submitting}>
        {form.submitting
          ? "Створюємо…"
          : inviteToken
            ? "Приєднатися"
            : "Створити акаунт"}
      </Button>
    </form>
  );
}
