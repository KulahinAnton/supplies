import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // 5173 is Vite's own default and the port the API's CORS allowlist ships
    // with. `host` so a phone on the same network can reach it, the same way
    // EXPO_PUBLIC_API_URL exists for the React Native app.
    port: 5173,
    strictPort: true,
    host: true,
  },
});
