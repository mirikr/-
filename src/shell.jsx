import React, { useState } from "react";

// Левая колонка: переключатель темы, навигация по экранам и строка о синхронизации.
// Раньше всё приложение было одной длинной страницей со сворачиваемыми разделами:
// чтобы попасть в дневник, нужно было проскроллить расписание. Теперь разделы —
// экраны, и между ними переходят отсюда. На телефоне колонка ложится в полосу
// сверху и прокручивается вбок: место под неё там взять неоткуда.
export function Rail({ items, screen, onGo, mode, setMode, modeLabel, todayLabel, syncLine, syncNote, next, main, version, onOpenNotes }) {
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
      {/* Подпись ведёт в «Оформление»: там границы ночи и задаются. */}
      <button className="ap-railbody ap-version" onClick={() => onGo("settings")} style={styles.modeLabel}>
        {modeLabel}
      </button>

      <div className="ap-railbody" style={styles.railHead}>
        <div style={styles.railTitle}>
          Ежедневник
          <br />
          лицеиста
        </div>
        <div style={styles.railToday}>{todayLabel}</div>
        <Countdowns next={next} main={main} tone="rail" />
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
        {/* Номер версии заодно открывает историю изменений: иначе её никто не находит. */}
        <button onClick={onOpenNotes} className="ap-version" style={styles.version} title="Что изменилось">
          бета {version}
        </button>
      </div>
    </aside>
  );
}


// Нижняя панель вкладок — как в обычных приложениях на телефоне: большой палец
// достаёт до неё, не дотягиваясь до верха экрана. Разделов восемь, в полосу
// помещается пять, поэтому редкие спрятаны за «Ещё» — вместе с переключателем
// темы, которому на телефоне места в шапке нет.
const PRIMARY_TABS = ["today", "school", "journal", "study"];

export function TabBar({ items, screen, onGo, mode, setMode, modeLabel, account, version, onOpenNotes }) {
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
            {/* Состояние аккаунта — первым делом: на телефоне колонки с ним нет,
                а знать, ушли ли записи в облако, важнее всего именно здесь. */}
            {account && (
              <div style={styles.sheetAccount}>
                <span style={{ ...styles.sheetDot, background: account.signedIn ? "var(--green)" : "var(--railInk2)" }} />
                <span style={styles.sheetAccountText}>
                  {account.signedIn ? account.email || "вход выполнен" : "Вход не выполнен — записи только на этом устройстве"}
                </span>
                {account.signedIn ? (
                  <button onClick={account.onSignOut} className="ap-nav" style={styles.sheetAccountBtn}>
                    Выйти
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      setMore(false);
                      account.onOpen();
                    }}
                    className="ap-nav"
                    style={styles.sheetAccountBtn}
                  >
                    Войти
                  </button>
                )}
              </div>
            )}
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
            <button
              onClick={() => {
                setMore(false);
                onGo("settings");
              }}
              className="ap-version"
              style={{ ...styles.sheetNote, border: "none", background: "none", textAlign: "left", padding: 0 }}
            >
              {modeLabel} · изменить часы
            </button>
            <button
              onClick={() => {
                setMore(false);
                onOpenNotes();
              }}
              className="ap-version"
              style={{ ...styles.version, marginTop: 10 }}
            >
              бета {version} · что изменилось
            </button>
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


// Два отсчёта: до ближайшего события и до того, по которому считается план.
// Обычно это одно и то же событие, и тогда карточка одна — вторая появляется,
// когда впереди что-то мелкое, а план считается до большого экзамена дальше.
export function Countdowns({ next, main, tone }) {
  if (!next) return null;
  const rail = tone === "rail";
  const same = main && main.id === next.id;
  const card = rail ? styles.cdCardRail : styles.cdCard;

  return (
    <div style={styles.cdRow}>
      <div className={rail ? undefined : "ap-card"} style={card}>
        <div style={styles.cdNum}>{next.days}</div>
        <div style={styles.cdLabel}>{next.word} {same ? "· план" : "до ближайшего"}</div>
        <div style={styles.cdName}>{next.name}</div>
      </div>
      {!same && main && (
        <div className={rail ? undefined : "ap-card"} style={{ ...card, borderColor: "var(--warmLine)" }}>
          <div style={{ ...styles.cdNum, color: "var(--gold)" }}>{main.days}</div>
          <div style={styles.cdLabel}>{main.word} · план</div>
          <div style={styles.cdName}>{main.name}</div>
        </div>
      )}
    </div>
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
  modeLabel: {
    display: "block",
    width: "100%",
    border: "none",
    background: "none",
    textAlign: "left",
    fontSize: 11.5,
    color: "var(--railInk2)",
    marginTop: -12,
    padding: "0 6px",
    lineHeight: 1.45,
    opacity: 0.85,
  },
  railHead: { padding: "0 6px" },
  railTitle: { fontFamily: "'PT Serif', Georgia, serif", fontSize: 22, lineHeight: 1.15 },
  railToday: { fontSize: 12.5, color: "var(--railInk2)", marginTop: 6 },
  nav: { display: "flex", flexDirection: "column", gap: 2 },
  navBtn: { display: "flex", alignItems: "center", gap: 10, fontSize: 14.5, textAlign: "left", whiteSpace: "nowrap" },
  navHint: { marginLeft: "auto", fontSize: 12, color: "var(--railInk2)", paddingLeft: 10, whiteSpace: "nowrap" },
  version: {
    display: "block",
    marginTop: 10,
    border: "none",
    background: "none",
    padding: 0,
    fontSize: 11.5,
    color: "var(--railInk2)",
    textDecoration: "underline",
    textAlign: "left",
  },
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
  sheetAccount: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 10px",
    marginBottom: 10,
    borderRadius: 9,
    background: "var(--railActive)",
    fontSize: 12.5,
    color: "var(--railInk2)",
  },
  sheetDot: { width: 8, height: 8, borderRadius: "50%", flexShrink: 0 },
  sheetAccountText: { flex: 1, minWidth: 0, lineHeight: 1.35 },
  sheetAccountBtn: { fontSize: 12.5, fontWeight: 600, flexShrink: 0 },
  sheetGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 10 },
  sheetBtn: { display: "flex", alignItems: "center", gap: 8, fontSize: 14, textAlign: "left" },
  sheetModes: { display: "flex", alignItems: "center", gap: 4, background: "var(--railActive)", borderRadius: 999, padding: 3 },
  sheetNote: { fontSize: 11.5, color: "var(--railInk2)", marginTop: 8, lineHeight: 1.45 },
  cdRow: { display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 },
  cdCard: {
    background: "var(--panel)",
    border: "1px solid var(--line)",
    borderRadius: 11,
    padding: "10px 14px",
    textAlign: "center",
    minWidth: 112,
  },
  cdCardRail: {
    background: "var(--railActive)",
    border: "1px solid transparent",
    borderRadius: 11,
    padding: "9px 10px",
    textAlign: "center",
    flex: "1 1 96px",
    minWidth: 0,
  },
  cdNum: { fontFamily: "'PT Serif', Georgia, serif", fontSize: 26, lineHeight: 1 },
  cdLabel: { fontSize: 10.5, opacity: 0.75, marginTop: 3, whiteSpace: "nowrap" },
  cdName: { fontSize: 11.5, marginTop: 4, lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis" },
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
