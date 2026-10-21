/**
 * The web preview's refresh token — in memory, on purpose.
 *
 * Metro picks this file over `token-store.ts` when bundling for the browser.
 * `expo start --web` is a development surface, not a product (the API lists
 * its origin for that reason — see `apps/api/src/config/env.ts`), and a
 * browser has no SecureStore: `expo-secure-store`'s web build is an empty
 * object. The native file therefore threw on its first write, which is the
 * moment right after the API had accepted the password — sign-in failed with
 * «Щось пішло не так» while the Network tab showed a 201 and both tokens.
 *
 * Memory is the only honest home for it here. `localStorage` would put a
 * thirty-day credential where every script on the origin can read it, and an
 * httpOnly cookie is how the SPA does it — the real web client — rather than
 * something to rebuild inside a preview. The price is that a reload signs you
 * out, which is the right amount of persistence for a preview.
 */
let refreshToken: string | null = null;

export function readRefreshToken(): Promise<string | null> {
  return Promise.resolve(refreshToken);
}

export function writeRefreshToken(token: string): Promise<void> {
  refreshToken = token;
  return Promise.resolve();
}

export function clearRefreshToken(): Promise<void> {
  refreshToken = null;
  return Promise.resolve();
}
