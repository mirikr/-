// Сверка ответа с ключом и состояние ключа.
//
// Ответ человек пишет как ему удобно: 0,25 или 0.25, «109 и 78» или «10978»,
// с пробелами и без. Поэтому сравниваем не буква в букву, а по упрощённой
// записи: запятая становится точкой, пробелы и знак ± выбрасываются.
//
// Ключи здесь решены нами, а не взяты у ФИПИ: банк правильный ответ не отдаёт,
// он только отвечает «верно» или «неверно». Поэтому у каждого ключа есть
// состояние: пока ученик не сверил его с банком, ответ считается несверенным,
// а если банк ответил иначе — спорным.

export function normalizeAnswer(value) {
  return String(value == null ? "" : value)
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/,/g, ".")
    .replace(/[\s ±()]/g, "")
    .replace(/[–—−]/g, "-")
    .trim();
}

export function isRight(task, value) {
  const given = normalizeAnswer(value);
  if (!given) return false;
  const keys = [task.answer].concat(task.accept || []);
  return keys.some((key) => {
    const want = normalizeAnswer(key);
    if (!want) return false;
    if (given === want) return true;
    // Числа сравниваем как числа: «0.5» и «.5», «7» и «7.0» — один ответ.
    const a = Number(given);
    const b = Number(want);
    return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < 1e-9;
  });
}

export const KEY_STATE = {
  unverified: { label: "не сверен с ФИПИ", tone: "warn" },
  confirmed: { label: "сверен с ФИПИ", tone: "ok" },
  disputed: { label: "спорный: банк ответил иначе", tone: "bad" },
};

// Состояние ключа по отметкам учеников. Жалоба весомее подтверждения: если
// хоть кто-то говорит, что банк ответил иначе, ключ спорный, пока не разберёмся.
export function keyState(marks, taskId) {
  let confirmed = 0;
  let disputed = 0;
  (marks || []).forEach((m) => {
    if (m.taskId !== taskId) return;
    if (m.kind === "ok") confirmed += 1;
    if (m.kind === "wrong") disputed += 1;
  });
  if (disputed) return { state: "disputed", confirmed, disputed };
  if (confirmed) return { state: "confirmed", confirmed, disputed };
  return { state: "unverified", confirmed, disputed };
}

export function timeWord(seconds) {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  return (m ? m + ":" + String(s % 60).padStart(2, "0") : s + " с");
}

// Итоги по журналу попыток: сколько решено, какая доля верных, сколько уходит
// времени. Считаем по последней попытке на задание — тренируются до победы.
export function trainerStats(log, taskIds) {
  const last = new Map();
  (log || []).forEach((a) => {
    if (taskIds && !taskIds.has(a.taskId)) return;
    last.set(a.taskId, a);
  });
  let right = 0;
  let seconds = 0;
  last.forEach((a) => {
    if (a.ok) right += 1;
    seconds += Number(a.seconds) || 0;
  });
  const done = last.size;
  return {
    done,
    right,
    wrong: done - right,
    percent: done ? Math.round((right / done) * 100) : 0,
    averageSeconds: done ? Math.round(seconds / done) : 0,
  };
}

// Серия: сколько верных ответов подряд в конце журнала.
export function streakOf(log) {
  let n = 0;
  for (let i = (log || []).length - 1; i >= 0; i -= 1) {
    if (!log[i].ok) break;
    n += 1;
  }
  return n;
}
