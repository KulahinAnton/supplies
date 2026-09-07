import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { BarcodeLookup } from "../components/item-form/types";

/**
 * Features 10, 20 and 21 — asking the world what a barcode is, on the item
 * form.
 *
 * A scan writes the code, then asks the server what it is. The name is only
 * pre-filled when the field is still EMPTY — silently overwriting something
 * the person typed would be worse than not helping at all, which is why the
 * caller is handed a suggestion rather than having its state written for it.
 *
 * `lookedUp` is what stops a blur without an edit refetching, and what stops
 * `autoLookup` re-asking on every render.
 */
export function useBarcodeFormLookup({
  autoLookup,
  onCode,
  onSuggestName,
}: {
  /** Feature 21 — a code carried in from a scan on /items that matched nothing. */
  autoLookup?: string;
  onCode: (code: string) => void;
  onSuggestName: (name: string) => void;
}) {
  const [lookup, setLookup] = useState<BarcodeLookup | null>(null);
  const [looking, setLooking] = useState(false);
  const [lookedUp, setLookedUp] = useState<string | null>(null);

  async function run(code: string) {
    if (code === lookedUp) return;
    onCode(code);
    setLookedUp(code);
    setLookup(null);
    setLooking(true);

    try {
      const result = await api.get<BarcodeLookup>(
        `/api/barcode/${encodeURIComponent(code)}`,
      );
      setLookup(result);
      if (result.kind === "product") onSuggestName(result.suggestedName);
    } catch {
      // A miss is not an error — Open Food Facts has patchy Ukrainian
      // coverage, and an empty form is a perfectly good outcome.
      setLookup(null);
    } finally {
      setLooking(false);
    }
  }

  const lookUp = (code: string) => void run(code);

  /**
   * Arriving here from a scan should behave like scanning here. The field is
   * already filled, so the blur handler that normally starts the lookup never
   * fires; without this someone would have to click into the barcode box and
   * back out to get the name suggestion they just earned.
   *
   * Mount only, and once: `lookedUp` stops any re-render re-asking.
   */
  useEffect(() => {
    if (!autoLookup) return;
    const handle = setTimeout(() => lookUp(autoLookup), 0);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { lookup, looking, lookUp };
}
