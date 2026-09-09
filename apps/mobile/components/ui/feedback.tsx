import { ActivityIndicator, Text, View } from "react-native";
import { ApiError } from "@/lib/api/client";

/**
 * What a screen shows while it waits, and when it cannot proceed.
 *
 * A server-rendered page has nothing to show while it loads; every screen here
 * does. Same reason `apps/spa/src/components/feedback.tsx` exists — this is
 * the component both clients are allowed that the Next app is not.
 */
export function Spinner({ label }: { label?: string }) {
  return (
    <View className="items-center gap-3 py-10">
      <ActivityIndicator color="#297f48" />
      {label ? <Text className="text-sm text-muted-foreground">{label}</Text> : null}
    </View>
  );
}

export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;

  /**
   * `ApiError.message` is already the Ukrainian the API rendered from the
   * shared catalogue — the same sentence the web clients show for the same
   * refusal. Anything else is a network failure, which on a phone is common
   * enough to deserve its own words rather than a stack trace.
   */
  const message =
    error instanceof ApiError
      ? error.message
      : "Немає зв'язку. Перевірте інтернет і спробуйте ще раз.";

  return (
    <View className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5">
      <Text className="text-sm text-destructive">{message}</Text>
    </View>
  );
}

export function EmptyNote({ children }: { children: string }) {
  return (
    <View className="items-center rounded-lg border border-dashed border-border py-12">
      <Text className="text-sm text-muted-foreground">{children}</Text>
    </View>
  );
}
