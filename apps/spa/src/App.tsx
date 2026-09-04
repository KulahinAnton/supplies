import { NavLink, Route, Routes } from "react-router";
import { StatusRoute } from "./routes/status";

/**
 * Phase 2.1 — the shell.
 *
 * One route so far. The 16 screens arrive in Phase 2.6, and they arrive as
 * ports rather than rewrites: the components in `components/` are DOM React and
 * Tailwind, and what actually changes is `next/link` → `NavLink`, RSC loading →
 * `useQuery`, and server actions → `useMutation` + `invalidateQueries`.
 */
export function App() {
  return (
    <div className="mx-auto min-h-dvh max-w-2xl px-4 py-6">
      <header className="mb-6 flex items-baseline justify-between gap-4">
        <h1 className="text-xl font-semibold tracking-tight">Запаси</h1>
        <nav className="flex gap-4 text-sm">
          <NavLink
            to="/"
            className={({ isActive }) =>
              isActive ? "font-medium text-emerald-700" : "text-neutral-500"
            }
          >
            Стан
          </NavLink>
        </nav>
      </header>

      <main>
        <Routes>
          <Route path="/" element={<StatusRoute />} />
          <Route
            path="*"
            element={<p className="text-sm text-neutral-500">Сторінку не знайдено.</p>}
          />
        </Routes>
      </main>

      <footer className="mt-10 border-t border-neutral-200 pt-4 text-xs text-neutral-500">
        Vite · React Router · TanStack Query — той самий рушій, що й у Next.js
        застосунку та Telegram-боті.
      </footer>
    </div>
  );
}
