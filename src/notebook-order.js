// Порядок предметов в списке тетрадей.
//
// Предметов бывает под двадцать, и нужный всегда оказывался где-то внизу.
// Теперь их можно закрепить наверху и расставить как удобно. Настройка —
// { order: [ключ…], pinned: [ключ…] } — хранится в общих записях и одинакова
// на телефоне и ноутбуке.
//
// Ключи исчезнувших предметов не вычищаются: лицейский предмет пропадает из
// списка, пока его нет в расписании, и должен вернуться на своё место.

function clean(pref) {
  return {
    order: Array.isArray(pref && pref.order) ? pref.order.map(String) : [],
    pinned: Array.isArray(pref && pref.pinned) ? pref.pinned.map(String) : [],
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
  const isPinned = new Set(pinned);
  const top = list.filter((o) => isPinned.has(o.key));
  const rest = list.filter((o) => !isPinned.has(o.key));
  return top.map((o) => ({ ...o, pinned: true })).concat(rest.map((o) => ({ ...o, pinned: false })));
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
  return { order: withHidden(keys, order), pinned: nextPinned };
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
  return { order: withHidden(keys, order), pinned };
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
