import { lazy, Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { Package } from "lucide-react";
import { Link, Navigate, Route, Routes, useLocation } from "react-router";
import { api } from "./api/client";
import { keys } from "./api/keys";
import type { AttentionCounts, Household } from "./api/types";
import { useAuth } from "./auth/auth-context";
import { AppNav } from "./components/app-nav";
import { ErrorBoundary } from "./components/error-boundary";
import { Spinner } from "./components/feedback";
import { ThemeToggle } from "./components/theme";
import { Toaster } from "./components/toaster";
import { UserMenu } from "./components/user-menu";
import { DashboardRoute } from "./routes/dashboard";
import { LoginRoute } from "./routes/login";

/**
 * Everything except the two screens that are someone's FIRST paint.
 *
 * `/login` is where an anonymous visitor lands and `/dashboard` is where a
 * signed-in one does; making either lazy would put a spinner and a round trip
 * in front of the app opening, which is the one place that cost is most
 * visible. The other ten screens are reached by tapping something, and a
 * chunk fetched during that tap is free.
 *
 * The measured reason this exists: the SPA shipped as a single 749 KB chunk,
 * because `@dnd-kit` (shopping, settings) and the whole item form were in the
 * first paint of a dashboard that uses none of them. Vite's own build output
 * had been saying so.
 */
const GroupDetailRoute = lazy(async () => ({
  default: (await import("./routes/group-detail")).GroupDetailRoute,
}));
const GroupsRoute = lazy(async () => ({
  default: (await import("./routes/groups")).GroupsRoute,
}));
const ItemDetailRoute = lazy(async () => ({
  default: (await import("./routes/item-detail")).ItemDetailRoute,
}));
const ItemFormRoute = lazy(async () => ({
  default: (await import("./routes/item-form")).ItemFormRoute,
}));
const ItemsArchiveRoute = lazy(async () => ({
  default: (await import("./routes/items-archive")).ItemsArchiveRoute,
}));
const ItemsRoute = lazy(async () => ({
  default: (await import("./routes/items")).ItemsRoute,
}));
const RecipesRoute = lazy(async () => ({
  default: (await import("./routes/recipes")).RecipesRoute,
}));
const SettingsRoute = lazy(async () => ({
  default: (await import("./routes/settings")).SettingsRoute,
}));
const ShoppingRoute = lazy(async () => ({
  default: (await import("./routes/shopping")).ShoppingRoute,
}));
const StatusRoute = lazy(async () => ({
  default: (await import("./routes/status")).StatusRoute,
}));
const RegisterRoute = lazy(async () => ({
  default: (await import("./routes/register")).RegisterRoute,
}));
const JoinRoute = lazy(async () => ({
  default: (await import("./routes/join")).JoinRoute,
}));
const ForgotPasswordRoute = lazy(async () => ({
  default: (await import("./routes/forgot-password")).ForgotPasswordRoute,
}));
const ResetPasswordRoute = lazy(async () => ({
  default: (await import("./routes/reset-password")).ResetPasswordRoute,
}));

/**
 * The authed shell, ported from `apps/web/app/(app)/layout.tsx`.
 *
 * That layout is a server component that guards the session and loads the nav
 * badge counts in the same render. Here the guard is a branch on auth state
 * and the counts are their own query — which is the shape of the whole Phase 2
 * translation: one server render becomes a guard plus a fetch.
 *
 * The markup is otherwise the same file, down to the `max-w-5xl` and the
 * `pb-24` that keeps the last row clear of the mobile bottom bar. Phase 2.9:
 * where the two differ, this one moves.
 */
export function App() {
  const auth = useAuth();
  // Remounts the error boundary on navigation, so a screen that threw does not
  // keep showing its fallback after the reader has moved on.
  const { pathname } = useLocation();

  if (auth.status === "loading") {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10">
        <Spinner label="Перевіряємо сесію…" />
      </div>
    );
  }

  if (auth.status === "anonymous") {
    return (
      <ErrorBoundary resetKey={pathname}>
        <Suspense fallback={<Spinner />}>
          <Routes>
            <Route path="/login" element={<LoginRoute />} />
            <Route path="/register" element={<RegisterRoute />} />
            <Route path="/join/:token" element={<JoinRoute />} />
            <Route path="/forgot-password" element={<ForgotPasswordRoute />} />
            <Route path="/reset-password" element={<ResetPasswordRoute />} />
            <Route path="/status" element={<StatusRoute />} />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </Suspense>
      </ErrorBoundary>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl items-center gap-3 px-4 py-3">
          <Link to="/dashboard" className="flex items-center gap-2 font-semibold">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Package className="size-4" />
            </span>
            <span className="hidden sm:inline">Запаси</span>
          </Link>

          <div className="ml-auto flex items-center gap-1.5">
            <ThemeToggle />
            <UserMenu
              name={auth.user.name}
              email={auth.user.email}
              onSignOut={() => void auth.signOut()}
            />
          </div>
        </div>

        <Nav />
      </header>

      {/*
        The boundary is INSIDE the shell, not around it: a screen that throws
        should leave the header and the nav standing, because those are how the
        reader gets to a screen that works. Wrapping the whole app would turn
        one broken page into a dead end.
      */}
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-5 pb-24 sm:pb-8">
        <ErrorBoundary resetKey={pathname}>
          <Suspense fallback={<Spinner />}>
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<DashboardRoute />} />
              <Route path="/items" element={<ItemsRoute />} />
              <Route path="/items/archive" element={<ItemsArchiveRoute />} />
              <Route path="/items/new" element={<ItemFormRoute />} />
              <Route path="/items/:id" element={<ItemDetailRoute />} />
              <Route path="/items/:id/edit" element={<ItemFormRoute />} />
              <Route path="/groups" element={<GroupsRoute />} />
              <Route path="/groups/:id" element={<GroupDetailRoute />} />
              <Route path="/shopping" element={<ShoppingRoute />} />
              <Route path="/recipes" element={<RecipesRoute />} />
              <Route path="/settings" element={<SettingsRoute />} />
              <Route path="/status" element={<StatusRoute />} />
              {/* A signed-in visitor who opens a public link is bounced to
                  the app, the same way the Next pages redirect on
                  `validSessionOrNull()`. */}
              <Route path="/login" element={<Navigate to="/dashboard" replace />} />
              <Route path="/register" element={<Navigate to="/dashboard" replace />} />
              <Route path="/join/:token" element={<Navigate to="/dashboard" replace />} />
              <Route
                path="/forgot-password"
                element={<Navigate to="/dashboard" replace />}
              />
              <Route
                path="/reset-password"
                element={<Navigate to="/dashboard" replace />}
              />
              <Route
                path="*"
                element={
                  <p className="text-sm text-muted-foreground">
                    Сторінку не знайдено.
                  </p>
                }
              />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </main>

      {/* Refusals on the shopping screen arrive as toasts, the same way the
          Next app reports them. */}
      <Toaster />
    </div>
  );
}

function Nav() {
  /**
   * The badge counts. In the Next app these come from `getAttentionCounts` in
   * the layout's own render; here they are a query that every stock mutation
   * invalidates — which is exactly the thing `keys.attention` exists to make
   * impossible to forget.
   */
  const household = useQuery({
    queryKey: keys.household,
    queryFn: () => api.get<Household>("/api/household"),
  });

  const counts = useQuery({
    queryKey: keys.attention,
    queryFn: () => api.get<AttentionCounts>("/api/attention"),
  });

  return (
    <AppNav
      expiring={counts.data?.expiring ?? 0}
      restock={counts.data?.restock ?? 0}
      // Feature 32.1 — the tab appears only once the household turns the
      // helper on. The page and the endpoint both check as well: a hidden link
      // is presentation, not an access control.
      aiEnabled={household.data?.aiEnabled ?? false}
    />
  );
}
