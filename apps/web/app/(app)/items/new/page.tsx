import { requireSession } from "@/lib/auth-guard";
import { getItemGroups, getCategoriesAndLocations, getItemNames } from "@supplies/db/queries";
import { ItemForm } from "@/components/item-form";

export default async function NewItemPage({
  searchParams,
}: {
  searchParams: Promise<{ name?: string; barcode?: string }>;
}) {
  const session = await requireSession();
  const [{ categories, locations }, itemGroups, existingItems, { name, barcode }] =
    await Promise.all([
      getCategoriesAndLocations(session.householdId),
      getItemGroups(session.householdId),
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
        itemGroups={itemGroups}
        // Feature 16.2 — carried from the /items search, so nothing is retyped.
        initialName={name}
        // Feature 21 — carried from a scan on /items that found no match.
        initialBarcode={barcode}
      />
    </div>
  );
}
