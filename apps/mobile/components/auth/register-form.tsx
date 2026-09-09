import { registerSchema } from "@supplies/core/validation/auth";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { FormError } from "@/components/auth/auth-shell";
import { useAuthForm } from "@/hooks/use-auth-form";
import { useAuth } from "@/lib/auth/auth-context";

/**
 * The form behind both «Створити акаунт» and «Приєднатися».
 *
 * One component, because the only difference is the invite token — and that
 * difference is entirely the server's: without one the API creates a new
 * household, with one it consumes the invite and joins an existing one, both
 * in a single transaction so two people racing the same link cannot both use
 * it. Nothing here decides which.
 */
export function RegisterForm({ inviteToken }: { inviteToken?: string }) {
  const { register } = useAuth();

  const form = useAuthForm({
    schema: registerSchema,
    initial: { name: "", email: "", password: "", inviteToken },
    // No navigation on success: the guard in `app/_layout.tsx` swaps the tree
    // the moment auth state changes, and pushing a route as well would race it.
    submit: (values) => register(values),
  });

  return (
    <>
      <TextField
        label="Ім'я"
        value={form.values.name}
        onChangeText={(value) => form.set("name", value)}
        error={form.errors.name}
        capitalize="sentences"
        returnKeyType="next"
      />
      <TextField
        label="Пошта"
        value={form.values.email}
        onChangeText={(value) => form.set("email", value)}
        error={form.errors.email}
        keyboard="email-address"
        autoComplete="email"
        returnKeyType="next"
      />
      <TextField
        label="Пароль"
        value={form.values.password}
        onChangeText={(value) => form.set("password", value)}
        error={form.errors.password}
        hint="Щонайменше 8 символів."
        secure
        autoComplete="new-password"
        returnKeyType="go"
        onSubmitEditing={form.onSubmit}
      />

      <FormError message={form.formError} />

      <Button
        label={inviteToken ? "Приєднатися" : "Створити акаунт"}
        busy={form.submitting}
        onPress={form.onSubmit}
      />
    </>
  );
}
