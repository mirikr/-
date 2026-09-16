// Тренажёр и учёт занятий: время решения идёт в часы, а решённые задания
// продлевают серию.
//
// Раньше эти два учёта не встречались. Тренажёр вёл свой журнал попыток с
// настоящим секундомером, а цель дня, огонёк серии и диаграмма «Часы занятий»
// считались по дневнику — и решённые задания для них не существовали вовсе:
// решил тридцать штук, а день пустой.
//
// Здесь всё, что нужно, чтобы свести их вместе. Ничего не хранится: записи
// выводятся из журнала попыток на лету. Так их нельзя рассинхронизировать с
// самими попытками и нельзя случайно потерять при слиянии с облаком.

// Сколько заданий за день считается занятием. Порог у предметов разный не по
// прихоти: задание по физике или информатике — это счёт и разбор схемы на
// несколько минут, а по обществознанию куда чаще выбор суждений.
export const STREAK_GOAL = { Обществознание: 15, Физика: 5, Информатика: 5 };
export const STREAK_GOAL_DEFAULT = 15;

export function goalFor(subject) {
  return STREAK_GOAL[subject] || STREAK_GOAL_DEFAULT;
}

// Номер задания → предмет. Опись предметов лежит рядом с приложением и весит
// копейки, поэтому карта строится по ней, а не по самому набору заданий.
export function subjectsByTask(bankSubjects) {
  const map = new Map();
  (bankSubjects || []).forEach((s) => (s.ids || []).forEach((id) => map.set(id, s.name)));
  return map;
}

function dayOf(attempt) {
  return String(attempt.at || "").slice(0, 10);
}

// День за днём и предмет за предметом: сколько времени просидел и сколько
// разных заданий решал. Именно разных: одно и то же задание, отвеченное
// пятнадцать раз, — это одно задание, а не выполненная норма.
export function trainerDays(log, byTask) {
  const days = new Map();
  (log || []).forEach((a) => {
    const date = dayOf(a);
    const subject = byTask.get(a.taskId);
    if (!date || !subject) return;
    const key = date + "|" + subject;
    if (!days.has(key)) days.set(key, { date, subject, seconds: 0, tasks: new Set() });
    const day = days.get(key);
    day.seconds += Math.max(0, Number(a.seconds) || 0);
    day.tasks.add(a.taskId);
  });
  return [...days.values()]
    .map((d) => ({ date: d.date, subject: d.subject, seconds: d.seconds, solved: d.tasks.size, need: goalFor(d.subject) }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.subject.localeCompare(b.subject, "ru"));
}

// Записи для дневника — такие же, как у пройденного урока, только выведенные.
// Удалять их руками нельзя: они и есть журнал попыток, просто в другом виде.
export function trainerEntries(days, subjectIdByName) {
  return days
    .filter((d) => d.seconds > 0)
    .map((d) => ({
      id: "trainer:" + d.date + ":" + d.subject,
      date: d.date,
      subjectId: (subjectIdByName && subjectIdByName(d.subject)) || d.subject,
      // Имя предмета несём с собой: физики и информатики среди предметов
      // приложения может не быть вовсе — тогда по одному id её не назвать.
      subjectName: d.subject,
      hours: d.seconds / 3600,
      note: "Тренажёр: " + d.solved + " " + taskWord(d.solved),
      auto: true,
      fromTrainer: true,
    }));
}

export function taskWord(n) {
  const ten = n % 100;
  if (ten >= 11 && ten <= 14) return "заданий";
  const one = n % 10;
  if (one === 1) return "задание";
  if (one >= 2 && one <= 4) return "задания";
  return "заданий";
}

// Засчитан ли день тренажёром: хоть по одному предмету взят его порог.
export function dayCounts(days, date) {
  return days.some((d) => d.date === date && d.solved >= d.need);
}

// Что показать в предложении: по какому предмету сегодня ближе всего к порогу и
// сколько заданий осталось.
//
// Если сегодня ещё не решали, предмет подсказывает тренажёр — тот, который
// открывали последним. А если тренажёр не открывали вовсе, предложение всё
// равно должно быть: человеку, который ещё не начинал, оно нужнее всего.
// Тогда берём первый предмет описи — тот, к чему готовятся всерьёз.
export function offerFor(days, date, lastOpened, subjects) {
  const today = days.filter((d) => d.date === date);
  const started = today
    .slice()
    .sort((a, b) => b.solved / b.need - a.solved / a.need)[0];
  if (started) {
    return { subject: started.subject, solved: started.solved, need: started.need, left: Math.max(0, started.need - started.solved) };
  }
  const known = (subjects || []).map((x) => (typeof x === "string" ? x : x && x.name)).filter(Boolean);
  const subject = lastOpened && STREAK_GOAL[lastOpened] ? lastOpened : known.find((n) => STREAK_GOAL[n]) || known[0] || "";
  if (!subject) return null;
  return { subject, solved: 0, need: goalFor(subject), left: goalFor(subject) };
}

// Чем можно отделаться быстрее всего: самый низкий порог и по каким предметам.
// Нужно, чтобы предложение не выглядело неподъёмным, когда открыт предмет
// с порогом в пятнадцать заданий.
export function cheapestGoal(subjects, except) {
  const names = (subjects || [])
    .map((x) => (typeof x === "string" ? x : x && x.name))
    .filter((n) => n && n !== except && STREAK_GOAL[n]);
  if (!names.length) return null;
  const need = Math.min(...names.map((n) => STREAK_GOAL[n]));
  return { need, subjects: names.filter((n) => STREAK_GOAL[n] === need) };
}
