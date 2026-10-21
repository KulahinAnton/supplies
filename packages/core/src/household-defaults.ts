/**
 * What a brand-new household starts with (PROJECT_PROMPT.md Feature 0/3).
 *
 * Here rather than beside `registerAction` because registration now happens in
 * two places — the Next app's server action and the API's `/auth/register`
 * (Feature 34) — and a household created through one must be indistinguishable
 * from one created through the other. Two copies of this list would diverge
 * the first time somebody added a category.
 */
export const DEFAULT_CATEGORIES = [
  { name: "Продукти", icon: "apple", sortOrder: 0 },
  { name: "Напої", icon: "cup-soda", sortOrder: 1 },
  { name: "Побутова хімія", icon: "spray-can", sortOrder: 2 },
  { name: "Гігієна", icon: "bath", sortOrder: 3 },
  { name: "Ліки", icon: "pill", sortOrder: 4 },
  { name: "Для тварин", icon: "paw-print", sortOrder: 5 },
  { name: "Інше", icon: "package", sortOrder: 6 },
] as const;

export const DEFAULT_LOCATIONS = [
  { name: "Комора", sortOrder: 0 },
  { name: "Холодильник", sortOrder: 1 },
  { name: "Морозильник", sortOrder: 2 },
  { name: "Ванна кімната", sortOrder: 3 },
  { name: "Гараж", sortOrder: 4 },
] as const;

/** «Родина Антон» — the name a household gets before anyone renames it. */
export function defaultHouseholdName(ownerName: string): string {
  return `Родина ${ownerName}`;
}
