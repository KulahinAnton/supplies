import { useEffect } from "react";
import { useRouter } from "expo-router";
import { loadNotifications } from "@/lib/push/module";

/**
 * Feature 35 — where a tapped notification lands.
 *
 * A reminder that opens whatever screen happened to be last is a reminder that
 * makes somebody navigate to the thing it just told them about. The payload
 * carries `data.screen`, so «2 товари псуються» opens «Огляд».
 *
 * `getLastNotificationResponseAsync` covers the case the listener cannot: a
 * tap that **launched** the app, where the response arrived before any React
 * code existed to hear it.
 *
 * Loaded through the guarded wrapper, because this hook is mounted on the
 * authed layout — every screen depends on it, and in Expo Go on Android
 * importing `expo-notifications` directly here took the whole app down.
 */
export function useNotificationRouting(): void {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    let remove: (() => void) | undefined;

    function route(data: { screen?: string } | undefined) {
      if (cancelled) return;
      // Only known destinations. A payload naming an arbitrary path would be a
      // way to steer the app from outside it.
      if (data?.screen === "dashboard") router.push("/");
    }

    void loadNotifications().then((notifications) => {
      if (cancelled || !notifications) return;

      void notifications.getLastNotificationResponseAsync().then((response) => {
        route(response?.notification.request.content.data);
      });

      const subscription = notifications.addNotificationResponseReceivedListener(
        (response) => route(response.notification.request.content.data),
      );
      // The effect may already have been cleaned up by the time the import
      // resolves, in which case there is nothing to keep.
      if (cancelled) subscription.remove();
      else remove = () => subscription.remove();
    });

    return () => {
      cancelled = true;
      remove?.();
    };
  }, [router]);
}
