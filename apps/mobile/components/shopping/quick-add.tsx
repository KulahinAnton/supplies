import { useState } from "react";
import { TextInput, View } from "react-native";
import { Button } from "@/components/ui/button";

/**
 * «Додати» — the one-line free-text row.
 *
 * Submitting from the keyboard as well as the button, because in a shop this
 * is typed one-handed and reaching for a button after every word is the
 * difference between using the list and giving up on it.
 */
export function QuickAdd({
  placeholder = "Додати до списку…",
  pending,
  onAdd,
}: {
  placeholder?: string;
  pending: boolean;
  onAdd: (text: string) => void;
}) {
  const [text, setText] = useState("");

  function submit() {
    const trimmed = text.trim();
    if (!trimmed) return;
    setText("");
    onAdd(trimmed);
  }

  return (
    <View className="flex-row items-center gap-2">
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder={placeholder}
        placeholderTextColor="#6b7069"
        autoCapitalize="sentences"
        returnKeyType="done"
        onSubmitEditing={submit}
        className="flex-1 rounded-lg border border-border bg-card px-3 py-2.5 text-base text-foreground"
      />
      <Button
        label="Додати"
        variant="ghost"
        onPress={submit}
        disabled={pending || text.trim().length === 0}
      />
    </View>
  );
}
