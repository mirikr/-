// Результаты: контрольные (КТ), экзамены, олимпиады, пробники.
//
// Считаются они по-разному, поэтому у записи есть шкала (scale):
//   points  — баллы из максимума (34 из 50);
//   primsec — первичные и вторичные баллы, как в ЕГЭ и ОГЭ (25 из 29 первичных
//             → 82 из 100 тестовых);
//   grade   — оценка (2–5), по желанию ещё и баллы;
//   percent — сразу процент;
//   pass    — зачёт или незачёт.
// Баллы можно разложить по частям или турам (parts) — тогда сумма считается сама.
// У олимпиады ещё статус (участник, призёр, победитель), проходной балл на
// следующий этап и место.
//
// Запись — обычный объект с id; хранится в state.results и синхронизируется,
// как дневник. Выложенные учителем или обновлением — не здесь (results-feed.js):
// их нельзя править, только скрыть у себя.

export const KINDS = [
  { id: "lesson", name: "Урок", long: "Оценка за урок" },
  { id: "kt", name: "КТ", long: "Контрольная (КТ)" },
  { id: "exam", name: "Экзамен", long: "Экзамен" },
  { id: "olympiad", name: "Олимпиада", long: "Олимпиада" },
  { id: "probe", name: "Пробник", long: "Пробник" },
  { id: "other", name: "Другое", long: "Другое" },
];

export const SCALES = [
  { id: "points", name: "Баллы из максимума" },
  { id: "primsec", name: "Первичные и вторичные баллы" },
  { id: "grade", name: "Оценка" },
  { id: "percent", name: "Процент" },
  { id: "pass", name: "Зачёт / незачёт" },
];

export const STATUSES = [
  { id: "", name: "—" },
  { id: "participant", name: "Участник" },
  { id: "next", name: "Прошёл на следующий этап" },
  { id: "prize", name: "Призёр" },
  { id: "winner", name: "Победитель" },
];

export const STAGES = ["Школьный", "Муниципальный", "Региональный", "Заключительный", "Отборочный", "Финал"];

const num = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

const fmt = (n) => {
  if (n === null || n === undefined) return "";
  const r = Math.round(n * 10) / 10;
  return String(r).replace(".", ",");
};

// Сумма по частям, если они есть и заполнены.
export function partsTotal(parts) {
  const list = (parts || []).filter((p) => num(p.score) !== null || num(p.max) !== null);
  if (!list.length) return null;
  const score = list.reduce((s, p) => s + (num(p.score) || 0), 0);
  const maxKnown = list.every((p) => num(p.max) !== null);
  const max = maxKnown ? list.reduce((s, p) => s + num(p.max), 0) : null;
  return { score, max };
}

// Итог записи для показа и подсчётов: главное число, подпись, процент (0–100
// или null, если его не из чего посчитать) и прошёл ли проходной.
export function summarize(r) {
  const res = r || {};
  const scale = res.scale || "points";
  const parts = partsTotal(res.parts);
  let main = "";
  let sub = "";
  let percent = null;
  if (scale === "points") {
    const score = parts ? parts.score : num(res.score);
    const max = parts && parts.max !== null ? parts.max : num(res.max);
    if (score !== null) {
      main = max ? `${fmt(score)} из ${fmt(max)}` : `${fmt(score)} б.`;
      if (max) percent = (score / max) * 100;
    }
  } else if (scale === "primsec") {
    const p = parts ? parts.score : num(res.primary);
    const pMax = parts && parts.max !== null ? parts.max : num(res.primaryMax);
    const s = num(res.secondary);
    const sMax = num(res.secondaryMax) || 100;
    if (s !== null) {
      main = `${fmt(s)} из ${fmt(sMax)}`;
      percent = (s / sMax) * 100;
    } else if (p !== null && pMax) {
      percent = (p / pMax) * 100;
    }
    if (p !== null) sub = `первичных ${fmt(p)}${pMax ? " из " + fmt(pMax) : ""}`;
    if (!main && p !== null) {
      main = `${fmt(p)}${pMax ? " из " + fmt(pMax) : ""} перв.`;
      sub = s === null ? "вторичные ещё не известны" : sub;
    }
  } else if (scale === "grade") {
    const g = num(res.grade);
    if (g !== null) {
      main = `оценка ${fmt(g)}`;
      percent = Math.max(0, Math.min(100, ((g - 2) / 3) * 100));
    }
    const score = parts ? parts.score : num(res.score);
    const max = parts && parts.max !== null ? parts.max : num(res.max);
    if (score !== null) {
      sub = max ? `${fmt(score)} из ${fmt(max)} б.` : `${fmt(score)} б.`;
      if (max) percent = (score / max) * 100;
    }
  } else if (scale === "percent") {
    const p = num(res.percent);
    if (p !== null) {
      main = `${fmt(p)} %`;
      percent = p;
    }
  } else if (scale === "pass") {
    if (res.passed === true) {
      main = "зачёт";
      percent = 100;
    } else if (res.passed === false) {
      main = "незачёт";
      percent = 0;
    }
  }
  if (percent !== null && scale !== "percent" && scale !== "pass" && !sub) sub = `${fmt(percent)} %`;
  else if (percent !== null && scale !== "percent" && scale !== "pass" && sub && !/%/.test(sub)) sub += ` · ${fmt(percent)} %`;

  // Проходной балл — в тех же единицах, что главное число.
  const threshold = num(res.threshold);
  let passedThreshold = null;
  if (threshold !== null) {
    const value =
      scale === "primsec" ? (num(res.secondary) !== null ? num(res.secondary) : parts ? parts.score : num(res.primary)) : scale === "percent" ? num(res.percent) : parts ? parts.score : num(res.score);
    if (value !== null) passedThreshold = value >= threshold;
  }
  return { main: main || "нет баллов", sub, percent: percent === null ? null : Math.max(0, Math.min(100, percent)), passedThreshold };
}

// Сводка по предмету: сколько записей, средний и последний процент.
export function subjectSummary(results) {
  const list = (results || []).slice().sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
  const withPct = list.map((r) => ({ r, p: summarize(r).percent })).filter((x) => x.p !== null);
  const avg = withPct.length ? withPct.reduce((s, x) => s + x.p, 0) / withPct.length : null;
  const last = withPct.length ? withPct[withPct.length - 1] : null;
  const prev = withPct.length > 1 ? withPct[withPct.length - 2] : null;
  const best = withPct.length ? withPct.reduce((b, x) => (x.p > b.p ? x : b)) : null;
  return {
    count: list.length,
    avg,
    last: last ? last.p : null,
    trend: last && prev ? last.p - prev.p : null,
    best: best ? best.p : null,
  };
}

// Общая статистика по нескольким результатам. Всё переводится в 100-балльную
// шкалу (процент от максимума, вторичные баллы, оценка, зачёт), и средний балл —
// среднее арифметическое. Записи без баллов в подсчёт не входят.
export function overallStats(results) {
  const rows = (results || [])
    .map((r) => ({ r, p: summarize(r).percent }))
    .filter((x) => x.p !== null)
    .sort((a, b) => String(a.r.date || "").localeCompare(String(b.r.date || "")));
  const mean = (list) => (list.length ? list.reduce((s, x) => s + x.p, 0) / list.length : null);
  const byKind = {};
  rows.forEach((x) => {
    const k = x.r.kind || "other";
    if (!byKind[k]) byKind[k] = [];
    byKind[k].push(x);
  });
  const last = rows.length ? rows[rows.length - 1].p : null;
  const prev = rows.length > 1 ? rows[rows.length - 2].p : null;
  return {
    count: (results || []).length,
    scored: rows.length,
    avg: mean(rows),
    best: rows.length ? Math.max(...rows.map((x) => x.p)) : null,
    worst: rows.length ? Math.min(...rows.map((x) => x.p)) : null,
    last,
    trend: last !== null && prev !== null ? last - prev : null,
    byKind: Object.fromEntries(Object.entries(byKind).map(([k, list]) => [k, { count: list.length, avg: mean(list) }])),
  };
}

// Пустая запись для формы.
export function blankResult(kind = "kt") {
  return {
    id: "",
    kind,
    subject: "",
    title: "",
    date: "",
    stage: "",
    scale: kind === "exam" ? "primsec" : kind === "kt" ? "grade" : "points",
    score: "",
    // Оценки за уроки — по 100-балльной шкале.
    max: kind === "lesson" ? "100" : "",
    primary: "",
    primaryMax: "",
    secondary: "",
    secondaryMax: "100",
    grade: "",
    percent: "",
    passed: null,
    parts: [],
    status: "",
    threshold: "",
    place: "",
    note: "",
  };
}

// Чистит запись перед сохранением: числа — числами, пустое — убирается.
export function cleanResult(r) {
  const out = { ...r };
  ["score", "max", "primary", "primaryMax", "secondary", "secondaryMax", "grade", "percent", "threshold", "place"].forEach((k) => {
    const n = num(out[k]);
    if (n === null) delete out[k];
    else out[k] = n;
  });
  out.parts = (out.parts || [])
    .map((p) => ({ name: String(p.name || "").trim(), score: num(p.score), max: num(p.max) }))
    .filter((p) => p.name || p.score !== null || p.max !== null);
  if (!out.parts.length) delete out.parts;
  ["title", "subject", "note", "stage"].forEach((k) => {
    out[k] = String(out[k] || "").trim();
    if (!out[k]) delete out[k];
  });
  if (!out.status) delete out.status;
  if (out.passed !== true && out.passed !== false) delete out.passed;
  return out;
}

export function kindName(id) {
  return (KINDS.find((k) => k.id === id) || KINDS[KINDS.length - 1]).name;
}

export function statusName(id) {
  return (STATUSES.find((s) => s.id === id) || STATUSES[0]).name;
}
