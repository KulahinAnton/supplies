import { Text, TextInput, View } from "react-native";

/**
 * A labelled input, with room under it for the message its schema produced.
 *
 * `autoCapitalize` defaults to `none` and that default is load-bearing rather
 * than lazy: Android capitalises the first letter of an email by default, and
 * «Anton@example.com» is a sign-in failure that looks like a wrong password.
 * Prose fields — an item's name, a note — pass `capitalize="sentences"`,
 * because there the platform's instinct is the right one.
 */
export function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  error,
  hint,
  secure = false,
  keyboard = "default",
  capitalize = "none",
  multiline = false,
  autoComplete,
  onSubmitEditing,
  returnKeyType,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  error?: string;
  hint?: string;
  secure?: boolean;
  keyboard?: "default" | "email-address" | "decimal-pad" | "numeric";
  capitalize?: "none" | "sentences";
  multiline?: boolean;
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
        placeholder={placeholder}
        secureTextEntry={secure}
        keyboardType={keyboard}
        autoCapitalize={capitalize}
        autoCorrect={capitalize === "sentences"}
        autoComplete={autoComplete}
        multiline={multiline}
        // Without an explicit height a multiline field opens one line tall and
        // grows, which hides the fact that it takes more than one.
        numberOfLines={multiline ? 3 : undefined}
        onSubmitEditing={onSubmitEditing}
        returnKeyType={returnKeyType}
        className={`rounded-lg border border-border bg-card px-3 py-2.5 text-base text-foreground ${
          multiline ? "min-h-24" : ""
        }`}
        style={multiline ? { textAlignVertical: "top" } : undefined}
        placeholderTextColor="#6b7069"
      />
      {hint ? <Text className="text-xs text-muted-foreground">{hint}</Text> : null}
      {error ? <Text className="text-sm text-destructive">{error}</Text> : null}
    </View>
  );
}
