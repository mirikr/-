// Порядок предметов в списке тетрадей.
//
// Предметов бывает под двадцать, и нужный всегда оказывался где-то внизу.
// Теперь их можно закрепить наверху и расставить как удобно. Настройка —
// { order: [ключ…], pinned: [ключ…] } — хранится в общих записях и одинакова
// на телефоне и ноутбуке.
//
// Ключи исчезнувших предметов не вычищаются: лицейский предмет пропадает из
// списка, пока его нет в расписании, и должен вернуться на своё место.

// Как упорядочен список: вручную или по признаку из расписания. Закреплённые
// в любом случае наверху.
export const SORTS = [
  { id: "manual", name: "Вручную" },
  { id: "priority", name: "По важности" },
  { id: "level", name: "По уровню" },
  { id: "next", name: "По ближайшему уроку" },
  { id: "name", name: "По алфавиту" },
];

function clean(pref) {
  return {
    order: Array.isArray(pref && pref.order) ? pref.order.map(String) : [],
    pinned: Array.isArray(pref && pref.pinned) ? pref.pinned.map(String) : [],
    sort: SORTS.some((x) => pref && x.id === pref.sort) ? pref.sort : "manual",
  };
}

// Уровень предмета по расписанию: спецкурс (олимпиадный трек, занятия вне
// лицея) выше профиля, профиль выше базы.
export const LEVELS = { special: { rank: 3, label: "спецкурс" }, prof: { rank: 2, label: "проф" }, base: { rank: 1, label: "база" } };
const LEVEL_OF = { olymp: "special", outside: "special", prof: "prof", base: "base" };
const DOW = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const toMin = (t) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(t || ""));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

// Важность, уровень и время до ближайшего урока предмета — по урокам из
// расписания. Важность — наибольшая у его уроков, уровень — самый высокий.
// now — Date; nextIn — минуты до начала ближайшего урока (неделя по кругу).
export function ownerMeta(name, schedule, now) {
  const lessons = (schedule || []).filter((e) => e && e.subjectName === name && e.kind !== "exam" && !e.skip);
  if (!lessons.length) return { priority: 0, level: "", nextIn: Infinity };
  const priority = Math.max(...lessons.map((e) => Number(e.priority) || 1));
  const level = lessons
    .map((e) => LEVEL_OF[e.level] || "base")
    .reduce((best, l) => (LEVELS[l].rank > LEVELS[best].rank ? l : best), "base");
  let nextIn = Infinity;
  if (now) {
    const today = (now.getDay() + 6) % 7;
    const nowMin = now.getHours() * 60 + now.getMinutes();
    lessons.forEach((e) => {
      const d = DOW.indexOf(e.day);
      const start = toMin(e.start);
      if (d < 0 || start === null) return;
      let delta = ((d - today + 7) % 7) * 1440 + start - nowMin;
      if (delta < 0) delta += 7 * 1440;
      nextIn = Math.min(nextIn, delta);
    });
  }
  return { priority, level, nextIn };
}

// Сравнение по выбранному признаку. Предметы без уроков в расписании — после
// остальных; при равенстве — по имени.
function compareBy(sort) {
  const byName = (a, b) => String(a.name).localeCompare(String(b.name), "ru");
  if (sort === "name") return byName;
  const key = {
    priority: (o) => -(o.priority || 0),
    level: (o) => -((LEVELS[o.level] || { rank: 0 }).rank),
    next: (o) => (Number.isFinite(o.nextIn) ? o.nextIn : Infinity),
  }[sort];
  return (a, b) => {
    const ka = key(a);
    const kb = key(b);
    if (ka !== kb) return ka === Infinity ? 1 : kb === Infinity ? -1 : ka - kb;
    return byName(a, b);
  };
}

// Сначала закреплённые, потом остальные; внутри — по сохранённому порядку,
// новые предметы — в конце, в обычном порядке.
export function orderOwners(owners, pref) {
  const { order, pinned } = clean(pref);
  const byKey = new Map(owners.map((o) => [o.key, o]));
  const seen = new Set();
  const list = [];
  order.forEach((key) => {
    if (byKey.has(key) && !seen.has(key)) {
      seen.add(key);
      list.push(byKey.get(key));
    }
  });
  owners.forEach((o) => {
    if (!seen.has(o.key)) list.push(o);
  });
  const { sort } = clean(pref);
  const isPinned = new Set(pinned);
  let top = list.filter((o) => isPinned.has(o.key));
  let rest = list.filter((o) => !isPinned.has(o.key));
  if (sort !== "manual") {
    const cmp = compareBy(sort);
    top = top.slice().sort(cmp);
    rest = rest.slice().sort(cmp);
  }
  return top.map((o) => ({ ...o, pinned: true })).concat(rest.map((o) => ({ ...o, pinned: false })));
}

// Сменить способ упорядочивания. Ручной порядок при этом не теряется: к нему
// можно вернуться.
export function setSort(pref, sort) {
  return { ...clean(pref), sort: SORTS.some((x) => x.id === sort) ? sort : "manual" };
}

// Сохраняет видимый порядок целиком, дописывая в хвост ключи, которых сейчас
// нет на экране, чтобы вернувшийся предмет встал туда же, где был.
function withHidden(visibleKeys, prevOrder) {
  const shown = new Set(visibleKeys);
  return visibleKeys.concat(prevOrder.filter((key) => !shown.has(key)));
}

// Закреплённый встаёт последним среди закреплённых, открепленный — первым
// среди остальных: предмет не прыгает через весь список.
export function togglePin(pref, owners, key) {
  const { order, pinned } = clean(pref);
  const list = orderOwners(owners, pref);
  const was = pinned.includes(key);
  const nextPinned = was ? pinned.filter((k) => k !== key) : pinned.concat(key);
  const keys = list.map((o) => o.key).filter((k) => k !== key);
  const pinnedCount = list.filter((o) => o.pinned && o.key !== key).length;
  keys.splice(pinnedCount, 0, key);
  return { order: withHidden(keys, order), pinned: nextPinned, sort: clean(pref).sort };
}

// Переставляет предмет с места from на место to (индексы в упорядоченном
// списке). Закреплённые и остальные не смешиваются: перетащить можно только
// внутри своей группы.
export function moveOwner(pref, owners, from, to) {
  const { order, pinned } = clean(pref);
  const list = orderOwners(owners, pref);
  if (from < 0 || from >= list.length) return clean(pref);
  const pinnedCount = list.filter((o) => o.pinned).length;
  const [lo, hi] = list[from].pinned ? [0, pinnedCount - 1] : [pinnedCount, list.length - 1];
  const target = Math.max(lo, Math.min(hi, to));
  const keys = list.map((o) => o.key);
  const [moved] = keys.splice(from, 1);
  keys.splice(target, 0, moved);
  // Перетащили руками — значит, порядок теперь ручной: видимый порядок
  // становится сохранённым, а сортировка выключается.
  return { order: withHidden(keys, order), pinned, sort: "manual" };
}

// Куда встанет перетаскиваемый предмет: столько мест, сколько соседей по его
// группе осталось выше пальца. Середины строк запоминаются в начале
// перетаскивания, поэтому живое перестроение списка на расчёт не влияет.
export function dropIndex(mids, from, y, pinnedCount) {
  const inPinned = from < pinnedCount;
  const lo = inPinned ? 0 : pinnedCount;
  const hi = inPinned ? pinnedCount - 1 : mids.length - 1;
  let above = 0;
  for (let i = lo; i <= hi; i += 1) {
    if (i !== from && mids[i] < y) above += 1;
  }
  return lo + above;
}
