import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { addStock, consume } from "@/lib/stock-service";
import { getDashboard, getItemViews, getShoppingView } from "@/lib/queries";
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
  const added = await addStock(actor, water.id, [
    { quantity: "2", expiresAt: "2027-01-10" },
    { quantity: "1", expiresAt: "2027-03-10" },
    { quantity: "7", expiresAt: "2027-06-10" },
  ]);
  check("returns ok", added.ok);
  if (added.ok) check("created 3 batches", added.data.batchIds.length === 3);
  const after = await prisma.stockBatch.count({ where: { itemId: water.id } });
  check("batch rows +3", after === before + 3, `${before} → ${after}`);
  const purchases = await prisma.stockMovement.count({
    where: { itemId: water.id, reason: "PURCHASE" },
  });
  check("one PURCHASE movement per batch", purchases === after, `${purchases}`);

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
  await addStock(actor, milk.id, [{ quantity: "2", expiresAt: `${nextYear}-06-01` }]);

  const milkBatches = await prisma.stockBatch.findMany({
    where: { itemId: milk.id, quantity: { gt: 0 } },
    orderBy: { expiresAt: "asc" },
  });
  const expiredBatch = milkBatches[0];
  const goodBatch = milkBatches.find((b) => b.id !== expiredBatch.id)!;
  const took = await consume(actor, milk.id, "1");
  check("consume ok", took.ok, took.ok ? "" : renderMessage(took.error));
  const expiredAfter = await prisma.stockBatch.findUniqueOrThrow({
    where: { id: expiredBatch.id },
  });
  const goodAfter = await prisma.stockBatch.findUniqueOrThrow({
    where: { id: goodBatch.id },
  });
  check(
    "expired batch untouched",
    expiredAfter.quantity.toString() === expiredBatch.quantity.toString(),
    `${expiredBatch.quantity} → ${expiredAfter.quantity}`,
  );
  check(
    "drew from the good batch",
    goodAfter.quantity.lessThan(goodBatch.quantity),
    `${goodBatch.quantity} → ${goodAfter.quantity}`,
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
  await prisma.gepirLookup.deleteMany({ where: { barcode: probe } });
  check(
    "cold cache is a miss",
    (await prisma.gepirLookup.findUnique({ where: { barcode: probe } })) === null,
  );

  await prisma.gepirLookup.create({ data: { barcode: probe, company: null } });
  const cachedMiss = await prisma.gepirLookup.findUnique({ where: { barcode: probe } });
  check(
    "a negative answer is cached, and differs from never asked",
    cachedMiss !== null && cachedMiss.company === null,
  );

  await prisma.gepirLookup.upsert({
    where: { barcode: probe },
    create: { barcode: probe, company: "ТОВ «ТЕСТ»" },
    update: { company: "ТОВ «ТЕСТ»", fetchedAt: new Date() },
  });
  const upgraded = await prisma.gepirLookup.findUnique({ where: { barcode: probe } });
  check("a later real answer replaces a cached miss", upgraded?.company === "ТОВ «ТЕСТ»");
  await prisma.gepirLookup.deleteMany({ where: { barcode: probe } });

  console.log("\n9. Cleanup");
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
