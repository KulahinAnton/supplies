import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar as ExpoStatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "@/lib/auth/auth-context";
import { Screen } from "@/components/ui/screen";
import { Spinner } from "@/components/ui/feedback";
import "../global.css";

/**
 * The root: providers, then the auth gate.
 *
 * `SafeAreaProvider` is here from the first commit even though Android mostly
 * does not need it — SPA_API_PORT.md is explicit that Phase 5 exists and that
 * safe areas are free now and expensive to retrofit.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // One retry, matching the SPA. A failing API should show as failing
      // quickly; three silent retries make a broken deployment look slow.
      retry: 1,
    },
  },
});

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ExpoStatusBar style="dark" />
          <Gate />
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

/**
 * `Stack.Protected` rather than an effect that calls `router.replace`.
 *
 * The effect version is the common pattern and it flickers: the guarded screen
 * mounts, renders once with no data, and is then navigated away from. A guard
 * is declarative — the route is not in the tree at all when it does not apply,
 * so nothing to unmount and no frame of the wrong screen.
 *
 * The loading branch matters as much. While `refreshSession()` is asking
 * SecureStore, NEITHER guard should be true — rendering the login screen for
 * the half second before a stored token resolves would show a sign-in form to
 * somebody who is already signed in.
 */
function Gate() {
  const auth = useAuth();

  if (auth.status === "loading") {
    return (
      <Screen>
        <Spinner label="Перевіряємо сесію…" />
      </Screen>
    );
  }

  const signedIn = auth.status === "signed-in";

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="login" />
      </Stack.Protected>
    </Stack>
  );
}
