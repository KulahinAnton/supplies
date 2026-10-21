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
import {
  api,
  refreshSession,
  setAccessToken,
  type SessionUser,
  type TokenPair,
} from "../api/client";

type AuthState =
  /** Still asking the API whether the refresh cookie is good. */
  | { status: "loading" }
  | { status: "anonymous" }
  | { status: "signed-in"; user: SessionUser };

type AuthValue = AuthState & {
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading" });
  const queryClient = useQueryClient();

  /**
   * On load, try the refresh cookie once — **through `refreshSession`, never
   * by posting to `/auth/refresh` here**.
   *
   * The access token lives in memory, so a reload always starts signed out as
   * far as this process knows. The httpOnly cookie is what carries the session
   * across that reload, and this is the one request that turns it back into an
   * access token.
   *
   * It used to post directly, and that was a real bug rather than a style
   * point. Refresh tokens ROTATE, and `AuthService.refresh` answers a replayed
   * one by revoking every session for that user — correctly, since a replay is
   * what token theft looks like. React's StrictMode double-invokes this effect,
   * so two refreshes went out, the second carrying the token the first had just
   * retired. The symptom was being anonymous immediately after registering; the
   * cause was the app reporting itself for theft.
   *
   * `refreshSession` shares one in-flight rotation between every caller **in
   * this document**, which is what makes a double mount harmless.
   *
   * What it does NOT fix, stated because the scope is easy to overestimate:
   * two TABS have two module instances and therefore two guards, so a pair
   * restoring at the same instant is still a race the client cannot close from
   * here. It is narrow — the first rotation usually lands before the second
   * request is sent, and a probe with two simultaneous loads did not reproduce
   * it — but narrow is not never. The server closes it: a token revoked by
   * rotation still answers within `REFRESH_GRACE_MS` (docs/ARCHITECTURE.md §8), so the
   * second tab is not mistaken for a thief.
   */
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!(await refreshSession())) {
        // No cookie, or an expired one. Ordinary, not an error worth showing.
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

  const signIn = useCallback(
    async (email: string, password: string) => {
      const pair = await api.post<TokenPair>("/api/auth/login", { email, password });
      setAccessToken(pair.accessToken);
      const user = pair.user ?? (await api.get<SessionUser>("/api/auth/me"));
      setState({ status: "signed-in", user });
    },
    [],
  );

  const signOut = useCallback(async () => {
    await api.post("/api/auth/logout").catch(() => undefined);
    setAccessToken(null);
    setState({ status: "anonymous" });
    // Otherwise the next person to sign in on this browser sees the previous
    // household's cached items for a frame.
    queryClient.clear();
  }, [queryClient]);

  const value = useMemo<AuthValue>(
    () => ({ ...state, signIn, signOut }),
    [state, signIn, signOut],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth(): AuthValue {
  const value = use(AuthContext);
  if (!value) throw new Error("useAuth outside AuthProvider");
  return value;
}
