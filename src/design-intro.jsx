import React, { useEffect } from "react";

// Разовое окно о новом дизайне. Приложение открывается уже в новом виде —
// окно объясняет, что случилось, и сразу даёт вернуть прежний: привычный
// интерфейс, поменявшийся без предупреждения, выглядит как поломка.
export default function DesignIntroDialog({ open, onKeep, onClassic, onNotes }) {
  useEffect(() => {
    if (!open) return;
    function onKey(e) {
      if (e.key === "Escape") onKeep();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onKeep]);

  if (!open) return null;

  return (
    <div style={styles.overlay} onClick={onKeep}>
      <div
        className="ap-dialog"
        style={styles.dialog}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="design-intro-title"
      >
        <img src={`${import.meta.env.BASE_URL}versions/1.0.0.png`} alt="" style={styles.shot} />
        <div style={styles.body}>
          <div style={styles.eyebrow}>Версия 1.0.0</div>
          <div id="design-intro-title" style={styles.title}>
            У ежедневника новый дизайн
          </div>
          <p style={styles.p}>
            Спокойнее цвета, крупнее заголовки, значки у разделов. На «Сегодня» сверху три числа дня — сколько
            записано, серия и неделя к плану, а запись занятия теперь отдельной карточкой.
          </p>
          <p style={styles.p}>Все записи на месте: поменялся только вид.</p>
          <p style={styles.note}>Вернуть прежний дизайн можно в любой момент: «Настройки» → «Дизайн».</p>
          <div style={styles.actions}>
            <button onClick={onKeep} style={styles.go} autoFocus>
              Отлично
            </button>
            <button onClick={onClassic} style={styles.later}>
              Вернуть прежний
            </button>
            <button onClick={onNotes} className="ap-version" style={styles.link}>
              Что изменилось
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
    maxWidth: 480,
    maxHeight: "88vh",
    display: "flex",
    flexDirection: "column",
    background: "var(--panel)",
    border: "1px solid var(--line)",
    borderRadius: 18,
    boxShadow: "0 18px 50px rgba(0,0,0,0.3)",
    color: "var(--ink)",
    overflow: "hidden",
  },
  shot: {
    display: "block",
    width: "100%",
    aspectRatio: "1180 / 820",
    objectFit: "cover",
    objectPosition: "left top",
    borderBottom: "1px solid var(--line)",
    background: "var(--bg)",
  },
  body: { padding: "18px 22px 20px", overflowY: "auto" },
  eyebrow: { fontSize: 12.5, color: "var(--accent)", fontWeight: 600, marginBottom: 4 },
  title: { fontFamily: "'PT Serif', Georgia, serif", fontSize: 23, lineHeight: 1.2, marginBottom: 10 },
  p: { fontSize: 14, lineHeight: 1.6, color: "var(--ink2)", margin: "0 0 10px" },
  note: { fontSize: 13, lineHeight: 1.55, color: "var(--ink3)", margin: "0 0 16px" },
  actions: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" },
  go: {
    border: "none",
    color: "var(--btnInk)",
    background: "var(--btnBg)",
    borderRadius: 10,
    minHeight: 40,
    padding: "0 18px",
    fontSize: 14,
    fontWeight: 600,
  },
  later: {
    border: "1px solid var(--line)",
    background: "var(--panel2)",
    color: "var(--ink2)",
    borderRadius: 10,
    minHeight: 40,
    padding: "0 16px",
    fontSize: 14,
    fontWeight: 600,
  },
  link: {
    border: "none",
    background: "none",
    color: "var(--ink3)",
    fontSize: 13,
    padding: "0 4px",
    textDecoration: "underline",
    textUnderlineOffset: 3,
    marginLeft: "auto",
  },
};
