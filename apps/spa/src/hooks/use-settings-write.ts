import { useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError } from "../api/client";
import { keys } from "../api/keys";

/**
 * Every panel invalidates the same things, so the list is written once.
 *
 * `household` is in it because of Feature 13: each category's day field shows
 * the household window as its placeholder, meaning "inherit this". Saving a
 * new window without refetching left every one of those placeholders quoting
 * the old number — the setting had changed and the page still described the
 * previous one. The Next app never had the bug because `router.refresh()`
 * re-renders the whole server component; here it has to be said.
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
 * Runs a write and answers `true` if it worked — the shape
 * `SettingsListPanel` takes, and the SPA's counterpart to the Next app's
 * `useActionRunner`. Refusals arrive as `ApiError` carrying the Ukrainian the
 * API rendered from the shared catalogue, so both clients toast the same
 * sentence for the same rule.
 */
export function useWrite(invalidates: QueryKey[] = TAXONOMY_KEYS) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (work: () => Promise<unknown>) => work(),
    onSuccess: () => {
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
      toast.error(
        cause instanceof ApiError ? cause.message : "Щось пішло не так. Спробуйте ще раз.",
      );
      return false;
    }
  }

  return { write, pending: mutation.isPending };
}
