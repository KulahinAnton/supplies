import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../api/client";
import { archiveWriteInvalidates, keys } from "../api/keys";
import type { Write } from "../components/item/dialog-bits";

/** Re-exported so a caller needs one import for the hook and its contract. */
export type { Write } from "../components/item/dialog-bits";

/**
 * One mutation wrapper for the whole page, so every write invalidates the same
 * set. A stock change moves the item's quantity, its place in the list, the
 * dashboard's three buckets and the nav badges — the Next app gets that from
 * `router.refresh()`, and here it has to be named.
 *
 * **It returns the refusal rather than reporting it.** Most writes on this
 * screen happen inside a dialog with a field the message belongs next to — a
 * shortfall names exactly how much is missing (§3.3) — while discard and
 * archive have no such field and toast instead. Only the caller knows which.
 */
export function useItemWrite(id: string): { write: Write; pending: boolean } {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (work: () => Promise<unknown>) => work(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.item(id) });
      // `archiveWriteInvalidates` rather than `stockWriteInvalidates` for
      // every write on this page, archive included: this is the one screen
      // that can archive, and one extra refetch of a short list beats a rule
      // that only applies to one of the six buttons here.
      for (const key of archiveWriteInvalidates) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
    },
  });

  /** `null` when it worked; the Ukrainian refusal when it did not. */
  async function write(work: () => Promise<unknown>): Promise<string | null> {
    try {
      await mutation.mutateAsync(work);
      return null;
    } catch (cause) {
      // `ApiError.message` is what the API rendered from the shared catalogue
      // — the same sentence the web app shows for the same rule.
      return cause instanceof ApiError
        ? cause.message
        : "Щось пішло не так. Спробуйте ще раз.";
    }
  }

  return { write, pending: mutation.isPending };
}

