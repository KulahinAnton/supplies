import type { ReactNode } from "react";
import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

/**
 * Every screen's outer frame.
 *
 * `SafeAreaView` from `react-native-safe-area-context` on all of them, even
 * though Android mostly does not need it — SPA_API_PORT.md names this as one of
 * four things that are free now and expensive to retrofit when Phase 5 adds
 * iOS. Doing it in one component means no screen can forget.
 *
 * `edges` excludes the bottom by default: a scrolling list should run under the
 * gesture bar rather than stopping short of it, and screens with a fixed footer
 * ask for it explicitly.
 */
export function Screen({
  children,
  scroll = true,
  edges = ["top", "left", "right"],
}: {
  children: ReactNode;
  scroll?: boolean;
  edges?: ("top" | "bottom" | "left" | "right")[];
}) {
  return (
    <SafeAreaView edges={edges} className="flex-1 bg-background">
      {scroll ? (
        <ScrollView
          contentContainerClassName="gap-5 p-5 pb-10"
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      ) : (
        <View className="flex-1">{children}</View>
      )}
    </SafeAreaView>
  );
}
