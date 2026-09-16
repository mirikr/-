// Загрузка набора заданий по предмету.
//
// Набор больше не лежит одним куском: у каждого предмета свой файл в src/bank,
// и грузится тот, который открыли. Раньше при заходе в тренажёр приложение
// тянуло сразу все предметы — мегабайты ради одного задания по информатике.
//
// Список файлов Vite собирает сам во время сборки, поэтому каждый предмет
// оказывается отдельным куском и подтягивается по требованию.
const FILES = import.meta.glob("./bank/*.js");

const loaded = new Map();

export function bankReady(file) {
  return loaded.has(file);
}

// Возвращает задания предмета. Уже загруженный набор отдаётся сразу же, без
// повторного запроса: переключаться между предметами нужно мгновенно.
export async function loadBank(file) {
  if (loaded.has(file)) return loaded.get(file);
  const load = FILES["./bank/" + file + ".js"];
  if (!load) return [];
  try {
    const mod = await load();
    const tasks = mod.TASKS || [];
    loaded.set(file, tasks);
    return tasks;
  } catch (e) {
    // Без сети и без кеша набор не придёт. Пустой список приложение переживает:
    // тренажёр честно скажет, что задания не загрузились.
    return null;
  }
}

// Картинки заданий лежат рядом со сборкой и подписаны относительным адресом:
// приложение живёт и в подпапке сайта, и в предпросмотре одной страницей.
export function withBase(html) {
  const base = (typeof import.meta.env !== "undefined" && import.meta.env.BASE_URL) || "/";
  return String(html || "").replace(/src="fipi\//g, 'src="' + base + "fipi/");
}
