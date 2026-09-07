import { Plus } from "lucide-react";
import { Link } from "react-router";
import { Button } from "@supplies/ui/button";
import type { ScanState } from "../../hooks/use-barcode-lookup";

/**
 * Feature 21 — the scan result, directly under the search field where the
 * reader is already looking.
 *
 * A hit never reaches here; `useBarcodeLookup` has already navigated. What is
 * left is the two outcomes worth a sentence: a code the household does not
 * have, and a lookup that failed. Those are deliberately different messages —
 * reporting a failure as "you do not have this" once shipped in the Next app
 * and read as data.
 */
export function ScanResult({ scan }: { scan: ScanState }) {
  if (!scan) return null;

  if (scan.state === "searching") {
    return <p className="text-sm text-muted-foreground">Шукаємо за штрихкодом…</p>;
  }

  if (scan.state === "error") {
    return (
      <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
        {scan.message}
      </p>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed px-3 py-2">
      <p className="min-w-0 text-xs text-muted-foreground">
        Штрихкоду <span className="font-medium text-foreground">{scan.code}</span> ще
        немає серед ваших запасів.
      </p>
      <Button
        size="sm"
        variant="outline"
        nativeButton={false}
        render={<Link to={`/items/new?barcode=${encodeURIComponent(scan.code)}`} />}
      >
        <Plus className="size-3.5" />
        Створити
      </Button>
    </div>
  );
}
