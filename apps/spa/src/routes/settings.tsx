import { useQuery } from "@tanstack/react-query";
import { findDuplicateGroups, type NamedItem } from "@supplies/core/duplicates";
import { api } from "../api/client";
import { keys } from "../api/keys";
import type { GroupView, Household, Member, Taxonomy } from "../api/types";
import { ErrorNote, Spinner } from "../components/feedback";
import { CategoryPanel } from "../components/settings/category-panel";
import { DuplicatesPanel } from "../components/settings/duplicates-panel";
import { HouseholdPanel } from "../components/settings/household-panel";
import { InvitePanel } from "../components/settings/invite-panel";
import { ItemGroupPanel } from "../components/settings/item-group-panel";
import { LocationPanel } from "../components/settings/location-panel";
import { PasswordPanel } from "../components/settings/password-panel";
import { TelegramPanel } from "../components/settings/telegram-panel";

/**
 * «Налаштування» — the counterpart of `apps/web/app/(app)/settings/page.tsx`
 * and its panels.
 *
 * §3.5/§7 — `expiryWarnDays` and `digestHour` are household DATA, not
 * constants. The engine takes them as input, so changing the warn window here
 * changes what «Скоро зіпсується» means everywhere at once: this page, the
 * dashboard, the Telegram digest and the phone.
 *
 * Deletes are expected to be refused sometimes, and that is the interesting
 * part rather than an inconvenience. A category with items in it cannot go,
 * because the items would silently lose it. Each panel owns its own writes and
 * shares one invalidation list through `useWrite`.
 */
export function SettingsRoute() {
  const household = useQuery({
    queryKey: keys.household,
    queryFn: () => api.get<Household>("/api/household"),
  });
  const taxonomy = useQuery({
    queryKey: keys.taxonomy,
    queryFn: () => api.get<Taxonomy>("/api/taxonomy"),
  });
  const groups = useQuery({
    queryKey: keys.groups,
    queryFn: () => api.get<GroupView[]>("/api/groups"),
  });
  const members = useQuery({
    queryKey: keys.members,
    queryFn: () => api.get<Member[]>("/api/household/members"),
  });
  const telegram = useQuery({
    queryKey: keys.telegram,
    queryFn: () => api.get<{ linked: boolean }>("/api/telegram/linked"),
  });
  const names = useQuery({
    queryKey: keys.itemNames,
    queryFn: () => api.get<NamedItem[]>("/api/items/names"),
  });

  if (household.isPending || taxonomy.isPending) return <Spinner />;
  if (household.isError) return <ErrorNote error={household.error} />;
  if (taxonomy.isError) return <ErrorNote error={taxonomy.error} />;
  if (!household.data || !taxonomy.data) return null;

  /**
   * Feature 16.3 — computed here rather than on the server.
   *
   * The Next page runs `findDuplicateGroups` in its server component because
   * it already holds the names; this one already holds them too, from the
   * endpoint the item form uses. Same pure function from `@supplies/core`,
   * so the two clients group names identically — which is the only part that
   * matters. Adding an endpoint to run a pure function over data the client
   * already has would be a round trip for nothing.
   */
  const duplicates = names.data ? findDuplicateGroups(names.data) : [];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Налаштування</h1>
        <p className="text-sm text-muted-foreground">Спільні для всієї родини.</p>
      </div>

      <HouseholdPanel household={household.data} />

      <div className="grid gap-5 sm:grid-cols-2">
        <CategoryPanel
          householdWarnDays={household.data.expiryWarnDays}
          categories={taxonomy.data.categories}
        />
        <LocationPanel locations={taxonomy.data.locations} />
      </div>

      {/* Feature 26 — full width: the rows carry a name and a threshold. */}
      <ItemGroupPanel groups={groups.data ?? []} />

      <DuplicatesPanel groups={duplicates} />

      <InvitePanel members={members.data ?? []} />

      <TelegramPanel linked={telegram.data?.linked ?? false} />

      <PasswordPanel />
    </div>
  );
}
