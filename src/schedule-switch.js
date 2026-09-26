// Смена сетки лицея без потерь.
//
// Когда лицей меняет расписание, приложение пересобирает уроки заново — и всё,
// что было привязано к старым урокам, надо перенести на новые:
//   • важность, роль и описание урока — это свойства предмета, а не часа:
//     у алгебры они те же, даже если она переехала со среды на пятницу;
//   • домашнее задание — на новый урок своего предмета в ту же неделю, то есть
//     туда, где его теперь сдают.
// Список предметов и тетради при этом не трогаются: тетрадь привязана к
// названию предмета, а не к уроку (см. lyceumSubjectNames в study-planner).

const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

function parse(iso) {
  const [y, m, d] = String(iso).split("-").map(Number);
  return new Date(y, m - 1, d);
}

function iso(date) {
  const p = (n) => String(n).padStart(2, "0");
  return date.getFullYear() + "-" + p(date.getMonth() + 1) + "-" + p(date.getDate());
}

function addDays(isoDate, n) {
  const d = parse(isoDate);
  d.setDate(d.getDate() + n);
  return iso(d);
}

// Дата этого дня недели в неделе (пн–вс), где лежит isoDate.
function dateInWeek(isoDate, dayKey) {
  const d = parse(isoDate);
  const shift = (d.getDay() + 6) % 7; // пн = 0
  const monday = addDays(isoDate, -shift);
  const offset = (DAYS.indexOf(dayKey) + 6) % 7;
  return addDays(monday, offset);
}

export function weekdayOf(isoDate) {
  return DAYS[parse(isoDate).getDay()];
}

const key = (e) => e.day + "|" + e.start + "|" + e.subjectName;

// Важность, роль, свёрнутость и описание — с прежних уроков на новые: сперва
// с того же урока (день, час, предмет), иначе с любого урока того же предмета.
export function carryLessonSettings(fresh, old) {
  const exact = new Map((old || []).map((e) => [key(e), e]));
  const bySubject = new Map();
  (old || []).forEach((e) => {
    if (e.kind === "exam" || bySubject.has(e.subjectName)) return;
    bySubject.set(e.subjectName, e);
  });
  return fresh.map((e) => {
    const same = exact.get(key(e));
    const like = same || (e.kind !== "exam" ? bySubject.get(e.subjectName) : null);
    if (!like) return e;
    return {
      ...e,
      priority: like.priority,
      level: like.level,
      ...(same && same.folded ? { folded: true } : null),
      ...(like.note ? { note: like.note } : null),
    };
  });
}

// Куда переедет задание по предмету subject со сроком date: первый урок этого
// предмета в ту же неделю не раньше срока; если в неделе позже нет — самый
// поздний до срока, но не раньше сегодняшнего; иначе — первый на следующей.
function targetFor(subject, date, lessons, today) {
  const own = lessons.filter((e) => e.kind !== "exam" && e.subjectName === subject);
  if (!own.length) return null;
  const at = (weekDate) =>
    own
      .map((e) => ({ lesson: e, date: dateInWeek(weekDate, e.day) }))
      .sort((a, b) => a.date.localeCompare(b.date) || String(a.lesson.start).localeCompare(String(b.lesson.start)));
  const week = at(date);
  const later = week.find((c) => c.date >= date);
  if (later) return later;
  const earlier = week.filter((c) => c.date < date && c.date >= today).pop();
  if (earlier) return earlier;
  return at(addDays(date, 7))[0];
}

// Возвращает { homework, moves }. moves — что куда переехало, для уведомления:
// [{ id, subject, text, from, to }]. Прошедшие и сделанные задания не трогаем:
// их уже сдали или срок ушёл.
export function moveHomework(homework, oldLessons, newLessons, today) {
  const oldById = new Map((oldLessons || []).map((e) => [e.id, e]));
  const newIds = new Set((newLessons || []).map((e) => e.id));
  const newByKey = new Map((newLessons || []).map((e) => [key(e), e]));
  const moves = [];

  const next = (homework || []).map((h) => {
    if (h.done || !h.date || h.date < today) return h;

    // Задание к уроку: урок остался — ничего не делаем.
    if (h.lessonId) {
      if (newIds.has(h.lessonId)) return h;
      const old = oldById.get(h.lessonId);
      if (!old) return h; // урок завели руками или он из другой сетки — не наш
      const same = newByKey.get(key(old));
      if (same) return { ...h, lessonId: same.id };
      const target = targetFor(old.subjectName, h.date, newLessons, today);
      if (!target) return h;
      const moved = { ...h, lessonId: target.lesson.id, date: target.date };
      if (target.date !== h.date) moves.push({ id: h.id, subject: old.subjectName, text: h.text || "", from: h.date, to: target.date });
      return moved;
    }

    // Задание из «Дневника»: предмет и дата, без урока. Двигаем, только если в
    // тот день урок предмета был, а теперь его нет.
    if (!h.subjectName) return h;
    const day = weekdayOf(h.date);
    const had = (oldLessons || []).some((e) => e.kind !== "exam" && e.subjectName === h.subjectName && e.day === day);
    const has = (newLessons || []).some((e) => e.kind !== "exam" && e.subjectName === h.subjectName && e.day === day);
    if (!had || has) return h;
    const target = targetFor(h.subjectName, h.date, newLessons, today);
    if (!target || target.date === h.date) return h;
    moves.push({ id: h.id, subject: h.subjectName, text: h.text || "", from: h.date, to: target.date });
    return { ...h, date: target.date };
  });

  return { homework: next, moves };
}
