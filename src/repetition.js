// Повторение по интервалам.
//
// Тему проходят один раз и забывают — не потому, что ленивы, а потому, что
// никто не напоминает. Здесь напоминает приложение: чем дольше тема лежит без
// дела, тем ближе она к верху списка.
//
// Ничего нового для этого хранить не нужно. Пройденная тема и так пишет запись
// в дневник — с датой, предметом и своим lessonId. Значит, «когда это было в
// последний раз» уже записано, и повторение — такая же запись, только помеченная
// review. Отсюда два следствия: старые темы, пройденные до этой версии, попадают
// в расчёт сами собой, а часы повторения идут в общий план, как и всё остальное.

// Лестница интервалов: через сколько дней после последнего касания тема снова
// просится в работу. Первое повторение — через три дня, дальше всё реже.
// Последний шаг повторяется, пока тему не забросят совсем.
export const INTERVALS = [3, 7, 21, 60];

const DAY = 86400000;

export function daysBetween(fromISO, toISO) {
  const a = new Date(fromISO + "T00:00:00");
  const b = new Date(toISO + "T00:00:00");
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  return Math.round((b - a) / DAY);
}

// Что дневник знает про тему: когда её трогали в последний раз и сколько раз
// повторяли.
export function topicHistory(journal, topicId) {
  let last = null;
  let reviews = 0;
  for (const entry of journal || []) {
    if (!entry || entry.lessonId !== topicId) continue;
    if (entry.review) reviews += 1;
    if (!last || entry.date > last) last = entry.date;
  }
  return { last, reviews };
}

export function intervalFor(reviews) {
  return INTERVALS[Math.min(reviews, INTERVALS.length - 1)];
}

// Сколько дней просрочки: 0 — ровно сегодня, больше нуля — пора было раньше,
// null — тема ещё не пройдена или дата непонятна.
export function overdueDays(journal, topicId, today) {
  const { last, reviews } = topicHistory(journal, topicId);
  if (!last) return null;
  const passed = daysBetween(last, today);
  if (passed === null) return null;
  return passed - intervalFor(reviews);
}

// Темы, которые пора повторить: сначала самые запущенные.
//
// subjects — то же, что показывает «Подготовка»: у каждого id, название, цвет
// и список тем. Берутся только пройденные: непройденную повторять нечего.
export function dueTopics(subjects, journal, today, limit) {
  const out = [];
  for (const subject of subjects || []) {
    for (const topic of subject.topics || []) {
      if (!topic.done) continue;
      const { last, reviews } = topicHistory(journal, topic.id);
      if (!last) continue;
      const over = overdueDays(journal, topic.id, today);
      if (over === null || over < 0) continue;
      out.push({
        subjectId: subject.id,
        subjectName: subject.name,
        color: subject.color,
        topicId: topic.id,
        name: topic.name,
        custom: !!topic.custom,
        duration: topic.duration,
        last,
        reviews,
        overdue: over,
        days: daysBetween(last, today),
      });
    }
  }
  out.sort((a, b) => b.overdue - a.overdue || a.name.localeCompare(b.name));
  return limit ? out.slice(0, limit) : out;
}

// Часы, которые пишутся в дневник за повторение: примерно треть от первого
// прохода, но не меньше пятнадцати минут — иначе в плане повторения не видно.
export function reviewHours(duration) {
  const minutes = Number(duration) || 45;
  return Math.max(0.25, Math.round((minutes / 60 / 3) * 4) / 4);
}

export function agoWord(days) {
  if (days === 0) return "сегодня";
  if (days === 1) return "вчера";
  const last = days % 10;
  const two = days % 100;
  const word = two >= 11 && two <= 14 ? "дней" : last === 1 ? "день" : last >= 2 && last <= 4 ? "дня" : "дней";
  return days + " " + word + " назад";
}
