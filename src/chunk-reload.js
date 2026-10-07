// Обновление приложения, пока оно открыто. Новая версия встаёт в фоне и
// убирает из офлайн-кэша куски старой, а на сайте их тоже уже нет. Если старая
// страница после этого подгружает свой кусок (тренажёр, задания), загрузка
// падает — раньше это был экран «Приложение сломалось», который чинился
// перезагрузкой. Теперь такую ошибку узнаём и перезагружаемся сами — один раз:
// если и после перезагрузки кусок не пришёл (нет сети), повторять бессмысленно.
const KEY = "planner-chunk-reload";

export function isChunkError(err) {
  const text = String((err && (err.message || err)) || "");
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload|Loading chunk|ChunkLoadError/i.test(text);
}

// true — перезагрузка пошла; false — только что уже перезагружались.
export function reloadOnce() {
  try {
    const last = Number(sessionStorage.getItem(KEY)) || 0;
    if (Date.now() - last < 20000) return false;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch (e) {
    /* приватный режим — перезагружаемся без отметки */
  }
  window.location.reload();
  return true;
}

// Обёртка для lazy(() => import(...)): кусок старой версии не загрузился —
// перезагружаемся на новой и, пока перезагрузка идёт, ничего не рисуем.
export function retryImport(factory) {
  return () =>
    factory().catch((err) => {
      if (isChunkError(err) && reloadOnce()) return new Promise(() => {});
      throw err;
    });
}
