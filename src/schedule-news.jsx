import React, { useEffect } from "react";

// Окно «Расписание лицея изменилось». Раньше о пересборке говорила строчка
// внизу — «Расписание лицея обновлено: добавилось 12, убралось 9», — которая
// через несколько секунд исчезала, и было непонятно ни что поменялось, ни
// куда делись задания. Теперь — отдельное окно: что сохранилось, какие
// задания куда переехали и что нужно выбрать заново. Оно висит, пока его не
// закроют, и переживает перезагрузку (запись — в localStorage).
//
// news: { lessons, days, moves: [{ id, subject, text, from, to }], need: [строки], changed: [предметы] }
const WEEK = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];
const MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];

export function shortDate(isoDate) {
  const [y, m, d] = String(isoDate).split("-").map(Number);
  if (!y) return String(isoDate || "");
  const dt = new Date(y, m - 1, d);
  return WEEK[dt.getDay()] + ", " + d + " " + MONTHS[m - 1];
}

export default function ScheduleNews({ news, onClose, onPick }) {
  useEffect(() => {
    if (!news) return undefined;
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [news, onClose]);

  if (!news) return null;
  const moves = news.moves || [];
  const need = news.need || [];

  return (
    <div style={S.overlay} onClick={onClose}>
      <div
        className="ap-dialog"
        style={S.dialog}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Расписание лицея изменилось"
      >
        <div style={S.head}>
          <div style={S.title}>Расписание лицея изменилось</div>
          <button onClick={onClose} style={S.close} title="Закрыть" aria-label="Закрыть">
            ✕
          </button>
        </div>
        <div style={S.body}>
          <p style={S.p}>
            Лицей перешёл на новую сетку, и уроки расставлены по ней заново: {news.lessons} {lessonsWord(news.lessons)} в
            неделю. Ваша школа, группы и треки сохранились — выбирать заново не нужно. Важность уроков, тетради и
            предметы остались прежними.
          </p>

          {need.length > 0 && (
            <div style={S.need}>
              <div style={S.needTitle}>Нужно выбрать</div>
              {need.map((n) => (
                <div key={n} style={S.needRow}>
                  {n}
                </div>
              ))}
              {onPick && (
                <button onClick={onPick} style={S.go}>
                  Выбрать
                </button>
              )}
            </div>
          )}

          <div style={S.section}>
            {moves.length ? (
              <>
                <div style={S.sectionTitle}>
                  Перенесено {moves.length} {tasksWord(moves.length)} — на новые уроки своих предметов
                </div>
                <div style={S.moves}>
                  {moves.map((m) => (
                    <div key={m.id} style={S.move} data-news-move={m.id}>
                      <div style={S.moveSubject}>{m.subject}</div>
                      {m.text && <div style={S.moveText}>{m.text}</div>}
                      <div style={S.moveDates}>
                        <s style={S.from}>{shortDate(m.from)}</s> → <b>{shortDate(m.to)}</b>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div style={S.sectionTitle}>Переносить задания не пришлось — их уроки остались на своих местах.</div>
            )}
          </div>

          <div style={S.actions}>
            <button onClick={onClose} style={need.length && onPick ? S.later : S.go}>
              Понятно
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function plural(n, one, few, many) {
  const a = n % 10;
  const b = n % 100;
  if (a === 1 && b !== 11) return one;
  if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return few;
  return many;
}
const lessonsWord = (n) => plural(n, "урок", "урока", "уроков");
const tasksWord = (n) => plural(n, "задание", "задания", "заданий");

const S = {
  overlay: {
    position: "fixed", inset: 0, zIndex: 130, display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
    background: "rgba(24, 22, 18, 0.45)", backdropFilter: "blur(5px)", WebkitBackdropFilter: "blur(5px)",
  },
  dialog: {
    width: "100%", maxWidth: 520, maxHeight: "86vh", display: "flex", flexDirection: "column",
    background: "var(--menuBg, var(--panel))", border: "1px solid var(--line)", borderRadius: 16,
    boxShadow: "0 18px 50px rgba(0,0,0,0.3)", color: "var(--ink)", overflow: "hidden",
  },
  head: { display: "flex", alignItems: "center", gap: 12, padding: "16px 20px", borderBottom: "1px solid var(--line2)" },
  title: { fontFamily: "var(--serif)", fontSize: 21, flex: 1, minWidth: 0 },
  close: {
    border: "1px solid var(--line)", background: "transparent", color: "var(--ink2)", borderRadius: 9,
    width: 34, height: 34, fontSize: 13, lineHeight: 1, flexShrink: 0, cursor: "pointer",
  },
  body: { padding: "16px 20px 20px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 14 },
  p: { fontSize: 14, lineHeight: 1.6, color: "var(--ink2)", margin: 0 },
  need: { padding: "12px 14px", borderRadius: 12, background: "var(--warmBg)", border: "1px solid var(--warmLine)", display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start" },
  needTitle: { fontSize: 12, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--warmInk)" },
  needRow: { fontSize: 14, color: "var(--ink)" },
  section: { display: "flex", flexDirection: "column", gap: 8 },
  sectionTitle: { fontSize: 13.5, fontWeight: 600, color: "var(--ink)" },
  moves: { display: "flex", flexDirection: "column", gap: 6 },
  move: { padding: "9px 12px", borderRadius: 10, background: "var(--neutralBg)", display: "flex", flexDirection: "column", gap: 2 },
  moveSubject: { fontSize: 13.5, fontWeight: 600 },
  moveText: { fontSize: 13, color: "var(--ink2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  moveDates: { fontSize: 13, color: "var(--ink2)" },
  from: { color: "var(--mute)" },
  actions: { display: "flex", gap: 8, flexWrap: "wrap" },
  go: { border: "none", color: "var(--btnInk)", background: "var(--btnBg)", borderRadius: 10, minHeight: 40, padding: "0 18px", fontSize: 14, fontWeight: 600, cursor: "pointer" },
  later: { border: "1px solid var(--line)", background: "transparent", color: "var(--ink2)", borderRadius: 10, minHeight: 40, padding: "0 18px", fontSize: 14, fontWeight: 600, cursor: "pointer" },
};
