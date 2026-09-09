import { Text, TextInput, View } from "react-native";

/**
 * A labelled input, with room under it for the message its schema produced.
 *
 * `autoCapitalize="none"` on email and password is not a nicety on a phone:
 * Android capitalises the first letter by default, and «Anton@example.com» is
 * a sign-in failure that looks like a wrong password.
 */
export function TextField({
  label,
  value,
  onChangeText,
  error,
  hint,
  secure = false,
  keyboard = "default",
  autoComplete,
  onSubmitEditing,
  returnKeyType,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  error?: string;
  hint?: string;
  secure?: boolean;
  keyboard?: "default" | "email-address" | "decimal-pad" | "numeric";
  autoComplete?: "email" | "current-password" | "new-password" | "off";
  onSubmitEditing?: () => void;
  returnKeyType?: "done" | "next" | "go";
}) {
  return (
    <View className="gap-2">
      <Text className="text-sm font-medium text-foreground">{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={secure}
        keyboardType={keyboard}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete={autoComplete}
        onSubmitEditing={onSubmitEditing}
        returnKeyType={returnKeyType}
        className="rounded-lg border border-border bg-card px-3 py-2.5 text-base text-foreground"
        placeholderTextColor="#6b7069"
      />
      {hint ? <Text className="text-xs text-muted-foreground">{hint}</Text> : null}
      {error ? <Text className="text-sm text-destructive">{error}</Text> : null}
    </View>
  );
}
