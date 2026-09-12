import React, { useState } from "react";

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
          className={"ap-pill" + (mode === "light" ? " is-on" : "")}
          style={styles.modePill}
        >
          ☀
        </button>
        <button
          onClick={() => setMode("night")}
          title="Ночная тема"
          className={"ap-pill" + (mode === "night" ? " is-on" : "")}
          style={styles.modePill}
        >
          ☾
        </button>
        <button
          onClick={() => setMode("auto")}
          title="Ночная тема вечером и ночью"
          className={"ap-pill" + (mode === "auto" ? " is-on" : "")}
          style={{ ...styles.modePill, flex: 1.6, fontSize: 12.5, fontWeight: 600 }}
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
              // Цвет и подложка — в таблице стилей: инлайновый стиль перебивал :hover,
              // и подсветка под курсором не появлялась вовсе.
              className={"ap-nav" + (on ? " is-on" : "")}
              onClick={() => onGo(item.key)}
              style={styles.navBtn}
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


// Нижняя панель вкладок — как в обычных приложениях на телефоне: большой палец
// достаёт до неё, не дотягиваясь до верха экрана. Разделов восемь, в полосу
// помещается пять, поэтому редкие спрятаны за «Ещё» — вместе с переключателем
// темы, которому на телефоне места в шапке нет.
const PRIMARY_TABS = ["today", "school", "journal", "study"];

export function TabBar({ items, screen, onGo, mode, setMode, modeLabel }) {
  const [more, setMore] = useState(false);
  const primary = PRIMARY_TABS.map((key) => items.find((i) => i.key === key)).filter(Boolean);
  const rest = items.filter((i) => !PRIMARY_TABS.includes(i.key));
  const restActive = rest.some((i) => i.key === screen);

  function go(key) {
    setMore(false);
    onGo(key);
  }

  return (
    <>
      {more && <div style={styles.sheetBackdrop} onClick={() => setMore(false)} />}
      <div className="ap-tabbar" style={styles.tabbar}>
        {more && (
          <div style={styles.sheet}>
            <div style={styles.sheetGrid}>
              {rest.map((item) => (
                <button
                  key={item.key}
                  className={"ap-nav" + (item.key === screen ? " is-on" : "")}
                  onClick={() => go(item.key)}
                  style={styles.sheetBtn}
                >
                  {item.label}
                  {item.hint ? <span style={styles.navHint}>{item.hint}</span> : null}
                </button>
              ))}
            </div>
            <div style={styles.sheetModes}>
              <button
                onClick={() => setMode("light")}
                className={"ap-pill" + (mode === "light" ? " is-on" : "")}
                style={styles.modePill}
                title="Светлая тема"
              >
                ☀
              </button>
              <button
                onClick={() => setMode("night")}
                className={"ap-pill" + (mode === "night" ? " is-on" : "")}
                style={styles.modePill}
                title="Ночная тема"
              >
                ☾
              </button>
              <button
                onClick={() => setMode("auto")}
                className={"ap-pill" + (mode === "auto" ? " is-on" : "")}
                style={{ ...styles.modePill, flex: 1.6, fontSize: 12.5, fontWeight: 600 }}
              >
                Авто
              </button>
            </div>
            <div style={styles.sheetNote}>{modeLabel}</div>
          </div>
        )}

        <div style={styles.tabRow}>
          {primary.map((item) => {
            const on = item.key === screen;
            return (
              <button
                key={item.key}
                className={"ap-tab" + (on ? " is-on" : "")}
                onClick={() => go(item.key)}
                style={styles.tab}
              >
                <span className="ap-tab-mark" style={styles.tabMark} />
                {item.short || item.label}
              </button>
            );
          })}
          <button
            className={"ap-tab" + (more || restActive ? " is-on" : "")}
            onClick={() => setMore(!more)}
            style={styles.tab}
          >
            <span className="ap-tab-mark" style={styles.tabMark} />
            Ещё
          </button>
        </div>
      </div>
    </>
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
  modePill: { flex: 1, minHeight: 32, border: "none", borderRadius: 999, fontSize: 15 },
  modeLabel: { fontSize: 11.5, color: "var(--railInk2)", marginTop: -12, padding: "0 6px", lineHeight: 1.45, opacity: 0.85 },
  railHead: { padding: "0 6px" },
  railTitle: { fontFamily: "'PT Serif', Georgia, serif", fontSize: 22, lineHeight: 1.15 },
  railToday: { fontSize: 12.5, color: "var(--railInk2)", marginTop: 6 },
  nav: { display: "flex", flexDirection: "column", gap: 2 },
  navBtn: { display: "flex", alignItems: "center", gap: 10, fontSize: 14.5, textAlign: "left", whiteSpace: "nowrap" },
  navHint: { marginLeft: "auto", fontSize: 12, color: "var(--railInk2)", paddingLeft: 10, whiteSpace: "nowrap" },
  railFoot: {
    marginTop: "auto",
    borderTop: "1px solid var(--railActive)",
    paddingTop: 12,
    paddingLeft: 6,
    fontSize: 12.5,
    color: "var(--railInk2)",
    lineHeight: 1.55,
  },
  tabbar: {
    position: "fixed",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 30,
    background: "var(--rail)",
    borderTop: "1px solid var(--railActive)",
    paddingBottom: "env(safe-area-inset-bottom)",
  },
  tabRow: { display: "flex" },
  tab: { flex: 1, minWidth: 0, fontSize: 12, lineHeight: 1.2, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 },
  tabMark: { width: 22, height: 3, borderRadius: 999 },
  sheetBackdrop: { position: "fixed", inset: 0, background: "rgba(0,0,0,.35)", zIndex: 29 },
  sheet: { borderBottom: "1px solid var(--railActive)", padding: "12px 12px 10px" },
  sheetGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 10 },
  sheetBtn: { display: "flex", alignItems: "center", gap: 8, fontSize: 14, textAlign: "left" },
  sheetModes: { display: "flex", alignItems: "center", gap: 4, background: "var(--railActive)", borderRadius: 999, padding: 3 },
  sheetNote: { fontSize: 11.5, color: "var(--railInk2)", marginTop: 8, lineHeight: 1.45 },
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
