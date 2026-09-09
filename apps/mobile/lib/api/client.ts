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

async function send(path: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(`${apiUrl()}${path}`, {
      ...init,
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
     */
    throw new ApiError(0, `Не вдалося зʼєднатися з API (${apiUrl()})`, undefined, {
      cause,
    });
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

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
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
  get: <T>(path: string) => apiFetch<T>(path),
  post: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, {
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
