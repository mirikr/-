import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { reloadOnce } from "./chunk-reload.js";

// Vite сам сообщает, что не смог подгрузить кусок (обычно — кусок старой
// версии после обновления): перезагружаемся на новой вместо ошибки.
window.addEventListener("vite:preloadError", (event) => {
  if (reloadOnce()) event.preventDefault();
});

// Обновление приложения. Оно работает офлайн, поэтому открывается из своей
// копии, а новая версия скачивается в фоне. Когда новая версия встала на
// место, сообщаем приложению («planner-update-ready»), а оно само решает —
// тихо перезапуститься (только открыли или были в фоне) или предложить
// «Обновить» (если человек что-то вводит). Новую версию проверяем и когда
// приложение снова открывают из фона: на телефоне его не закрывают неделями.
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  let controlled = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    // Самая первая установка — не обновление: страница и так свежая.
    if (!controlled) {
      controlled = true;
      return;
    }
    window.__plannerUpdateReady = true;
    window.dispatchEvent(new Event("planner-update-ready"));
  });
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(import.meta.env.BASE_URL + "sw.js", { scope: import.meta.env.BASE_URL })
      .then((reg) => {
        const check = () => reg.update().catch(() => {});
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") check();
        });
        setInterval(check, 60 * 60 * 1000);
      })
      .catch(() => {});
  });
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
