import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ItemDetail } from "@supplies/core/contracts/items";
import { api, ApiError } from "@/lib/api/client";
import { keys, stockWriteInvalidates } from "@/lib/api/keys";

/**
 * One item, and the writes it allows.
 *
 * `write` **returns the refusal rather than reporting it**, the same contract
 * the SPA's `useItemWrite` settled on. A shortfall names exactly how much is
 * missing (§3.3) and belongs beside the field that caused it; a discard has no
 * such field. Only the caller knows which, so this hook does not choose.
 */
export function useItemDetail(id: string) {
  const queryClient = useQueryClient();

  const detail = useQuery({
    queryKey: keys.item(id),
    queryFn: () => api.get<ItemDetail>(`/api/items/${id}`),
    enabled: id.length > 0,
  });

  const mutation = useMutation({
    mutationFn: (work: () => Promise<unknown>) => work(),
    onSuccess: () => {
      /**
       * A stock write changes four things, and this is the only place that
       * knows all of them. The Next app gets it from `router.refresh()`; here
       * it has to be named, which is what `stockWriteInvalidates` is for.
       */
      void queryClient.invalidateQueries({ queryKey: keys.item(id) });
      for (const key of stockWriteInvalidates) {
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
      // `ApiError.message` is what the API rendered from the shared catalogue —
      // the same sentence the web clients show for the same rule.
      return cause instanceof ApiError
        ? cause.message
        : "Немає зв'язку. Спробуйте ще раз.";
    }
  }

  return { detail, write, pending: mutation.isPending };
}
