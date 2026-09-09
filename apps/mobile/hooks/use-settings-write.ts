import { useState } from "react";
import { useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { ApiError } from "@/lib/api/client";
import { keys } from "@/lib/api/keys";

/**
 * Every settings screen invalidates the same things, so the list is written
 * once.
 *
 * `household` is in it because of Feature 13: each category's day field shows
 * the household window as its placeholder, meaning "inherit this". Saving a
 * new window without refetching leaves every one of those placeholders quoting
 * the old number — the setting has changed and the screen still describes the
 * previous one.
 */
export const TAXONOMY_KEYS: QueryKey[] = [
  keys.taxonomy,
  keys.household,
  keys.groups,
  keys.items(),
  keys.dashboard,
  keys.attention,
];

/**
 * Runs a write and answers `true` if it worked.
 *
 * The SPA's counterpart toasts the refusal; there is no toast library here, so
 * the refusal comes back in `refusal` for the screen to render. Deletes are
 * *expected* to be refused sometimes — a category with items in it cannot go,
 * because the items would silently lose it — so where that sentence lands is a
 * design decision rather than error handling.
 */
export function useWrite(invalidates: QueryKey[] = TAXONOMY_KEYS) {
  const queryClient = useQueryClient();
  const [refusal, setRefusal] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (work: () => Promise<unknown>) => work(),
    onSuccess: () => {
      setRefusal(null);
      for (const key of invalidates) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
    },
  });

  async function write(work: () => Promise<unknown>): Promise<boolean> {
    try {
      await mutation.mutateAsync(work);
      return true;
    } catch (cause) {
      // `ApiError.message` is the Ukrainian the API rendered from the shared
      // catalogue — the same sentence the web clients show for the same rule.
      setRefusal(
        cause instanceof ApiError
          ? cause.message
          : "Щось пішло не так. Спробуйте ще раз.",
      );
      return false;
    }
  }

  return { write, refusal, clearRefusal: () => setRefusal(null), pending: mutation.isPending };
}
