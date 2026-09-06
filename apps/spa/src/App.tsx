import { useQuery } from "@tanstack/react-query";
import { NavLink, Navigate, Route, Routes } from "react-router";
import { api } from "./api/client";
import { keys } from "./api/keys";
import type { AttentionCounts } from "./api/types";
import { useAuth } from "./auth/auth-context";
import { Button, Spinner } from "./components/ui";
import { DashboardRoute } from "./routes/dashboard";
import { ItemDetailRoute } from "./routes/item-detail";
import { ItemsRoute } from "./routes/items";
import { LoginRoute } from "./routes/login";
import { ShoppingRoute } from "./routes/shopping";
import { StatusRoute } from "./routes/status";

/**
 * The authed shell, ported from `app/(app)/layout.tsx`.
 *
 * That layout is a server component that guards the session and loads the nav
 * badge counts in the same render. Here the guard is a branch on auth state and
 * the counts are their own query — which is the shape of the whole Phase 2
 * translation: one server render becomes a guard plus a fetch.
 */
export function App() {
  const auth = useAuth();

  if (auth.status === "loading") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <Spinner label="Перевіряємо сесію…" />
      </div>
    );
  }

  if (auth.status === "anonymous") {
    return (
      <div className="mx-auto min-h-dvh max-w-2xl px-4 py-6">
        <Routes>
          <Route path="/login" element={<LoginRoute />} />
          <Route path="/status" element={<StatusRoute />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-dvh max-w-2xl px-4 py-6">
      <header className="mb-5 flex items-baseline justify-between gap-4">
        <h1 className="text-xl font-semibold tracking-tight">Запаси</h1>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-neutral-500">{auth.user.name}</span>
          <Button variant="ghost" onClick={() => void auth.signOut()}>
            Вийти
          </Button>
        </div>
      </header>

      <Nav />

      <main>
        <Routes>
          <Route path="/" element={<DashboardRoute />} />
          <Route path="/items" element={<ItemsRoute />} />
          <Route path="/items/:id" element={<ItemDetailRoute />} />
          <Route path="/shopping" element={<ShoppingRoute />} />
          <Route path="/status" element={<StatusRoute />} />
          <Route path="/login" element={<Navigate to="/" replace />} />
          <Route
            path="*"
            element={<p className="text-sm text-neutral-500">Сторінку не знайдено.</p>}
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
  const counts = useQuery({
    queryKey: keys.attention,
    queryFn: () => api.get<AttentionCounts>("/api/attention"),
  });

  const tabs = [
    { to: "/", label: "Огляд", badge: undefined },
    { to: "/items", label: "Запаси", badge: undefined },
    { to: "/shopping", label: "Список", badge: counts.data?.restock },
    { to: "/status", label: "Стан", badge: undefined },
  ];

  return (
    <nav className="mb-5 flex gap-4 border-b border-neutral-200 pb-2 text-sm">
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.to === "/"}
          className={({ isActive }) =>
            isActive ? "font-medium text-emerald-700" : "text-neutral-500"
          }
        >
          {tab.label}
          {tab.badge ? (
            <span className="ml-1 rounded-full bg-amber-100 px-1.5 text-xs text-amber-800">
              {tab.badge}
            </span>
          ) : null}
        </NavLink>
      ))}
    </nav>
  );
}
