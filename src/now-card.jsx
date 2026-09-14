import React, { useEffect, useMemo, useState } from "react";
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

// «Сейчас» на экране «Сегодня»: какой урок идёт по звонкам, что в это время
// стоит у тебя и что — у всей параллели.
//
// Вторая половина — не украшение: спрашивают обычно не про своё расписание.
// «А что у вас сейчас?» — и ответить нечего, если у друга другая академическая
// школа. Поэтому сетка берётся целиком, без фильтра по своему выбору.
export default function NowCard({ entriesFor, tasksFor, homeworkOn, styles }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    // Полминуты: счётчик минут должен меняться вовремя, а чаще считать нечего.
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

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
  const me = {
    hasOwn,
    firstToday: mineToday[0] || null,
    lastEndToday: myEnds[myEnds.length - 1] || null,
    next: myNextDay ? { when: myNextDay.when, start: myStarts(myNextDay.day)[0] } : null,
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
  const tomorrow = useMemo(() => {
    if (!over) return null;
    const next = new Date(now);
    next.setDate(next.getDate() + 1);
    const key = dayKeyOf(next);
    const iso = next.getFullYear() + "-" + pad(next.getMonth() + 1) + "-" + pad(next.getDate());
    const lessons = [...(entriesFor(key) || [])].sort((a, b) => String(a.start).localeCompare(String(b.start)));
    return { lessons, tasks: homeworkOn ? homeworkOn(iso) : [] };
  }, [over, now, entriesFor, homeworkOn]);

  const head = headline(state, dayKey, me, nowMin);

  return (
    <section className="ap-card" style={styles.card}>
      <div style={styles.nowHead}>
        <span style={styles.nowTitle}>{head.title}</span>
        {head.note && <span style={styles.nowNote}>{head.note}</span>}
      </div>

      {shown && (
        <div style={styles.nowMine}>
          {mine.length ? (
            mine.map((e) => (
              <div key={e.id}>
                <div style={styles.nowMineRow}>
                  <span style={styles.nowMineTag}>{state.phase === "lesson" ? "у тебя" : "у тебя дальше"}</span>
                  <span style={styles.nowMineName}>{e.subjectName}</span>
                  {e.room && <span style={styles.nowMineMeta}>{e.room}</span>}
                  {e.teacher && <span style={styles.nowMineMeta}>{e.teacher}</span>}
                </div>
                {/* Задание к этому же уроку — здесь, а не в отдельном списке:
                    «что задали на сейчас» спрашивают вместе с «что сейчас». */}
                {(tasksFor ? tasksFor(e.id) : []).map((h) => (
                  <div key={h.id} style={styles.nowTaskRow}>
                    <span style={{ ...styles.nowTaskText, textDecoration: h.done ? "line-through" : "none" }}>
                      задано: {h.text}
                    </span>
                    {h.minutes ? <span style={styles.nowMineMeta}>{h.minutes} мин</span> : null}
                  </div>
                ))}
              </div>
            ))
          ) : (
            <div style={styles.nowMineRow}>
              <span style={styles.nowMineTag}>у тебя</span>
              <span style={styles.nowMineMeta}>
                {entriesFor(dayKey).length ? "в это время окно" : "расписание не выбрано — раздел «Лицей»"}
              </span>
            </div>
          )}
        </div>
      )}

      {over && tomorrow && (
        <div style={styles.nowAll}>
          <div style={styles.nowAllTitle}>Завтра</div>
          {tomorrow.lessons.length === 0 ? (
            <div style={styles.nowMineMeta}>уроков нет</div>
          ) : (
            <>
              <div style={styles.nowMineRow}>
                <span style={styles.nowMineName}>
                  {tomorrow.lessons.length} {lessonsWord(tomorrow.lessons.length)}
                </span>
                <span style={styles.nowMineMeta}>
                  с {tomorrow.lessons[0].start} до {tomorrow.lessons[tomorrow.lessons.length - 1].end}
                </span>
              </div>
              <div style={styles.nowAllItems}>
                {tomorrow.lessons.map((e) => (
                  <span key={e.id} style={styles.nowAllItem}>
                    {e.start} {e.subjectName}
                  </span>
                ))}
              </div>
            </>
          )}
          {tomorrow.tasks.length > 0 && (
            <div style={styles.nowTomorrowTasks}>
              {tomorrow.tasks.map((h) => (
                <div key={h.id} style={styles.nowTaskRow}>
                  <span style={{ ...styles.nowTaskText, textDecoration: h.done ? "line-through" : "none" }}>
                    задано: {h.text}
                  </span>
                  {h.subjectName ? <span style={styles.nowMineMeta}>{h.subjectName}</span> : null}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {rows.length > 0 && (
        <div style={styles.nowAll}>
          <div style={styles.nowAllTitle}>
            {state.phase === "lesson" ? "Сейчас идут уроки" : "Следующим уроком"}
          </div>
          {rows.map((row) => (
            <div key={row.subject} style={styles.nowAllRow}>
              <div style={styles.nowAllName}>
                {row.subject}
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
          ))}
        </div>
      )}
    </section>
  );
}

function headline(state, dayKey, me, nowMin) {
  const left = (n) => n + " " + minutesWord(n);
  // Когда уроков нет или они кончились, полезно не «их нет», а когда следующие
  // — и именно твои. Общая сетка отвечает только тем, кто расписание не выбрал.
  const later = () => {
    if (me.next) return `${me.next.when} твой первый в ${me.next.start}`;
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
      return { title: "Твои уроки на сегодня закончились", note: later() };
    }
    if (nowMin < minutesOfTime(me.firstToday)) {
      const wait = minutesOfTime(me.firstToday) - nowMin;
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

function lessonsWord(n) {
  const last = n % 10;
  const two = n % 100;
  if (two >= 11 && two <= 14) return "уроков";
  if (last === 1) return "урок";
  if (last >= 2 && last <= 4) return "урока";
  return "уроков";
}
