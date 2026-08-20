import { requireSession } from "@/lib/auth-guard";
import {
  getCategoriesAndLocations,
  getHousehold,
  getMembers,
  hasTelegramLink,
} from "@/lib/queries";
import { CategoryPanel } from "@/components/category-panel";
import { LocationPanel } from "@/components/location-panel";
import {
  HouseholdPanel,
  InvitePanel,
  PasswordPanel,
  TelegramPanel,
} from "@/components/settings-panels";

export default async function SettingsPage() {
  const session = await requireSession();
  const [household, { categories, locations }, members, telegramLinked] =
    await Promise.all([
      getHousehold(session.householdId),
      getCategoriesAndLocations(session.householdId),
      getMembers(session.householdId),
      hasTelegramLink(session.userId),
    ]);

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
