// NOTE: deliberately NOT `import "server-only"`. That package throws on import
// outside a React Server Component build, and this module has two legitimate
// plain-Node consumers — the Telegram bot (`pnpm bot:start`) and the daily
// digest (`pnpm digest:run`). Client-safety is enforced by the Prisma import
// below instead: pulling this into a browser bundle fails the build loudly.

import { selectItems } from "../../core/src/item-filter";
import { paginate } from "../../core/src/pagination";
import type { ItemFilter, PerPage } from "../../core/src/item-list-params";
import type { ItemSort } from "../../core/src/item-sort";
import { buildGroupView, groupNeedsRestock } from "../../core/src/item-group";
import { Prisma } from "./generated/prisma/client";
import type { Unit } from "../../core/src/units";
import { prisma } from "./prisma";
import {
  itemExpiryState,
  needsAttention,
  resolveWarnDays,
  type ExpiryState,
} from "../../core/src/expiry";
import { todayUTC } from "../../core/src/period";
import {
  itemQuantity,
  needsRestock,
  stockState,
  type StockBatchInput,
  type StockState,
} from "../../core/src/stock";
import { shoppingCandidates, type ShoppingCandidate } from "../../core/src/shopping";

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
  /** Feature 26 — the set this item is counted with, if any. */
  groupId: string | null;
  groupName: string | null;
};

const liveBatch = (batch: { quantity: Prisma.Decimal }) =>
  batch.quantity.greaterThan(0);

export async function getHousehold(householdId: string) {
  return prisma.household.findUniqueOrThrow({ where: { id: householdId } });
}

/** The row `getHousehold` returns, for callers that pass one back in. */
export type HouseholdRow = Awaited<ReturnType<typeof getHousehold>>;

/** Every non-archived item with its computed states. */
export async function getItemViews(
  householdId: string,
  /** Feature 33 — reuse the caller's household row instead of re-reading it. */
  preloadedHousehold?: HouseholdRow,
): Promise<ItemView[]> {
  const household = preloadedHousehold ?? (await getHousehold(householdId));
  const today = todayUTC();

  const items = await prisma.item.findMany({
    where: { householdId, isArchived: false },
    include: {
      batches: true,
      category: { select: { name: true, expiryWarnDays: true } },
      location: { select: { name: true } },
      group: { select: { id: true, name: true } },
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
      groupId: item.groupId,
      groupName: item.group?.name ?? null,
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
  /** Feature 26 — items, plus groups standing in for their members. */
  restock: RestockEntry[];
  recent: Awaited<ReturnType<typeof getRecentMovements>>;
};

/** Feature 5 — the morning glance. */
export async function getDashboard(
  householdId: string,
  /**
   * Feature 33 — pass the item views in when the caller already has them.
   * The layout's nav badges load the whole household one line above this page
   * does; without a seam here that scan happens twice per navigation. Same
   * shape `getRestockEntries` already uses. Omitted, it loads its own.
   */
  preloaded?: { items?: ItemView[]; household?: HouseholdRow },
): Promise<DashboardData> {
  const household = preloaded?.household ?? (await getHousehold(householdId));
  const items = preloaded?.items ?? (await getItemViews(householdId, household));

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

  // Feature 26 — groups stand in for their members; see getRestockEntries.
  const restock = await getRestockEntries(householdId, items);

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
      batches: {
        include: {
          addedBy: { select: { name: true } },
          // Feature 22 — a batch can sit somewhere other than the item's shelf.
          location: { select: { id: true, name: true } },
        },
      },
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

  // Feature 14.2 — an archived row is not "on the list", so its item becomes
  // suggestible again rather than being suppressed by a row nobody can see.
  const onList = new Set(
    rows
      .filter((row) => !row.isChecked && !row.archivedAt && row.itemId)
      .map((row) => row.itemId!),
  );

  const batchesByItem = new Map<string, StockBatchInput[]>(
    items.map((item) => [item.id, item.batches]),
  );

  /**
   * Feature 26 — a grouped item is never suggested on its own; its group
   * speaks for it. Otherwise three brands of milk produce three suggestions
   * that all mean "buy milk".
   */
  const candidates: ShoppingCandidate[] = shoppingCandidates(
    items.filter((item) => item.groupId === null),
    batchesByItem,
    onList,
  );

  const itemGroups = await prisma.itemGroup.findMany({
    where: { householdId },
    orderBy: { sortOrder: "asc" },
  });

  for (const group of itemGroups) {
    const members = items.filter((item) => item.groupId === group.id);
    const view = buildGroupView(
      group,
      members.map((item) => ({
        id: item.id,
        name: item.name,
        unit: item.unit,
        quantity: itemQuantity(item.batches),
      })),
    );
    if (!groupNeedsRestock(view)) continue;
    // Writing down any brand settles the need; the group should stop asking.
    if (members.some((item) => onList.has(item.id))) continue;

    candidates.push({
      // No itemId: the app cannot know which brand will be bought, so this
      // goes on the list as free text and the shopper decides in the shop.
      itemId: null,
      name: group.name,
      state: view.state,
      quantity: view.quantity,
      minQty: view.minQty,
      unit: view.unit ?? members[0]?.unit ?? "PIECE",
    });
  }

  candidates.sort((a, b) => {
    if (a.state !== b.state) return a.state === "OUT" ? -1 : 1;
    return a.name.localeCompare(b.name, "uk-UA");
  });

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

/**
 * Feature 26 — what to remind about, with groups standing in for their members.
 *
 * A grouped item never appears on its own: the household is short of "milk",
 * not of a brand, and listing three brands separately turns one need into
 * three lines that all mean the same thing. The group's threshold is the only
 * one consulted for its members — an item's own minQty is ignored while it is
 * grouped, which is why the item form hides that field.
 *
 * Built once, here, so the dashboard, the shopping suggestions, the Telegram
 * digest and the nav badge cannot disagree about what is running out.
 */
export type RestockEntry =
  | { kind: "item"; id: string; name: string; state: StockState; quantity: Prisma.Decimal; unit: Unit; minQty: Prisma.Decimal }
  | { kind: "group"; id: string; name: string; state: StockState; quantity: Prisma.Decimal; unit: Unit | null; minQty: Prisma.Decimal; memberCount: number };

export async function getRestockEntries(
  householdId: string,
  items?: ItemView[],
): Promise<RestockEntry[]> {
  const views = items ?? (await getItemViews(householdId));

  const ungrouped = views
    .filter((item) => item.groupId === null)
    .filter((item) => needsRestock(item, item.stock))
    .map((item): RestockEntry => ({
      kind: "item",
      id: item.id,
      name: item.name,
      state: item.stock,
      quantity: item.quantity,
      unit: item.unit,
      minQty: item.minQty,
    }));

  const groups = await prisma.itemGroup.findMany({
    where: { householdId },
    orderBy: { sortOrder: "asc" },
  });

  const grouped: RestockEntry[] = [];
  for (const group of groups) {
    const members = views.filter((item) => item.groupId === group.id);
    const view = buildGroupView(group, members);
    if (!groupNeedsRestock(view)) continue;
    grouped.push({
      kind: "group",
      id: view.id,
      name: view.name,
      state: view.state,
      quantity: view.quantity,
      unit: view.unit,
      minQty: view.minQty,
      memberCount: view.memberCount,
    });
  }

  return [...ungrouped, ...grouped].sort((a, b) => {
    if (a.state !== b.state) return a.state === "OUT" ? -1 : 1;
    return a.name.localeCompare(b.name, "uk-UA");
  });
}

/** Header chips: how many things want attention right now. */
export async function getAttentionCounts(
  householdId: string,
  /** Feature 33 — see `getDashboard`. */
  preloaded?: ItemView[],
) {
  const items = preloaded ?? (await getItemViews(householdId));
  return {
    expiring: items.filter((item) => needsAttention(item.expiry)).length,
    // Feature 26 — a group of three brands is one thing to buy, so it counts
    // once. Counting members would inflate the badge past what the list shows.
    restock: (await getRestockEntries(householdId, items)).length,
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

/**
 * Feature 16 — every item name in the household, including archived ones.
 *
 * Archived items are included on purpose: a duplicate you archived last month
 * is exactly the one you are about to recreate, and staying quiet about it
 * would defeat the point.
 */
export async function getItemNames(householdId: string) {
  return prisma.item.findMany({
    where: { householdId },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

/**
 * Feature 26 — the sets, named and counted. For the pickers: the item form's
 * set selector, and the /items header deciding whether to offer the sets link.
 *
 * The unit comes from the members rather than a stored column, so it is always
 * the unit the set is actually counted in.
 *
 * Deliberately does NOT compute the combined stock — see `getItemGroupViews`,
 * which loads every member's batches to get it. This one runs on the items
 * list, where Feature 28 went to some trouble to keep the query small.
 */
export async function getItemGroups(householdId: string) {
  const groups = await prisma.itemGroup.findMany({
    where: { householdId },
    orderBy: { sortOrder: "asc" },
    include: {
      items: { where: { isArchived: false }, select: { unit: true }, take: 1 },
      _count: { select: { items: { where: { isArchived: false } } } },
    },
  });

  return groups.map((group) => ({
    id: group.id,
    name: group.name,
    minQty: group.minQty,
    itemCount: group._count.items,
    unit: group.items[0]?.unit ?? null,
  }));
}

/**
 * Feature 26.4 — the sets WITH their combined stock, for the settings panel
 * and the sets list.
 *
 * A minimum is a number you choose by comparing it against what the household
 * actually has, and the panel where you type that minimum showed only how MANY
 * products were in the set, never how much of them. This goes through
 * `buildGroupView`, the same engine the set page uses, so the total under the
 * name and the total on the set's own page cannot disagree.
 *
 * Loading every member's batches is the only way to it: quantity is derived
 * from live batches at read time and never stored, so there is no column to
 * sum in SQL (`getItemsPage` argues the same trade-off at length). That cost
 * is why this is separate from `getItemGroups` — the two pages that show a
 * total are not the two pages that need to be fast.
 *
 * Archived members are excluded, from the count as well. That was already true
 * of the set page and NOT of the settings count, so a set could report four
 * products and then show three.
 */
export async function getItemGroupViews(householdId: string) {
  const groups = await prisma.itemGroup.findMany({
    where: { householdId },
    orderBy: { sortOrder: "asc" },
    include: {
      items: {
        where: { isArchived: false },
        select: { id: true, name: true, unit: true, batches: true },
      },
    },
  });

  return groups.map((group) =>
    buildGroupView(
      group,
      group.items.map((item) => ({
        id: item.id,
        name: item.name,
        unit: item.unit,
        quantity: itemQuantity(item.batches),
      })),
    ),
  );
}

/**
 * Feature 26.2 — one set with its members, plus the items that could join it.
 *
 * Candidates exclude only the current members: an item already in *another*
 * set is offered, with that set named, because moving one is legitimate and
 * hiding it would look like the item does not exist.
 */
export async function getItemGroupDetail(householdId: string, groupId: string) {
  const group = await prisma.itemGroup.findFirst({
    where: { id: groupId, householdId },
  });
  if (!group) return null;

  const items = await prisma.item.findMany({
    where: { householdId, isArchived: false },
    include: { batches: true, group: { select: { id: true, name: true } } },
    orderBy: { name: "asc" },
  });

  const members = items
    .filter((item) => item.groupId === group.id)
    .map((item) => ({
      id: item.id,
      name: item.name,
      unit: item.unit,
      quantity: itemQuantity(item.batches),
    }));

  const view = buildGroupView(group, members);

  const candidates = items
    .filter((item) => item.groupId !== group.id)
    .map((item) => ({
      id: item.id,
      name: item.name,
      unit: item.unit,
      barcode: item.barcode,
      currentGroupName: item.group?.name ?? null,
      // The set counts one unit; anything else cannot be summed with it.
      compatible: view.unit === null || item.unit === view.unit,
    }));

  return { group, view, members, candidates };
}

/**
 * Feature 28 — one page of the items list.
 *
 * The whole household is loaded and the engine computes every state, then the
 * selection is applied and only the requested page is returned. That is not
 * laziness: `stock` and `expiry` are derived from batches and never stored, so
 * the server cannot know which items belong on page 1 without considering all
 * of them. Expressing those rules in SQL would be a second implementation of
 * §3.4 and §3.5, free to disagree with the first.
 *
 * What the page buys is the wire and the DOM: the browser receives 25 rows
 * instead of every item the family owns, which is what actually costs on a
 * phone.
 *
 * `categories` come from the whole household, not the page — a chip list that
 * changed as you paged would be unusable.
 */
export async function getItemsPage(
  householdId: string,
  view: {
    query: string;
    filter: ItemFilter;
    category: string;
    sort: ItemSort;
    page: number;
    perPage: PerPage;
  },
) {
  const items = await getItemViews(householdId);

  /**
   * The sort helpers take the client-safe forms (epoch ms, ISO string) because
   * a Date does not survive the server/client boundary. Adding them here beats
   * teaching the pure sorter about Prisma dates, or reshaping ItemView for one
   * caller's convenience.
   */
  const sortable = items.map((item) => ({
    ...item,
    createdAtMs: item.createdAt.getTime(),
    nextExpiryIso: item.nextExpiry ? item.nextExpiry.toISOString() : null,
  }));

  const selected = selectItems(
    sortable,
    { query: view.query, filter: view.filter, category: view.category },
    view.sort,
  );

  const categories = [...new Set(items.map((item) => item.categoryName))].sort(
    (a, b) => a.localeCompare(b, "uk-UA"),
  );

  return { ...paginate(selected, view.page, view.perPage), categories };
}
