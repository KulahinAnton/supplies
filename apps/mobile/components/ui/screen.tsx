import type { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

/**
 * Every screen's outer frame.
 *
 * `SafeAreaView` from `react-native-safe-area-context` on all of them, even
 * though Android mostly does not need it — docs/ARCHITECTURE.md §11 names this as one of
 * the things that are free now and expensive to retrofit if iOS comes back. Doing it in one component means no screen can forget.
 *
 * `edges` excludes the bottom by default: a scrolling list should run under the
 * gesture bar rather than stopping short of it, and screens with a fixed footer
 * ask for it explicitly.
 *
 * **A screen with a native header passes `["left", "right"]`.** The header has
 * already cleared the status bar, so keeping `top` inserts the same inset
 * twice — a finger-wide band of nothing under the title, which is what it
 * looked like on «Новий товар» before this note existed.
 *
 * **The keyboard is handled here too, and that is the second of those four
 * things.** Android's `adjustResize` shrinks the window and scrolls the focused
 * field into view by itself; iOS does nothing at all, so a form with more than
 * three fields has its lower half under the keyboard. `KeyboardAvoidingView`
 * wraps the scroller rather than each form, so a screen added later inherits
 * it — four screens used to carry their own copy, which is three too many
 * places for the next one to be forgotten.
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
      <KeyboardAvoidingView
        // `undefined` on Android is not an oversight: with `adjustResize` the
        // platform already does this, and adding padding on top of it pushes
        // the content twice as far as the keyboard is tall.
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1"
      >
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
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
