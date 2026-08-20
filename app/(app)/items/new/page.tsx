import { requireSession } from "@/lib/auth-guard";
import { getCategoriesAndLocations, getItemNames } from "@/lib/queries";
import { ItemForm } from "@/components/item-form";

export default async function NewItemPage({
  searchParams,
}: {
  searchParams: Promise<{ name?: string }>;
}) {
  const session = await requireSession();
  const [{ categories, locations }, existingItems, { name }] = await Promise.all([
    getCategoriesAndLocations(session.householdId),
    getItemNames(session.householdId),
    searchParams,
  ]);

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight">Новий товар</h1>
      <ItemForm
        categories={categories}
        locations={locations}
        existingItems={existingItems}
        // Feature 16.2 — carried from the /items search, so nothing is retyped.
        initialName={name}
      />
    </div>
  );
}
