import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import type { ItemFilter } from "@supplies/core/item-list-params";

const FILTERS: { value: ItemFilter; label: string }[] = [
  { value: "all", label: "Усі" },
  { value: "attention", label: "Потребують уваги" },
  { value: "OUT", label: "Закінчились" },
  { value: "LOW", label: "Закінчуються" },
];

/**
 * The search field and the state chips.
 *
 * Rendered by its parent unconditionally, and that is deliberate — the same
 * rule the SPA learned the hard way. A control that drives a query must never
 * be conditional on that query's data, or every keystroke unmounts the field
 * and takes the keyboard with it. There is no `data` in scope here to be
 * tempted by.
 */
export function ItemFilters({
  query,
  onQuery,
  filter,
  onFilter,
  onScan,
}: {
  query: string;
  onQuery: (value: string) => void;
  filter: ItemFilter;
  onFilter: (value: ItemFilter) => void;
  onScan: () => void;
}) {
  return (
    <View className="gap-3 px-5 pb-3 pt-1">
      <View className="flex-row items-center gap-2">
        <TextInput
          value={query}
          onChangeText={onQuery}
          placeholder="Пошук за назвою…"
          placeholderTextColor="#6b7069"
          autoCapitalize="none"
          autoCorrect={false}
          // `search` gives Android the magnifier key and iOS "Search";
          // `clearButtonMode` is iOS-only and harmless elsewhere.
          returnKeyType="search"
          clearButtonMode="while-editing"
          className="flex-1 rounded-lg border border-border bg-card px-3 py-2.5 text-base text-foreground"
        />
        {/*
          Feature 21 — the scan is a peer of the search box, not a menu item.
          Standing in a kitchen holding a packet, the barcode IS the query, and
          burying it a tap deeper makes the camera the slower way to find
          something than typing.
        */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Сканувати штрихкод"
          onPress={onScan}
          className="rounded-lg border border-border bg-card px-3 py-2.5 active:opacity-70"
        >
          <Text className="text-base">▣</Text>
        </Pressable>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-2 pr-5"
        // Keeps a tap on a chip from being swallowed by the scroll gesture.
        keyboardShouldPersistTaps="handled"
      >
        {FILTERS.map((option) => {
          const active = filter === option.value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => onFilter(option.value)}
              className={`rounded-full border px-3 py-1.5 ${
                active ? "border-primary bg-primary" : "border-border bg-card"
              }`}
            >
              <Text
                className={`text-xs font-medium ${
                  active ? "text-primary-foreground" : "text-muted-foreground"
                }`}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
