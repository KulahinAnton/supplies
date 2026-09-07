import { Link, Navigate, useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import { MESSAGES } from "@supplies/core/messages";
import { resetPasswordSchema } from "@supplies/core/validation/auth";
import { Button } from "@supplies/ui/button";
import { api } from "../api/client";
import { useAuth } from "../auth/auth-context";
import { AuthPageShell } from "../components/auth-page-shell";
import { AuthField, FormError } from "../components/auth/field";
import { useAuthForm } from "../hooks/use-auth-form";

/**
 * «Новий пароль» — the counterpart of
 * `apps/web/app/reset-password/page.tsx`.
 *
 * The token arrives in the query string, exactly as the emailed link builds
 * it, so one link works whichever client is open. It is never shown and never
 * editable: it is a credential that happens to travel in a URL.
 *
 * A missing token is its own screen rather than a form that will certainly be
 * refused — there is nothing the person could type to fix it.
 */
export function ResetPasswordRoute() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const token = search.get("token") ?? "";

  const form = useAuthForm({
    schema: resetPasswordSchema,
    initial: { token, password: "" },
    submit: async (values) => {
      await api.post("/api/auth/reset-password", values);
      toast.success("Пароль змінено");
      void navigate("/login", { replace: true });
    },
  });

  if (auth.status === "signed-in") return <Navigate to="/dashboard" replace />;

  if (!token) {
    return (
      <AuthPageShell
        title="Посилання неповне"
        subtitle={MESSAGES["auth.inviteInvalid"]}
        footer={
          <Link
            to="/forgot-password"
            className="text-primary underline-offset-4 hover:underline"
          >
            Надіслати нове посилання
          </Link>
        }
      >
        <p className="text-sm text-muted-foreground">
          Відкрийте посилання з листа повністю — у ньому є код, без якого
          пароль не змінити.
        </p>
      </AuthPageShell>
    );
  }

  return (
    <AuthPageShell
      title="Новий пароль"
      subtitle="Посилання спрацює лише один раз."
      footer={
        <Link to="/login" className="text-primary underline-offset-4 hover:underline">
          До входу
        </Link>
      }
    >
      <form
        onSubmit={(event) => void form.onSubmit(event)}
        className="space-y-4"
        noValidate
      >
        <AuthField
          id="password"
          label="Новий пароль"
          type="password"
          autoComplete="new-password"
          hint="Щонайменше 8 символів."
          value={form.values.password}
          error={form.errors.password}
          onChange={(value) => form.set("password", value)}
        />

        <FormError>{form.formError}</FormError>

        <Button type="submit" className="w-full" disabled={form.submitting}>
          {form.submitting ? "Зберігаємо…" : "Зберегти пароль"}
        </Button>
      </form>
    </AuthPageShell>
  );
}
