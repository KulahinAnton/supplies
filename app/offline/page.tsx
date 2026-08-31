import { WifiOff } from "lucide-react";

/**
 * Feature 31, stage 0 — what a page never opened online looks like offline.
 *
 * Deliberately static and outside the authed shell: it is precached during
 * service-worker install, before anyone has signed in, and it must render
 * without a session or a database. Anything dynamic here would defeat the
 * one job it has.
 */
export default function OfflinePage() {
  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <div className="max-w-sm text-center">
        <WifiOff className="mx-auto size-10 text-muted-foreground" />
        <h1 className="mt-4 text-xl font-semibold tracking-tight">
          Немає з&apos;єднання
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Цю сторінку ще не завантажено на цьому пристрої. Відкриті раніше
          сторінки доступні й без інтернету.
        </p>
      </div>
    </div>
  );
}
