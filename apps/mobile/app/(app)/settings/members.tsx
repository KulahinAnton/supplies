import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import { Text, View } from "react-native";
import type { Member } from "@supplies/core/contracts/settings";
import { api } from "@/lib/api/client";
import { keys } from "@/lib/api/keys";
import { Button } from "@/components/ui/button";
import { Divider } from "@/components/ui/card";
import { Spinner } from "@/components/ui/feedback";
import { Screen } from "@/components/ui/screen";
import { useWrite } from "@/hooks/use-settings-write";

/**
 * Who is in the household, and how somebody else joins it.
 *
 * Registration creates a NEW household; joining an existing one goes through a
 * single-use invite link that expires in seven days. The link is shown once
 * and copied to the clipboard rather than emailed from here — the person
 * inviting is usually standing next to the person joining, and a message they
 * send themselves needs no address book.
 */
export default function MembersScreen() {
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // Nothing else on screen depends on an invite, so this write invalidates
  // nothing.
  const { write, refusal, pending } = useWrite([]);

  const members = useQuery({
    queryKey: keys.members,
    queryFn: () => api.get<Member[]>("/api/household/members"),
  });

  return (
    <Screen edges={["left", "right"]}>
      {members.isPending ? (
        <Spinner />
      ) : (
        <View className="rounded-lg border border-border bg-card px-4">
          {(members.data ?? []).map((member, index) => (
            <View key={member.id}>
              {index > 0 ? <Divider /> : null}
              <View className="py-3">
                <Text className="text-base text-foreground">{member.name}</Text>
                <Text className="text-xs text-muted-foreground">{member.email}</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {refusal ? (
        <View className="rounded-lg bg-destructive/10 px-3 py-2.5">
          <Text className="text-sm text-destructive">{refusal}</Text>
        </View>
      ) : null}

      <Button
        label="Створити запрошення"
        variant="ghost"
        busy={pending}
        onPress={() => {
          setCopied(false);
          void write(async () => {
            const result = await api.post<{ url: string }>("/api/account/invite");
            setLink(result.url);
          });
        }}
      />

      {link ? (
        <View className="gap-2 rounded-lg border border-border bg-card p-3">
          <Text className="text-xs text-muted-foreground">
            Одноразове посилання, дійсне 7 днів:
          </Text>
          {/* Selectable rather than a read-only input: there is nothing to
              type here, and a text field invites editing a link. */}
          <Text selectable className="text-sm text-foreground">
            {link}
          </Text>
          <Button
            label={copied ? "Скопійовано" : "Скопіювати"}
            variant="ghost"
            onPress={() => {
              void Clipboard.setStringAsync(link).then(() => setCopied(true));
            }}
          />
        </View>
      ) : null}
    </Screen>
  );
}
