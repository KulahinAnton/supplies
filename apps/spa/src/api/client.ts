/**
 * The one place the SPA knows a URL.
 *
 * `VITE_API_URL` with a localhost default, per SPA_API_PORT.md §4.2 — no
 * domain is written into this source tree, so deploying is filling a value in
 * rather than editing code. Vite inlines `import.meta.env` at build time, which
 * is why this is a build-time variable and not a runtime fetch.
 */
export const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3200";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "ApiError";
  }
}

/**
 * `credentials: "include"` from the start, because the refresh token will
 * travel as an httpOnly cookie once Phase 1.2 lands. It is also the half of
 * CORS that fails loudest if the API's allowlist is wrong, so exercising it
 * now — while there is nothing to lose — is deliberate.
 */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      credentials: "include",
      headers: { Accept: "application/json", ...init?.headers },
    });
  } catch (cause) {
    // A network-level failure and a CORS rejection are indistinguishable from
    // here — the browser hands both to `fetch` as the same opaque TypeError.
    // Saying so is more useful than repeating "Failed to fetch"; the original
    // is kept as `cause` so a console still has the browser's own words.
    throw new ApiError(0, `Не вдалося зʼєднатися з API (${API_URL})`, { cause });
  }

  if (!response.ok) {
    throw new ApiError(response.status, `${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

export type Health = { status: "ok"; uptime: number };
export type Ready = { status: "ok" | "degraded"; database: boolean };
export type Meta = { units: string[]; movementReasons: string[] };
