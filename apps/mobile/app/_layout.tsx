import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar as ExpoStatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import "../global.css";

/**
 * Phase 3.1 — the shell.
 *
 * `SafeAreaProvider` is here from the first commit even though Android mostly
 * does not need it. SPA_API_PORT.md is explicit that Phase 5 exists and that
 * safe areas are free now and expensive to retrofit; wrapping the app once is
 * the cheapest possible version of not painting into Android.
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
        <ExpoStatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false }} />
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
