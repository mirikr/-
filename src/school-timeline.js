// Лента дня в «Лицее»: из записей расписания — блоки по времени.
//
// Раньше день был списком записей как есть: два урока истории подряд — две
// одинаковые строки, а три пары в одно время (физкультура, социология,
// конституционное право) — три строки подряд, будто идти на все три. Здесь
// записи собираются в то, что человек на самом деле проживает за день:
//   • пара — два урока одного предмета у того же преподавателя подряд;
//   • выбор — уроки, которые идут одновременно: на один из них ходят, и какой
//     именно, человек отмечает сам (поле skip у остальных записей);
//   • перерыв — окно между уроками, о котором стоит сказать;
//   • «сейчас» — где мы внутри дня.

// Перемена внутри пары: седьмой и восьмой уроки идут через пять минут, первый
// и второй — через пятнадцать. Двадцать пять — с запасом, но меньше окна.
const PAIR_GAP = 25;
// Окно короче не показываем: обычная большая перемена — двадцать минут.
const GAP_SHOWN = 45;
// «Сейчас» показывается, когда до первого урока меньше часа: в семь утра линия
// над первым уроком ничего не говорит.
const NOW_LEAD = 60;

export function minutesOf(hhmm) {
  const m = String(hhmm || "").match(/^(\d{1,2}):(\d{2})$/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export function timeOf(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
}

// «2 ч 20 мин», «50 мин», «3 ч».
export function spanLabel(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return m + " мин";
  return m ? h + " ч " + m + " мин" : h + " ч";
}

const clean = (s) => String(s || "").trim();

function sameLesson(a, b) {
  return clean(a.subjectName) === clean(b.subjectName) && clean(a.teacher) === clean(b.teacher) && clean(a.room) === clean(b.room);
}

// Одна карточка: урок или пара. from/to — минуты от полуночи.
function unitOf(entries) {
  const first = entries[0];
  const last = entries[entries.length - 1];
  const from = minutesOf(first.start);
  const to = minutesOf(last.end);
  return {
    key: first.id,
    kind: first.kind === "exam" ? "exam" : "lesson",
    entries,
    subject: first.subjectName || "",
    start: first.start || "",
    end: last.end || "",
    from: from === null ? 0 : from,
    to: to === null ? (from === null ? 0 : from + 45) : to,
  };
}

const byStart = (a, b) => String(a.start).localeCompare(String(b.start)) || String(a.subjectName).localeCompare(String(b.subjectName));

// Уроки одного предмета подряд — в пару. Ищем не только среди последней
// карточки: в 14:05 идут три урока сразу, и физкультура в 14:50 должна
// приклеиться к своей физкультуре, а не к соседней социологии.
export function mergePairs(lessons) {
  const groups = [];
  [...lessons].sort(byStart).forEach((e) => {
    const from = minutesOf(e.start);
    const host = groups.find((g) => {
      const last = g[g.length - 1];
      const end = minutesOf(last.end);
      return sameLesson(last, e) && from !== null && end !== null && from >= end && from - end <= PAIR_GAP;
    });
    if (host) host.push(e);
    else groups.push([e]);
  });
  return groups.map(unitOf);
}

// Карточки, пересекающиеся по времени, — в кучки. Кучка из одной карточки —
// обычный урок, из нескольких — выбор.
function clusters(units) {
  const out = [];
  [...units]
    .sort((a, b) => a.from - b.from || a.to - b.to)
    .forEach((u) => {
      const last = out[out.length - 1];
      if (last && u.from < last.to) {
        last.units.push(u);
        last.to = Math.max(last.to, u.to);
      } else {
        out.push({ units: [u], from: u.from, to: u.to });
      }
    });
  return out;
}

// Внутри выбора карточки одного преподавателя в одном кабинете, идущие одна за
// другой, — это один вариант дня: конституционное право и за ним теория
// государства и права у того же преподавателя выбирают вместе, а не по одной.
function optionsOf(units) {
  const options = [];
  [...units]
    .sort((a, b) => a.from - b.from)
    .forEach((u) => {
      const head = u.entries[0];
      const host = options.find((o) => {
        const last = o.units[o.units.length - 1];
        const tail = last.entries[last.entries.length - 1];
        return (
          u.from >= last.to &&
          u.from - last.to <= PAIR_GAP &&
          clean(tail.teacher) &&
          clean(tail.teacher) === clean(head.teacher) &&
          clean(tail.room) === clean(head.room)
        );
      });
      if (host) host.units.push(u);
      else options.push({ units: [u] });
    });
  return options.map((o) => {
    const entries = o.units.flatMap((u) => u.entries);
    return {
      key: o.units[0].key,
      units: o.units,
      entries,
      ids: entries.map((e) => e.id),
      names: [...new Set(o.units.map((u) => u.subject))],
      from: o.units[0].from,
      to: o.units[o.units.length - 1].to,
      skipped: entries.every((e) => e.skip),
    };
  });
}

// Сколько уроков человек отсидит в этом блоке: у выбора — самый длинный
// вариант, у выбранного — только он.
function lessonCount(block) {
  if (block.type === "unit") return block.unit.entries.length;
  if (block.type === "picked") return block.option.entries.length;
  return Math.max(...block.options.map((o) => o.entries.length));
}

// Главная функция: записи одного дня → блоки ленты.
// entries — уроки и ближние экзамены этого дня (дальние экзамены лента не
// показывает). now — минуты от полуночи, если день сегодняшний, иначе null.
export function buildDay(entries, now = null) {
  const lessons = entries.filter((e) => e.kind !== "exam");
  const exams = entries.filter((e) => e.kind === "exam");
  const blocks = [];

  clusters(mergePairs(lessons)).forEach((c) => {
    if (c.units.length === 1) {
      // Одиночный урок не прячется, даже если помечен: иначе вернуть его
      // было бы неоткуда. Пометка остаётся от выбора, которого больше нет.
      blocks.push({ type: "unit", unit: c.units[0], from: c.from, to: c.to });
      return;
    }
    const options = optionsOf(c.units);
    const allIds = options.flatMap((o) => o.ids);
    if (options.length === 1) {
      options[0].units.forEach((u) => blocks.push({ type: "unit", unit: u, from: u.from, to: u.to }));
      return;
    }
    const open = options.filter((o) => !o.skipped);
    if (open.length === 1) {
      const picked = open[0];
      blocks.push({
        type: "picked",
        key: "picked-" + picked.key,
        option: picked,
        others: options.filter((o) => o !== picked),
        allIds,
        from: picked.from,
        to: picked.to,
      });
      return;
    }
    blocks.push({ type: "choice", key: "choice-" + options[0].key, options, allIds, from: c.from, to: c.to });
  });

  exams.forEach((e) => {
    const unit = unitOf([e]);
    blocks.push({ type: "unit", unit, from: unit.from, to: unit.to });
  });

  blocks.sort((a, b) => a.from - b.from || a.to - b.to);

  const out = [];
  blocks.forEach((b, i) => {
    const prev = blocks[i - 1];
    if (prev) {
      const gap = b.from - Math.max(...blocks.slice(0, i).map((x) => x.to));
      if (gap >= GAP_SHOWN) out.push({ type: "gap", key: "gap-" + i, minutes: gap, from: b.from - gap, to: b.from });
    }
    const state = now === null ? "" : b.to <= now ? "past" : b.from <= now ? "current" : "next";
    out.push({ ...b, key: b.key || b.unit.key, state });
  });

  // Линия «сейчас» — перед первым блоком, который ещё не начался. Перерывы
  // в счёт не идут: линия над перерывом значит «сейчас окно».
  if (now !== null && blocks.length) {
    const first = blocks[0].from;
    const last = Math.max(...blocks.map((b) => b.to));
    if (now >= first - NOW_LEAD && now < last) {
      let at = out.findIndex((b) => b.type !== "gap" && b.from > now);
      if (at > 0 && out[at - 1].type === "gap" && out[at - 1].from <= now) at -= 1;
      if (at === -1) at = out.length;
      out.splice(at, 0, { type: "now", key: "now", minutes: now });
    }
  }

  return {
    blocks: out,
    count: blocks.reduce((n, b) => n + lessonCount(b), 0),
    from: blocks.length ? blocks[0].from : null,
    to: blocks.length ? Math.max(...blocks.map((b) => b.to)) : null,
  };
}

// Что сейчас и что дальше — для заголовка карточки на «Сегодня».
export function dayStatus(day, now) {
  const real = day.blocks.filter((b) => b.type === "unit" || b.type === "picked" || b.type === "choice");
  if (!real.length) return { phase: "empty" };
  const current = real.find((b) => b.state === "current");
  const next = real.find((b) => b.from > now);
  if (now < real[0].from) return { phase: "before", next, leftMin: real[0].from - now };
  if (current) return { phase: "lesson", current, next, leftMin: current.to - now };
  if (next) return { phase: "break", next, leftMin: next.from - now };
  return { phase: "after" };
}

const DOW = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

// Даты дней недели (пн–вс), в которую попадает date.
export function weekDates(date) {
  const base = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const shift = (base.getDay() + 6) % 7;
  const out = {};
  for (let i = 0; i < 7; i += 1) {
    const d = new Date(base);
    d.setDate(base.getDate() - shift + i);
    out[DOW[d.getDay()]] = d;
  }
  return out;
}

// С какого дня открывать расписание: с сегодняшнего. Если сегодня день скрыт
// (воскресенье без уроков) — со следующего, что есть в неделе.
export function openingDay(todayKey, days) {
  if (days.includes(todayKey)) return todayKey;
  const at = DOW.indexOf(todayKey);
  for (let step = 1; step <= 7; step += 1) {
    const key = DOW[(at + step) % 7];
    if (days.includes(key)) return key;
  }
  return days[0];
}
