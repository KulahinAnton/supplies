/**
 * Feature 16 — deciding when two item names look like the same thing.
 *
 * Pure, and the single source for all three parts of the feature (the warning
 * while typing, the search-before-create affordance, and the Settings list),
 * so they cannot disagree about what "similar" means.
 *
 * Nothing here blocks anything. It reports similarity; the family decides.
 */

export type NamedItem = { id: string; name: string };

export type MatchReason = "exact" | "contains" | "tokens";

export type Match = NamedItem & {
  reason: MatchReason;
  /** Higher is a stronger match; used only for ordering. */
  score: number;
};

/**
 * Lowercase (Ukrainian-aware), strip punctuation, collapse whitespace.
 *
 * `toLocaleLowerCase("uk-UA")` rather than `toLowerCase()`: the generic form
 * is right for Cyrillic today, but stating the locale keeps it correct if a
 * name ever mixes scripts.
 */
export function normalizeName(name: string): string {
  return name
    .toLocaleLowerCase("uk-UA")
    .replace(/[.,/#!$%^&*;:{}=\-_`~()«»"'’]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Words of a normalised name, ignoring one-character noise. */
function tokensOf(normalized: string): string[] {
  return normalized.split(" ").filter((token) => token.length > 1);
}

function sameTokenSet(a: string[], b: string[]): boolean {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return false;
  const setB = new Set(b);
  return a.every((token) => setB.has(token));
}

/**
 * How `candidate` relates to `name`, or null if they are unrelated.
 *
 * Deliberately NOT edit distance. It is the obvious next step and it misfires
 * on short Ukrainian words — "Сік" and "Сіль" are two edits apart and are not
 * the same thing. Catching a typo is not worth telling someone their salt is
 * juice.
 */
export function matchReason(name: string, candidate: string): Match["reason"] | null {
  const a = normalizeName(name);
  const b = normalizeName(candidate);

  if (!a || !b) return null;
  if (a === b) return "exact";

  // "Сіль" vs "Сіль кухонна". Guard against a one-letter query matching
  // everything: require the shorter side to be a real word.
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  if (shorter.length >= 3 && longer.includes(shorter)) return "contains";

  // "Сіль кухонна" vs "Кухонна сіль".
  if (sameTokenSet(tokensOf(a), tokensOf(b))) return "tokens";

  return null;
}

const SCORE: Record<MatchReason, number> = {
  exact: 3,
  contains: 2,
  tokens: 1,
};

/**
 * Items that look like `name`, strongest first. `excludeId` keeps an item
 * being edited from matching itself.
 */
export function findSimilar(
  name: string,
  items: readonly NamedItem[],
  excludeId?: string,
): Match[] {
  const trimmed = name.trim();
  if (trimmed.length < 2) return [];

  const matches: Match[] = [];
  for (const item of items) {
    if (item.id === excludeId) continue;
    const reason = matchReason(trimmed, item.name);
    if (!reason) continue;
    matches.push({ ...item, reason, score: SCORE[reason] });
  }

  return matches.sort(
    (a, b) => b.score - a.score || a.name.localeCompare(b.name, "uk-UA"),
  );
}

/**
 * Feature 16.3 — cluster existing items that match each other.
 *
 * Transitive on purpose: if A matches B and B matches C, all three belong in
 * one group, because showing the family three overlapping pairs of the same
 * salt would be worse than showing one group of three.
 *
 * O(n²) over a household's items, which is a few dozen. Fine.
 */
export function findDuplicateGroups(items: readonly NamedItem[]): NamedItem[][] {
  const parent = new Map<string, string>();
  for (const item of items) parent.set(item.id, item.id);

  const find = (id: string): string => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root)!;
    return root;
  };

  const union = (a: string, b: string) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent.set(rootA, rootB);
  };

  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      if (matchReason(items[i].name, items[j].name)) {
        union(items[i].id, items[j].id);
      }
    }
  }

  const groups = new Map<string, NamedItem[]>();
  for (const item of items) {
    const root = find(item.id);
    const group = groups.get(root);
    if (group) group.push(item);
    else groups.set(root, [item]);
  }

  return [...groups.values()]
    .filter((group) => group.length > 1)
    .map((group) => [...group].sort((a, b) => a.name.localeCompare(b.name, "uk-UA")))
    .sort((a, b) => a[0].name.localeCompare(b[0].name, "uk-UA"));
}
