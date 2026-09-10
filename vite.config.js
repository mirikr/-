import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// GitHub Pages serves this repo from a subpath, Vercel and local dev from the root,
// so the base is passed in by whoever builds it (see .github/workflows/deploy.yml).
const base = process.env.BASE_PATH || "/";

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["apple-touch-icon.png", "icon-192.png"],
      manifest: {
        name: "Ежедневник ученика Лицея КЭО",
        short_name: "Ежедневник",
        description: "Учёба, расписание, конспекты и дедлайны в одном месте",
        lang: "ru",
        start_url: base,
        scope: base,
        display: "standalone",
        orientation: "portrait",
        background_color: "#EFEBE1",
        theme_color: "#EFEBE1",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,svg,woff2}"],
        // The planner must open with no network at all; Supabase calls are never cached,
        // they either reach the server or fall back to the local copy in storage.js.
        navigateFallback: base + "index.html",
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\//,
            handler: "CacheFirst",
            options: { cacheName: "fonts", expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
        ],
      },
    }),
  ],
});
