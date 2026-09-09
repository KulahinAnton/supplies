import { Link } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { loginSchema } from "@supplies/core/validation/auth";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { AuthShell, FormError } from "@/components/auth/auth-shell";
import { useAuthForm } from "@/hooks/use-auth-form";
import { useAuth } from "@/lib/auth/auth-context";

/**
 * «Вхід» — the third implementation of this screen, and the first on a phone.
 *
 * Validated with `loginSchema` from `@supplies/core/validation/auth`: the same
 * object the Next form resolves against, the same one the SPA uses, and the
 * same one the API checks the request with. Its messages are KEYS, so they
 * render through `MESSAGES` here exactly as they do there — one catalogue,
 * four clients.
 */
export default function LoginScreen() {
  const { signIn } = useAuth();

  const form = useAuthForm({
    schema: loginSchema,
    initial: { email: "", password: "" },
    // No navigation on success: the guard in `app/_layout.tsx` swaps the tree
    // the moment auth state changes, and pushing a route as well would race it.
    submit: (values) => signIn(values.email, values.password),
  });

  return (
    <AuthShell
      title="Запаси"
      subtitle="Той самий акаунт, що й у вебзастосунку та Telegram-боті."
      footer={
        <View className="items-center gap-3">
          <Link href="/register" asChild>
            <Pressable className="active:opacity-60">
              <Text className="text-sm text-primary underline">
                Немає акаунта? Створити
              </Text>
            </Pressable>
          </Link>
          <Link href="/forgot-password" asChild>
            <Pressable className="active:opacity-60">
              <Text className="text-sm text-muted-foreground underline">
                Забули пароль?
              </Text>
            </Pressable>
          </Link>
        </View>
      }
    >
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
        secure
        autoComplete="current-password"
        returnKeyType="go"
        onSubmitEditing={form.onSubmit}
      />

      <FormError message={form.formError} />

      <Button
        label={form.submitting ? "Заходимо…" : "Увійти"}
        busy={form.submitting}
        onPress={form.onSubmit}
      />
    </AuthShell>
  );
}
