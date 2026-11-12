import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BOOKS, planToday } from "./books.js";

// Раздел «Учебники»: список учебников и планов, читалка поверх приложения.
//
// Чтение — тоже занятие: пока учебник открыт, идёт секундомер (на свёрнутой
// вкладке стоит), а при выходе предлагается записать время в дневник — в
// предмет, к которому относится открытый раздел. Отказаться можно: полистать
// учебник минуту — ещё не подготовка.

const pad = (n) => String(n).padStart(2, "0");
const clock = (s) => Math.floor(s / 60) + ":" + pad(s % 60);
export default function BooksScreen({ subjects, request, onRequestDone, onRecord, onMockTour, styles }) {
  const [openId, setOpenId] = useState("");
  const [hash, setHash] = useState("");
  const [menu, setMenu] = useState(false);
  const [seconds, setSeconds] = useState(0);
  // Окно «записать занятие»: null — закрыто.
  const [finish, setFinish] = useState(null);
  const frame = useRef(null);
  const book = BOOKS.find((b) => b.id === openId) || null;

  // Открыть учебник просят снаружи: карточка плана на «Сегодня», плитка тренажёра.
  useEffect(() => {
    if (!request) return;
    const target = BOOKS.find((b) => b.id === request.id) || BOOKS[0];
    setHash(request.hash || "");
    setSeconds(0);
    setOpenId(target.id);
    onRequestDone();
  }, [request, onRequestDone]);

  // Секундомер идёт, только пока учебник на экране.
  useEffect(() => {
    if (!book || finish) return undefined;
    const t = setInterval(() => {
      if (document.visibilityState === "visible") setSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(t);
  }, [book, finish]);

  useEffect(() => {
    if (!book) return undefined;
    const was = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = was;
    };
  }, [book]);

  function open(id, at) {
    setHash(at || "");
    setSeconds(0);
    setMenu(false);
    setOpenId(id);
  }

  // Раздел, на котором закрыли учебник: по нему подбирается предмет и подпись.
  function whereNow() {
    try {
      const win = frame.current && frame.current.contentWindow;
      const id = ((win && win.location.hash) || "").slice(1).split("-")[0];
      const h1 = win && win.document.querySelector("article:not([hidden]) h1");
      return { chapter: id, title: h1 ? h1.textContent : "" };
    } catch (e) {
      return { chapter: "", title: "" };
    }
  }

  function close() {
    setMenu(false);
    // Меньше минуты — не занятие, спрашивать не о чем.
    if (seconds < 60 || !subjects.length) {
      setOpenId("");
      return;
    }
    const at = whereNow();
    const wanted = book.subjects[at.chapter];
    const subject = subjects.find((s) => s.name === wanted) || subjects[0];
    setFinish({
      minutes: Math.max(1, Math.round(seconds / 60)),
      subjectId: subject.id,
      note: "Учебник" + (at.title ? ": " + at.title : ""),
    });
  }

  function record() {
    const minutes = Math.max(1, Math.round(Number(finish.minutes) || 0));
    onRecord({ subjectId: finish.subjectId, hours: Math.round((minutes / 60) * 100) / 100, note: finish.note.trim() || "Учебник" });
    setFinish(null);
    setOpenId("");
  }

  const today = planToday();

  return (
    <section className="ap-card" style={styles.card} data-books>
      {today && (
        <div style={S.today} data-plan-today>
          <div style={S.todayHead}>
            <span style={S.todayTitle}>Сегодня по плану</span>
            <span style={S.todayMeta}>
              {today.closed} из {today.items.length}{today.hours ? " · около " + String(today.hours).replace(".", ",") + " ч" : ""}
            </span>
          </div>
          <ul style={S.todayList}>
            {today.items.map((it, i) => (
              <li key={i}>{it.text}</li>
            ))}
          </ul>
          <button type="button" onClick={() => open(today.book, "home")} className="ap-btn" style={S.primary}>Открыть план в учебнике</button>
        </div>
      )}

      <div style={S.title}>Учебники и планы</div>
      <div style={S.list}>
        {BOOKS.map((b) => (
          <div key={b.id} style={S.book} data-book={b.id}>
            <div style={S.bookName}>{b.title}</div>
            <div style={S.bookNote}>{b.note}</div>
            <div style={S.bookRow}>
              <button type="button" onClick={() => open(b.id, "")} className="ap-btn" style={S.primary}>Читать</button>
              <button type="button" onClick={() => open(b.id, "home")} className="ap-row" style={S.ghost}>План, повторение и тренировки</button>
            </div>
          </div>
        ))}
      </div>

      <div style={S.title}>Тренировка на время</div>
      <button type="button" onClick={onMockTour} className="ap-row" style={S.row} data-mock-tour>
        <span>
          <b>Пробный первый тур · 40 минут</b>
          <br />
          <span style={S.rowNote}>задания муниципального этапа из тренажёра ВсОШ с обратным отсчётом и итогом из 100</span>
        </span>
        <span aria-hidden="true">›</span>
      </button>
      <p style={S.foot}>
        Время в учебнике считается секундомером; при выходе можно записать его как занятие — оно попадёт в дневник и в
        часы предмета. Новые учебники и наборы карточек будут появляться в этом разделе.
      </p>

      {book &&
        createPortal(
          <div style={S.layer} role="dialog" aria-modal="true" aria-label={"Учебник: " + book.title}>
            <div style={S.bar}>
              <button type="button" onClick={close} className="ap-row" style={S.close}>‹ Закрыть</button>
              <div style={S.pick}>
                <button type="button" onClick={() => setMenu(!menu)} aria-expanded={menu} aria-haspopup="true" className="ap-row" style={S.pickBtn} data-book-menu>
                  <span style={S.pickLabel}>Учебники и планы</span>
                  <span style={S.pickName}>{book.title} ▾</span>
                </button>
                {menu && (
                  <div role="menu" style={S.menu}>
                    {BOOKS.map((b) => (
                      <button
                        key={b.id}
                        type="button"
                        role="menuitemradio"
                        aria-checked={b.id === book.id}
                        onClick={() => (b.id === book.id ? setMenu(false) : open(b.id, ""))}
                        className="ap-row"
                        style={{ ...S.menuItem, ...(b.id === book.id ? S.menuOn : null) }}
                      >
                        <span style={S.menuName}>{b.id === book.id ? "✓ " : ""}{b.title}</span>
                        <span style={S.menuNote}>{b.note}</span>
                      </button>
                    ))}
                    <div style={S.menuFoot}>Учебники к следующим этапам и другим предметам появятся в этом списке.</div>
                  </div>
                )}
              </div>
              <span style={S.clock} aria-label="Время в учебнике" data-book-clock>{clock(seconds)}</span>
            </div>
            <iframe
              key={book.id + ":" + hash}
              ref={frame}
              title="Учебник к олимпиаде"
              src={import.meta.env.BASE_URL + book.src + (hash ? "#" + hash : "")}
              style={S.frame}
            />
            {finish && (
              <div style={S.veil}>
                <div style={S.sheet} role="dialog" aria-modal="true" aria-label="Записать занятие" data-book-finish>
                  <div style={S.sheetTitle}>Записать занятие?</div>
                  <p style={S.sheetText}>Время в учебнике можно засчитать как подготовку — оно попадёт в дневник и в часы предмета.</p>
                  <label style={S.field}>
                    Минут
                    <input
                      type="number"
                      min="1"
                      value={finish.minutes}
                      onChange={(e) => setFinish({ ...finish, minutes: e.target.value })}
                      style={S.input}
                      aria-label="Сколько минут записать"
                    />
                  </label>
                  <label style={S.field}>
                    Предмет
                    <select value={finish.subjectId} onChange={(e) => setFinish({ ...finish, subjectId: e.target.value })} style={S.input} aria-label="Предмет">
                      {subjects.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </label>
                  <label style={S.field}>
                    Что делал
                    <input value={finish.note} onChange={(e) => setFinish({ ...finish, note: e.target.value })} style={S.input} aria-label="Подпись занятия" />
                  </label>
                  <div style={S.sheetRow}>
                    <button type="button" onClick={record} className="ap-btn" style={S.primary}>Записать</button>
                    <button type="button" onClick={() => { setFinish(null); setOpenId(""); }} className="ap-row" style={S.ghost}>Не записывать</button>
                    <button type="button" onClick={() => setFinish(null)} className="ap-row" style={S.link}>Вернуться к учебнику</button>
                  </div>
                </div>
              </div>
            )}
          </div>,
          document.body,
        )}
    </section>
  );
}

const S = {
  title: { fontFamily: "var(--serif)", fontSize: 20, margin: "4px 0 10px" },
  today: {
    marginBottom: 18, padding: "14px 16px", borderRadius: 16, background: "var(--rail)", color: "var(--railInk)",
    display: "flex", flexDirection: "column", gap: 8,
  },
  todayHead: { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, flexWrap: "wrap" },
  todayTitle: { fontFamily: "var(--serif)", fontSize: 19 },
  todayMeta: { fontSize: 12.5, color: "var(--railInk2)" },
  todayList: { margin: 0, paddingLeft: 18, fontSize: 14, lineHeight: 1.5 },
  list: { display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", marginBottom: 18 },
  book: { border: "1px solid var(--line2)", borderRadius: 16, padding: 16, background: "var(--panel2)", display: "flex", flexDirection: "column", gap: 6 },
  bookName: { fontFamily: "var(--serif)", fontSize: 19 },
  bookNote: { fontSize: 13, color: "var(--ink3)", lineHeight: 1.45 },
  bookRow: { display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 },
  primary: {
    height: 42, padding: "0 18px", border: "none", borderRadius: 12, background: "var(--btnBg)", color: "var(--btnInk)",
    font: "inherit", fontSize: 14.5, fontWeight: 600, cursor: "pointer", alignSelf: "flex-start",
  },
  ghost: {
    height: 42, padding: "0 14px", border: "1px solid var(--line)", borderRadius: 12, background: "var(--panel)",
    color: "var(--ink)", font: "inherit", fontSize: 14, cursor: "pointer",
  },
  link: { height: 42, padding: "0 6px", border: "none", background: "none", color: "var(--ink3)", font: "inherit", fontSize: 14, cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 3 },
  row: {
    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, width: "100%", padding: "12px 14px",
    border: "1px solid var(--line)", borderRadius: 14, background: "var(--panel)", color: "var(--ink)", font: "inherit",
    fontSize: 14.5, textAlign: "left", cursor: "pointer",
  },
  rowNote: { fontSize: 12.5, color: "var(--ink3)" },
  foot: { fontSize: 12.5, color: "var(--mute)", lineHeight: 1.5, margin: "14px 0 0" },
  layer: {
    position: "fixed", inset: 0, zIndex: 60, display: "flex", flexDirection: "column", background: "var(--bg)",
    paddingTop: "env(safe-area-inset-top, 0px)", paddingBottom: "env(safe-area-inset-bottom, 0px)",
  },
  bar: {
    display: "flex", alignItems: "center", gap: 10, padding: "8px max(12px, env(safe-area-inset-right, 0px)) 8px max(12px, env(safe-area-inset-left, 0px))",
    borderBottom: "1px solid var(--line)", background: "var(--panel)",
  },
  close: {
    flex: "0 0 auto", height: 38, padding: "0 14px", border: "1px solid var(--line)", borderRadius: 10, background: "var(--panel2)",
    color: "var(--ink)", font: "inherit", fontSize: 14, fontWeight: 600, cursor: "pointer",
  },
  pick: { position: "relative", flex: 1, minWidth: 0 },
  pickBtn: {
    display: "flex", flexDirection: "column", alignItems: "flex-start", maxWidth: "100%", padding: "2px 6px",
    border: "none", background: "none", color: "var(--ink)", font: "inherit", textAlign: "left", cursor: "pointer",
  },
  pickLabel: { fontSize: 11.5, color: "var(--mute)" },
  pickName: { fontSize: 14.5, fontWeight: 600, maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  clock: {
    flex: "0 0 auto", padding: "5px 10px", borderRadius: 999, background: "var(--neutralBg)", fontSize: 13, fontWeight: 600,
    fontVariantNumeric: "tabular-nums", color: "var(--ink2)",
  },
  menu: {
    position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 2, width: "min(360px, calc(100vw - 24px))",
    display: "flex", flexDirection: "column", padding: 6, borderRadius: 14, border: "1px solid var(--line)",
    background: "var(--panel2)", boxShadow: "var(--shadow)",
  },
  menuItem: {
    display: "flex", flexDirection: "column", gap: 2, padding: "10px 12px", border: "none", borderRadius: 10,
    background: "none", color: "var(--ink)", font: "inherit", textAlign: "left", cursor: "pointer",
  },
  menuOn: { background: "var(--accentSoft)" },
  menuName: { fontSize: 14.5, fontWeight: 600 },
  menuNote: { fontSize: 12.5, color: "var(--ink3)" },
  menuFoot: { padding: "8px 12px 6px", fontSize: 12, color: "var(--mute)", lineHeight: 1.4 },
  frame: { flex: 1, width: "100%", border: "none", background: "var(--bg)" },
  veil: { position: "absolute", inset: 0, zIndex: 3, display: "flex", alignItems: "flex-end", justifyContent: "center", background: "rgba(0,0,0,.45)", padding: 12 },
  sheet: {
    width: "min(460px, 100%)", marginBottom: "env(safe-area-inset-bottom, 0px)", padding: 18, borderRadius: 18,
    background: "var(--panel2)", color: "var(--ink)", display: "flex", flexDirection: "column", gap: 10, boxShadow: "var(--shadow)",
  },
  sheetTitle: { fontFamily: "var(--serif)", fontSize: 22 },
  sheetText: { margin: 0, fontSize: 13.5, color: "var(--ink3)", lineHeight: 1.5 },
  field: { display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5, color: "var(--ink3)" },
  input: {
    height: 44, boxSizing: "border-box", padding: "0 12px", border: "1px solid var(--line)", borderRadius: 11,
    background: "var(--panel)", color: "var(--ink)", font: "inherit", fontSize: 16,
  },
  sheetRow: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 4 },
};
