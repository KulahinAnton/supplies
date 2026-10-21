import { useState } from "react";
import { Link } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { forgotPasswordSchema } from "@supplies/core/validation/auth";
import { api } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { AuthShell, FormError } from "@/components/auth/auth-shell";
import { useAuthForm } from "@/hooks/use-auth-form";

/**
 * «Відновлення пароля».
 *
 * The confirmation is the same whether or not the address has an account, and
 * it is shown even if the request itself failed. That is deliberate rather
 * than sloppy: the endpoint answers identically for both cases on purpose, and
 * a client that distinguished them here would hand back the membership oracle
 * the API just refused to be. The wording says «якщо така пошта
 * зареєстрована» rather than «перевірте пошту», so it never promises a letter
 * that is not coming.
 */
export default function ForgotPasswordScreen() {
  const [sent, setSent] = useState(false);

  const form = useAuthForm({
    schema: forgotPasswordSchema,
    initial: { email: "" },
    submit: async (values) => {
      await api.post("/api/auth/forgot-password", values).catch(() => undefined);
      setSent(true);
    },
  });

  return (
    <AuthShell
      title="Відновлення пароля"
      subtitle="Надішлемо посилання на пошту."
      footer={
        <Link href="/login" asChild>
          <Pressable className="active:opacity-60">
            <Text className="text-sm text-primary underline">До входу</Text>
          </Pressable>
        </Link>
      }
    >
      {sent ? (
        <View className="rounded-lg bg-muted px-3 py-3">
          <Text className="text-sm text-muted-foreground">
            Якщо така пошта зареєстрована, ми надіслали лист із посиланням. Воно
            дійсне одну годину.
          </Text>
        </View>
      ) : (
        <>
          <TextField
            label="Пошта"
            value={form.values.email}
            onChangeText={(value) => form.set("email", value)}
            error={form.errors.email}
            keyboard="email-address"
            autoComplete="email"
            returnKeyType="go"
            onSubmitEditing={form.onSubmit}
          />

          <FormError message={form.formError} />

          <Button
            label={form.submitting ? "Надсилаємо…" : "Надіслати посилання"}
            busy={form.submitting}
            onPress={form.onSubmit}
          />
        </>
      )}
    </AuthShell>
  );
}
