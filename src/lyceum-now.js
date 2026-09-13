// Что идёт в лицее прямо сейчас — по звонкам и по всей сетке параллели.
//
// Своё расписание у человека уже есть, но спрашивают обычно не про своё:
// «а что у вас сейчас?» — и ответить нечего, если у друга другая академическая
// школа или другая группа. Поэтому здесь берётся вся сетка целиком, без
// фильтра по выбору: сейчас у кого-то геометрия, у кого-то история, и видно
// оба урока сразу.
import { BELLS, SLOTS, SCHOOLS } from "./lyceum-schedule-10.js";

// Вечерние пары идут после девятого урока, поэтому порядок задан руками:
// сортировка по номеру положила бы «e1» не туда.
const ORDER = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "e1", "e2"];

const SCHOOL_SHORT = {
  math: "матшкола",
  biz: "бизнес",
  med: "медицина",
  law: "право",
  hum: "гуманитарии",
};

export function minutesOfTime(hhmm) {
  const [h, m] = String(hhmm || "").split(":");
  const hours = Number(h);
  const mins = Number(m);
  if (!Number.isFinite(hours) || !Number.isFinite(mins)) return null;
  return hours * 60 + mins;
}

// Номера уроков, которые в этот день вообще есть: в субботу их шесть, и «после
// уроков» наступает не в половине пятого, а сразу после последнего.
export function periodsOfDay(dayKey) {
  const has = new Set(SLOTS.filter((s) => s.day === dayKey).map((s) => String(s.n)));
  return ORDER.filter((n) => has.has(n))
    .map((n) => {
      const bell = BELLS[n] || BELLS[Number(n)];
      if (!bell) return null;
      return { n, start: bell[0], end: bell[1], from: minutesOfTime(bell[0]), to: minutesOfTime(bell[1]) };
    })
    .filter(Boolean);
}

// Где мы внутри учебного дня. Четыре состояния, и у каждого свой смысл:
// до первого звонка, урок, перемена, всё закончилось. Выходной — отдельно:
// в этот день звонков нет вовсе.
export const LONG_BREAK = 30;

export function bellState(dayKey, minutes) {
  const periods = periodsOfDay(dayKey);
  if (!periods.length) return { phase: "off" };
  const first = periods[0];
  const last = periods[periods.length - 1];
  if (minutes < first.from) return { phase: "before", next: first, leftMin: first.from - minutes };
  if (minutes > last.to) return { phase: "after", prev: last };
  for (let i = 0; i < periods.length; i += 1) {
    const p = periods[i];
    if (minutes >= p.from && minutes <= p.to) {
      return { phase: "lesson", current: p, next: periods[i + 1] || null, leftMin: p.to - minutes };
    }
    const nextOne = periods[i + 1];
    if (nextOne && minutes > p.to && minutes < nextOne.from) {
      // Между девятым уроком и вечерней парой полтора часа — это не перемена,
      // и называть это переменой значило бы обещать урок, которого не будет.
      const gap = nextOne.from - p.to;
      return { phase: "break", prev: p, next: nextOne, leftMin: nextOne.from - minutes, long: gap > LONG_BREAK };
    }
  }
  return { phase: "after", prev: last };
}

function whoLabel(slot) {
  const who = slot.who || {};
  if (who.spec) return "спецкурс";
  if (who.sch) {
    const list = [].concat(who.sch);
    // Все пять школ — это и есть вся параллель, перечислять их незачем.
    if (list.length >= SCHOOLS.length) return "";
    return list.map((id) => SCHOOL_SHORT[id] || id).join(", ");
  }
  if (who.v) return "по группам";
  return "";
}

// Все уроки этой клетки, собранные по предметам: у одного предмета бывает три
// преподавателя в трёх кабинетах, и три отдельные строки читались бы как три
// разных урока.
export function lessonsAt(dayKey, n) {
  const key = String(n);
  const groups = new Map();
  for (const slot of SLOTS) {
    if (slot.day !== dayKey || String(slot.n) !== key) continue;
    if (!groups.has(slot.subject)) groups.set(slot.subject, { subject: slot.subject, who: whoLabel(slot), items: [] });
    const group = groups.get(slot.subject);
    group.items.push({ teacher: slot.teacher, room: slot.room });
    if (!group.who) group.who = whoLabel(slot);
  }
  return [...groups.values()];
}

export function periodLabel(n) {
  if (n === "e1" || n === "e2") return "вечерняя пара";
  return n + "-й урок";
}

export function minutesWord(n) {
  const last = n % 10;
  const two = n % 100;
  if (two >= 11 && two <= 14) return "минут";
  if (last === 1) return "минута";
  if (last >= 2 && last <= 4) return "минуты";
  return "минут";
}

const DOW_TO_KEY = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export function dayKeyOf(date) {
  return DOW_TO_KEY[date.getDay()];
}

const DAY_IN = {
  mon: "в понедельник",
  tue: "во вторник",
  wed: "в среду",
  thu: "в четверг",
  fri: "в пятницу",
  sat: "в субботу",
  sun: "в воскресенье",
};

// Ближайший день, про который что-то есть. Что именно «есть» — решает тот, кто
// спрашивает: у своего расписания и у общей сетки выходные не совпадают.
export function nextDayWith(fromDayKey, has) {
  const start = DOW_TO_KEY.indexOf(fromDayKey);
  if (start < 0) return null;
  for (let step = 1; step <= 7; step += 1) {
    const key = DOW_TO_KEY[(start + step) % 7];
    if (has(key)) return { day: key, when: step === 1 ? "завтра" : DAY_IN[key] };
  }
  return null;
}

// Когда сегодня уроков нет или они кончились, полезнее всего знать не то, что
// их нет, а когда следующие.
export function nextSchoolDay(fromDayKey) {
  const found = nextDayWith(fromDayKey, (key) => periodsOfDay(key).length > 0);
  return found ? { ...found, first: periodsOfDay(found.day)[0] } : null;
}

export const WEEK = ["mon", "tue", "wed", "thu", "fri", "sat"];
