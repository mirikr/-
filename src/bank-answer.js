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

// Сколько независимых совпадений нужно, чтобы поверить ключу без банка.
// Четверо в классе — значит трое, сошедшихся порознь, это уже не случайность.
export const AGREE_NEEDED = 3;

// Состояние ключа по общим голосам. Голос — это ответ одного человека на одно
// задание: сошёлся он с нашим ключом или нет, и что сказал банк, если человек
// сходил проверить.
//
// Слово банка весомее любого числа совпадений: если банк ответил иначе, ключ
// спорный, сколько бы человек ни решили так же. И наоборот — сговорившееся
// большинство с одинаковым неверным ответом не должно объявляться истиной,
// поэтому «сошлось у троих» и «подтверждено банком» — разные состояния.
export function consensus(votes, taskId) {
  let agree = 0;
  let fipiOk = 0;
  let fipiBad = 0;
  const rivals = new Map();

  (votes || []).forEach((v) => {
    if (v.taskId !== taskId) return;
    if (v.fipi === "ok") fipiOk += 1;
    if (v.fipi === "wrong") fipiBad += 1;
    if (v.matches) {
      agree += 1;
    } else if (v.answer) {
      const key = normalizeAnswer(v.answer);
      if (key) rivals.set(key, { answer: v.answer, count: (rivals.get(key) ? rivals.get(key).count : 0) + 1 });
    }
  });

  let rival = null;
  rivals.forEach((r) => {
    if (!rival || r.count > rival.count) rival = r;
  });

  let state = "unverified";
  if (fipiBad) state = "disputed";
  else if (fipiOk) state = "confirmed";
  else if (rival && rival.count >= 2 && rival.count > agree) state = "disputed";
  else if (agree >= AGREE_NEEDED) state = "agreed";

  return { state, agree, fipiOk, fipiBad, rival, need: Math.max(0, AGREE_NEEDED - agree) };
}

// Свой голос: последний ответ на задание и отметка о сверке с банком.
export function myVote(log, marks, taskId) {
  let answer = "";
  let matches = false;
  (log || []).forEach((a) => {
    if (a.taskId !== taskId) return;
    answer = a.answer || "";
    matches = !!a.ok;
  });
  const mark = (marks || []).find((m) => m.taskId === taskId);
  return { taskId, userId: "я", answer, matches, fipi: mark ? mark.kind : "" };
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
