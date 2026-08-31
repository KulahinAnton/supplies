import "dotenv/config";
import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { todayUTC } from "@/lib/period";
import { addStock, consume, consumeBatch } from "@/lib/stock-service";
import {
  getDashboard,
  getItemGroupViews,
  getItemViews,
  getShoppingView,
} from "@/lib/queries";
import { itemQuantity } from "@/lib/stock";
import { renderMessage } from "@/lib/messages";
import { formatQuantityWithUnit } from "@/lib/format";

/**
 * One-off integration smoke test against a real Postgres. Exercises the paths
 * unit tests cannot reach: transactions, FEFO through Prisma, household
 * scoping. Run with:
 *   pnpm exec tsx --conditions=react-server scripts/smoke.ts
 */

let failures = 0;

function check(label: string, condition: boolean, detail = "") {
  const mark = condition ? "PASS" : "FAIL";
  if (!condition) failures += 1;
  console.log(`  [${mark}] ${label}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  const household = await prisma.household.findFirstOrThrow({
    where: { name: "Наша родина" },
  });
  const anton = await prisma.user.findFirstOrThrow({
    where: { email: "anton@example.com" },
  });
  const actor = { userId: anton.id, householdId: household.id };

  const water = await prisma.item.findFirstOrThrow({
    where: { householdId: household.id, name: { startsWith: "Вода" } },
  });
  const milk = await prisma.item.findFirstOrThrow({
    where: { householdId: household.id, name: { startsWith: "Молоко" } },
  });

  console.log("\n1. Multi-batch add (one purchase, three expiry dates)");
  const waterBefore = itemQuantity(
    await prisma.stockBatch.findMany({ where: { itemId: water.id } }),
  );
  const before = await prisma.stockBatch.count({ where: { itemId: water.id } });
  const purchasesBefore = await prisma.stockMovement.count({
    where: { itemId: water.id, reason: "PURCHASE" },
  });
  const added = await addStock(actor, water.id, [
    { quantity: "2", expiresAt: "2027-01-10" },
    { quantity: "1", expiresAt: "2027-03-10" },
    { quantity: "7", expiresAt: "2027-06-10" },
  ]);
  check("returns ok", added.ok);
  if (added.ok) check("created 3 batches", added.data.batchIds.length === 3);
  const after = await prisma.stockBatch.count({ where: { itemId: water.id } });
  check("batch rows +3", after === before + 3, `${before} → ${after}`);
  const purchasesAfter = await prisma.stockMovement.count({
    where: { itemId: water.id, reason: "PURCHASE" },
  });
  // A DELTA, like the batch count above. Comparing absolute totals only held
  // on a pristine seed, so this file stopped being re-runnable the moment
  // anything else in it created a batch — which the later sections now do.
  check(
    "one PURCHASE movement per batch",
    purchasesAfter - purchasesBefore === 3,
    `+${purchasesAfter - purchasesBefore}`,
  );

  console.log("\n2. Rows naming the same date merge into one batch");
  const mergeItem = await prisma.item.findFirstOrThrow({
    where: { householdId: household.id, name: "Макарони" },
  });
  const mergedBefore = await prisma.stockBatch.count({
    where: { itemId: mergeItem.id },
  });
  const merged = await addStock(actor, mergeItem.id, [
    { quantity: "1", expiresAt: "2027-05-05" },
    { quantity: "2", expiresAt: "2027-05-05" },
  ]);
  const mergedAfter = await prisma.stockBatch.count({
    where: { itemId: mergeItem.id },
  });
  check("ok", merged.ok);
  check("2 rows → 1 batch", mergedAfter === mergedBefore + 1);
  const mergedBatch = await prisma.stockBatch.findFirstOrThrow({
    where: { itemId: mergeItem.id, expiresAt: new Date("2027-05-05T00:00:00Z") },
  });
  check("quantities summed to 3", mergedBatch.quantity.toString() === "3", mergedBatch.quantity.toString());

  console.log("\n3. FEFO consume skips the expired batch");
  // Set up our own stock rather than relying on what the seed left behind —
  // otherwise a second run of this script finds the milk already drunk.
  const nextYear = new Date().getUTCFullYear() + 1;

  /**
   * Both batches are created here rather than found among the seed's.
   *
   * This used to take `milkBatches[0]` as the expired one, assuming the seed's
   * expired carton was always the earliest surviving batch. Once that stopped
   * being true the check drew from the batch it had labelled "expired" and
   * reported that FEFO had not touched the good one — a real-looking failure
   * with nothing wrong behind it.
   */
  const expiredBatch = await prisma.stockBatch.create({
    data: {
      itemId: milk.id,
      quantity: "1.000",
      expiresAt: new Date("2020-01-01"),
      addedById: anton.id,
    },
  });
  const goodAdd = await addStock(actor, milk.id, [
    { quantity: "2", expiresAt: `${nextYear}-06-01` },
  ]);
  if (!goodAdd.ok) throw new Error("could not set up the good batch");

  /**
   * Measured as a TOTAL over unexpired stock, not against one named batch.
   *
   * Naming a batch asserts which one FEFO picks, which is not the rule — the
   * rule is that it draws a whole unit from something unexpired and leaves
   * expired stock alone. The previous version named the batch it had just
   * added, and failed the moment the seed happened to hold milk with an
   * earlier date, which FEFO quite correctly preferred.
   */
  const liveUnexpired = async () => {
    const batches = await prisma.stockBatch.findMany({
      where: { itemId: milk.id, quantity: { gt: 0 }, expiresAt: { gte: todayUTC() } },
    });
    return batches.reduce((sum, b) => sum.plus(b.quantity), new Prisma.Decimal(0));
  };
  const unexpiredBefore = await liveUnexpired();
  const took = await consume(actor, milk.id, "1");
  check("consume ok", took.ok, took.ok ? "" : renderMessage(took.error));
  const expiredAfter = await prisma.stockBatch.findUniqueOrThrow({
    where: { id: expiredBatch.id },
  });
  const unexpiredAfter = await liveUnexpired();
  check(
    "expired batch untouched",
    expiredAfter.quantity.toString() === expiredBatch.quantity.toString(),
    `${expiredBatch.quantity} → ${expiredAfter.quantity}`,
  );
  check(
    "drew exactly 1 from unexpired stock",
    unexpiredBefore.minus(unexpiredAfter).equals(1),
    `${unexpiredBefore} → ${unexpiredAfter}`,
  );

  console.log("\n4. Shortfall is rejected whole, naming the gap");
  const bread = await prisma.item.findFirstOrThrow({
    where: { householdId: household.id, name: "Хліб житній" },
  });
  const short = await consume(actor, bread.id, "5");
  check("rejected", !short.ok);
  if (!short.ok) {
    check("key is stock.shortfall", short.error.key === "stock.shortfall");
    console.log(`      message: ${renderMessage(short.error)}`);
  }
  const breadMovements = await prisma.stockMovement.count({
    where: { itemId: bread.id, reason: "CONSUME" },
  });
  check("no partial write", breadMovements === 0);

  console.log("\n5. Household scoping — another household cannot touch these rows");
  const other = await prisma.household.create({ data: { name: "Чужа родина" } });
  const otherUser = await prisma.user.create({
    data: {
      name: "Чужий",
      email: `outsider-${Date.now()}@example.com`,
      passwordHash: "x",
      householdId: other.id,
    },
  });
  const intruder = { userId: otherUser.id, householdId: other.id };
  const stolen = await consume(intruder, milk.id, "1");
  check("consume blocked", !stolen.ok);
  if (!stolen.ok) check("reports item.notFound", stolen.error.key === "item.notFound");
  const stolenAdd = await addStock(intruder, water.id, [{ quantity: "99" }]);
  check("addStock blocked", !stolenAdd.ok);
  const otherViews = await getItemViews(other.id);
  check("sees none of our items", otherViews.length === 0, `${otherViews.length}`);

  console.log("\n6. Queries compose the engine correctly");
  const dashboard = await getDashboard(household.id);
  const views = await getItemViews(household.id);
  const waterView = views.find((item) => item.id === water.id)!;
  // Relative, not absolute: this script is meant to be re-runnable against a
  // database it has already touched, so it must not assume a fresh seed.
  check(
    "water grew by exactly the 10 added",
    waterView.quantity.equals(waterBefore.plus(10)),
    `${waterBefore} → ${formatQuantityWithUnit(waterView.quantity, waterView.unit)}`,
  );
  check("water is OK on stock", waterView.stock === "OK");
  const milkView = views.find((item) => item.id === milk.id)!;
  check("milk still reads EXPIRED", milkView.expiry === "EXPIRED");
  check("dashboard lists expiring", dashboard.expiring.length > 0, `${dashboard.expiring.length}`);
  check("dashboard lists restock", dashboard.restock.length > 0, `${dashboard.restock.length}`);
  check(
    "expired sorts before soon",
    dashboard.expiring[0].expiry === "EXPIRED",
    dashboard.expiring[0].name,
  );

  console.log("\n7. Shopping candidates exclude what is already on the list");
  const { rows, candidates } = await getShoppingView(household.id);
  const onListIds = rows.filter((r) => !r.isChecked && r.itemId).map((r) => r.itemId);
  check("bread is on the list", onListIds.includes(bread.id));
  check(
    "bread is NOT also a candidate",
    !candidates.some((c) => c.itemId === bread.id),
  );
  check("coffee IS a candidate", candidates.some((c) => c.name === "Кава мелена"));
  console.log(`      candidates: ${candidates.map((c) => c.name).join(", ")}`);

  // Feature 20 — the GEPIR cache. No network here: this pins the storage
  // contract the lookup depends on, above all that a MISS is cachable and
  // distinguishable from "never asked". Confuse those two and the app either
  // re-scrapes a third-party site on every scan or hides a real answer.
  console.log("\n8. GEPIR lookup cache");
  const probe = "4820000000000";
  await prisma.barcodeFact.deleteMany({ where: { barcode: probe } });
  check(
    "cold cache is a miss",
    (await prisma.barcodeFact.findUnique({ where: { barcode_source: { barcode: probe, source: "gepir" } } })) === null,
  );

  await prisma.barcodeFact.create({ data: { barcode: probe, source: "gepir", value: null } });
  const cachedMiss = await prisma.barcodeFact.findUnique({ where: { barcode_source: { barcode: probe, source: "gepir" } } });
  check(
    "a negative answer is cached, and differs from never asked",
    cachedMiss !== null && cachedMiss.value === null,
  );

  await prisma.barcodeFact.upsert({
    where: { barcode_source: { barcode: probe, source: "gepir" } },
    create: { barcode: probe, source: "gepir", value: "ТОВ «ТЕСТ»" },
    update: { value: "ТОВ «ТЕСТ»", fetchedAt: new Date() },
  });
  const upgraded = await prisma.barcodeFact.findUnique({ where: { barcode_source: { barcode: probe, source: "gepir" } } });
  check("a later real answer replaces a cached miss", upgraded?.value === "ТОВ «ТЕСТ»");
  await prisma.barcodeFact.deleteMany({ where: { barcode: probe } });

  // Feature 22 — per-batch storage location.
  console.log("\n9. Batch storage locations");
  const shelves = await prisma.storageLocation.findMany({
    where: { householdId: household.id },
    orderBy: { name: "asc" },
    take: 2,
  });
  const locItem = await prisma.item.findFirstOrThrow({
    where: { householdId: household.id, isArchived: false },
  });

  // Same date, two different shelves. These must NOT merge: merging would
  // silently move stock, which is the whole point of the feature.
  const sameDate = "2027-01-15";
  const shelfBefore = await prisma.stockBatch.count({ where: { itemId: locItem.id } });
  const shelfAdded = await addStock(actor, locItem.id, [
    { quantity: "2", expiresAt: sameDate, locationId: shelves[0].id },
    { quantity: "3", expiresAt: sameDate, locationId: shelves[1].id },
  ]);
  check("two shelves, one date -> two batches", shelfAdded.ok);
  const shelfAfter = await prisma.stockBatch.count({ where: { itemId: locItem.id } });
  check("same date on different shelves does not merge", shelfAfter - shelfBefore === 2, `+${shelfAfter - shelfBefore}`);

  // Same date AND same shelf still merges, as it always did.
  const beforeMerge = await prisma.stockBatch.count({ where: { itemId: locItem.id } });
  await addStock(actor, locItem.id, [
    { quantity: "1", expiresAt: "2027-02-20", locationId: shelves[0].id },
    { quantity: "4", expiresAt: "2027-02-20", locationId: shelves[0].id },
  ]);
  const afterMerge = await prisma.stockBatch.count({ where: { itemId: locItem.id } });
  check("same date on the same shelf still merges", afterMerge - beforeMerge === 1, `+${afterMerge - beforeMerge}`);

  // An omitted location falls back to the item's own shelf.
  const fallback = await addStock(actor, locItem.id, [
    { quantity: "1", expiresAt: "2027-03-25" },
  ]);
  const fallbackBatch = await prisma.stockBatch.findFirstOrThrow({
    where: { id: fallback.ok ? fallback.data.batchIds[0] : "" },
  });
  check(
    "omitted location falls back to the item's own",
    fallbackBatch.locationId === locItem.locationId,
  );

  // A location belonging to another household must be refused outright.
  const intruderShelf = await prisma.storageLocation.create({
    data: { householdId: other.id, name: "Чужа полиця" },
  });
  const refused = await addStock(actor, locItem.id, [
    { quantity: "1", locationId: intruderShelf.id },
  ]);
  check("another household's shelf is refused", !refused.ok);

  await prisma.stockBatch.deleteMany({
    where: { itemId: locItem.id, expiresAt: { in: [new Date(sameDate), new Date("2027-02-20"), new Date("2027-03-25")] } },
  });

  // Feature 24 — taking from one batch, expired included.
  console.log("\n10. Taking from a specific batch");
  const takeItem = await prisma.item.findFirstOrThrow({
    where: { householdId: household.id, isArchived: false },
  });
  const takeBatch = await prisma.stockBatch.create({
    data: {
      itemId: takeItem.id,
      quantity: "5.000",
      // Deliberately expired: this is the case the item-level take refuses.
      expiresAt: new Date("2020-01-01"),
      addedById: anton.id,
    },
  });

  const overTake = await consumeBatch(actor, takeBatch.id, "6");
  check("cannot take more than the batch holds", !overTake.ok);

  const tookExpired = await consumeBatch(actor, takeBatch.id, "2");
  check("an EXPIRED batch can still be taken from", tookExpired.ok);

  const afterTake = await prisma.stockBatch.findUniqueOrThrow({ where: { id: takeBatch.id } });
  check("batch quantity dropped by exactly the amount taken", afterTake.quantity.toString() === "3", afterTake.quantity.toString());

  const movement = await prisma.stockMovement.findFirstOrThrow({
    where: { batchId: takeBatch.id },
    orderBy: { occurredAt: "desc" },
  });
  // Used and binned are different facts; only the movement log keeps them apart.
  check("it is recorded as CONSUME, not WASTE", movement.reason === "CONSUME", movement.reason);

  await prisma.stockMovement.deleteMany({ where: { batchId: takeBatch.id } });
  await prisma.stockBatch.delete({ where: { id: takeBatch.id } });

  console.log("\n11. Set totals count live stock, not members");
  // Feature 26.4 — the settings panel and the sets list read this. A set's
  // combined quantity is derived from its members' live batches, so it cannot
  // be asserted from a column; and archived members must not reach it.
  const setName = `Смоук набір ${Date.now()}`;
  const set = await prisma.itemGroup.create({
    data: { householdId: household.id, name: setName, minQty: "0", sortOrder: 999 },
  });
  const spare = await prisma.item.create({
    data: {
      householdId: household.id,
      name: `Смоук товар ${Date.now()}`,
      unit: water.unit,
      minQty: "0",
      groupId: set.id,
      categoryId: water.categoryId,
    },
  });
  await prisma.item.update({ where: { id: water.id }, data: { groupId: set.id } });
  await prisma.stockBatch.create({
    data: { itemId: spare.id, quantity: "4", expiresAt: null, addedById: anton.id },
  });

  const waterNow = itemQuantity(
    await prisma.stockBatch.findMany({ where: { itemId: water.id } }),
  );
  const bothIn = (await getItemGroupViews(household.id)).find((g) => g.id === set.id)!;
  check("counts both members", bothIn.memberCount === 2, `${bothIn.memberCount}`);
  check(
    "sums their live stock",
    bothIn.quantity.equals(waterNow.plus(4)),
    `${bothIn.quantity} vs ${waterNow.plus(4)}`,
  );

  await prisma.item.update({ where: { id: spare.id }, data: { isArchived: true } });
  const archivedOut = (await getItemGroupViews(household.id)).find((g) => g.id === set.id)!;
  // The set page has always ignored archived members; the settings count did
  // not, so a set could report two products and then show one.
  check("an archived member leaves the count", archivedOut.memberCount === 1);
  check(
    "and leaves the total",
    archivedOut.quantity.equals(waterNow),
    `${archivedOut.quantity} vs ${waterNow}`,
  );

  await prisma.item.update({ where: { id: water.id }, data: { groupId: null } });
  await prisma.stockBatch.deleteMany({ where: { itemId: spare.id } });
  await prisma.item.delete({ where: { id: spare.id } });
  await prisma.itemGroup.delete({ where: { id: set.id } });
  check("set removed", (await prisma.itemGroup.count({ where: { id: set.id } })) === 0);

  console.log("\n12. Cleanup");
  await prisma.household.delete({ where: { id: other.id } });
  check("intruder household removed", true);

  console.log(
    failures === 0
      ? "\nAll smoke checks passed.\n"
      : `\n${failures} smoke check(s) FAILED.\n`,
  );
  if (failures > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
