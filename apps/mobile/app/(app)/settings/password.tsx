import { useState } from "react";
import { Text, View } from "react-native";
import { api } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Screen } from "@/components/ui/screen";
import { TextField } from "@/components/ui/text-field";
import { useWrite } from "@/hooks/use-settings-write";

/**
 * Changing the password — the account's, not the household's.
 *
 * It invalidates nothing: no query on any screen holds a password, and the
 * session keeps working because the API rotates nothing here. What it does not
 * do is sign other devices out; a stolen password is a different problem with
 * a different answer, and Feature 34's theft response is the one that revokes
 * every refresh token.
 */
export default function PasswordScreen() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [done, setDone] = useState(false);
  const { write, refusal, pending } = useWrite([]);

  return (
    <Screen edges={["left", "right"]}>
      <TextField
        label="Поточний пароль"
        value={current}
        onChangeText={setCurrent}
        secure
        autoComplete="current-password"
      />
      <TextField
        label="Новий пароль"
        value={next}
        onChangeText={setNext}
        secure
        autoComplete="new-password"
      />

      {refusal ? (
        <View className="rounded-lg bg-destructive/10 px-3 py-2.5">
          <Text className="text-sm text-destructive">{refusal}</Text>
        </View>
      ) : null}
      {done ? <Text className="text-sm text-primary">Пароль змінено.</Text> : null}

      <Button
        label="Змінити пароль"
        busy={pending}
        disabled={!current || !next}
        onPress={() => {
          setDone(false);
          void write(() =>
            api.post("/api/account/password", {
              currentPassword: current,
              newPassword: next,
            }),
          ).then((ok) => {
            setDone(ok);
            if (ok) {
              setCurrent("");
              setNext("");
            }
          });
        }}
      />
    </Screen>
  );
}
