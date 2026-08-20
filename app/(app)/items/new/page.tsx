import { requireSession } from "@/lib/auth-guard";
import { getCategoriesAndLocations } from "@/lib/queries";
import { ItemForm } from "@/components/item-form";

export default async function NewItemPage() {
  const session = await requireSession();
  const { categories, locations } = await getCategoriesAndLocations(
    session.householdId,
  );

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight">Новий товар</h1>
      <ItemForm categories={categories} locations={locations} />
    </div>
  );
}
