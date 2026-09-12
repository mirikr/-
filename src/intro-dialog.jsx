import React, { useEffect } from "react";

// Разовое окно после обновления. Готовое расписание не появляется само: пока
// школа не выбрана, раздел выглядит ровно так же, как до апдейта, — пустой
// сеткой. Об этом и говорит окно, иначе новая возможность просто не будет
// замечена.
export default function IntroDialog({ open, onClose, onGo }) {
  useEffect(() => {
    if (!open) return;
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div
        className="ap-dialog"
        style={styles.dialog}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Расписание лицея"
      >
        <div style={styles.head}>
          <div style={styles.title}>Расписание теперь собирается само</div>
          <button onClick={onClose} style={styles.close} title="Закрыть" aria-label="Закрыть">
            ✕
          </button>
        </div>
        <div style={styles.body}>
          <p style={styles.p}>
            В разделе «Лицей КЭО» появилось готовое расписание 3 курса. Выберите свою академическую школу, уровень
            английского и математики, группы и спецкурсы — и неделя заполнится сама: по звонкам, с кабинетами и
            преподавателями.
          </p>
          <p style={styles.p}>
            Рядом — график контрольных тестов КТ1: отметьте предметы, которые сдаёте, и тесты встанут в расписание с
            отсчётом и напоминанием в календаре.
          </p>
          <p style={styles.note}>
            Пока школа не выбрана, расписание остаётся пустым — само оно не появится. Уроки и экзамены, заведённые
            вручную, при этом никуда не денутся.
          </p>
          <div style={styles.actions}>
            <button onClick={onGo} style={styles.go}>
              Выбрать расписание
            </button>
            <button onClick={onClose} style={styles.later}>
              Позже
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: "fixed",
    inset: 0,
    zIndex: 120,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    background: "rgba(24, 22, 18, 0.45)",
    backdropFilter: "blur(5px)",
    WebkitBackdropFilter: "blur(5px)",
  },
  dialog: {
    width: "100%",
    maxWidth: 460,
    maxHeight: "86vh",
    display: "flex",
    flexDirection: "column",
    background: "var(--panel)",
    border: "1px solid var(--line)",
    borderRadius: 14,
    boxShadow: "0 18px 50px rgba(0,0,0,0.3)",
    color: "var(--ink)",
    overflow: "hidden",
  },
  head: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "14px 18px",
    borderBottom: "1px solid var(--line2)",
  },
  title: { fontFamily: "'PT Serif', Georgia, serif", fontSize: 19, flex: 1, minWidth: 0 },
  close: {
    border: "1px solid var(--line)",
    background: "var(--panel2)",
    color: "var(--ink2)",
    borderRadius: 8,
    width: 30,
    height: 30,
    fontSize: 13,
    lineHeight: 1,
    flexShrink: 0,
  },
  body: { padding: "14px 18px 18px", overflowY: "auto" },
  p: { fontSize: 13.5, lineHeight: 1.6, color: "var(--ink2)", margin: "0 0 10px" },
  note: { fontSize: 12.5, lineHeight: 1.55, color: "var(--ink3)", margin: "0 0 16px" },
  actions: { display: "flex", gap: 8, flexWrap: "wrap" },
  go: { border: "none", color: "var(--btnInk)", background: "var(--btnBg)", borderRadius: 9, padding: "9px 16px", fontSize: 13.5, fontWeight: 600 },
  later: {
    border: "1px solid var(--line)",
    background: "var(--panel2)",
    color: "var(--ink2)",
    borderRadius: 9,
    padding: "9px 16px",
    fontSize: 13.5,
    fontWeight: 600,
  },
};
