import { requireSession } from "@/lib/auth-guard";
import { findDuplicateGroups } from "@supplies/core/duplicates";
import {
  getCategoriesAndLocations,
  getItemGroupViews,
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
      getItemGroupViews(session.householdId),
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
        aiEnabled={household.aiEnabled}
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
          itemCount: group.memberCount,
          // A set has no "default" — the star is hidden for this panel.
          isDefault: false,
          minQty: group.minQty.toString(),
          unit: group.unit,
          // Feature 26.4 — a Decimal cannot cross into a client component.
          quantity: group.quantity.toString(),
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
