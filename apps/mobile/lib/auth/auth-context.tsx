import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { SessionUser, TokenPair } from "@supplies/core/contracts/auth";
import {
  acceptTokens,
  api,
  BEST_EFFORT_TIMEOUT_MS,
  forgetTokens,
  refreshSession,
} from "../api/client";
import { readRefreshToken } from "./token-store";
import { unregisterFromPush } from "../push/register";

type AuthState =
  /** Still asking SecureStore, and then the API, whether there is a session. */
  | { status: "loading" }
  | { status: "anonymous" }
  | { status: "signed-in"; user: SessionUser };

type RegisterInput = {
  name: string;
  email: string;
  password: string;
  inviteToken?: string;
};

type AuthValue = AuthState & {
  signIn: (email: string, password: string) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading" });
  const queryClient = useQueryClient();

  /**
   * On launch, try the stored refresh token once — **through `refreshSession`,
   * never by posting to `/auth/refresh` here.**
   *
   * That is not a style rule. Refresh tokens rotate, and a replayed one is
   * treated as theft; the SPA shipped a bug where this effect posted directly,
   * React double-invoked it, and the second call replayed what the first had
   * just retired. `refreshSession` shares one in-flight rotation between every
   * caller in this process, which is what makes a double mount harmless.
   *
   * The phone reaches the same code by a different road: no cookie, so the
   * token comes out of SecureStore and goes back in the request body.
   */
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!(await refreshSession())) {
        // No stored token, or a dead one. Ordinary on a fresh install.
        if (!cancelled) setState({ status: "anonymous" });
        return;
      }
      try {
        const user = await api.get<SessionUser>("/api/auth/me");
        if (!cancelled) setState({ status: "signed-in", user });
      } catch {
        if (!cancelled) setState({ status: "anonymous" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const pair = await api.post<TokenPair & { user?: SessionUser }>(
      "/api/auth/login",
      { email, password },
    );
    await acceptTokens(pair);
    const user = pair.user ?? (await api.get<SessionUser>("/api/auth/me"));
    setState({ status: "signed-in", user });
  }, []);

  /**
   * Registration signs you in, because it always has: the API answers with the
   * same token pair `/auth/login` does. Without an invite token it creates a
   * NEW household; with one it joins an existing one, and the API consumes the
   * invite in the same transaction so two people racing the same link cannot
   * both use it.
   */
  const register = useCallback(async (input: RegisterInput) => {
    const pair = await api.post<TokenPair & { user?: SessionUser }>(
      "/api/auth/register",
      input,
    );
    await acceptTokens(pair);
    const user = pair.user ?? (await api.get<SessionUser>("/api/auth/me"));
    setState({ status: "signed-in", user });
  }, []);

  const signOut = useCallback(async () => {
    /**
     * The token has to be SENT, not assumed. `/auth/logout` finds it in a
     * cookie or in the body, and a phone has no cookie — posting nothing would
     * return `{ ok: true }` (logout is idempotent by design) while leaving the
     * row live on the server. Signing out would then be a local illusion.
     */
    /**
     * Feature 35 — drop this device first, while the access token is still
     * good. Afterwards the request would be refused, and the next person to
     * sign in on this phone would keep receiving the previous household's
     * reminders.
     */
    await unregisterFromPush();

    const stored = await readRefreshToken();
    await api
      .post("/api/auth/logout", stored ? { refreshToken: stored } : undefined, {
        timeoutMs: BEST_EFFORT_TIMEOUT_MS,
      })
      // Best effort: a device with no signal must still be able to sign out of
      // itself, and the token is dropped below either way.
      .catch(() => undefined);
    await forgetTokens();
    setState({ status: "anonymous" });
    // Otherwise the next person to sign in on this phone sees the previous
    // household's cached items for a frame.
    queryClient.clear();
  }, [queryClient]);

  const value = useMemo<AuthValue>(
    () => ({ ...state, signIn, register, signOut }),
    [state, signIn, register, signOut],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth(): AuthValue {
  const value = use(AuthContext);
  if (!value) throw new Error("useAuth outside AuthProvider");
  return value;
}
