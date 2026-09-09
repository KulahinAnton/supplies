import { useQuery } from "@tanstack/react-query";
import type { AttentionCounts } from "@supplies/core/contracts/dashboard";
import { api } from "@/lib/api/client";
import { keys } from "@/lib/api/keys";

/**
 * The two numbers on the tab badges — the same endpoint the web nav uses.
 *
 * It exists as its own request rather than being read off `/api/dashboard`
 * because the badges are on every screen and the dashboard payload is not: a
 * tab bar that had to load three lists of items to show a "2" would make every
 * screen wait for a screen nobody is looking at.
 *
 * A failure is silent on purpose. A badge is an ornament; a household that
 * cannot reach the API will find out from the screen it is actually on, and an
 * error banner on the tab bar would say it four times.
 */
export function useAttention() {
  const attention = useQuery({
    queryKey: keys.attention,
    queryFn: () => api.get<AttentionCounts>("/api/attention"),
  });

  return attention.data ?? { expiring: 0, restock: 0 };
}
