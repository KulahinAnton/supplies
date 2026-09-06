import { useCallback, useEffect, useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@supplies/ui/button";

/**
 * Dark mode, without `next-themes`.
 *
 * The tokens are shared with the Next app (`@supplies/ui/theme.css`); only the
 * mechanism that flips them differs, because `next-themes` is a Next package.
 * What has to match is the contract the stylesheet depends on: **`.dark` on
 * the root element**, and three states rather than two — an explicit light, an
 * explicit dark, and "whatever the operating system says", which is the
 * default.
 *
 * `useSyncExternalStore` rather than `useState` + an effect that copies
 * `localStorage` in. That shape renders once with the wrong answer and once
 * with the right one, and needs a guard so the copy does not clobber a change
 * made in the meantime — the same reason `use-collapsed-groups.ts` in the Next
 * app is written this way. Here it also means a change in one tab reaches the
 * others, since `storage` fires across them.
 */
export type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "supplies-theme";

function isTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark" || value === "system";
}

const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // Another tab, or the OS setting itself. Both change what should be on
  // screen here and neither goes through setTheme.
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  window.addEventListener("storage", listener);
  media.addEventListener("change", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
    media.removeEventListener("change", listener);
  };
}

function readStored(): Theme {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return isTheme(raw) ? raw : "system";
  } catch {
    // Safari in private mode throws on access rather than returning null.
    return "system";
  }
}

function systemPrefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/**
 * The two values a component can want, computed together so they cannot
 * disagree: `theme` is the stored choice, `resolvedTheme` is what is actually
 * on screen once "system" has been asked.
 *
 * `getSnapshot` must return a stable value for the same state or React loops,
 * so this returns the string and the caller splits it — a fresh object each
 * call would never compare equal.
 */
function getSnapshot(): string {
  const theme = readStored();
  const resolved = theme === "system" ? (systemPrefersDark() ? "dark" : "light") : theme;
  return `${theme}:${resolved}`;
}

// Vite's dev server renders in the browser only, so there is no hydration to
// match — but useSyncExternalStore still asks, and touching matchMedia in a
// non-browser context would throw.
const getServerSnapshot = (): string => "system:light";

export function useTheme(): {
  theme: Theme;
  resolvedTheme: "light" | "dark";
  setTheme: (next: Theme) => void;
} {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [theme, resolved] = snapshot.split(":") as [Theme, "light" | "dark"];

  const setTheme = useCallback((next: Theme) => {
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage refused; the class below still applies for this session.
    }
    for (const listener of listeners) listener();
  }, []);

  // Applying a class is not state, so this is what an effect is actually for.
  // The inline script in index.html has already done it for the first paint;
  // this keeps it right afterwards.
  useEffect(() => {
    document.documentElement.classList.toggle("dark", resolved === "dark");
  }, [resolved]);

  return { theme, resolvedTheme: resolved, setTheme };
}

/**
 * Ported from `apps/web/components/theme-toggle.tsx`, icons and all.
 *
 * The two icons are both rendered and one is hidden by the `dark:` variant
 * rather than picked in JavaScript. In the Next app that avoids a hydration
 * mismatch; here it is kept because it means the icon is correct on the very
 * first frame, before React has asked anything.
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Перемкнути тему"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      <Sun className="size-4 dark:hidden" />
      <Moon className="hidden size-4 dark:block" />
    </Button>
  );
}
