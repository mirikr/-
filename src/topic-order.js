// Порядок уроков в «Самостоятельной подготовке».
//
// Уроки предмета лежат двумя списками: из программы (topics) и свои (custom).
// Раньше свои всегда шли после программных; теперь их можно расставить как
// угодно: порядок — список id в data[предмет].order. Его нет — порядок прежний.
// Уроки, которых нет в order (добавили после перестановки), — в конце, в
// обычном порядке. Сами списки topics и custom не трогаются.

export function orderedTopics(subject) {
  const s = subject || {};
  const all = [...(s.topics || []).map((t) => ({ ...t, custom: false })), ...(s.custom || []).map((t) => ({ ...t, custom: true }))];
  const order = Array.isArray(s.order) ? s.order.map(String) : [];
  if (!order.length) return all;
  const pos = new Map(order.map((id, i) => [id, i]));
  return all
    .map((t, i) => ({ t, i, p: pos.has(String(t.id)) ? pos.get(String(t.id)) : order.length + i }))
    .sort((a, b) => a.p - b.p)
    .map((x) => x.t);
}

// Переставить урок movedId туда, где сейчас стоит targetId (в полном списке).
// Возвращает новый order — id всех уроков по порядку.
export function moveTopicOrder(subject, movedId, targetId) {
  const ids = orderedTopics(subject).map((t) => String(t.id));
  const from = ids.indexOf(String(movedId));
  const to = ids.indexOf(String(targetId));
  if (from < 0 || to < 0 || from === to) return ids;
  ids.splice(from, 1);
  ids.splice(to, 0, String(movedId));
  return ids;
}
