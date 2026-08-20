// NOTE: deliberately NOT `import "server-only"`. That package throws on import
// outside a React Server Component build, and this module has two legitimate
// plain-Node consumers — the Telegram bot (`pnpm bot:start`) and the daily
// digest (`pnpm digest:run`). Client-safety is enforced by the Prisma import
// below instead: pulling this into a browser bundle fails the build loudly.

import { Prisma } from "@/lib/generated/prisma/client";
import type { Unit } from "@/lib/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import {
  itemExpiryState,
  needsAttention,
  resolveWarnDays,
  type ExpiryState,
} from "@/lib/expiry";
import { todayUTC } from "@/lib/period";
import {
  itemQuantity,
  needsRestock,
  stockState,
  type StockBatchInput,
  type StockState,
} from "@/lib/stock";
import { shoppingCandidates, type ShoppingCandidate } from "@/lib/shopping";

/**
 * Read helpers shared by the pages, the Telegram bot and the daily digest.
 *
 * This is the ONLY place that joins the database to the pure engine: pages do
 * not compute stock states themselves, so the web UI and the bot can never
 * disagree about what "low" means.
 */

export type ItemView = {
  id: string;
  name: string;
  unit: Unit;
  minQty: Prisma.Decimal;
  quantity: Prisma.Decimal;
  stock: StockState;
  expiry: ExpiryState;
  categoryName: string;
  locationName: string | null;
  /** Soonest expiry among live batches — what the chip shows. */
  nextExpiry: Date | null;
  batchCount: number;
  /** Feature 12.2 — lets the list offer "newest first". */
  createdAt: Date;
  /** Feature 13 — the window actually used for this item, after inheritance. */
  warnDays: number;
};

const liveBatch = (batch: { quantity: Prisma.Decimal }) =>
  batch.quantity.greaterThan(0);

export async function getHousehold(householdId: string) {
  return prisma.household.findUniqueOrThrow({ where: { id: householdId } });
}

/** Every non-archived item with its computed states. */
export async function getItemViews(householdId: string): Promise<ItemView[]> {
  const household = await getHousehold(householdId);
  const today = todayUTC();

  const items = await prisma.item.findMany({
    where: { householdId, isArchived: false },
    include: {
      batches: true,
      category: { select: { name: true, expiryWarnDays: true } },
      location: { select: { name: true } },
    },
    orderBy: { name: "asc" },
  });

  return items.map((item) => {
    const live = item.batches.filter(liveBatch);
    const dated = live
      .filter((batch) => batch.expiresAt)
      .sort((a, b) => a.expiresAt!.getTime() - b.expiresAt!.getTime());

    // Feature 13 — resolved per item, via its category. This is the only place
    // the fallback happens, so the item list, dashboard, bot and digest cannot
    // disagree about how far ahead to warn.
    const warnDays = resolveWarnDays(
      item.category.expiryWarnDays,
      household.expiryWarnDays,
    );

    return {
      id: item.id,
      name: item.name,
      unit: item.unit,
      minQty: item.minQty,
      quantity: itemQuantity(item.batches),
      stock: stockState(item, item.batches),
      expiry: itemExpiryState(item.batches, today, warnDays),
      warnDays,
      categoryName: item.category.name,
      locationName: item.location?.name ?? null,
      nextExpiry: dated[0]?.expiresAt ?? null,
      batchCount: live.length,
      createdAt: item.createdAt,
    };
  });
}

export type DashboardData = {
  expiryWarnDays: number;
  /** Feature 13 — true when some category uses a different window. */
  hasCategoryOverrides: boolean;
  expiring: ItemView[];
  restock: ItemView[];
  recent: Awaited<ReturnType<typeof getRecentMovements>>;
};

/** Feature 5 — the morning glance. */
export async function getDashboard(householdId: string): Promise<DashboardData> {
  const household = await getHousehold(householdId);
  const items = await getItemViews(householdId);

  const severity: Record<ExpiryState, number> = {
    EXPIRED: 0,
    SOON: 1,
    FRESH: 2,
    NONE: 3,
  };

  const expiring = items
    .filter((item) => needsAttention(item.expiry))
    .sort((a, b) => {
      const bySeverity = severity[a.expiry] - severity[b.expiry];
      if (bySeverity !== 0) return bySeverity;
      const aDate = a.nextExpiry?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const bDate = b.nextExpiry?.getTime() ?? Number.MAX_SAFE_INTEGER;
      return aDate - bDate;
    });

  const restock = items
    .filter((item) => needsRestock(item.stock))
    .sort((a, b) => {
      if (a.stock !== b.stock) return a.stock === "OUT" ? -1 : 1;
      return a.name.localeCompare(b.name, "uk-UA");
    });

  return {
    expiryWarnDays: household.expiryWarnDays,
    // Feature 13 — the header shows the household default, so it must say when
    // that number does not apply to everything. Claiming one figure covers the
    // whole list would be a lie once a category overrides it.
    hasCategoryOverrides: items.some(
      (item) => item.warnDays !== household.expiryWarnDays,
    ),
    expiring,
    restock,
    recent: await getRecentMovements(householdId, 8),
  };
}

export async function getRecentMovements(householdId: string, take = 20) {
  return prisma.stockMovement.findMany({
    where: { item: { householdId } },
    include: {
      item: { select: { id: true, name: true, unit: true } },
      user: { select: { name: true } },
    },
    orderBy: { occurredAt: "desc" },
    take,
  });
}

/** Item detail: batches ordered the way FEFO will actually draw them. */
export async function getItemDetail(householdId: string, itemId: string) {
  const household = await getHousehold(householdId);
  const item = await prisma.item.findFirst({
    where: { id: itemId, householdId },
    include: {
      batches: { include: { addedBy: { select: { name: true } } } },
      category: true,
      location: true,
      movements: {
        include: { user: { select: { name: true } } },
        orderBy: { occurredAt: "desc" },
        take: 50,
      },
    },
  });
  if (!item) return null;

  // Feature 13 — this item's window, after category inheritance. The page uses
  // it for the batch chips too, so a category override applies everywhere the
  // item is shown, not just in the list.
  const warnDays = resolveWarnDays(
    item.category.expiryWarnDays,
    household.expiryWarnDays,
  );

  return {
    item,
    household,
    warnDays,
    quantity: itemQuantity(item.batches),
    stock: stockState(item, item.batches),
    expiry: itemExpiryState(item.batches, todayUTC(), warnDays),
  };
}

/** Feature 6 — suggestions, never auto-inserted. */
export async function getShoppingView(householdId: string) {
  const rows = await prisma.shoppingListItem.findMany({
    where: { householdId },
    include: {
      item: { select: { id: true, name: true, unit: true } },
      addedBy: { select: { name: true } },
      checkedBy: { select: { name: true } },
    },
    orderBy: [{ isChecked: "asc" }, { addedAt: "asc" }],
  });

  const items = await prisma.item.findMany({
    where: { householdId, isArchived: false },
    include: { batches: true },
  });

  const onList = new Set(
    rows.filter((row) => !row.isChecked && row.itemId).map((row) => row.itemId!),
  );

  const batchesByItem = new Map<string, StockBatchInput[]>(
    items.map((item) => [item.id, item.batches]),
  );

  const candidates: ShoppingCandidate[] = shoppingCandidates(
    items,
    batchesByItem,
    onList,
  );

  // Feature 11 — the named groups. «Загальна група» is not among them; it is
  // the implicit `groupId = null` bucket that lib/shopping-groups.ts adds.
  const groups = await prisma.shoppingGroup.findMany({
    where: { householdId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, sortOrder: true },
  });

  return { rows, candidates, groups };
}

export async function getCategoriesAndLocations(householdId: string) {
  const [categories, locations] = await Promise.all([
    prisma.category.findMany({
      where: { householdId },
      orderBy: { sortOrder: "asc" },
      include: { _count: { select: { items: true } } },
    }),
    prisma.storageLocation.findMany({
      where: { householdId },
      orderBy: { sortOrder: "asc" },
      include: { _count: { select: { items: true } } },
    }),
  ]);
  return { categories, locations };
}

export async function getMembers(householdId: string) {
  return prisma.user.findMany({
    where: { householdId },
    select: { id: true, name: true, email: true, isActive: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
}

/** Header chips: how many things want attention right now. */
export async function getAttentionCounts(householdId: string) {
  const items = await getItemViews(householdId);
  return {
    expiring: items.filter((item) => needsAttention(item.expiry)).length,
    restock: items.filter((item) => needsRestock(item.stock)).length,
  };
}

/** Feature 9 — whether this user already has a Telegram chat bound. */
export async function hasTelegramLink(userId: string): Promise<boolean> {
  const link = await prisma.telegramLink.findUnique({
    where: { userId },
    select: { id: true },
  });
  return link !== null;
}

/**
 * Feature 3 — archived items, for /items/archive. Deliberately a separate
 * query: `getItemViews` filters archived rows out, because an archived item
 * must never reach the dashboard, the item list or the shopping suggestions.
 */
export async function getArchivedItems(householdId: string) {
  const items = await prisma.item.findMany({
    where: { householdId, isArchived: true },
    include: {
      batches: true,
      category: { select: { name: true } },
    },
    orderBy: { name: "asc" },
  });

  return items.map((item) => ({
    id: item.id,
    name: item.name,
    unit: item.unit,
    categoryName: item.category.name,
    quantity: itemQuantity(item.batches),
  }));
}
