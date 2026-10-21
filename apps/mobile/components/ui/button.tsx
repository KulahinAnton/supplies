import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, Text } from "react-native";

/**
 * The two button shapes this app needs, and no variant system yet.
 *
 * `packages/ui`'s `Button` is web-only by design (docs/ARCHITECTURE.md §4) —
 * React Native has no DOM and no class strings in that sense — so this is a
 * deliberate rebuild rather than a missed reuse. It stays small until a third
 * variant actually earns itself.
 */
export function Button({
  label,
  onPress,
  variant = "primary",
  busy = false,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  variant?: "primary" | "ghost";
  busy?: boolean;
  disabled?: boolean;
}) {
  const off = disabled || busy;
  const base = "flex-row items-center justify-center gap-2 rounded-lg px-4 py-3";
  const tone =
    variant === "primary"
      ? "bg-primary active:opacity-80"
      : "border border-border bg-card active:opacity-70";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: off, busy }}
      disabled={off}
      onPress={onPress}
      className={`${base} ${tone} ${off ? "opacity-50" : ""}`}
    >
      {busy ? (
        <ActivityIndicator
          size="small"
          color={variant === "primary" ? "#ffffff" : "#297f48"}
        />
      ) : null}
      <Text
        className={
          variant === "primary"
            ? "text-sm font-medium text-primary-foreground"
            : "text-sm font-medium text-foreground"
        }
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** A row of controls with the spacing every screen uses. */
export function ButtonRow({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
