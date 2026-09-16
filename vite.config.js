import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// GitHub Pages serves this repo from a subpath, Vercel and local dev from the root,
// so the base is passed in by whoever builds it (see .github/workflows/deploy.yml).
const base = process.env.BASE_PATH || "/";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

export default defineConfig(({ mode }) => ({
  base,
  build: { sourcemap: true },
  // Версия и дата сборки видны в подвале приложения: иначе «залилось или нет»
  // проверяется только на глаз.
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString()),
    // Раздел «Тест» с кнопками вызова пасхалок нужен, только пока их смотрят:
    // он есть в предпросмотре и исчезает из боевой сборки.
    __EASTER_TEST__: JSON.stringify(mode !== "production"),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["apple-touch-icon.png", "icon-192.png"],
      manifest: {
        name: "Ежедневник лицеиста",
        short_name: "Ежедневник",
        description: "Учёба, расписание, конспекты и дедлайны в одном месте",
        lang: "ru",
        start_url: base,
        scope: base,
        display: "standalone",
        orientation: "portrait",
        // Заставка при запуске под цвет иконки: со светлым фоном она вспыхивала
        // белым перед тёмным приложением.
        background_color: "#171612",
        theme_color: "#171612",
        // ?v меняется вместе с рисунком. Chrome считает иконку прежней, пока
        // совпадает её адрес, и у уже установленного приложения не трогает —
        // смена адреса единственный способ заставить его заметить новую.
        icons: [
          { src: "icon-192.png?v=2", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png?v=2", sizes: "512x512", type: "image/png" },
          { src: "maskable-512.png?v=2", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,svg,woff2}"],
        // Снимки прошлых версий — это пара мегабайт ради одного окна истории:
        // в офлайн-кэш они не нужны, подгрузятся, когда откроют сравнение.
        // Набор заданий тренажёра — отдельный кусок в пару мегабайт. В офлайн-запас
        // его не кладём: приложение должно ставиться быстро и на мобильном интернете.
        // Один раз открыв тренажёр, ученик получает набор в кэш и дальше решает без сети.
        // Наборы заданий и картинки к ним — десятки мегабайт. В офлайн-запас
        // они не кладутся: приложение должно ставиться быстро и на мобильном
        // интернете. Открытый хоть раз набор попадает в кэш и дальше работает
        // без сети.
        globIgnores: ["**/versions/*.png", "**/society-*.js", "**/physics-*.js", "**/informatics-*.js", "**/fipi/*"],
        // The planner must open with no network at all; Supabase calls are never cached,
        // they either reach the server or fall back to the local copy in storage.js.
        navigateFallback: base + "index.html",
        runtimeCaching: [
          {
            // Имя куска меняется вместе с содержимым, поэтому старый набор
            // подсунуть нельзя: адрес у новой сборки другой.
            urlPattern: /\/assets\/(society|physics|informatics)-[^/]+\.js$/,
            handler: "CacheFirst",
            options: {
              cacheName: "trainer-bank",
              expiration: { maxEntries: 8, maxAgeSeconds: 60 * 60 * 24 * 180 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Картинки заданий: имя файла — отпечаток содержимого, поэтому
            // подменить их нельзя, и кэш можно держать долго.
            urlPattern: /\/fipi\/[^/]+\.(jpg|jpeg|png|gif)$/,
            handler: "CacheFirst",
            options: {
              cacheName: "trainer-pics",
              expiration: { maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\//,
            handler: "CacheFirst",
            options: { cacheName: "fonts", expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
        ],
      },
    }),
  ],
}));
