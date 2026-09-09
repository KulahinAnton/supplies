import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { Screen } from "@/components/ui/screen";

/**
 * The frame every public auth screen shares: a title, a line saying what this
 * screen is for, the form, and a way out at the bottom.
 *
 * The keyboard is `Screen`'s problem, not this one's — it wraps its scroller
 * in a `KeyboardAvoidingView` rather than relying on Android's `adjustResize`.
 * SPA_API_PORT.md names that as one of four things free now and expensive to
 * retrofit for Phase 5: Android mostly handles it and iOS does not, so writing
 * it the portable way costs nothing here and saves a pass later.
 */
export function AuthShell({
  title,
  subtitle,
  footer,
  children,
}: {
  title: string;
  subtitle?: string;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Screen>
      <View className="gap-5">
        <View className="gap-1.5 pt-8">
          <Text className="text-3xl font-semibold text-foreground">{title}</Text>
          {subtitle ? (
            <Text className="text-sm text-muted-foreground">{subtitle}</Text>
          ) : null}
        </View>

        {children}

        {footer ? <View className="items-center pt-2">{footer}</View> : null}
      </View>
    </Screen>
  );
}

/** The refusal the server sent, in the one place every auth screen puts it. */
export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <View className="rounded-lg bg-destructive/10 px-3 py-2.5">
      <Text className="text-sm text-destructive">{message}</Text>
    </View>
  );
}
