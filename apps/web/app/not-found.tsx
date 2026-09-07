import Link from "next/link";
import { Package } from "lucide-react";
import { Button } from "@supplies/ui/button";

/**
 * The page `notFound()` renders.
 *
 * Three pages already called it — the item, its edit form and a set — and
 * without this file they got Next's built-in 404: English, unstyled, and
 * without a single link back into the app. An archived item someone reached
 * from an old bookmark is exactly the case that lands here, so the copy says
 * that rather than the generic thing.
 */
export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <span className="flex size-12 items-center justify-center rounded-xl bg-muted">
        <Package className="size-6 text-muted-foreground" />
      </span>
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Нічого немає за цією адресою</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Можливо, товар видалили або посилання застаріло.
        </p>
      </div>
      <Button nativeButton={false} render={<Link href="/dashboard" />}>
        На головну
      </Button>
    </div>
  );
}
