import { useState } from "react";
import { useNavigate } from "react-router";
import { renderMessage } from "@supplies/core/messages";
import { api, ApiError } from "../api/client";

/**
 * Feature 21 — what happened to the last scan on «Запаси».
 *
 * A hit navigates straight to the item, because the scan already said exactly
 * which one; making the reader pick it out of a filtered list would be asking
 * a question with one answer. A miss stays put and offers to create it,
 * carrying the code so it is never retyped.
 */
export type ScanState =
  | { code: string; state: "searching" | "missing" }
  | { code: string; state: "error"; message: string }
  | null;

export function useBarcodeLookup(): {
  scan: ScanState;
  clear: () => void;
  lookUp: (code: string) => void;
} {
  const navigate = useNavigate();
  const [scan, setScan] = useState<ScanState>(null);

  async function run(code: string) {
    setScan({ code, state: "searching" });
    try {
      const found = await api.get<
        { kind: "found"; itemId: string } | { kind: "missing" }
      >(`/api/barcode/${encodeURIComponent(code)}/item`);

      if (found.kind === "found") {
        void navigate(`/items/${found.itemId}`);
        return;
      }
      setScan({ code, state: "missing" });
    } catch (cause) {
      /**
       * Never report a failure as "you do not have this". A broken lookup once
       * shipped as a confident "not found" in the Next app, which read as data
       * and contradicted the item form. Saying nothing would have been better;
       * saying what actually happened is better still.
       *
       * `ApiError.message` is already the Ukrainian the API rendered from the
       * shared catalogue, so this is the same sentence the web app shows for
       * the same refusal.
       */
      setScan({
        code,
        state: "error",
        message:
          cause instanceof ApiError
            ? cause.message
            : renderMessage({ key: "error.unexpected" }),
      });
    }
  }

  return {
    scan,
    clear: () => setScan(null),
    // No memoisation: `BarcodeScanButton` reads the latest callback through a
    // ref, so a new identity every render does not restart the camera.
    lookUp: (code: string) => void run(code),
  };
}
