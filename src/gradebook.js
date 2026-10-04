// Журнал учителя: ученики строками, уроки по датам столбцами, в клетках —
// отметки. Даты берутся из расписания: дни недели, в которые стоит предмет,
// внутри выбранного периода. Лишнюю дату можно скрыть (каникулы, отмена),
// нужную — добавить.
//
// Журнал хранится у учителя (state.gradebooks) и синхронизируется как обычная
// запись. Ученикам уходят только отметки — каждая своей строкой в
// results_inbox (results-inbox.js) с ключом «журнал:дата». Что уже выложено,
// журнал помнит (published), поэтому «Выложить изменения» отправляет только
// новое и исправленное, а стёртое — убирает у ученика.
//
// gradebook = {
//   id, name, subject, days: ["mon", …], from, to, scale: 100 | 5,
//   students: [{ id, name, email }],
//   marks: { [studentId]: { [дата]: значение } },
//   published: { ["studentId|дата"]: значение },
//   extra: [дата…], skip: [дата…],
// }

export const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
export const DAY_SHORT = { mon: "Пн", tue: "Вт", wed: "Ср", thu: "Чт", fri: "Пт", sat: "Сб", sun: "Вс" };
const JS_DAY = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

const iso = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
const parse = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ""));
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
};

export function dayOf(date) {
  const d = parse(date);
  return d ? JS_DAY[d.getDay()] : "";
}

// Дни недели, в которые предмет стоит в расписании (без экзаменов и уроков,
// на которые не ходят).
export function daysFromSchedule(schedule, subject) {
  const name = String(subject || "").trim().toLowerCase();
  if (!name) return [];
  const set = new Set(
    (schedule || [])
      .filter((e) => e && e.kind !== "exam" && !e.skip && String(e.subjectName || "").trim().toLowerCase() === name)
      .map((e) => e.day)
  );
  return DAY_KEYS.filter((d) => set.has(d));
}

// Даты уроков журнала по порядку: дни недели внутри периода, плюс добавленные,
// минус скрытые.
export function lessonDates(gb) {
  const from = parse(gb.from);
  const to = parse(gb.to);
  const days = new Set(gb.days || []);
  const out = new Set(gb.extra || []);
  if (from && to && from <= to && days.size) {
    const d = new Date(from);
    let guard = 0;
    while (d <= to && guard < 400) {
      if (days.has(JS_DAY[d.getDay()])) out.add(iso(d));
      d.setDate(d.getDate() + 1);
      guard += 1;
    }
  }
  const skip = new Set(gb.skip || []);
  return Array.from(out).filter((x) => !skip.has(x)).sort();
}

// Период по умолчанию — текущий месяц.
export function monthRange(now = new Date()) {
  const a = new Date(now.getFullYear(), now.getMonth(), 1);
  const b = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { from: iso(a), to: iso(b) };
}

export function newGradebook(subject, schedule, now = new Date()) {
  return {
    id: "gb-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    name: subject || "Новый журнал",
    subject: subject || "",
    days: daysFromSchedule(schedule, subject),
    ...monthRange(now),
    scale: 100,
    students: [],
    marks: {},
    published: {},
    extra: [],
    skip: [],
  };
}

// Отметка из клетки: число в пределах шкалы или null (пусто или мусор).
export function markValue(raw, scale) {
  const s = String(raw === undefined || raw === null ? "" : raw).trim().replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  const max = scale === 5 ? 5 : 100;
  const min = scale === 5 ? 1 : 0;
  if (n < min || n > max) return null;
  return n;
}

// Средний балл ученика по журналу — среднее арифметическое отметок.
export function studentAverage(gb, studentId, dates) {
  const row = (gb.marks || {})[studentId] || {};
  const vals = (dates || lessonDates(gb)).map((d) => markValue(row[d], gb.scale)).filter((v) => v !== null);
  return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
}

// Средний по уроку (столбцу).
export function dateAverage(gb, date) {
  const vals = (gb.students || []).map((st) => markValue(((gb.marks || {})[st.id] || {})[date], gb.scale)).filter((v) => v !== null);
  return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
}

export const itemKey = (gb, date) => "gb:" + gb.id + ":" + date;

// Что изменилось с последней выкладки: put — новая или исправленная отметка,
// del — стёртая (у ученика её надо убрать). Ученики без почты пропускаются.
export function pendingChanges(gb) {
  const out = [];
  const published = gb.published || {};
  const dates = new Set(lessonDates(gb));
  (gb.students || []).forEach((st) => {
    const email = String(st.email || "").trim().toLowerCase();
    if (!email) return;
    const row = (gb.marks || {})[st.id] || {};
    const seen = new Set();
    Object.keys(row).forEach((date) => {
      const v = markValue(row[date], gb.scale);
      const key = st.id + "|" + date;
      seen.add(key);
      if (v === null || !dates.has(date)) {
        if (published[key] !== undefined) out.push({ action: "del", student: st, email, date, key });
        return;
      }
      if (published[key] !== v) out.push({ action: "put", student: st, email, date, key, value: v });
    });
    Object.keys(published).forEach((key) => {
      if (!key.startsWith(st.id + "|") || seen.has(key)) return;
      out.push({ action: "del", student: st, email, date: key.slice(st.id.length + 1), key });
    });
  });
  return out;
}

// Результат, который увидит ученик.
export function payloadFor(gb, date, value) {
  const d = parse(date);
  const label = d ? String(d.getDate()).padStart(2, "0") + "." + String(d.getMonth() + 1).padStart(2, "0") : date;
  const base = { kind: "lesson", subject: gb.subject || gb.name, title: "Урок " + label, date, journal: gb.name, key: itemKey(gb, date) };
  return gb.scale === 5 ? { ...base, scale: "grade", grade: value } : { ...base, scale: "points", score: value, max: 100 };
}

// После выкладки: published = то, что сейчас в клетках (для выложенных ключей).
export function markPublished(gb, done) {
  const published = { ...(gb.published || {}) };
  done.forEach((c) => {
    if (c.action === "put") published[c.key] = c.value;
    else delete published[c.key];
  });
  return { ...gb, published };
}

// Как назвать ученика: «Фамилия Имя»; у старых записей — name, в крайнем
// случае почта.
export function studentName(st) {
  if (!st) return "";
  const full = [st.last, st.first].map((x) => String(x || "").trim()).filter(Boolean).join(" ");
  return full || String(st.name || "").trim() || String(st.email || "").trim() || "Без имени";
}

// По алфавиту фамилий.
export function sortStudents(list) {
  return (list || []).slice().sort((a, b) => studentName(a).localeCompare(studentName(b), "ru"));
}

// Список учеников из вставленного текста: по строке на ученика, имя и почта
// в любом порядке, через запятую, точку с запятой, табуляцию или пробел.
export function parseStudents(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const found = (line.match(/[^\s,;<>]+@[^\s,;<>]+/) || [""])[0];
      const email = found.toLowerCase();
      const name = (found ? line.replace(found, "") : line).replace(/[<>,;\t]+/g, " ").replace(/\s+/g, " ").trim();
      // Первое слово — фамилия, остальное — имя.
      const words = name.split(" ").filter(Boolean);
      return { last: words[0] || "", first: words.slice(1).join(" "), email };
    })
    .filter((s) => s.last || s.email);
}

// Оценка за отметку журнала: в 100-балльном — по шкале уроков
// (0–49 → 2, 50–69 → 3, 70–89 → 4, 90–100 → 5), в 5-балльном — она сама.
export function markGrade(gb, value) {
  if (value === null || value === undefined) return null;
  if (gb.scale === 5) return Math.round(value);
  return value >= 90 ? 5 : value >= 70 ? 4 : value >= 50 ? 3 : 2;
}

const mean = (list) => (list.length ? list.reduce((s, v) => s + v, 0) / list.length : null);

// Статистика ученика: средний балл (в 100-балльном), средняя оценка — оба
// среднее арифметическое; сколько отметок, сколько прошедших уроков без отметки
// и сколько каких оценок.
export function studentStats(gb, studentId, dates, today = null) {
  const row = (gb.marks || {})[studentId] || {};
  const list = dates || lessonDates(gb);
  const values = [];
  const grades = [];
  const dist = { 5: 0, 4: 0, 3: 0, 2: 0 };
  let missing = 0;
  list.forEach((d) => {
    const v = markValue(row[d], gb.scale);
    if (v === null) {
      if (!today || d <= today) missing += 1;
      return;
    }
    values.push(v);
    const g = markGrade(gb, v);
    grades.push(g);
    if (dist[g] !== undefined) dist[g] += 1;
  });
  return { count: values.length, avg: gb.scale === 5 ? null : mean(values), avgGrade: mean(grades), missing, dist };
}

// Сводка по классу: средние по всем отметкам, распределение оценок, у кого
// средняя оценка ниже 3 и кто лучший.
export function classStats(gb, dates, today = null) {
  const list = dates || lessonDates(gb);
  const per = (gb.students || []).map((st) => ({ student: st, ...studentStats(gb, st.id, list, today) }));
  const values = [];
  const grades = [];
  const dist = { 5: 0, 4: 0, 3: 0, 2: 0 };
  per.forEach((p) => {
    const row = (gb.marks || {})[p.student.id] || {};
    list.forEach((d) => {
      const v = markValue(row[d], gb.scale);
      if (v === null) return;
      values.push(v);
      const g = markGrade(gb, v);
      grades.push(g);
      if (dist[g] !== undefined) dist[g] += 1;
    });
  });
  const ranked = per.filter((p) => p.avgGrade !== null);
  const best = ranked.length ? ranked.reduce((b, p) => ((p.avg ?? p.avgGrade) > (b.avg ?? b.avgGrade) ? p : b)) : null;
  return {
    count: values.length,
    avg: gb.scale === 5 ? null : mean(values),
    avgGrade: mean(grades),
    dist,
    risk: ranked.filter((p) => p.avgGrade < 3).map((p) => p.student),
    best: best ? best.student : null,
    per,
  };
}

// Ученики журнала: класс из списка (без убранных из этого журнала) и
// добавленные учителем. У журнала без класса (старого вида) — свой список.
export function journalStudents(gb, classes) {
  if (!gb) return [];
  const added = gb.addedStudents || [];
  if (!gb.classId) return [...(gb.students || []), ...added];
  const cls = (classes || []).find((c) => c.id === gb.classId);
  const excluded = new Set(gb.excluded || []);
  const fromClass = ((cls && cls.students) || []).filter((st) => !excluded.has(st.id)).map((st) => ({ ...st, fromClass: true }));
  return [...fromClass, ...added.filter((st) => !fromClass.some((x) => x.id === st.id))];
}

// Журнал вместе с учениками — для подсчётов и выкладки.
export function withStudents(gb, classes) {
  return gb ? { ...gb, students: journalStudents(gb, classes) } : gb;
}

// Название журнала: «10Б · Право».
export function journalTitle(gb, classes) {
  if (!gb) return "";
  const cls = gb.classId && (classes || []).find((c) => c.id === gb.classId);
  return [cls ? cls.name : gb.name, gb.subject].filter(Boolean).join(" · ") || "Журнал";
}
