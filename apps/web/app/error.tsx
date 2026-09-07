"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@supplies/ui/button";

/**
 * The App Router's error boundary for everything under the root layout.
 *
 * A client component by requirement — it has to re-render in the browser to
 * offer `reset()`. That is also why the error's own message is not shown:
 * Next strips it in production and replaces it with a digest, so printing it
 * would show developers a stack and everyone else an empty string.
 *
 * `reset()` re-renders the segment that threw. Worth offering first, because
 * a failed database round trip usually succeeds on the second try, and a full
 * reload costs the whole page.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The digest is the only handle on this error in production logs.
    console.error("Unhandled error", error.digest ?? error.message);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Щось пішло не так</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Ваші запаси в безпеці — сторінка просто не завантажилась.
        </p>
      </div>
      <div className="flex gap-2">
        <Button onClick={reset}>Спробувати ще раз</Button>
        <Button variant="outline" nativeButton={false} render={<Link href="/dashboard" />}>
          На головну
        </Button>
      </div>
      {error.digest ? (
        <p className="text-xs text-muted-foreground">Код помилки: {error.digest}</p>
      ) : null}
    </div>
  );
}
