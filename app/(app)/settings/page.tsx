import { requireSession } from "@/lib/auth-guard";
import { findDuplicateGroups } from "@/lib/duplicates";
import {
  getCategoriesAndLocations,
  getItemGroups,
  getHousehold,
  getMembers,
  hasTelegramLink,
  getItemNames,
} from "@/lib/queries";
import { CategoryPanel } from "@/components/category-panel";
import { DuplicatesPanel } from "@/components/duplicates-panel";
import { ItemGroupPanel } from "@/components/item-group-panel";
import { LocationPanel } from "@/components/location-panel";
import {
  HouseholdPanel,
  InvitePanel,
  PasswordPanel,
  TelegramPanel,
} from "@/components/settings-panels";

export default async function SettingsPage() {
  const session = await requireSession();
  const [household, { categories, locations }, itemGroups, members, telegramLinked] =
    await Promise.all([
      getHousehold(session.householdId),
      getCategoriesAndLocations(session.householdId),
      getItemGroups(session.householdId),
      getMembers(session.householdId),
      hasTelegramLink(session.userId),
    ]);

  // Feature 16.3 — computed here so the panel stays a plain server component.
  const duplicateGroups = findDuplicateGroups(
    await getItemNames(session.householdId),
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Налаштування</h1>
        <p className="text-sm text-muted-foreground">
          Спільні для всієї родини.
        </p>
      </div>

      <HouseholdPanel
        name={household.name}
        expiryWarnDays={household.expiryWarnDays}
        digestHour={household.digestHour}
      />

      <div className="grid gap-5 sm:grid-cols-2">
        <CategoryPanel
          householdWarnDays={household.expiryWarnDays}
          rows={categories.map((category) => ({
            id: category.id,
            name: category.name,
            itemCount: category._count.items,
            isDefault: category.isDefault,
            expiryWarnDays: category.expiryWarnDays,
          }))}
        />
        <LocationPanel
          rows={locations.map((location) => ({
            id: location.id,
            name: location.name,
            itemCount: location._count.items,
            isDefault: location.isDefault,
          }))}
        />
      </div>

      {/* Feature 26 — full width: the rows carry a name and a threshold. */}
      <ItemGroupPanel
        rows={itemGroups.map((group) => ({
          id: group.id,
          name: group.name,
          itemCount: group.itemCount,
          // A set has no "default" — the star is hidden for this panel.
          isDefault: false,
          minQty: group.minQty.toString(),
          unit: group.unit,
        }))}
      />

      <DuplicatesPanel groups={duplicateGroups} />

      <InvitePanel
        members={members.map((member) => ({
          id: member.id,
          name: member.name,
          email: member.email,
        }))}
      />

      <TelegramPanel linked={telegramLinked} />

      <PasswordPanel />
    </div>
  );
}
