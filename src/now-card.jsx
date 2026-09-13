import React, { useEffect, useState } from "react";
import { bellState, dayKeyOf, lessonsAt, minutesWord, nextSchoolDay, periodLabel } from "./lyceum-now.js";

// «Сейчас» на экране «Сегодня»: какой урок идёт по звонкам, что в это время
// стоит у тебя и что — у всей параллели.
//
// Вторая половина — не украшение: спрашивают обычно не про своё расписание.
// «А что у вас сейчас?» — и ответить нечего, если у друга другая академическая
// школа. Поэтому сетка берётся целиком, без фильтра по своему выбору.
export default function NowCard({ entriesFor, styles }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    // Полминуты: счётчик минут должен меняться вовремя, а чаще считать нечего.
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  const dayKey = dayKeyOf(now);
  const state = bellState(dayKey, now.getHours() * 60 + now.getMinutes());

  // На перемене и до начала дня смотреть интересно уже на следующий урок:
  // перемена — это ожидание, а не пауза сама по себе.
  const shown = state.phase === "lesson" ? state.current : state.next || null;
  const rows = shown ? lessonsAt(dayKey, shown.n) : [];
  const mine = shown ? (entriesFor(dayKey) || []).filter((e) => e.start === shown.start) : [];

  const head = headline(state, dayKey);

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
              <div key={e.id} style={styles.nowMineRow}>
                <span style={styles.nowMineTag}>{state.phase === "lesson" ? "у тебя" : "у тебя дальше"}</span>
                <span style={styles.nowMineName}>{e.subjectName}</span>
                {e.room && <span style={styles.nowMineMeta}>{e.room}</span>}
                {e.teacher && <span style={styles.nowMineMeta}>{e.teacher}</span>}
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

function headline(state, dayKey) {
  const left = (n) => n + " " + minutesWord(n);
  // Когда уроков нет или они кончились, полезно не «их нет», а когда следующие.
  const later = () => {
    const day = nextSchoolDay(dayKey);
    return day ? `${day.when} первый в ${day.first.start}` : "";
  };
  if (state.phase === "off") return { title: "Сегодня уроков нет", note: later() };
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
    return { title: "Уроки ещё не начались", note: `первый в ${state.next.start}, через ${left(state.leftMin)}` };
  }
  return { title: "Уроки на сегодня закончились", note: later() };
}
