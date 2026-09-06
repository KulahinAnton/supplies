"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { ActionResult } from "@supplies/core/action-result";
import { renderMessage } from "@supplies/core/messages";

/**
 * Runs a server action and answers `true` if it worked.
 *
 * `SettingsListPanel` moved into `packages/ui` so the SPA could use it, and
 * shedding `useRouter` and `toast` was the price — a shared component cannot
 * know whether the host re-renders through Next's router or invalidates a
 * TanStack query, nor how it reports a refusal. It now takes callbacks that
 * return a boolean, and this is how the Next app supplies them: refresh on
 * success, toast the message key on failure.
 */
/**
 * Generic over the action's payload, not `ActionResult<unknown>`: an action
 * that returns nothing is `ActionResult<void>`, whose `data` is optional,
 * and `unknown` makes it required. Pinning the type would reject every
 * action that answers with a bare `actionOk()`.
 */
type ActionRunner = <T>(work: () => Promise<ActionResult<T>>) => Promise<boolean>;

export function useActionRunner(): ActionRunner {
  const router = useRouter();

  return useCallback<ActionRunner>(
    async (work) => {
      const result = await work();
      if (!result.ok) {
        toast.error(renderMessage(result.error));
        return false;
      }
      router.refresh();
      return true;
    },
    [router],
  );
}
