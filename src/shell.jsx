import React from "react";

// Левая колонка: переключатель темы, навигация по экранам и строка о синхронизации.
// Раньше всё приложение было одной длинной страницей со сворачиваемыми разделами:
// чтобы попасть в дневник, нужно было проскроллить расписание. Теперь разделы —
// экраны, и между ними переходят отсюда. На телефоне колонка ложится в полосу
// сверху и прокручивается вбок: место под неё там взять неоткуда.
export function Rail({ items, screen, onGo, mode, setMode, modeLabel, todayLabel, syncLine, syncNote }) {
  return (
    <aside className="ap-rail" style={styles.rail}>
      <div style={styles.modeSwitch}>
        <button
          onClick={() => setMode("light")}
          title="Светлая тема"
          style={{ ...styles.modePill, ...(mode === "light" ? styles.modePillOn : null) }}
        >
          ☀
        </button>
        <button
          onClick={() => setMode("night")}
          title="Ночная тема"
          style={{ ...styles.modePill, ...(mode === "night" ? styles.modePillOn : null) }}
        >
          ☾
        </button>
        <button
          onClick={() => setMode("auto")}
          title="Ночная тема вечером и ночью"
          style={{ ...styles.modePill, flex: 1.6, fontSize: 12.5, fontWeight: 600, ...(mode === "auto" ? styles.modePillOn : null) }}
        >
          Авто
        </button>
      </div>
      <div className="ap-railbody" style={styles.modeLabel}>
        {modeLabel}
      </div>

      <div className="ap-railbody" style={styles.railHead}>
        <div style={styles.railTitle}>
          Ежедневник
          <br />
          лицеиста
        </div>
        <div style={styles.railToday}>{todayLabel}</div>
      </div>

      <nav style={styles.nav}>
        {items.map((item) => {
          const on = item.key === screen;
          return (
            <button
              key={item.key}
              className="ap-nav"
              onClick={() => onGo(item.key)}
              style={{
                ...styles.navBtn,
                borderLeftColor: on ? "var(--accent)" : "transparent",
                background: on ? "var(--railActive)" : "transparent",
                color: on ? "var(--railInk)" : "var(--railInk2)",
                fontWeight: on ? 600 : 400,
              }}
            >
              {item.label}
              {item.hint ? <span style={styles.navHint}>{item.hint}</span> : null}
            </button>
          );
        })}
      </nav>

      <div className="ap-railbody" style={styles.railFoot}>
        {syncLine}
        {syncNote ? (
          <>
            <br />
            <span style={{ color: syncNote.ok ? "var(--green)" : "var(--red)" }}>{syncNote.text}</span>
          </>
        ) : null}
      </div>
    </aside>
  );
}

// Шапка экрана: где мы и что здесь делают.
export function ScreenHead({ title, note, children }) {
  return (
    <div style={styles.head}>
      <div style={styles.headText}>
        <h1 style={styles.h1}>{title}</h1>
        {note && <div style={styles.note}>{note}</div>}
      </div>
      {children ? <div style={styles.headSide}>{children}</div> : null}
    </div>
  );
}

const styles = {
  rail: {
    width: 232,
    flexShrink: 0,
    background: "var(--rail)",
    color: "var(--railInk)",
    padding: "16px 12px 22px",
    display: "flex",
    flexDirection: "column",
    gap: 18,
  },
  modeSwitch: { display: "flex", alignItems: "center", gap: 4, background: "var(--railActive)", borderRadius: 999, padding: 3 },
  modePill: {
    flex: 1,
    minHeight: 32,
    border: "none",
    borderRadius: 999,
    background: "transparent",
    color: "var(--railInk2)",
    fontSize: 15,
  },
  modePillOn: { background: "var(--accent)", color: "var(--accentInk)" },
  modeLabel: { fontSize: 11.5, color: "var(--railInk2)", marginTop: -12, padding: "0 6px", lineHeight: 1.45, opacity: 0.85 },
  railHead: { padding: "0 6px" },
  railTitle: { fontFamily: "'PT Serif', Georgia, serif", fontSize: 22, lineHeight: 1.15 },
  railToday: { fontSize: 12.5, color: "var(--railInk2)", marginTop: 6 },
  nav: { display: "flex", flexDirection: "column", gap: 2 },
  navBtn: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 12px",
    borderRadius: 8,
    border: "none",
    borderLeft: "3px solid transparent",
    fontSize: 14.5,
    textAlign: "left",
    whiteSpace: "nowrap",
  },
  navHint: { marginLeft: "auto", fontSize: 12, color: "var(--railInk2)", paddingLeft: 10 },
  railFoot: {
    marginTop: "auto",
    borderTop: "1px solid var(--railActive)",
    paddingTop: 12,
    paddingLeft: 6,
    fontSize: 12.5,
    color: "var(--railInk2)",
    lineHeight: 1.55,
  },
  head: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 20,
    flexWrap: "wrap",
    marginBottom: 18,
  },
  headText: { minWidth: 0 },
  h1: { fontFamily: "'PT Serif', Georgia, serif", fontSize: 30, margin: 0, fontWeight: 400, lineHeight: 1.15 },
  note: { fontSize: 14, color: "var(--ink3)", marginTop: 5, lineHeight: 1.5 },
  headSide: { display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" },
};
