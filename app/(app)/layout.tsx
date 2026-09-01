import Link from "next/link";
import { Package } from "lucide-react";
import { requireSession } from "@/lib/auth-guard";
import { getAttentionCounts, getHousehold } from "@/lib/queries";
import { AppNav } from "@/components/app-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserMenu } from "@/components/user-menu";

/**
 * Route protection is layout-based (PROJECT_PROMPT.md Feature 1) — there is no
 * middleware. This guards PAGES only; every server action calls
 * `requireSession()` itself.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSession();
  // Feature 32.1 — the nav needs to know whether this household turned the
  // recipe helper on; the tab is absent otherwise.
  const [counts, household] = await Promise.all([
    getAttentionCounts(session.householdId),
    getHousehold(session.householdId),
  ]);

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl items-center gap-3 px-4 py-3">
          <Link href="/dashboard" className="flex items-center gap-2 font-semibold">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Package className="size-4" />
            </span>
            <span className="hidden sm:inline">Запаси</span>
          </Link>

          <div className="ml-auto flex items-center gap-1.5">
            <ThemeToggle />
            <UserMenu name={session.name} email={session.email} />
          </div>
        </div>

        <AppNav
          expiring={counts.expiring}
          restock={counts.restock}
          aiEnabled={household.aiEnabled}
        />
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-5 pb-24 sm:pb-8">
        {children}
      </main>
    </div>
  );
}
