import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  isUkrainianGtin,
  parseGepirResponse,
  shortenCompanyName,
} from "@/lib/gepir";

/**
 * Feature 20. The fixtures are real responses captured from gepir.gs1ua.org,
 * not hand-written markup — the whole risk of this feature is that the page
 * changes shape, and invented HTML would hide exactly that.
 */
const fixture = (name: string) =>
  readFileSync(join(__dirname, "__fixtures__", `${name}.html`), "utf8");

describe("parseGepirResponse", () => {
  it("reads the licensee company off a real hit", () => {
    const result = parseGepirResponse(fixture("gepir-hit"));
    expect(result.kind).toBe("company");
    if (result.kind !== "company") return;
    expect(result.company.name).toBe(
      'ТОВАРИСТВО З ОБМЕЖЕНОЮ ВІДПОВІДАЛЬНІСТЮ "САНДОРА"',
    );
  });

  it("decodes the entities the page escapes", () => {
    // The page emits &#039; and &quot; in this block; a raw scrape leaks them
    // into the UI as literal "&#039;".
    const result = parseGepirResponse(
      '<b>Найменування:</b> ПП &quot;Іван&#039;s&quot;<br>Кількість результатів: 1.',
    );
    expect(result).toEqual({ kind: "company", company: { name: `ПП "Іван's"` } });
  });

  it("treats a real not-found as an answer, not a failure", () => {
    expect(parseGepirResponse(fixture("gepir-not-found"))).toEqual({
      kind: "unregistered",
    });
  });

  it("distinguishes a bad check digit from a missing product", () => {
    expect(
      parseGepirResponse(
        "<p>Введені дані некоректні (неправильна контрольна цифра)</p>",
      ),
    ).toEqual({ kind: "invalid" });
  });

  it("reports unavailable when the markup moves rather than inventing a name", () => {
    // A result count with no name field means they restructured the page.
    // Guessing here would put garbage in front of the user.
    expect(
      parseGepirResponse("<div>Кількість результатів: 1.</div>"),
    ).toEqual({ kind: "unavailable" });
  });

  it("never returns an empty company name", () => {
    for (const html of [
      "",
      "<b>Найменування:</b>   <br>",
      "<b>Найменування:</b><br>Кількість результатів: 1.",
    ]) {
      const result = parseGepirResponse(html);
      if (result.kind === "company") {
        expect(result.company.name.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("isUkrainianGtin", () => {
  /**
   * This gate is a timeout guard, not a filter. gepir.gs1ua.org forwards a
   * foreign GTIN to the global GEPIR router, which never answers — measured
   * at over 40 seconds against 0.3 for a Ukrainian code.
   */
  it("accepts a 13-digit 482 code", () => {
    expect(isUkrainianGtin("4823063114912")).toBe(true);
  });

  it("rejects foreign prefixes, which is what stops the hang", () => {
    expect(isUkrainianGtin("5449000000996")).toBe(false); // Belgium
    expect(isUkrainianGtin("4006381333931")).toBe(false); // Germany
  });

  it("rejects anything that is not exactly GTIN-13", () => {
    expect(isUkrainianGtin("482306311491")).toBe(false); // 12
    expect(isUkrainianGtin("48230631149123")).toBe(false); // 14
    expect(isUkrainianGtin("482306311491a")).toBe(false);
    expect(isUkrainianGtin("")).toBe(false);
  });
});

describe("shortenCompanyName", () => {
  it("abbreviates the legal form and normalises the quotes", () => {
    expect(
      shortenCompanyName('ТОВАРИСТВО З ОБМЕЖЕНОЮ ВІДПОВІДАЛЬНІСТЮ "САНДОРА"'),
    ).toBe("ТОВ «САНДОРА»");
  });

  it("covers the other forms the registry uses", () => {
    expect(shortenCompanyName('ПРИВАТНЕ АКЦІОНЕРНЕ ТОВАРИСТВО "ОБОЛОНЬ"')).toBe(
      "ПрАТ «ОБОЛОНЬ»",
    );
    expect(shortenCompanyName('ПРИВАТНЕ ПІДПРИЄМСТВО "ВЕСНА"')).toBe("ПП «ВЕСНА»");
    expect(shortenCompanyName("ФІЗИЧНА ОСОБА-ПІДПРИЄМЕЦЬ ШЕВЧЕНКО Т. Г.")).toBe(
      "ФОП ШЕВЧЕНКО Т. Г.",
    );
  });

  it("leaves an unrecognised form alone rather than guessing", () => {
    // Inventing an abbreviation would be inventing information about a
    // real company.
    expect(shortenCompanyName("КОНЦЕРН ХЛІБПРОМ")).toBe("КОНЦЕРН ХЛІБПРОМ");
  });

  it("never abbreviates the trading name itself", () => {
    const long = 'ТОВАРИСТВО З ОБМЕЖЕНОЮ ВІДПОВІДАЛЬНІСТЮ "МОЛОЧНИЙ ДІМ ПОДІЛЛЯ"';
    expect(shortenCompanyName(long)).toBe("ТОВ «МОЛОЧНИЙ ДІМ ПОДІЛЛЯ»");
  });
});
