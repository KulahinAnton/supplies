/**
 * The one place the SPA knows a URL, and the one place it knows about tokens.
 *
 * `VITE_API_URL` with a localhost default, per SPA_API_PORT.md §4.2 — no domain
 * is written into this source tree, so deploying is filling a value in rather
 * than editing code. Vite inlines `import.meta.env` at build time, which is why
 * this is a build-time variable and not a runtime fetch.
 */
export const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3200";

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

/**
 * The access token lives in memory only.
 *
 * `localStorage` would survive a reload, which is convenient and is exactly
 * what makes it worth stealing: any injected script can read it. The refresh
 * token is an httpOnly cookie the API sets, so a reload recovers the session
 * through `/auth/refresh` without the SPA ever being able to read the
 * long-lived credential. Losing the access token on reload is the price, and
 * it costs one request.
 */
let accessToken: string | null = null;
const listeners = new Set<(token: string | null) => void>();

export function setAccessToken(token: string | null): void {
  accessToken = token;
  for (const listener of listeners) listener(token);
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function onAccessTokenChange(listener: (token: string | null) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

type ErrorBody = { key?: string; message?: string };

async function send(path: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(`${API_URL}${path}`, {
      ...init,
      // The refresh cookie. Set from the start — credentialed CORS is the
      // configuration that fails loudest and most confusingly when it is wrong.
      credentials: "include",
      headers: {
        Accept: "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...init.headers,
      },
    });
  } catch (cause) {
    // A network failure and a CORS rejection are indistinguishable from here —
    // the browser hands both to `fetch` as the same opaque TypeError. Saying
    // which two things to check beats repeating "Failed to fetch"; the
    // original is kept as `cause` so the console still has the browser's words.
    throw new ApiError(0, `Не вдалося зʼєднатися з API (${API_URL})`, undefined, {
      cause,
    });
  }
}

/**
 * One refresh in flight at a time.
 *
 * A screen that fires four queries at once produces four 401s the moment the
 * access token expires. Without this they would race, and three of the four
 * refresh tokens would be replays — which the API correctly treats as theft
 * and answers by revoking every session. The bug would present as "the app
 * randomly logs me out", which is a miserable thing to diagnose.
 */
let refreshing: Promise<boolean> | null = null;

async function refreshOnce(): Promise<boolean> {
  refreshing ??= (async () => {
    try {
      const response = await send("/api/auth/refresh", { method: "POST" });
      if (!response.ok) return false;
      const body = (await response.json()) as { accessToken: string };
      setAccessToken(body.accessToken);
      return true;
    } catch {
      return false;
    } finally {
      // Cleared in a microtask so callers awaiting this promise all see the
      // same result before the next 401 can start a second refresh.
      queueMicrotask(() => {
        refreshing = null;
      });
    }
  })();
  return refreshing;
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response = await send(path, init);

  if (response.status === 401 && !path.startsWith("/api/auth/")) {
    if (await refreshOnce()) response = await send(path, init);
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as ErrorBody;
    if (response.status === 401) setAccessToken(null);
    throw new ApiError(
      response.status,
      body.message ?? `${response.status} ${response.statusText}`,
      body.key,
    );
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const api = {
  get: <T>(path: string) => apiFetch<T>(path),
  /**
   * No `Content-Type` when there is no body.
   *
   * Fastify rejects a request that declares JSON and sends nothing with a
   * 400 *before the handler runs* — so `/auth/refresh`, which carries its
   * token in a cookie and needs no body at all, was answered by the body
   * parser instead of by the auth code. The symptom was a reload landing on
   * the login page with a valid session sitting in the cookie jar.
   */
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
};

export type Health = { status: "ok"; uptime: number };
export type Ready = { status: "ok" | "degraded"; database: boolean };
export type Meta = { units: string[]; movementReasons: string[] };
export type SessionUser = {
  id: string;
  email: string;
  name: string;
  householdId: string;
};
export type TokenPair = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user?: SessionUser;
};
