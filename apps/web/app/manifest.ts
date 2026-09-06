import type { MetadataRoute } from "next";

/** Feature 7 — installable PWA, Ukrainian-only (Feature 8). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Запаси",
    short_name: "Запаси",
    description: "Домашні запаси: що є, що закінчується, що псується.",
    lang: "uk",
    dir: "ltr",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#2f7d5b",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      {
        src: "/icon-maskable.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
