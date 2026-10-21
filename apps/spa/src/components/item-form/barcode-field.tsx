import { Link } from "react-router";
import { BarcodeScanButton } from "@supplies/ui/barcode-scan-button";
import { Input } from "@supplies/ui/input";
import { Label } from "@supplies/ui/label";
import type { BarcodeLookup } from "./types";

/**
 * Features 10, 20 and 18.2 — the barcode, what the world knows about it, and
 * the offer to tell the world back.
 *
 * The lookup NEVER blocks. Open Food Facts has patchy Ukrainian coverage, so a
 * miss just leaves the field as you found it; the message says which kind of
 * miss it was, because "we have never heard of this" and "GS1 says who made
 * it" are different amounts of help.
 */
export function BarcodeField({
  value,
  lookup,
  looking,
  shareToOff,
  onChange,
  onLookUp,
  onShareChange,
}: {
  value: string;
  lookup: BarcodeLookup | null;
  looking: boolean;
  shareToOff: boolean;
  onChange: (value: string) => void;
  /** Fires on scan and on blur — see the note on the handler below. */
  onLookUp: (code: string) => void;
  onShareChange: (share: boolean) => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor="barcode">Штрихкод</Label>
      <div className="flex gap-2">
        <Input
          id="barcode"
          inputMode="numeric"
          placeholder="Необов'язково"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onBlur={(event) => {
            // Typing or pasting a code should do exactly what scanning does —
            // the camera is a convenience, not the only way in. (React's
            // `onBlur` is delegated from `focusout`, so a synthetic `blur` in a
            // test will not reach this; the feature is fine, the test is not.)
            const code = event.target.value.trim();
            if (code) onLookUp(code);
          }}
        />
        <BarcodeScanButton onScan={onLookUp} />
      </div>

      {lookup ? <LookupMessage lookup={lookup} /> : null}

      {/*
        Feature 18.2 — opt-in, unchecked by default. Publishing a product to
        Open Food Facts sends data to a third party, which must be a decision
        rather than a side effect of saving an item. Only offered when the
        lookup missed AND credentials exist, so it never silently does nothing.
      */}
      {lookup?.kind === "unknown" && lookup.canShare ? (
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 size-4 accent-primary"
            checked={shareToOff}
            onChange={(event) => onShareChange(event.target.checked)}
          />
          <span className="text-muted-foreground">
            Поділитися назвою й штрихкодом з Open Food Facts — щоб наступного разу
            цей товар знайшовся сам, і не лише у вас.
          </span>
        </label>
      ) : null}

      {looking ? <p className="text-sm text-muted-foreground">Шукаємо товар…</p> : null}
    </div>
  );
}

function LookupMessage({ lookup }: { lookup: BarcodeLookup }) {
  if (lookup.kind === "existing") {
    return (
      <p className="text-sm text-warning-foreground dark:text-warning">
        Такий штрихкод уже має{" "}
        <Link
          to={`/items/${lookup.itemId}`}
          className="text-primary underline underline-offset-4"
        >
          {lookup.name}
        </Link>
        . Можливо, варто просто поповнити його запас.
      </p>
    );
  }

  if (lookup.kind === "product") {
    return (
      <p className="text-sm text-muted-foreground">
        Назву підставлено з Open Food Facts — перевірте й виправте за потреби.
      </p>
    );
  }

  /*
    Feature 20 — GS1 Ukraine knows who licensed the number even when no product
    database knows the product. Naming the maker is a real head start on typing
    the name; claiming it IS the name would be a lie, so it is worded as a
    separate fact.
  */
  return (
    <p className="text-sm text-muted-foreground">
      {lookup.manufacturer ? (
        <>
          Цього штрихкоду немає у відкритих базах. За даними GS1 Україна, виробник —{" "}
          <strong className="font-medium">{lookup.manufacturer}</strong>. Введіть назву
          вручну.
        </>
      ) : (
        "Цього штрихкоду немає у відкритих базах. Введіть назву вручну."
      )}
    </p>
  );
}
