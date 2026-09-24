// Оболочка прежнего дизайна (как в 0.14.0): колонка, полоса вкладок и шапка
// экрана. Включается в «Настройках» переключателем «Дизайн: прежний» и нужна тем,
// кто ещё не привык к новому. Логика та же, что в shell.jsx, меняется только вид.
import React, { useState } from "react";
import SkebobNote from "./skebob.jsx";

// Левая колонка: переключатель темы, навигация по экранам и строка о синхронизации.
// Раньше всё приложение было одной длинной страницей со сворачиваемыми разделами:
// чтобы попасть в дневник, нужно было проскроллить расписание. Теперь разделы —
// экраны, и между ними переходят отсюда. На телефоне колонка ложится в полосу
// сверху и прокручивается вбок: место под неё там взять неоткуда.
export function Rail({ items, screen, onGo, mode, setMode, modeLabel, todayLabel, syncLine, syncNote, next, main, version, onOpenNotes }) {
  // Подвал колонки свёрнут в одну строку. Каждый день там нужно одно: на связи
  // облако или нет. Время последней синхронизации, подпись и номер версии
  // нужны раз в месяц — они под нажатием.
  const [footOpen, setFootOpen] = useState(false);

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
      <button className="ap-railbody ap-version" onClick={() => onGo("prefs")} style={styles.modeLabel}>
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

      {/* «Сегодня» — не такой же пункт, как остальные: с него начинают день и
          на него возвращаются. Поэтому он стоит отдельно, крупнее и отделён
          чертой от списка разделов. */}
      <nav style={styles.nav}>
        {items.map((item) => {
          const on = item.key === screen;
          const home = item.key === "today";
          return (
            <React.Fragment key={item.key}>
              <button
                // Цвет и подложка — в таблице стилей: инлайновый стиль перебивал :hover,
                // и подсветка под курсором не появлялась вовсе.
                className={"ap-nav" + (on ? " is-on" : "")}
                onClick={() => onGo(item.key)}
                style={home ? styles.navHome : styles.navBtn}
              >
                {item.label}
                {item.hint ? <span style={styles.navHint}>{item.hint}</span> : null}
              </button>
              {home && <div style={styles.navDivider} />}
            </React.Fragment>
          );
        })}
      </nav>

      <div className="ap-railbody" style={styles.railFoot}>
        <button
          onClick={() => setFootOpen(!footOpen)}
          className="ap-version"
          style={styles.footToggle}
          aria-expanded={footOpen}
          aria-label={footOpen ? "Свернуть подробности" : "Подробнее о синхронизации"}
          title={footOpen ? "Свернуть" : "Подробнее о синхронизации"}
        >
          <span style={{ color: syncNote ? (syncNote.ok ? "var(--green)" : "var(--red)") : "inherit" }}>
            {syncNote ? syncNote.text : syncLine}
          </span>
          <span style={styles.footSign} aria-hidden="true">{footOpen ? "−" : "+"}</span>
        </button>
        {footOpen ? (
          <>
            <div style={styles.footLine}>{syncLine}</div>
            <SkebobNote />
            {/* Номер версии заодно открывает историю изменений: иначе её никто не находит. */}
            <button onClick={onOpenNotes} className="ap-version" style={styles.version} title="Что изменилось">
              версия {version}
            </button>
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
const PRIMARY_TABS = ["today", "trainer", "journal", "school"];

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
                  <button onClick={account.onSignOut} style={styles.sheetAccountBtn}>
                    Выйти
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      setMore(false);
                      account.onOpen();
                    }}
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
                  onClick={() => go(item.key)}
                  style={item.key === screen ? styles.sheetBtnOn : styles.sheetBtn}
                >
                  {item.label}
                  {item.hint ? <span style={styles.sheetHint}>{item.hint}</span> : null}
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
                onGo("prefs");
              }}
              className="ap-version"
              style={{ ...styles.sheetNote, border: "none", background: "none", textAlign: "left", padding: 0 }}
            >
              {modeLabel} · изменить часы
            </button>
            <SkebobNote />
            <button
              onClick={() => {
                setMore(false);
                onOpenNotes();
              }}
              className="ap-version"
              style={{ ...styles.version, marginTop: 10 }}
            >
              версия {version} · что изменилось
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
export function ScreenHead({ title, note, date, badge, children }) {
  return (
    <div style={styles.head}>
      <div style={styles.headText}>
        <h1 style={styles.h1}>
          {title}
          {/* Пометка вроде ALPHA — рядом с названием раздела, а не абзацем под ним:
              так она видна всегда и занимает одну строку, а не пять. */}
          {badge && <span style={styles.headBadge}>{badge}</span>}
          {/* Число и день недели — рядом с заголовком: в колонке слева они есть,
              а на телефоне колонки нет, и календаря под рукой тоже. */}
          {date && <span style={styles.headDate}>{date}</span>}
        </h1>
        {note && <div className="ap-head-note" style={styles.note}>{note}</div>}
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
  navHome: { display: "flex", alignItems: "center", gap: 10, fontSize: 16.5, fontWeight: 600, textAlign: "left", whiteSpace: "nowrap" },
  navDivider: { height: 1, background: "var(--railActive)", margin: "6px 12px 8px" },
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
  footToggle: {
    display: "flex", alignItems: "center", gap: 8, width: "100%",
    border: "none", background: "none", padding: 0, textAlign: "left",
    fontSize: 12.5, color: "var(--railInk2)", cursor: "pointer",
  },
  footSign: { marginLeft: "auto", fontSize: 14, lineHeight: 1, opacity: 0.7 },
  footLine: { marginTop: 8, fontSize: 12.5, color: "var(--railInk2)" },
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
  sheetAccountBtn: {
    fontSize: 12.5,
    fontWeight: 600,
    flexShrink: 0,
    padding: "7px 12px",
    borderRadius: 999,
    border: "1px solid var(--railInk2)",
    background: "none",
    color: "var(--railInk)",
  },
  sheetGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 },
  // На телефоне подсветки под курсором нет, и разделы, нарисованные как строки
  // текста, сливались в один столбец. Поэтому каждый — своя плашка с границей:
  // видно, что это отдельная кнопка и куда по ней попадать пальцем.
  sheetBtn: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    minHeight: 46,
    padding: "10px 12px",
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--railActive)",
    background: "var(--railActive)",
    color: "var(--railInk2)",
    fontSize: 14,
    textAlign: "left",
  },
  sheetHint: { marginLeft: "auto", fontSize: 12, color: "var(--railInk2)", opacity: 0.75, whiteSpace: "nowrap" },
  sheetBtnOn: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    minHeight: 46,
    padding: "10px 12px",
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--accent)",
    background: "var(--railActive)",
    color: "var(--railInk)",
    fontSize: 14,
    fontWeight: 600,
    textAlign: "left",
  },
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
  headBadge: {
    marginLeft: 10, verticalAlign: "middle", display: "inline-block",
    fontFamily: "Inter, system-ui, sans-serif", fontSize: 11, fontWeight: 600, letterSpacing: "0.08em",
    padding: "3px 8px", borderRadius: 7, border: "1px solid var(--line)",
    background: "var(--panel2)", color: "var(--mute)", whiteSpace: "nowrap",
  },
  headDate: {
    fontFamily: "'PT Serif', Georgia, serif",
    fontSize: 24,
    color: "var(--ink3)",
    marginLeft: 12,
  },
  headSide: { display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" },
};
