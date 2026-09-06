import {
  ChefHat,
  LayoutDashboard,
  Package,
  Settings,
  ShoppingCart,
} from "lucide-react";
import { NavLink } from "react-router";
import { cn } from "@supplies/ui/utils";

/**
 * Ported from `apps/web/components/app-nav.tsx`, structure and classes intact.
 *
 * The differences are the two that have to differ: `NavLink` instead of
 * `next/link` + `usePathname`, and the counts arrive as props from a query
 * rather than from the layout's own render. Everything visual is the same
 * file — that is the point of Phase 2.9, and the reason `packages/ui` had to
 * exist first.
 *
 * The attention counts ride in the nav so the family can see from any page
 * that something is expiring — that is the whole point of the app.
 */
export function AppNav({
  expiring,
  restock,
  aiEnabled,
}: {
  expiring: number;
  restock: number;
  aiEnabled: boolean;
}) {
  const links = [
    { to: "/dashboard", label: "Огляд", icon: LayoutDashboard, badge: expiring },
    { to: "/items", label: "Запаси", icon: Package, badge: 0 },
    { to: "/shopping", label: "Покупки", icon: ShoppingCart, badge: restock },
    // Feature 32.1 — only for households that turned the helper on, and last
    // before Settings: it is the newest and least-used of the four.
    ...(aiEnabled
      ? [{ to: "/recipes", label: "Рецепти", icon: ChefHat, badge: 0 }]
      : []),
    { to: "/settings", label: "Налаштування", icon: Settings, badge: 0 },
  ];

  return (
    <nav
      className={cn(
        // Mobile: a fixed bottom bar, thumb-reachable while standing in a shop.
        "fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur",
        // Desktop: an ordinary row under the header.
        "sm:static sm:border-t-0 sm:bg-transparent sm:backdrop-blur-none",
      )}
    >
      <div className="mx-auto flex w-full max-w-5xl items-stretch gap-1 px-2 pb-[env(safe-area-inset-bottom)] sm:px-4 sm:pb-0">
        {links.map((link) => {
          const Icon = link.icon;

          return (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                cn(
                  "relative flex flex-1 flex-col items-center gap-0.5 rounded-md px-2 py-2.5 text-xs font-medium transition-colors",
                  "sm:flex-none sm:flex-row sm:gap-2 sm:border-b-2 sm:border-transparent sm:px-3 sm:py-2.5 sm:text-sm",
                  isActive
                    ? "text-primary sm:border-primary"
                    : "text-muted-foreground hover:text-foreground",
                )
              }
            >
              <span className="relative">
                <Icon className="size-5 sm:size-4" />
                {link.badge > 0 ? (
                  <span className="absolute -top-1.5 -right-2 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] leading-4 font-semibold text-destructive-foreground">
                    {link.badge > 99 ? "99+" : link.badge}
                  </span>
                ) : null}
              </span>
              {link.label}
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
