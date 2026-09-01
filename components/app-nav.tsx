"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChefHat,
  LayoutDashboard,
  Package,
  Settings,
  ShoppingCart,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The attention counts ride in the nav so the family can see from any page
 * that something is expiring — that is the whole point of the app.
 */
export function AppNav({
  expiring,
  restock,
}: {
  expiring: number;
  restock: number;
}) {
  const pathname = usePathname();

  const links = [
    { href: "/dashboard", label: "Огляд", icon: LayoutDashboard, badge: expiring },
    { href: "/items", label: "Запаси", icon: Package, badge: 0 },
    // Feature 32 — beside the stock it cooks from, not beside the shopping
    // list: it answers "what do we have", never "what should we buy".
    { href: "/recipes", label: "Рецепти", icon: ChefHat, badge: 0 },
    { href: "/shopping", label: "Покупки", icon: ShoppingCart, badge: restock },
    { href: "/settings", label: "Налаштування", icon: Settings, badge: 0 },
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
          const active =
            pathname === link.href || pathname.startsWith(`${link.href}/`);
          const Icon = link.icon;

          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex flex-1 flex-col items-center gap-0.5 rounded-md px-2 py-2.5 text-xs font-medium transition-colors",
                "sm:flex-none sm:flex-row sm:gap-2 sm:border-b-2 sm:border-transparent sm:px-3 sm:py-2.5 sm:text-sm",
                active
                  ? "text-primary sm:border-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
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
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
