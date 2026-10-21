import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@supplies/db/generated/prisma/client";
import type { Unit } from "@supplies/db/generated/prisma/enums";

/**
 * Demo data (PROJECT_PROMPT.md Feature 0).
 *
 * Deliberately uneven: one item OUT, two LOW, one carrying an EXPIRED batch,
 * one expiring SOON, and one with no expiry date at all — so the dashboard,
 * the shopping suggestions and the FEFO planner all have something real to
 * show the first time the app is opened.
 *
 * Dates are relative to the day the seed runs, so the demo never goes stale.
 */

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

/** UTC-midnight date `days` from today — matches lib/period.ts semantics. */
function day(offset: number): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offset),
  );
}

const CATEGORIES = [
  { name: "Продукти", icon: "apple" },
  { name: "Напої", icon: "cup-soda" },
  { name: "Побутова хімія", icon: "spray-can" },
  { name: "Гігієна", icon: "bath" },
  { name: "Ліки", icon: "pill" },
  { name: "Для тварин", icon: "paw-print" },
  { name: "Інше", icon: "package" },
];

const LOCATIONS = [
  "Комора",
  "Холодильник",
  "Морозильник",
  "Ванна кімната",
  "Гараж",
];

type SeedItem = {
  name: string;
  category: string;
  location: string;
  unit: Unit;
  minQty: string;
  barcode?: string;
  /** [quantity, days-from-today or null] */
  batches: [string, number | null][];
};

const ITEMS: SeedItem[] = [
  // The §3.1 example, verbatim: one product, three expiry dates.
  {
    name: "Вода негазована 1,5 л",
    category: "Напої",
    location: "Комора",
    unit: "PIECE",
    minQty: "4",
    barcode: "4820000431125",
    batches: [
      ["2", 90],
      ["1", 180],
      ["7", 365],
    ],
  },
  // EXPIRED — something to discard on day one.
  {
    name: "Молоко 2,5%",
    category: "Продукти",
    location: "Холодильник",
    unit: "LITRE",
    minQty: "2",
    batches: [
      ["1", -2],
      ["2", 4],
    ],
  },
  // SOON.
  {
    name: "Йогурт натуральний",
    category: "Продукти",
    location: "Холодильник",
    unit: "PIECE",
    minQty: "2",
    batches: [["4", 3]],
  },
  // OUT — no live batches at all.
  {
    name: "Хліб житній",
    category: "Продукти",
    location: "Комора",
    unit: "PIECE",
    minQty: "1",
    batches: [],
  },
  // LOW.
  {
    name: "Кава мелена",
    category: "Напої",
    location: "Комора",
    unit: "GRAM",
    minQty: "250",
    batches: [["200", 400]],
  },
  // LOW.
  {
    name: "Пральний порошок",
    category: "Побутова хімія",
    location: "Ванна кімната",
    unit: "KILOGRAM",
    minQty: "1",
    batches: [["0.8", null]],
  },
  // No expiry at all.
  {
    name: "Сіль кухонна",
    category: "Продукти",
    location: "Комора",
    unit: "KILOGRAM",
    minQty: "0",
    batches: [["1.5", null]],
  },
  {
    name: "Олія соняшникова",
    category: "Продукти",
    location: "Комора",
    unit: "LITRE",
    minQty: "1",
    batches: [["2", 200]],
  },
  {
    name: "Макарони",
    category: "Продукти",
    location: "Комора",
    unit: "KILOGRAM",
    minQty: "1",
    batches: [["3", 500]],
  },
  {
    name: "Яйця",
    category: "Продукти",
    location: "Холодильник",
    unit: "PIECE",
    minQty: "10",
    batches: [["20", 21]],
  },
  {
    name: "Заморожені ягоди",
    category: "Продукти",
    location: "Морозильник",
    unit: "GRAM",
    minQty: "0",
    batches: [["900", 300]],
  },
  {
    name: "Зубна паста",
    category: "Гігієна",
    location: "Ванна кімната",
    unit: "PIECE",
    minQty: "1",
    batches: [["2", 600]],
  },
  {
    name: "Шампунь",
    category: "Гігієна",
    location: "Ванна кімната",
    unit: "PIECE",
    minQty: "1",
    batches: [["1", 700]],
  },
  {
    name: "Парацетамол 500 мг",
    category: "Ліки",
    location: "Ванна кімната",
    unit: "PACK",
    minQty: "1",
    batches: [["2", 45]],
  },
  {
    name: "Корм для кота",
    category: "Для тварин",
    location: "Комора",
    unit: "KILOGRAM",
    minQty: "2",
    batches: [["5", 250]],
  },
];

async function main() {
  console.log("Seeding…");

  // Idempotent: wipe the demo household and rebuild it.
  await prisma.household.deleteMany({ where: { name: "Наша родина" } });

  const passwordHash = await bcrypt.hash("supplies123", 12);

  const household = await prisma.household.create({
    data: { name: "Наша родина", expiryWarnDays: 7, digestHour: 8 },
  });

  const [anton, olena] = await Promise.all([
    prisma.user.create({
      data: {
        name: "Антон",
        email: "anton@example.com",
        passwordHash,
        householdId: household.id,
      },
    }),
    prisma.user.create({
      data: {
        name: "Олена",
        email: "olena@example.com",
        passwordHash,
        householdId: household.id,
      },
    }),
  ]);

  await prisma.category.createMany({
    data: CATEGORIES.map((category, index) => ({
      ...category,
      householdId: household.id,
      sortOrder: index,
    })),
  });
  await prisma.storageLocation.createMany({
    data: LOCATIONS.map((name, index) => ({
      name,
      householdId: household.id,
      sortOrder: index,
    })),
  });

  const categories = new Map(
    (await prisma.category.findMany({ where: { householdId: household.id } })).map(
      (row) => [row.name, row.id],
    ),
  );
  const locations = new Map(
    (
      await prisma.storageLocation.findMany({ where: { householdId: household.id } })
    ).map((row) => [row.name, row.id]),
  );

  for (const [index, spec] of ITEMS.entries()) {
    const addedById = index % 2 === 0 ? anton.id : olena.id;

    const item = await prisma.item.create({
      data: {
        householdId: household.id,
        name: spec.name,
        categoryId: categories.get(spec.category)!,
        locationId: locations.get(spec.location)!,
        unit: spec.unit,
        minQty: spec.minQty,
        barcode: spec.barcode ?? null,
      },
    });

    for (const [quantity, offset] of spec.batches) {
      const batch = await prisma.stockBatch.create({
        data: {
          itemId: item.id,
          quantity,
          expiresAt: offset === null ? null : day(offset),
          addedById,
        },
      });
      // Every batch carries its PURCHASE movement — the seed obeys the same
      // rule the app does (§7), so the history is not empty on day one.
      await prisma.stockMovement.create({
        data: {
          itemId: item.id,
          batchId: batch.id,
          delta: quantity,
          reason: "PURCHASE",
          userId: addedById,
        },
      });
    }
  }

  // A shopping list that already has something on it.
  const bread = await prisma.item.findFirst({
    where: { householdId: household.id, name: "Хліб житній" },
  });
  if (bread) {
    await prisma.shoppingListItem.create({
      data: {
        householdId: household.id,
        itemId: bread.id,
        addedById: olena.id,
      },
    });
  }
  await prisma.shoppingListItem.create({
    data: {
      householdId: household.id,
      freeText: "Свічки для торта",
      addedById: anton.id,
    },
  });

  console.log(`Done. ${ITEMS.length} items in "${household.name}".`);
  console.log("Login: anton@example.com / supplies123");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
