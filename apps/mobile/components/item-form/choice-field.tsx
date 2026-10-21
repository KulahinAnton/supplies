import { Pressable, ScrollView, Text, View } from "react-native";

/**
 * A labelled row of chips, standing in for the web's `<select>`.
 *
 * **Not `@expo/ui`'s `Picker`, and not a dropdown.** The lists this replaces
 * are short — a household has under ten categories and a handful of storage
 * places — and at that size a chip row is one tap where a picker is two, with
 * every option readable without opening anything. A dropdown earns itself when
 * the list is long enough that showing it costs more than hiding it, and none
 * of these are.
 *
 * `disabled` is for §3.2's locked unit: an item with batches cannot change
 * unit, and the field says so rather than disappearing, because "why can I not
 * change this" is a question the screen should answer.
 */
export function ChoiceField<T extends string>({
  label,
  hint,
  value,
  options,
  disabled = false,
  onChange,
}: {
  label: string;
  hint?: string;
  value: T;
  options: { value: T; label: string }[];
  disabled?: boolean;
  onChange: (value: T) => void;
}) {
  return (
    <View className="gap-2">
      <Text className="text-sm font-medium text-foreground">{label}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        // Without this the chips are clipped by the screen's own padding
        // instead of scrolling past it.
        contentContainerClassName="gap-2 pr-5"
        className={disabled ? "opacity-50" : ""}
      >
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityState={{ selected, disabled }}
              disabled={disabled}
              onPress={() => onChange(option.value)}
              className={`rounded-full border px-3.5 py-2 ${
                selected ? "border-primary bg-primary" : "border-border bg-card"
              }`}
            >
              <Text
                className={`text-sm ${
                  selected
                    ? "font-medium text-primary-foreground"
                    : "text-muted-foreground"
                }`}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      {hint ? <Text className="text-xs text-muted-foreground">{hint}</Text> : null}
    </View>
  );
}
