import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { Toaster as Sonner } from "sonner";
import { useTheme } from "./theme";

/**
 * The SPA's copy of `apps/web/components/ui/sonner.tsx`.
 *
 * One of the two things `packages/ui` deliberately does not hold: the toaster
 * needs to know the current theme, and the Next app answers that with
 * `next-themes` while this one answers it with `./theme`. Everything below the
 * `theme` prop — the icons, the CSS variables it maps onto the shared tokens —
 * is the same file.
 *
 * It exists at all because the web app reports refusals through toasts on the
 * shopping screen. Rendering those as inline notes instead would be a
 * different interaction for the same events, which is what Phase 2.9 is for.
 */
export function Toaster() {
  const { theme } = useTheme();

  return (
    <Sonner
      theme={theme}
      position="top-center"
      richColors
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{ classNames: { toast: "cn-toast" } }}
    />
  );
}
