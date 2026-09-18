// Порядок заданий в наборе.
//
// По умолчанию задания идут так, как лежат в банке: номер за номером. Это
// удобно, когда набор проходят целиком, но плохо для повторения — порядок
// запоминается вместе с ответами, и кажется, что помнишь тему, хотя помнишь
// место. Поэтому порядок можно сменить: перемешать, собрать по темам или
// вынести вперёд то, чего ещё не решал.
//
// Перемешивание должно быть устойчивым: если каждый показ тасовать заново,
// набор будет прыгать под руками, а после перезагрузки страницы человек
// окажется неизвестно где. Поэтому случайность здесь — не Math.random, а
// хэш от номера задания и зерна, которое лежит в состоянии тренажёра:
// при одном зерне порядок всегда один и тот же, а «перемешать заново» —
// это просто новое зерно.

export const ORDERS = [
  { key: "", name: "По порядку", hint: "как в банке" },
  { key: "shuffle", name: "Вперемешку", hint: "случайный порядок" },
  { key: "section", name: "По темам", hint: "разделы подряд" },
  { key: "fresh", name: "Сначала нерешённые", hint: "начнём с нового" },
];

export function orderName(key) {
  const found = ORDERS.find((o) => o.key === (key || ""));
  return found ? found.name : ORDERS[0].name;
}

// FNV-1a: короткий, ровно рассыпает близкие строки (а номера заданий похожи
// друг на друга) и считается одинаково везде — без этого порядок на телефоне
// и на ноутбуке разошёлся бы.
export function hashOf(text, seed) {
  let h = ((Number(seed) || 0) ^ 0x811c9dc5) >>> 0;
  const s = String(text);
  for (let i = 0; i < s.length; i += 1) {
    h = (h ^ s.charCodeAt(i)) >>> 0;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function newSeed() {
  return Math.floor(Math.random() * 0xffffff) + 1;
}

// Всегда возвращаем новый массив: исходный набор — общий для всего тренажёра,
// сортировать его на месте нельзя.
export function orderTasks(tasks, order, options) {
  const list = (tasks || []).slice();
  const opts = options || {};
  const seed = Number(opts.seed) || 1;
  const solved = opts.solved || new Set();
  // Исходный порядок запоминаем: он разрешает ничьи, чтобы сортировка была
  // одинаковой всюду, а не зависела от внутренностей sort.
  const was = new Map();
  list.forEach((t, i) => was.set(t.id, i));
  const first = (a, b) => was.get(a.id) - was.get(b.id);

  if (order === "shuffle") {
    return list.sort(
      (a, b) => hashOf(a.id, seed) - hashOf(b.id, seed) || String(a.id).localeCompare(String(b.id)),
    );
  }
  if (order === "section") {
    return list.sort(
      (a, b) => String(a.section || "").localeCompare(String(b.section || ""), "ru") || first(a, b),
    );
  }
  if (order === "fresh") {
    const done = (t) => (solved.has(t.id) ? 1 : 0);
    return list.sort((a, b) => done(a) - done(b) || first(a, b));
  }
  return list;
}
