import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Text, View } from "react-native";
import { findDuplicateGroups, type NamedItem } from "@supplies/core/duplicates";
import type { Household, Taxonomy } from "@supplies/core/contracts/settings";
import { api } from "@/lib/api/client";
import { keys } from "@/lib/api/keys";
import { Button } from "@/components/ui/button";
import { ErrorNote, Spinner } from "@/components/ui/feedback";
import { Screen } from "@/components/ui/screen";
import { SettingsGroup, SettingsRow } from "@/components/settings/settings-row";
import { useAuth } from "@/lib/auth/auth-context";

/**
 * «Налаштування» — an index, not the web's eight stacked panels.
 *
 * On a wide screen every panel can be open at once and scanning past the ones
 * you did not want costs a flick of a wheel. On a phone it costs a swipe per
 * panel, every time, so this is a list of rows and each panel is its own
 * screen — the arrangement the platform's own Settings uses for the same
 * reason.
 *
 * The rows carry their current value where there is one worth seeing: the warn
 * window and the digest hour are household DATA (§3.5/§7) and change what
 * «Скоро зіпсується» means everywhere, so it is worth reading without opening
 * anything.
 */
export default function SettingsScreen() {
  const router = useRouter();
  const auth = useAuth();

  const household = useQuery({
    queryKey: keys.household,
    queryFn: () => api.get<Household>("/api/household"),
  });
  const taxonomy = useQuery({
    queryKey: keys.taxonomy,
    queryFn: () => api.get<Taxonomy>("/api/taxonomy"),
  });
  const names = useQuery({
    queryKey: keys.itemNames,
    queryFn: () => api.get<NamedItem[]>("/api/items/names"),
  });

  /**
   * Feature 16.3 — computed here rather than on the server. The names are
   * already in hand for the item form's duplicate check, and adding an
   * endpoint to run a pure function over data the client already has would be
   * a round trip for nothing. Same function as both web clients, so all three
   * group names identically.
   */
  const duplicates = names.data ? findDuplicateGroups(names.data) : [];

  if (household.isPending) {
    return (
      <Screen>
        <Spinner />
      </Screen>
    );
  }

  return (
    <Screen>
      <View>
        <Text className="text-2xl font-semibold text-foreground">Налаштування</Text>
        <Text className="text-sm text-muted-foreground">Спільні для всієї родини.</Text>
      </View>

      <ErrorNote error={household.error} />

      <SettingsGroup title="Родина">
        <SettingsRow
          label="Про родину"
          value={household.data?.name}
          onPress={() => router.push("/settings/household")}
        />
        <SettingsRow
          label="Попереджати за"
          value={household.data ? `${household.data.expiryWarnDays} дн.` : undefined}
          onPress={() => router.push("/settings/household")}
        />
        <SettingsRow
          label="Учасники"
          onPress={() => router.push("/settings/members")}
        />
      </SettingsGroup>

      <SettingsGroup title="Довідники">
        <SettingsRow
          label="Категорії"
          value={
            taxonomy.data ? `${taxonomy.data.categories.length}` : undefined
          }
          onPress={() => router.push("/settings/categories")}
        />
        <SettingsRow
          label="Місця зберігання"
          value={taxonomy.data ? `${taxonomy.data.locations.length}` : undefined}
          onPress={() => router.push("/settings/locations")}
        />
        <SettingsRow
          label="Набори товарів"
          onPress={() => router.push("/settings/groups")}
        />
      </SettingsGroup>

      {/*
        Feature 16.3 — only when there is something to say. A permanently
        visible «схожі назви: 0» is a row that trains people to ignore rows.
      */}
      {duplicates.length > 0 ? (
        <View className="gap-2 rounded-lg bg-warning/10 p-3">
          <Text className="text-sm text-warning-foreground">
            Схожі назви: {duplicates.length}
          </Text>
          <Text className="text-xs text-muted-foreground">
            {duplicates
              .slice(0, 3)
              .map((group) => group.map((item) => item.name).join(" · "))
              .join("\n")}
          </Text>
        </View>
      ) : null}

      {/*
        Feature 32.1 — the row appears only for a household that turned the
        helper on. Unlike the tab bar, a settings index can afford a row that
        comes and goes, and offering a paid feature nobody enabled is worse
        than not mentioning it.
      */}
      {household.data?.aiEnabled ? (
        <SettingsGroup title="Помічник">
          <SettingsRow label="Рецепти" onPress={() => router.push("/recipes")} />
        </SettingsGroup>
      ) : null}

      <SettingsGroup title="Акаунт">
        <SettingsRow
          label="Пароль"
          onPress={() => router.push("/settings/password")}
        />
        <SettingsRow label="Стан збірки" onPress={() => router.push("/status")} />
      </SettingsGroup>

      <Button
        label="Вийти"
        variant="ghost"
        onPress={() => void auth.signOut()}
      />
    </Screen>
  );
}
