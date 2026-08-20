import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth-guard";
import { getCategoriesAndLocations, getItemDetail } from "@/lib/queries";
import { ItemForm } from "@/components/item-form";

export default async function EditItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSession();
  const { id } = await params;

  const detail = await getItemDetail(session.householdId, id);
  if (!detail) notFound();

  const { categories, locations } = await getCategoriesAndLocations(
    session.householdId,
  );
  const { item } = detail;

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight">Редагувати</h1>
      <ItemForm
        categories={categories}
        locations={locations}
        hasBatches={item.batches.length > 0}
        item={{
          id: item.id,
          name: item.name,
          categoryId: item.categoryId,
          locationId: item.locationId,
          unit: item.unit,
          minQty: item.minQty.toString(),
          barcode: item.barcode,
          notes: item.notes,
        }}
      />
    </div>
  );
}
