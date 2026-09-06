import Link from "next/link";
import { Package } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

export function AuthPageShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="flex items-center justify-between px-4 py-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Package className="size-4" />
          </span>
          Запаси
        </Link>
        <ThemeToggle />
      </header>

      <main className="flex flex-1 items-center justify-center px-4 pb-16">
        <div className="w-full max-w-sm">
          <div className="mb-6 space-y-1.5">
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            {subtitle ? (
              <p className="text-sm text-muted-foreground">{subtitle}</p>
            ) : null}
          </div>
          {children}
          {footer ? (
            <div className="mt-6 text-center text-sm text-muted-foreground">
              {footer}
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}
