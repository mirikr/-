import React, { useMemo, useState } from "react";
import {
  bellState,
  dayKeyOf,
  lessonsAt,
  minutesOfTime,
  minutesWord,
  nextDayWith,
  nextSchoolDay,
  periodLabel,
  WEEK,
} from "./lyceum-now.js";
import { buildDay, dayCountLabel, timeOf } from "./school-timeline.js";
import { CompactDay, useNowMinutes } from "./school-day.jsx";

// Уроки на «Сегодня»: что идёт сейчас по звонкам и весь твой день лентой.
//
// Раньше на «Сегодня» было две карточки про одно и то же: «Сейчас» (урок по
// звонкам и что у всей параллели) и ниже «Сегодня в лицее» — список уроков
// строками, без пар, без «сейчас» и с тремя одновременными уроками подряд.
// Теперь это одна карточка: заголовок — где мы внутри дня, под ним — та же
// лента, что в «Лицее», только для чтения. Вечером лента — про завтра.
//
// Что у всей параллели — свёрнутой строкой внизу: спрашивают обычно не про
// своё расписание («а что у вас сейчас?»), но реже, чем про своё.
export default function NowCard({ entriesFor, tasksFor, homeworkOn, colorOf, kit, onOpen, onTasks, styles }) {
  const now = useNowMinutes();
  const [allOpen, setAllOpen] = useState(false);

  const dayKey = dayKeyOf(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const state = bellState(dayKey, nowMin);

  // «Первый в 08:30» по общей сетке бесполезно, если у тебя первым уроком
  // вторая пара. Поэтому время первого урока берётся из своего расписания, а
  // общая сетка остаётся запасным ответом — для тех, кто его ещё не выбрал.
  const myStarts = (key) =>
    (entriesFor(key) || [])
      .map((e) => e.start)
      .filter(Boolean)
      .sort();
  const mineToday = myStarts(dayKey);
  const hasOwn = WEEK.some((key) => myStarts(key).length > 0);
  const myNextDay = hasOwn ? nextDayWith(dayKey, (key) => myStarts(key).length > 0) : null;
  const myEnds = (entriesFor(dayKey) || []).map((e) => e.end).filter(Boolean).sort();
  // Что стоит первым: урок, олимпиада или экзамен — от этого зависят слова.
  // День, где только олимпиада, — не «уроки».
  const firstOf = (key) =>
    (entriesFor(key) || []).filter((e) => e.start).sort((a, b) => String(a.start).localeCompare(String(b.start)))[0] || null;
  const todayList = entriesFor(dayKey) || [];
  const me = {
    hasOwn,
    firstToday: mineToday[0] || null,
    firstTodayWhat: whatOf(firstOf(dayKey)),
    onlyExamsToday: todayList.length > 0 && todayList.every((e) => e.kind === "exam"),
    lastEndToday: myEnds[myEnds.length - 1] || null,
    next: myNextDay ? { when: myNextDay.when, start: myStarts(myNextDay.day)[0], what: whatOf(firstOf(myNextDay.day)) } : null,
  };

  // На перемене и до начала дня смотреть интересно уже на следующий урок:
  // перемена — это ожидание, а не пауза сама по себе.
  const shown = state.phase === "lesson" ? state.current : state.next || null;
  const rows = shown ? lessonsAt(dayKey, shown.n) : [];
  const mine = shown ? (entriesFor(dayKey) || []).filter((e) => e.start === shown.start) : [];

  // Вечером полезнее знать, что завтра, чем то, что уже отработано.
  const over =
    state.phase === "off" ||
    state.phase === "after" ||
    (me.hasOwn && (!me.firstToday || (me.lastEndToday && nowMin > minutesOfTime(me.lastEndToday))));

  const today = useMemo(() => buildDay(entriesFor(dayKey) || [], nowMin), [entriesFor, dayKey, nowMin]);

  // Следующий день со своими уроками — завтра или, в субботу вечером, понедельник.
  const later = useMemo(() => {
    if (!over || !hasOwn) return null;
    const start = new Date(now);
    for (let step = 1; step <= 7; step += 1) {
      const d = new Date(start);
      d.setDate(start.getDate() + step);
      const key = dayKeyOf(d);
      const list = entriesFor(key) || [];
      if (!list.length) continue;
      const iso = d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
      return { key, step, plan: buildDay(list), tasks: homeworkOn ? homeworkOn(iso) : [] };
    }
    return null;
  }, [over, hasOwn, now.toDateString(), entriesFor, homeworkOn]); // eslint-disable-line react-hooks/exhaustive-deps

  const head = headline(state, dayKey, me, nowMin);

  return (
    <section className="ap-card" style={styles.card}>
      <div style={styles.nowHead}>
        <span style={styles.nowTitle}>{head.title}</span>
        {head.note && <span style={styles.nowNote}>{head.note}</span>}
      </div>

      {!over && today.blocks.length > 0 && (
        <CompactDay blocks={today.blocks} kit={kit} colorOf={colorOf} tasksFor={tasksFor} onOpen={onOpen} />
      )}

      {!hasOwn && (
        <div style={styles.nowMineRow}>
          <span style={styles.nowMineMeta}>Своё расписание не выбрано — в «Лицее» его собирают за минуту.</span>
        </div>
      )}

      {later && (
        <div style={styles.nowLater}>
          <div style={styles.nowAllTitle}>
            {later.step === 1 ? "Завтра" : DAY_IN[later.key]} · {dayCountLabel(later.plan)} ·{" "}
            {timeOf(later.plan.from)}–{timeOf(later.plan.to)}
          </div>
          <CompactDay blocks={later.plan.blocks} kit={kit} colorOf={colorOf} tasksFor={tasksFor} onOpen={onOpen} />
          {/* Сами задания — в «Делах и сроках» сразу под этой карточкой (там же
              напоминание); здесь — строка, что к этому дню задано, со ссылкой туда. */}
          {(() => {
            const open = later.tasks.filter((h) => !h.done);
            if (!open.length) return null;
            const n = open.length;
            const word = n % 10 === 1 && n % 100 !== 11 ? "задание" : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? "задания" : "заданий";
            return (
              <button type="button" onClick={onTasks} style={styles.nowTasksLink} data-now-tasks>
                <span style={styles.nowTasksMark} aria-hidden="true">!</span>
                {later.step === 1 ? "К завтра" : "К этому дню"} задано: {n} {word}
                {open[0] && <span style={styles.nowMineMeta}> · {open.map((h) => h.subjectName || h.text).filter(Boolean).slice(0, 3).join(", ")}</span>}
                <span style={{ marginLeft: "auto" }}>↓</span>
              </button>
            );
          })()}
        </div>
      )}

      <div style={styles.nowFoot}>
        {rows.length > 0 && (
          <button type="button" onClick={() => setAllOpen(!allOpen)} style={styles.nowAllToggle} aria-expanded={allOpen}>
            <span aria-hidden="true">{allOpen ? "▾" : "▸"}</span>{" "}
            {state.phase === "lesson" ? "Сейчас у всей параллели" : "Следующим уроком у всей параллели"} · {rows.length}{" "}
            {subjectsWord(rows.length)}
          </button>
        )}
        {onOpen && (
          <button type="button" onClick={onOpen} style={styles.goLink}>
            {hasOwn ? "Всё расписание →" : "Собрать расписание →"}
          </button>
        )}
      </div>

      {allOpen && rows.length > 0 && (
        <div style={styles.nowAll}>
          {rows.map((row) => {
            const here = mine.find((e) => e.subjectName === row.subject);
            const info = here && kit ? kit.priorityInfo(here.priority) : null;
            return (
              <div
                key={row.subject}
                style={{
                  ...styles.nowAllRow,
                  ...styles.nowMark,
                  borderLeftColor: info ? info.strong : colorOf ? colorOf(row.subject) : "var(--line)",
                  background: info ? info.tint : "transparent",
                }}
              >
                <div style={styles.nowAllName}>
                  {row.subject}
                  {here && <span style={styles.nowMineTag}>у тебя</span>}
                  {row.who && <span style={styles.nowAllWho}>{row.who}</span>}
                </div>
                <div style={styles.nowAllItems}>
                  {row.items.map((it, i) => (
                    <span key={it.teacher + it.room + i} style={styles.nowAllItem}>
                      {it.teacher} · {it.room}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

const DAY_IN = {
  mon: "В понедельник",
  tue: "Во вторник",
  wed: "В среду",
  thu: "В четверг",
  fri: "В пятницу",
  sat: "В субботу",
  sun: "В воскресенье",
};

function headline(state, dayKey, me, nowMin) {
  const left = (n) => n + " " + minutesWord(n);
  // Когда уроков нет или они кончились, полезно не «их нет», а когда следующие
  // — и именно твои. Общая сетка отвечает только тем, кто расписание не выбрал.
  const later = () => {
    if (me.next) return me.next.what === "урок" ? `${me.next.when} твой первый в ${me.next.start}` : `${me.next.when} ${me.next.what} в ${me.next.start}`;
    if (me.hasOwn) return "";
    const day = nextSchoolDay(dayKey);
    return day ? `${day.when} первый урок в параллели в ${day.first.start}` : "";
  };
  if (state.phase === "off") return { title: "Сегодня уроков нет", note: later() };

  // Дальше — про свой день, а не про звонки лицея: в семь вечера у параллели
  // идёт вечерняя пара, а у тебя уроки кончились в одиннадцать, и «идёт
  // вечерняя пара» в заголовке — ответ не на тот вопрос. Что происходит у всех,
  // видно ниже, в списке.
  if (me.hasOwn) {
    if (!me.firstToday) return { title: "Сегодня у тебя уроков нет", note: later() };
    if (me.lastEndToday && nowMin > minutesOfTime(me.lastEndToday)) {
      return { title: me.onlyExamsToday ? "На сегодня у тебя всё" : "Твои уроки на сегодня закончились", note: later() };
    }
    if (nowMin < minutesOfTime(me.firstToday)) {
      const wait = minutesOfTime(me.firstToday) - nowMin;
      if (me.firstTodayWhat !== "урок") {
        const title = !me.onlyExamsToday
          ? "День ещё не начался"
          : me.firstTodayWhat === "олимпиада"
            ? "Олимпиада ещё не началась"
            : "Экзамен ещё не начался";
        return { title, note: `${me.firstTodayWhat} в ${me.firstToday}, через ${left(wait)}` };
      }
      return { title: "Уроки ещё не начались", note: `твой первый в ${me.firstToday}, через ${left(wait)}` };
    }
  }
  if (state.phase === "lesson") {
    return {
      title: "Идёт " + periodLabel(state.current.n),
      note: `${state.current.start}–${state.current.end} · осталось ${left(state.leftMin)}`,
    };
  }
  if (state.phase === "break") {
    // Полтора часа до вечерней пары — не перемена, и называть это переменой
    // значило бы обещать урок, которого у большинства не будет.
    if (state.long) {
      return { title: "Уроки закончились", note: `${periodLabel(state.next.n)} в ${state.next.start}` };
    }
    return { title: "Перемена", note: `до ${periodLabel(state.next.n)} ${left(state.leftMin)}` };
  }
  if (state.phase === "before") {
    return {
      title: "Уроки ещё не начались",
      note: `первый в параллели в ${state.next.start}, через ${left(state.leftMin)}`,
    };
  }
  return { title: "Уроки на сегодня закончились", note: later() };
}

const pad = (n) => String(n).padStart(2, "0");

// «урок», «олимпиада» или «экзамен» — как назвать запись в подписи.
function whatOf(entry) {
  if (!entry || entry.kind !== "exam") return "урок";
  return entry.examKind === "olympiad" ? "олимпиада" : "экзамен";
}


function subjectsWord(n) {
  const last = n % 10;
  const two = n % 100;
  if (two >= 11 && two <= 14) return "предметов";
  if (last === 1) return "предмет";
  if (last >= 2 && last <= 4) return "предмета";
  return "предметов";
}
