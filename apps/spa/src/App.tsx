import { useQuery } from "@tanstack/react-query";
import { Package } from "lucide-react";
import { Link, Navigate, Route, Routes } from "react-router";
import { api } from "./api/client";
import { keys } from "./api/keys";
import type { AttentionCounts, Household } from "./api/types";
import { useAuth } from "./auth/auth-context";
import { AppNav } from "./components/app-nav";
import { Spinner } from "./components/feedback";
import { ThemeToggle } from "./components/theme";
import { UserMenu } from "./components/user-menu";
import { DashboardRoute } from "./routes/dashboard";
import { GroupDetailRoute } from "./routes/group-detail";
import { GroupsRoute } from "./routes/groups";
import { ItemDetailRoute } from "./routes/item-detail";
import { ItemFormRoute } from "./routes/item-form";
import { ItemsRoute } from "./routes/items";
import { LoginRoute } from "./routes/login";
import { RecipesRoute } from "./routes/recipes";
import { SettingsRoute } from "./routes/settings";
import { ShoppingRoute } from "./routes/shopping";
import { StatusRoute } from "./routes/status";

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

  if (auth.status === "loading") {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10">
        <Spinner label="Перевіряємо сесію…" />
      </div>
    );
  }

  if (auth.status === "anonymous") {
    return (
      <Routes>
        <Route path="/login" element={<LoginRoute />} />
        <Route path="/status" element={<StatusRoute />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
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

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-5 pb-24 sm:pb-8">
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardRoute />} />
          <Route path="/items" element={<ItemsRoute />} />
          <Route path="/items/new" element={<ItemFormRoute />} />
          <Route path="/items/:id" element={<ItemDetailRoute />} />
          <Route path="/items/:id/edit" element={<ItemFormRoute />} />
          <Route path="/groups" element={<GroupsRoute />} />
          <Route path="/groups/:id" element={<GroupDetailRoute />} />
          <Route path="/shopping" element={<ShoppingRoute />} />
          <Route path="/recipes" element={<RecipesRoute />} />
          <Route path="/settings" element={<SettingsRoute />} />
          <Route path="/status" element={<StatusRoute />} />
          <Route path="/login" element={<Navigate to="/dashboard" replace />} />
          <Route
            path="*"
            element={
              <p className="text-sm text-muted-foreground">Сторінку не знайдено.</p>
            }
          />
        </Routes>
      </main>
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
