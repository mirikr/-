// История нормы часов по дням недели.
//
// Раньше норма дня бралась из текущих настроек «Распределения» для любой даты:
// поменял вторник с 2,5 на 1,5 часа — и все прошлые вторники на графике
// «Сегодня» задним числом мерились новой нормой, а выполненное по старой
// мерке выглядело недобором (или наоборот). Теперь при каждой правке прежняя
// норма запоминается вместе с датой, до которой она действовала:
//
//   budget.past = [{ until: "2026-10-02", daily: { mon: 150, … } }, …]
//
// Дни раньше until меряются этой нормой, с until и дальше — следующей, а
// после последней записи — текущей budget.daily. Правка вступает в силу с
// сегодняшнего дня. Несколько правок за один день дают одну запись: до
// сегодняшнего дня действовала норма, бывшая до первой из них.

const DOW = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

function ymd(date) {
  return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
}

// Норма (минуты по дням недели), действовавшая в этот день.
export function dailyFor(budget, date) {
  const key = typeof date === "string" ? date : ymd(date);
  const past = Array.isArray(budget && budget.past) ? budget.past : [];
  const hit = past.find((p) => p && p.until && key < p.until && p.daily);
  return hit ? hit.daily : (budget && budget.daily) || {};
}

export function goalMinutesFor(budget, date) {
  const d = typeof date === "string" ? new Date(date + "T00:00:00") : date;
  return Number(dailyFor(budget, d)[DOW[d.getDay()]]) || 0;
}

// Новая норма дня недели с сегодняшнего дня; прежняя остаётся за прошлыми днями.
export function withDaily(budget, dayKey, minutes, today = new Date()) {
  const prev = budget || {};
  const daily = prev.daily || {};
  const value = Math.max(0, Number(minutes) || 0);
  if ((Number(daily[dayKey]) || 0) === value) return prev;
  const until = typeof today === "string" ? today : ymd(today);
  const past = (Array.isArray(prev.past) ? prev.past : []).filter((p) => p && p.until && p.until <= until);
  const last = past[past.length - 1];
  const nextPast = last && last.until === until ? past : [...past, { until, daily: { ...daily } }];
  return { ...prev, past: nextPast, daily: { ...daily, [dayKey]: value } };
}
