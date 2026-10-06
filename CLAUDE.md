# Ежедневник лицеиста — заметки для работы

## Проверки перед выкладкой

Глубина проверки — по тому, что меняется. Сомневаешься — бери уровень выше.

| Что меняется | Что запускать |
|---|---|
| Вид, тексты, расположение | `npm run check:quick` (~3 мин: юнит-тесты, сборка сайта, приложение открывается, нет белого экрана, «Результаты» не в сборке сайта) + скриншоты изменённого места |
| Один раздел (тренажёр, физкультура, «Результаты», «Сегодня»…) | `check:quick` + проверка раздела: `check:trainer` / `check:vosh`, `check:pe` (на `dist-nocloud`), `check:results` (на сборке предпросмотра), `check:design` / `check:pulse` |
| Данные: хранение, синхронизация (`sync-state.js`, `storage.js`), формат записей, удаление и перенос, обновление приложения (service worker) | Полный прогон: `npm test` и все `check:*`, включая `check:upgrade` (записи старой версии доживают до новой) и `check:switch` |
| Крупная версия (1.10, 2.0) | Полный прогон |

Сборки для проверок:

- сайт: `BASE_PATH=/-/ npx vite build` (без `BASE_PATH` проверки не найдут файлы);
- без облака (для `check:pe`): `BASE_PATH=/-/ VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= npx vite build --outDir dist-nocloud`;
- предпросмотр (для `check:results`): `VITE_SANDBOX=1 VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= BASE_PATH=./ npx vite build --outDir <папка>`, затем `DIST=<папка> npm run check:results`.

Браузерным проверкам нужен `PLAYWRIGHT_MODULE` (путь к установленному playwright).

## Раздел «Результаты»

Пока в разработке: на сайте выключен (`RESULTS_ON` — предпросмотр или
`VITE_RESULTS=1`), в сборку сайта его код не попадает.
