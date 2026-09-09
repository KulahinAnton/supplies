import { useState } from "react";
import { KeyboardAvoidingView, Platform, Text, View } from "react-native";
import { MESSAGES, type MessageKey } from "@supplies/core/messages";
import { loginSchema } from "@supplies/core/validation/auth";
import { Button } from "@/components/ui/button";
import { Screen } from "@/components/ui/screen";
import { TextField } from "@/components/ui/text-field";
import { ApiError } from "@/lib/api/client";
import { useAuth } from "@/lib/auth/auth-context";

/** Zod messages are keys (§8) — the form is the place that renders them. */
function messageFor(key?: string): string | undefined {
  if (!key) return undefined;
  return MESSAGES[key as MessageKey] ?? key;
}

/**
 * «Вхід» — the third implementation of this screen, and the first one on a
 * phone.
 *
 * Validated with `loginSchema` from `@supplies/core/validation/auth`: the same
 * object the Next form resolves against, the same one the SPA uses, and the
 * same one the API checks the request with. Its messages are KEYS, so they
 * render through `MESSAGES` here exactly as they do there — one catalogue,
 * three clients.
 *
 * `KeyboardAvoidingView` rather than relying on Android's `adjustResize`.
 * SPA_API_PORT.md names that as one of the four things that are free now and
 * expensive to retrofit: Android mostly handles this itself and iOS does not,
 * so writing it the portable way from the first screen costs nothing.
 */
export default function LoginScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [issues, setIssues] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setFormError(null);

    // Checked here as well as on the server, with the same schema, so a typo in
    // an address is answered next to the field instead of after a round trip —
    // which on a phone may be a slow one.
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      const next: { email?: string; password?: string } = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (field === "email" && !next.email) next.email = messageFor(issue.message);
        if (field === "password" && !next.password) {
          next.password = messageFor(issue.message);
        }
      }
      setIssues(next);
      return;
    }
    setIssues({});

    setBusy(true);
    try {
      await signIn(parsed.data.email, parsed.data.password);
      // No navigation here: the guard in `app/_layout.tsx` swaps the tree the
      // moment auth state changes. Pushing a route as well would race it.
    } catch (cause) {
      setFormError(
        cause instanceof ApiError
          ? cause.message
          : "Немає зв'язку. Перевірте інтернет і спробуйте ще раз.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="gap-5"
      >
        <View className="gap-1.5 pt-8">
          <Text className="text-3xl font-semibold text-foreground">Запаси</Text>
          <Text className="text-sm text-muted-foreground">
            Той самий акаунт, що й у вебзастосунку та Telegram-боті.
          </Text>
        </View>

        <TextField
          label="Пошта"
          value={email}
          onChangeText={setEmail}
          error={issues.email}
          keyboard="email-address"
          autoComplete="email"
          returnKeyType="next"
        />

        <TextField
          label="Пароль"
          value={password}
          onChangeText={setPassword}
          error={issues.password}
          secure
          autoComplete="current-password"
          returnKeyType="go"
          onSubmitEditing={() => void submit()}
        />

        {formError ? (
          <View className="rounded-lg bg-destructive/10 px-3 py-2.5">
            <Text className="text-sm text-destructive">{formError}</Text>
          </View>
        ) : null}

        <Button
          label={busy ? "Заходимо…" : "Увійти"}
          busy={busy}
          onPress={() => void submit()}
        />
      </KeyboardAvoidingView>
    </Screen>
  );
}
