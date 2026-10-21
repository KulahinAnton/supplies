/**
 * Tailwind v3, not v4 — NativeWind 4 compiles class strings through the v3
 * engine, and the web clients' v4 setup has no equivalent here.
 *
 * The COLOURS are the same ones, transcribed from `packages/ui/src/theme.css`
 * as hex rather than oklch: React Native's colour parser does not know oklch,
 * and a token the runtime cannot read is a token that silently renders black.
 * They are duplicated on purpose — `@supplies/ui` is web-only by design
 * (docs/ARCHITECTURE.md §4), and the alternative was a colour package existing
 * solely to be read by two different CSS dialects.
 */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  /**
   * `class`, not NativeWind's default `media`.
   *
   * With `media`, dark mode is a system query the app may only read — and
   * anything that tries to SET it throws "Cannot manually set color scheme".
   * Expo's `userInterfaceStyle: "automatic"` does exactly that on web, which
   * is how this surfaced.
   *
   * `class` is where this app is going regardless: the two web clients offer
   * light / dark / system as a choice, and parity means the phone will too.
   * A theme the person cannot choose is not the same feature.
   */
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        background: "#fbfbf9",
        foreground: "#1a1c1a",
        card: "#ffffff",
        muted: "#f1f2ef",
        "muted-foreground": "#6b7069",
        primary: "#297f48",
        "primary-foreground": "#ffffff",
        border: "#e3e5e0",
        destructive: "#b3261e",
        warning: "#a2640a",
        success: "#297f48",
      },
    },
  },
  plugins: [],
};
