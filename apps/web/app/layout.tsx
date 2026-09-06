import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin", "cyrillic"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin", "cyrillic"],
});

export const metadata: Metadata = {
  title: "Запаси",
  description: "Домашні запаси: що є, що закінчується, що псується.",
  appleWebApp: { capable: true, title: "Запаси", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#101a14" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    /*
      `suppressHydrationWarning` on BOTH elements, for two different reasons.

      On <html> it is ours: next-themes writes `class="dark"` before React
      hydrates, which is the whole point of it — the alternative is a white
      flash on every load for anyone using dark mode.

      On <body> it is not ours. Browser extensions attach their own attributes
      to <body> before React runs — ColorZilla's `cz-shortcut-listen`, Grammarly's
      `data-gr-*`, and others — and every one of them reports as a hydration
      mismatch that no change to this codebase can fix.

      This is narrower than it looks: the flag covers an element's OWN
      attributes and text, one level deep. It does not extend to children, so a
      real mismatch anywhere inside the app is still reported.
    */
    <html lang="uk" suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeProvider>
          {children}
          <Toaster position="top-center" richColors />
        </ThemeProvider>
      </body>
    </html>
  );
}
