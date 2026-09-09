import { useState } from "react";
import { Link, useLocalSearchParams } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { MESSAGES } from "@supplies/core/messages";
import { resetPasswordSchema } from "@supplies/core/validation/auth";
import { api } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { AuthShell, FormError } from "@/components/auth/auth-shell";
import { useAuthForm } from "@/hooks/use-auth-form";

/**
 * «Новий пароль» — the far end of the reset email, arriving as a deep link
 * with the token in the query string.
 *
 * It does **not** sign anybody in. The token proves control of the mailbox,
 * which is enough to set a password and not enough to become a session; the
 * API answers with nothing and the person signs in with what they just chose.
 * A missing token is the reset flow's own failure — `auth.resetLinkInvalid`,
 * not the invitation's message, which is a mistake this project has already
 * shipped once.
 */
export default function ResetPasswordScreen() {
  const { token = "" } = useLocalSearchParams<{ token?: string }>();
  const [done, setDone] = useState(false);

  const form = useAuthForm({
    schema: resetPasswordSchema,
    initial: { token, password: "" },
    submit: async (values) => {
      await api.post("/api/auth/reset-password", values);
      setDone(true);
    },
  });

  if (done) {
    return (
      <AuthShell
        title="Пароль змінено"
        subtitle="Тепер увійдіть із новим паролем."
        footer={
          <Link href="/login" asChild>
            <Pressable className="active:opacity-60">
              <Text className="text-sm text-primary underline">До входу</Text>
            </Pressable>
          </Link>
        }
      >
        <View />
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Новий пароль"
      subtitle={token ? "Придумайте пароль, який ще ніде не використовували." : undefined}
      footer={
        <Link href="/login" asChild>
          <Pressable className="active:opacity-60">
            <Text className="text-sm text-primary underline">До входу</Text>
          </Pressable>
        </Link>
      }
    >
      {token ? (
        <>
          <TextField
            label="Новий пароль"
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
            label={form.submitting ? "Зберігаємо…" : "Зберегти пароль"}
            busy={form.submitting}
            onPress={form.onSubmit}
          />
        </>
      ) : (
        <View className="rounded-lg bg-destructive/10 px-3 py-2.5">
          <Text className="text-sm text-destructive">
            {MESSAGES["auth.resetLinkInvalid"]}
          </Text>
        </View>
      )}
    </AuthShell>
  );
}
