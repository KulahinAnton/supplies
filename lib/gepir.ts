/**
 * Feature 20 — GS1 Ukraine (GEPIR) as a **last-resort fallback** for barcodes
 * that Open Food Facts and its sibling databases do not know.
 *
 * What this can and cannot do, because it is easy to expect too much:
 * GEPIR is a registry of **which company licensed a GTIN**, not a product
 * catalogue. It answers "ТОВ «САНДОРА»", never "Сік Сандора 0,95 л". So this
 * never fills the name field — it only tells the user who made the thing they
 * are holding, which turns a dead end into a useful hint while they type.
 *
 * There is no API. The flow is a Symfony form: GET the page to obtain a
 * session cookie and a CSRF token, then POST the barcode back. That makes it
 * scraping, with scraping's lifespan — every failure path here is a shrug,
 * never an error the user sees.
 */

const GEPIR_BASE = process.env.GEPIR_BASE_URL ?? "https://gepir.gs1ua.org";
const SEARCH_PATH = "/search/gtin";

/**
 * GS1 prefix 482 is Ukraine. The restriction is not tidiness — a foreign GTIN
 * makes gepir.gs1ua.org forward to the global GEPIR router, which then never
 * responds. Measured: a Ukrainian code answers in ~0.3s, a Belgian one hung
 * past 40s. Asking only about codes this registry can answer is what keeps
 * the timeout below from being load-bearing.
 */
export function isUkrainianGtin(barcode: string): boolean {
  return /^482\d{10}$/.test(barcode);
}

/** Total budget for the two requests. Generous vs 0.3s, mean vs a hang. */
const TIMEOUT_MS = 6000;

export type GepirCompany = {
  /** Registered legal name, e.g. `ТОВАРИСТВО З ОБМЕЖЕНОЮ ВІДПОВІДАЛЬНІСТЮ "САНДОРА"`. */
  name: string;
};

/** The distinguishable outcomes. `unregistered` is a real answer, not a failure. */
export type GepirResult =
  | { kind: "company"; company: GepirCompany }
  | { kind: "unregistered" }
  | { kind: "invalid" }
  | { kind: "unavailable" };

const ENTITIES: Record<string, string> = {
  "&#039;": "'",
  "&quot;": '"',
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&nbsp;": " ",
};

function decode(text: string): string {
  return text
    .replace(/&#039;|&quot;|&amp;|&lt;|&gt;|&nbsp;/g, (m) => ENTITIES[m] ?? m)
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Pure so it can be tested against real captured HTML rather than a mock —
 * see `lib/__fixtures__/`. When this site changes its markup, that is where
 * the failure shows up, and the fixtures are what make the change visible.
 */
export function parseGepirResponse(html: string): GepirResult {
  if (html.includes("неправильна контрольна цифра")) return { kind: "invalid" };

  const count = html.match(/Кількість результатів:\s*(\d+)/);
  if (count && count[1] === "0") return { kind: "unregistered" };

  // The page repeats «Найменування:» for the GTIN licensee, the prefix
  // licensee and the address block. They are the same company; take the first.
  const name = html.match(/<b>\s*Найменування:\s*<\/b>\s*([^<]+)/);
  const value = name ? decode(name[1]) : "";
  if (!value) {
    // A result count above zero with no name means the markup moved.
    return count ? { kind: "unavailable" } : { kind: "unregistered" };
  }

  return { kind: "company", company: { name: value } };
}

function csrfToken(html: string): string | null {
  const match = html.match(
    /name="search_by_gtin\[_token\]"\s+value="([^"]+)"/,
  );
  return match ? match[1] : null;
}

/** Cookies the session depends on, folded back into a request header. */
function cookieHeader(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
}

/**
 * Never throws and never rejects: every fault becomes `unavailable`, because
 * a barcode scan must not fail just because a third-party registry is down.
 */
export async function fetchGepirCompany(barcode: string): Promise<GepirResult> {
  // "unavailable", not "unregistered": we did not ask, so we know nothing.
  // The distinction matters because callers cache a miss but never an
  // unavailable, and caching "GS1 Ukraine has no record" for a Belgian
  // barcode would be recording an answer nobody gave.
  if (!isUkrainianGtin(barcode)) return { kind: "unavailable" };

  const signal = AbortSignal.timeout(TIMEOUT_MS);
  const headers = {
    // Sent as a browser because the form is meant for one; a bare fetch is
    // served the same HTML, but this keeps the two paths identical.
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36",
    "accept-language": "uk-UA,uk;q=0.9",
  };

  try {
    const page = await fetch(`${GEPIR_BASE}${SEARCH_PATH}`, { headers, signal });
    if (!page.ok) return { kind: "unavailable" };

    const token = csrfToken(await page.text());
    if (!token) return { kind: "unavailable" };

    const body = new URLSearchParams({
      "search_by_gtin[interpretationResult]": barcode,
      "search_by_gtin[searchType]": "1",
      "search_by_gtin[_token]": token,
    });

    const result = await fetch(`${GEPIR_BASE}${SEARCH_PATH}`, {
      method: "POST",
      signal,
      headers: {
        ...headers,
        "content-type": "application/x-www-form-urlencoded",
        cookie: cookieHeader(page),
        referer: `${GEPIR_BASE}${SEARCH_PATH}`,
      },
      body,
    });
    if (!result.ok) return { kind: "unavailable" };

    return parseGepirResponse(await result.text());
  } catch {
    // Timeout, DNS, TLS, aborted socket — all the same to the caller.
    return { kind: "unavailable" };
  }
}

/**
 * «ТОВАРИСТВО З ОБМЕЖЕНОЮ ВІДПОВІДАЛЬНІСТЮ "САНДОРА"» → «ТОВ «САНДОРА»».
 *
 * The registry stores the full legal name in caps, which is correct and
 * unreadable in a one-line hint. Only the legal form is abbreviated and the
 * quotes normalised to Ukrainian ones — the company name itself is never
 * touched, because shortening that would be inventing information.
 *
 * An unrecognised legal form is returned unchanged rather than guessed at.
 */
const LEGAL_FORMS: [RegExp, string][] = [
  [/^ТОВАРИСТВО З ОБМЕЖЕНОЮ ВІДПОВІДАЛЬНІСТЮ\s+/i, "ТОВ "],
  [/^ПРИВАТНЕ АКЦІОНЕРНЕ ТОВАРИСТВО\s+/i, "ПрАТ "],
  [/^ПУБЛІЧНЕ АКЦІОНЕРНЕ ТОВАРИСТВО\s+/i, "ПАТ "],
  [/^ВІДКРИТЕ АКЦІОНЕРНЕ ТОВАРИСТВО\s+/i, "ВАТ "],
  [/^ЗАКРИТЕ АКЦІОНЕРНЕ ТОВАРИСТВО\s+/i, "ЗАТ "],
  [/^АКЦІОНЕРНЕ ТОВАРИСТВО\s+/i, "АТ "],
  [/^ПРИВАТНЕ ПІДПРИЄМСТВО\s+/i, "ПП "],
  [/^ДОЧІРНЄ ПІДПРИЄМСТВО\s+/i, "ДП "],
  [/^ФІЗИЧНА ОСОБА[- ]ПІДПРИЄМЕЦЬ\s+/i, "ФОП "],
];

export function shortenCompanyName(name: string): string {
  let short = name.trim();
  for (const [pattern, replacement] of LEGAL_FORMS) {
    if (pattern.test(short)) {
      short = short.replace(pattern, replacement);
      break;
    }
  }
  // Straight quotes around the trading name read as English; the UI is not.
  return short.replace(/"([^"]+)"/g, "«$1»");
}
