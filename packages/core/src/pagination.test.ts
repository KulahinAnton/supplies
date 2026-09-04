import { describe, expect, it } from "vitest";
import { paginate } from "./pagination";

const items = Array.from({ length: 74 }, (_, i) => `item-${i + 1}`);

describe("paginate", () => {
  it("returns the requested slice and describes it", () => {
    const page = paginate(items, 2, 25);
    expect(page.rows[0]).toBe("item-26");
    expect(page.rows).toHaveLength(25);
    expect(page).toMatchObject({ page: 2, pageCount: 3, total: 74, from: 26, to: 50 });
  });

  it("gives a short last page its real bounds", () => {
    const page = paginate(items, 3, 25);
    expect(page.rows).toHaveLength(24);
    expect(page).toMatchObject({ from: 51, to: 74 });
  });

  /**
   * The case that matters: narrowing a filter while on page 7 leaves a page
   * that no longer exists. Returning nothing would look exactly like "your
   * filter matched nothing", so clamp to the last real page instead.
   */
  it("clamps a page past the end rather than showing an empty list", () => {
    const page = paginate(items, 99, 25);
    expect(page.page).toBe(3);
    expect(page.rows).toHaveLength(24);
  });

  it("clamps nonsense page numbers to the first page", () => {
    for (const bad of [0, -5, Number.NaN]) {
      expect(paginate(items, bad, 10).page).toBe(1);
    }
  });

  it("shows everything for \"all\", in one page", () => {
    const page = paginate(items, 1, "all");
    expect(page.rows).toHaveLength(74);
    expect(page).toMatchObject({ page: 1, pageCount: 1, from: 1, to: 74 });
  });

  it("describes an empty list as 0–0 of 0, not 1–0", () => {
    const page = paginate([], 1, 25);
    expect(page).toMatchObject({ pageCount: 1, total: 0, from: 0, to: 0 });
    expect(page.rows).toEqual([]);
  });

  it("never returns more than one page's worth", () => {
    for (const per of [10, 25, 50, 100] as const) {
      for (let p = 1; p <= 4; p += 1) {
        expect(paginate(items, p, per).rows.length).toBeLessThanOrEqual(per);
      }
    }
  });

  it("covers every item exactly once across its pages", () => {
    const seen: string[] = [];
    const { pageCount } = paginate(items, 1, 10);
    for (let p = 1; p <= pageCount; p += 1) seen.push(...paginate(items, p, 10).rows);
    expect(seen).toEqual(items);
  });

  it("does not mutate the input", () => {
    const source = [...items];
    paginate(source, 2, 25);
    expect(source).toEqual(items);
  });
});
