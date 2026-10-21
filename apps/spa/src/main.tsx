import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { App } from "./App";
import { AuthProvider } from "./auth/auth-context";
import "./index.css";

/**
 * TanStack Query is what replaces `revalidatePath`. There is no server to
 * revalidate from here: a mutation invalidates the keys it affected and the
 * cache refetches. docs/ARCHITECTURE.md §9 — the key map gets written before the
 * screens are ported, not during.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // One retry, not three. A failing API should show as failing quickly;
      // three silent retries just make a broken deployment look slow.
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const root = document.getElementById("root");
if (!root) throw new Error("#root missing from index.html");

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
