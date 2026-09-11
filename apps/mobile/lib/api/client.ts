import { renderMessage } from "@supplies/core/messages";
import type { TokenPair } from "@supplies/core/contracts/auth";
import { clearRefreshToken, readRefreshToken, writeRefreshToken } from "../auth/token-store";
import { apiUrl } from "./url";

/**
 * The phone's HTTP client. Same shape as the SPA's `api/client.ts`, and
 * deliberately not the same file.
 *
 * They differ where it matters: the SPA's refresh token is an httpOnly cookie
 * the browser attaches by itself, so it sends `credentials: "include"` and
 * never sees the value. Here there are no cookies — the token comes back in
 * the JSON body, goes to SecureStore, and is sent explicitly. Sharing this
 * module would mean one of the two clients pretending to be the other, which
 * is exactly the sharing SPA_API_PORT.md §4.3 rules out.
 *
 * What IS shared is everything above it: the contracts, the message catalogue,
 * and the rules.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** The stable identifier from the API. Switch on this, never on `message`. */
    readonly key?: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "ApiError";
  }
}

/** In memory only — see `token-store.ts` for why the access token is not saved. */
let accessToken: string | null = null;
const listeners = new Set<(token: string | null) => void>();

export function getAccessToken(): string | null {
  return accessToken;
}

function setAccessToken(token: string | null): void {
  accessToken = token;
  for (const listener of listeners) listener(token);
}

export function onAccessTokenChange(listener: (token: string | null) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Store both halves of a fresh pair. The refresh half outlives the process. */
export async function acceptTokens(pair: TokenPair): Promise<void> {
  setAccessToken(pair.accessToken);
  await writeRefreshToken(pair.refreshToken);
}

export async function forgetTokens(): Promise<void> {
  setAccessToken(null);
  await clearRefreshToken();
}

type ErrorBody = { key?: string; message?: string };

/**
 * How long a request may go unanswered before it is given up on.
 *
 * **React Native's `fetch` has no timeout of its own.** React Native builds its
 * OkHttp client with zero connect, read and write timeouts, which OkHttp reads
 * as "never". A request to an address that silently drops packets (a wrong IP,
 * a firewall, `10.0.2.2` on a real phone) is not refused but simply never
 * answered, and it waits until the operating system abandons the connection
 * minutes later — the sign-in button just spun, and nobody waits that long.
 * Twenty seconds clears a Neon compute waking from zero with room to spare;
 * nothing this app does normally takes a tenth of it.
 */
const DEFAULT_TIMEOUT_MS = 20_000;

/**
 * For the two requests whose server side waits on someone else: the barcode
 * lookup walks Open Food Facts, GS1 and METRO in turn, and recipe suggestions
 * wait on Claude, which `packages/core/src/claude.ts` bounds at 12 s with one
 * retry. Both are slow by nature, and cutting them off at twenty seconds would
 * turn an answer that was coming into an error.
 */
export const SLOW_TIMEOUT_MS = 45_000;

/**
 * For requests whose failure changes nothing the person sees — sign-out's two
 * courtesy calls, dropping the push address and revoking the refresh token.
 * Both are best effort by design, because a device with no signal must still
 * be able to sign out of itself; forty seconds of a button that does nothing
 * would honour that on paper only.
 */
export const BEST_EFFORT_TIMEOUT_MS = 5_000;

export type RequestOptions = { timeoutMs?: number };

async function send(
  path: string,
  { timeoutMs = DEFAULT_TIMEOUT_MS, ...init }: RequestInit & RequestOptions,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(`${apiUrl()}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...init.headers,
      },
    });
  } catch (cause) {
    /**
     * On a phone this is the common failure, not the exotic one — no signal, a
     * captive portal, or the laptop running the API asleep. `fetch` reports all
     * of them as the same opaque `TypeError`, so the message names the address
     * it tried rather than repeating "Network request failed".
     *
     * The two messages differ on purpose. Refused means nothing is listening
     * at that address; unanswered usually means the address itself is wrong,
     * or something between here and there is dropping the traffic.
     */
    const message = controller.signal.aborted
      ? `API не відповідає (${apiUrl()})`
      : `Не вдалося зʼєднатися з API (${apiUrl()})`;
    throw new ApiError(0, message, undefined, { cause });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * One refresh in flight at a time.
 *
 * A screen that fires four queries at once produces four 401s the moment the
 * access token expires. Without this they race, and three of the four would
 * present a token the first had already rotated — which the API is right to
 * treat as theft. The server now also allows a ten-second grace window
 * (`REFRESH_GRACE_MS`), but that exists for clients that cannot coordinate at
 * all, like two browser tabs. Inside one process, coordinating is free and
 * this is how.
 */
let refreshing: Promise<boolean> | null = null;

export async function refreshSession(): Promise<boolean> {
  refreshing ??= (async () => {
    try {
      const stored = await readRefreshToken();
      if (!stored) return false;

      const response = await send("/api/auth/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: stored }),
      });
      if (!response.ok) {
        // The token is dead, not merely stale — drop it so the next launch
        // does not spend a request rediscovering that.
        await clearRefreshToken();
        return false;
      }

      await acceptTokens((await response.json()) as TokenPair);
      return true;
    } catch {
      return false;
    } finally {
      // Cleared in a microtask so everyone awaiting this promise sees the same
      // result before another 401 can start a second refresh.
      queueMicrotask(() => {
        refreshing = null;
      });
    }
  })();
  return refreshing;
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit & RequestOptions = {},
): Promise<T> {
  // Which token each attempt carried, so the check below judges the attempt
  // whose answer it is holding — not the one before the retry.
  let sentWith = accessToken;
  let response = await send(path, init);

  if (response.status === 401 && !path.startsWith("/api/auth/")) {
    if (await refreshSession()) {
      sentWith = accessToken;
      response = await send(path, init);
    }
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as ErrorBody;
    // Only when the token we sent is the one still installed: otherwise a slow
    // request that 401s after a concurrent refresh already installed a new one
    // would sign the person out mid-session.
    if (response.status === 401 && accessToken === sentWith) setAccessToken(null);
    throw new ApiError(
      response.status,
      body.message ?? renderMessage({ key: "error.unexpected" }),
      body.key,
    );
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) => apiFetch<T>(path, { ...options }),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    apiFetch<T>(path, {
      ...options,
      method: "POST",
      ...(body === undefined
        ? {}
        : {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }),
    }),
  patch: <T>(path: string, body: unknown) =>
    apiFetch<T>(path, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  del: <T>(path: string) => apiFetch<T>(path, { method: "DELETE" }),
};
