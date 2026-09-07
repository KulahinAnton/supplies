import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        /**
         * React gets its own chunk; nothing else is named here.
         *
         * This does **not** make the first visit smaller — the same bytes
         * arrive, in two requests instead of one. What it buys is the SECOND
         * visit: `react` keeps its content hash across a deploy that only
         * touched application code, so a returning reader re-uses 193 KB from
         * cache and downloads only what actually changed.
         *
         * The first visit got smaller from route-level `lazy()` in `App.tsx`
         * — 749 KB down to 603 KB — which is a different fix for a different
         * problem. Both were in the advice Vite's own chunk-size warning
         * prints, and only one of them was about first-paint bytes.
         */
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          // react and react-dom must land together: react-dom reaches into
          // react's internals, and separating them across chunks makes the
          // load order matter in a way nothing here controls.
          // Normalised, because Rollup hands this Windows separators on
          // Windows and POSIX ones everywhere else.
          const path = id.split("\\").join("/");
          const REACT = ["react", "react-dom", "scheduler"];
          if (REACT.some((name) => path.includes(`/node_modules/${name}/`))) {
            return "react";
          }
          /**
           * Everything else is left to Rollup, and that is the whole point.
           *
           * A blanket `return "vendor"` here was measured and reverted: naming
           * a chunk OVERRIDES the automatic async splitting, so `@dnd-kit`,
           * the Base UI dialog and `@zxing/browser` — all of which are only
           * reachable from lazy routes — were pulled back into the first
           * paint. It bought better caching and cost 63 KB on the visit that
           * matters most.
           */
          return undefined;
        },
      },
    },
  },
  server: {
    // 5173 is Vite's own default and the port the API's CORS allowlist ships
    // with. `host` so a phone on the same network can reach it, the same way
    // EXPO_PUBLIC_API_URL exists for the React Native app.
    port: 5173,
    strictPort: true,
    host: true,
  },
});
