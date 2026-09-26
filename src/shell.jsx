import React, { useState } from "react";
import SkebobNote from "./skebob.jsx";

// Значки разделов. Раньше пункты меню были одними словами, и восемь строк
// подряд читались сплошным столбцом: глазу не за что было зацепиться. Значок
// у каждого свой и одинаковый в колонке и в полосе вкладок на телефоне.
// Рисуются линией в цвет текста, поэтому сами знают про тему и подсветку.
const ICON_PATHS = {
  today: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4" />
    </>
  ),
  events: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </>
  ),
  journal: (
    <>
      <path d="M5 4.5h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z" />
      <path d="M5 17.5a3 3 0 0 1 3-3h11" />
    </>
  ),
  study: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="1" />
    </>
  ),
  trainer: (
    <>
      <path d="M9 11.5l2.2 2.2L15.5 9" />
      <rect x="4" y="3.5" width="16" height="17" rx="2.5" />
    </>
  ),
  notes: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M9 3v18M12.5 8h3.5M12.5 12h3.5" />
    </>
  ),
  school: <path d="M3 20.5h18M5 20.5V10l7-5 7 5v10.5M10 20.5v-5h4v5" />,
  budget: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 3.5V12l6 6" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" />
    </>
  ),
  settings: <path d="M20 11a8 8 0 0 0-14.3-4.9L4 8M4 4v4h4M4 13a8 8 0 0 0 14.3 4.9L20 16M20 20v-4h-4" />,
  prefs: (
    <>
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  more: <path d="M4 7h16M4 12h16M4 17h16" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M4.6 19.4L6 18M18 6l1.4-1.4" />
    </>
  ),
  moon: <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />,
  plus: <path d="M12 5v14M5 12h14" />,
};

export function Icon({ name, size = 18, strokeWidth = 1.7 }) {
  const body = ICON_PATHS[name];
  if (!body) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ flexShrink: 0, display: "block" }}
    >
      {body}
    </svg>
  );
}

// Разделы колонки собраны в группы по тому, как ими пользуются: первые три
// открывают каждый день, дальше — учёба, ниже — лицей и план недели. Подпись
// группы не повторяет название раздела в ней: «Подготовка» над «Подготовкой»
// читалась как опечатка. Поиск стоит над списком полем, а синхронизация и
// настройки — в подвале: это не разделы, куда ходят, а инструменты.
const RAIL_GROUPS = [
  { label: null, keys: ["today", "events", "journal"] },
  // Тетради — сразу за «Подготовкой»: это одна работа, конспект к пройденному уроку.
  { label: "Учёба", keys: ["study", "notes", "trainer"] },
  { label: "Лицей и план", keys: ["school", "budget"] },
];
const RAIL_APART = ["search", "settings", "prefs"];

function ThemeSwitch({ mode, setMode }) {
  return (
    <div role="group" aria-label="Тема" style={styles.modeSwitch}>
      <button
        type="button"
        onClick={() => setMode("light")}
        title="Светлая тема"
        aria-label="Светлая тема"
        aria-pressed={mode === "light"}
        className={"ap-pill" + (mode === "light" ? " is-on" : "")}
        style={styles.modeIcon}
      >
        <Icon name="sun" size={15} strokeWidth={1.8} />
      </button>
      <button
        type="button"
        onClick={() => setMode("night")}
        title="Ночная тема"
        aria-label="Ночная тема"
        aria-pressed={mode === "night"}
        className={"ap-pill" + (mode === "night" ? " is-on" : "")}
        style={styles.modeIcon}
      >
        <Icon name="moon" size={15} strokeWidth={1.8} />
      </button>
      <button
        type="button"
        onClick={() => setMode("auto")}
        title="Ночная тема вечером и ночью"
        aria-pressed={mode === "auto"}
        className={"ap-pill" + (mode === "auto" ? " is-on" : "")}
        style={styles.modeAuto}
      >
        Авто
      </button>
    </div>
  );
}

function NavButton({ item, on, onGo }) {
  // У событий в подсказке число — оно встаёт кружком, как счётчик
  // непрочитанного; у остальных подсказка — просто подпись справа.
  const badge = item.key === "events" && item.hint;
  return (
    <button
      type="button"
      // Цвет и подложка — в таблице стилей: инлайновый стиль перебивал :hover,
      // и подсветка под курсором не появлялась вовсе.
      className={"ap-nav" + (on ? " is-on" : "")}
      onClick={() => onGo(item.key)}
      aria-current={on ? "page" : undefined}
      style={styles.navBtn}
    >
      <Icon name={item.key} />
      <span style={styles.navLabel}>{item.label}</span>
      {badge ? (
        <span style={styles.navBadge} title={item.hint}>{String(item.hint).split(" ")[0]}</span>
      ) : item.hint ? (
        <span style={styles.navHint}>{item.hint}</span>
      ) : null}
    </button>
  );
}

// Левая колонка: название, поиск, разделы группами, отсчёт до события и подвал
// с облаком и темой. Раньше переключатель темы стоял первой строкой, над
// названием, — самое заметное место занимала настройка, которую трогают раз в
// месяц. Теперь наверху то, ради чего открывают приложение.
export function Rail({ items, screen, onGo, mode, setMode, modeLabel, todayLabel, syncLine, syncNote, next, main, version, onOpenNotes }) {
  // Подвал колонки свёрнут в одну строку. Каждый день там нужно одно: на связи
  // облако или нет. Время последней синхронизации, подпись и номер версии
  // нужны раз в месяц — они под нажатием.
  const [footOpen, setFootOpen] = useState(false);
  const byKey = new Map(items.map((i) => [i.key, i]));
  const grouped = new Set(RAIL_GROUPS.flatMap((g) => g.keys).concat(RAIL_APART));
  // Раздел, который появится позже и в группы не попал, не пропадает: он
  // встаёт в конец последней группы.
  const groups = RAIL_GROUPS.map((g, i) => ({
    ...g,
    items: g.keys
      .map((k) => byKey.get(k))
      .filter(Boolean)
      .concat(i === RAIL_GROUPS.length - 1 ? items.filter((it) => !grouped.has(it.key)) : []),
  }));
  const search = byKey.get("search");
  const settings = byKey.get("settings");
  const prefs = byKey.get("prefs");
  const dot = syncNote ? (syncNote.ok ? "var(--green)" : "var(--red)") : "var(--railInk2)";

  return (
    <aside className="ap-rail" style={styles.rail}>
      <div style={styles.brand}>
        {/* Та же иконка, что на экране «Домой»: приложение узнаётся по ней,
            а не по букве. Колонка тёмная в обеих темах — берём тёмный вариант. */}
        <img src={`${import.meta.env.BASE_URL}icon-192.png?v=2`} alt="" width="40" height="40" style={styles.brandMark} />
        <div style={{ minWidth: 0 }}>
          <div style={styles.railTitle}>Ежедневник лицеиста</div>
          <div style={styles.railToday}>{todayLabel}</div>
        </div>
      </div>

      {search && (
        <button
          type="button"
          className={"ap-search" + (screen === "search" ? " is-on" : "")}
          onClick={() => onGo("search")}
          aria-current={screen === "search" ? "page" : undefined}
          style={styles.searchBtn}
        >
          <Icon name="search" size={16} />
          <span>Поиск</span>
        </button>
      )}

      <nav aria-label="Разделы" style={styles.nav}>
        {groups.map((g, i) =>
          g.items.length ? (
            <div key={i} style={styles.navGroup}>
              {g.label && <div style={styles.navGroupLabel}>{g.label}</div>}
              {g.items.map((item) => (
                <NavButton key={item.key} item={item} on={item.key === screen} onGo={onGo} />
              ))}
            </div>
          ) : null
        )}
      </nav>

      <div style={styles.railSpacer} />

      <Countdowns next={next} main={main} tone="rail" />

      <div className="ap-railbody" style={styles.railFoot}>
        {/* Синхронизация и настройки — рядом, но порознь: облако проверяют
            каждый день, а тему и установку трогают раз в месяц, поэтому
            настройкам хватает кнопки-шестерёнки. */}
        <div style={styles.footTools}>
          {settings && (
            <button
              type="button"
              className={"ap-nav" + (screen === "settings" ? " is-on" : "")}
              onClick={() => onGo("settings")}
              aria-current={screen === "settings" ? "page" : undefined}
              style={{ ...styles.navBtn, flex: 1, minWidth: 0 }}
            >
              <span style={{ ...styles.syncDot, background: dot }} aria-hidden="true" />
              {/* Состояние облака — подписью под названием: каждый день нужно
                  знать одно, ушли ли записи, и видно это без нажатия. */}
              <span style={styles.syncText}>
                <span>{settings.label}</span>
                <span style={styles.syncSub}>{syncNote ? syncNote.text : syncLine}</span>
              </span>
              {settings.hint ? <span style={{ ...styles.navHint, color: "var(--red)" }}>{settings.hint}</span> : null}
            </button>
          )}
          {prefs && (
            <button
              type="button"
              className={"ap-nav" + (screen === "prefs" ? " is-on" : "")}
              onClick={() => onGo("prefs")}
              aria-current={screen === "prefs" ? "page" : undefined}
              aria-label={prefs.label}
              title={prefs.label}
              style={styles.gearBtn}
            >
              <Icon name="prefs" size={19} />
            </button>
          )}
        </div>
        <div style={styles.footRow}>
          <ThemeSwitch mode={mode} setMode={setMode} />
          <button
            type="button"
            onClick={() => setFootOpen(!footOpen)}
            className="ap-version"
            style={styles.footToggle}
            aria-expanded={footOpen}
            title={footOpen ? "Свернуть" : "Время синхронизации и версия"}
          >
            <span style={styles.footText}>{footOpen ? "свернуть" : "подробнее"}</span>
            <span style={styles.footSign} aria-hidden="true">{footOpen ? "−" : "+"}</span>
          </button>
        </div>
        {footOpen ? (
          <div style={styles.footMore}>
            <div>{syncLine}</div>
            {/* Подпись ведёт в «Оформление»: там границы ночи и задаются. */}
            <button type="button" className="ap-version" onClick={() => onGo("prefs")} style={styles.footLink}>
              {modeLabel}
            </button>
            <SkebobNote />
            {/* Номер версии заодно открывает историю изменений: иначе её никто не находит. */}
            <button type="button" onClick={onOpenNotes} className="ap-version" style={styles.footLink} title="Что изменилось">
              версия {version} · что изменилось
            </button>
          </div>
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
                  <Icon name={item.key} />
                  <span style={{ minWidth: 0 }}>{item.label}</span>
                  {item.hint ? <span style={styles.sheetHint}>{item.hint}</span> : null}
                </button>
              ))}
            </div>
            <div style={styles.sheetThemeRow}>
              <ThemeSwitch mode={mode} setMode={setMode} />
              <button
                onClick={() => {
                  setMore(false);
                  onGo("prefs");
                }}
                className="ap-version"
                style={styles.sheetNote}
              >
                {modeLabel} · изменить часы
              </button>
            </div>
            <SkebobNote />
            <button
              onClick={() => {
                setMore(false);
                onOpenNotes();
              }}
              className="ap-version"
              style={{ ...styles.footLink, marginTop: 10 }}
            >
              версия {version} · что изменилось
            </button>
          </div>
        )}

        <nav aria-label="Разделы" style={styles.tabRow}>
          {primary.map((item) => {
            const on = item.key === screen;
            return (
              <button
                key={item.key}
                className={"ap-tab" + (on ? " is-on" : "")}
                onClick={() => go(item.key)}
                aria-current={on ? "page" : undefined}
                style={styles.tab}
              >
                <span className="ap-tab-mark" style={styles.tabMark}>
                  <Icon name={item.key} size={20} />
                </span>
                {item.short || item.label}
              </button>
            );
          })}
          <button
            className={"ap-tab" + (more || restActive ? " is-on" : "")}
            onClick={() => setMore(!more)}
            aria-expanded={more}
            style={styles.tab}
          >
            <span className="ap-tab-mark" style={styles.tabMark}>
              <Icon name="more" size={20} />
            </span>
            Ещё
          </button>
        </nav>
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
    <div style={rail ? styles.cdColumn : styles.cdRow}>
      <div className={rail ? undefined : "ap-card"} style={card}>
        <div style={styles.cdLabel}>{same ? "до события · план" : "до ближайшего"}</div>
        <div style={styles.cdBig}>
          <span style={styles.cdNum}>{next.days}</span>
          <span style={styles.cdWord}>{next.word}</span>
        </div>
        <div style={styles.cdName}>{next.name}</div>
      </div>
      {!same && main && (
        <div className={rail ? undefined : "ap-card"} style={card}>
          <div style={styles.cdLabel}>до события · план</div>
          <div style={styles.cdBig}>
            <span style={{ ...styles.cdNum, color: "var(--gold)" }}>{main.days}</span>
            <span style={styles.cdWord}>{main.word}</span>
          </div>
          <div style={styles.cdName}>{main.name}</div>
        </div>
      )}
    </div>
  );
}

// Шапка экрана: где мы и что здесь делают. Дата стоит строкой над названием:
// рядом с ним в одну строку она спорила с заголовком за размер.
export function ScreenHead({ title, note, date, badge, children }) {
  return (
    <div style={styles.head}>
      <div style={styles.headText}>
        {date && <div style={styles.headDate}>{date}</div>}
        <h1 style={styles.h1}>
          {title}
          {/* Пометка вроде ALPHA — рядом с названием раздела, а не абзацем под ним:
              так она видна всегда и занимает одну строку, а не пять. */}
          {badge && <span style={styles.headBadge}>{badge}</span>}
        </h1>
        {note && <div className="ap-head-note" style={styles.note}>{note}</div>}
      </div>
      {children ? <div style={styles.headSide}>{children}</div> : null}
    </div>
  );
}

const styles = {
  rail: {
    width: 248,
    flexShrink: 0,
    background: "var(--rail)",
    color: "var(--railInk)",
    padding: "18px 14px 14px",
    display: "flex",
    flexDirection: "column",
    gap: 14,
    // Колонка стоит на месте, пока экран прокручивается: раньше на длинном
    // дневнике она уезжала вверх вместе с ним, и за разделом приходилось
    // возвращаться к началу страницы.
    position: "sticky",
    top: 0,
    height: "100vh",
    overflowY: "auto",
    // На невысоком экране колонка прокручивается, и в Windows её полоса
    // прокрутки отъедала ширину — «Распределение» обрезалось до «Распределе…».
    // Прокрутка остаётся, полоса не рисуется (для WebKit — в таблице стилей).
    scrollbarWidth: "none",
  },
  brand: { display: "flex", alignItems: "center", gap: 12, padding: "0 6px" },
  brandMark: {
    width: 40,
    height: 40,
    borderRadius: 10,
    flexShrink: 0,
    display: "block",
    boxShadow: "0 0 0 1px var(--railActive)",
  },
  footTools: { display: "flex", alignItems: "stretch", gap: 4 },
  gearBtn: {
    width: 44,
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
  },
  railTitle: { fontFamily: "var(--serif)", fontSize: 17, lineHeight: 1.2 },
  railToday: { fontSize: 12.5, color: "var(--railInk2)", marginTop: 3 },
  searchBtn: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    width: "100%",
    minHeight: 40,
    padding: "0 12px",
    borderRadius: 10,
    border: "1px solid var(--railActive)",
    fontSize: 14,
    textAlign: "left",
  },
  nav: { display: "flex", flexDirection: "column", gap: 10 },
  navGroup: { display: "flex", flexDirection: "column", gap: 2 },
  navGroupLabel: {
    padding: "0 12px 4px",
    fontSize: 11.5,
    letterSpacing: "0.07em",
    textTransform: "uppercase",
    color: "var(--railInk2)",
  },
  navBtn: { display: "flex", alignItems: "center", gap: 12, width: "100%", minHeight: 38, fontSize: 14.5, textAlign: "left", whiteSpace: "nowrap" },
  navLabel: { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" },
  navHint: { fontSize: 12.5, color: "var(--railInk2)", paddingLeft: 8, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" },
  navBadge: {
    minWidth: 22,
    height: 22,
    padding: "0 7px",
    borderRadius: 11,
    background: "var(--accent)",
    color: "var(--rail)",
    fontSize: 12,
    fontWeight: 600,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  },
  railSpacer: { flex: 1, minHeight: 8 },
  syncDot: { width: 8, height: 8, borderRadius: "50%", margin: "0 5px", flexShrink: 0 },
  syncText: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 1, padding: "5px 0", lineHeight: 1.3, whiteSpace: "normal" },
  syncSub: { fontSize: 12, fontWeight: 400, color: "var(--railInk2)" },
  modeSwitch: { display: "flex", alignItems: "center", gap: 2, background: "var(--railActive)", borderRadius: 10, padding: 3, flexShrink: 0 },
  modeIcon: { width: 30, height: 30, border: "none", borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", padding: 0 },
  modeAuto: { height: 30, padding: "0 10px", border: "none", borderRadius: 7, fontSize: 12, fontWeight: 600 },
  footRow: { display: "flex", alignItems: "center", gap: 8, padding: "4px 0 0 6px" },
  footToggle: {
    display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6, flex: 1, minWidth: 0,
    minHeight: 32, border: "none", background: "none", padding: "0 4px", textAlign: "right",
    fontSize: 12, color: "var(--railInk2)", cursor: "pointer",
  },
  footText: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  footSign: { fontSize: 14, lineHeight: 1, opacity: 0.7 },
  footMore: { display: "flex", flexDirection: "column", gap: 8, padding: "10px 6px 2px", fontSize: 12.5, color: "var(--railInk2)", lineHeight: 1.5 },
  footLink: {
    display: "block",
    border: "none",
    background: "none",
    padding: 0,
    fontSize: 12,
    color: "var(--railInk2)",
    textDecoration: "underline",
    textUnderlineOffset: 3,
    textAlign: "left",
  },
  railFoot: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    borderTop: "1px solid var(--railActive)",
    paddingTop: 10,
    fontSize: 12.5,
    color: "var(--railInk2)",
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
  tabRow: { display: "flex", padding: "6px 6px 4px" },
  tab: {
    flex: 1,
    minWidth: 0,
    minHeight: 54,
    fontSize: 11.5,
    lineHeight: 1.2,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    borderRadius: 12,
  },
  tabMark: { display: "flex", alignItems: "center", justifyContent: "center", width: 48, height: 28, borderRadius: 999 },
  sheetBackdrop: { position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", zIndex: 29 },
  sheet: { borderBottom: "1px solid var(--railActive)", padding: "14px 12px 12px" },
  sheetAccount: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 10px",
    marginBottom: 10,
    borderRadius: 10,
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
    minHeight: 34,
    padding: "0 12px",
    borderRadius: 999,
    border: "1px solid var(--railInk2)",
    background: "none",
    color: "var(--railInk)",
  },
  sheetGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 },
  // На телефоне подсветки под курсором нет, и разделы, нарисованные как строки
  // текста, сливались в один столбец. Поэтому каждый — своя плашка с границей:
  // видно, что это отдельная кнопка и куда по ней попадать пальцем.
  sheetBtn: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    minHeight: 48,
    padding: "10px 12px",
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--railActive)",
    background: "var(--railActive)",
    color: "var(--railInk2)",
    fontSize: 14,
    textAlign: "left",
  },
  sheetHint: { marginLeft: "auto", fontSize: 12, color: "var(--railInk2)", opacity: 0.8, whiteSpace: "nowrap" },
  sheetBtnOn: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    minHeight: 48,
    padding: "10px 12px",
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--accent)",
    background: "var(--railActive)",
    color: "var(--railInk)",
    fontSize: 14,
    fontWeight: 600,
    textAlign: "left",
  },
  sheetThemeRow: { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 6 },
  sheetNote: {
    flex: "1 1 160px",
    border: "none",
    background: "none",
    padding: 0,
    margin: 0,
    textAlign: "left",
    fontSize: 12,
    color: "var(--railInk2)",
    lineHeight: 1.45,
  },
  cdRow: { display: "flex", gap: 8, flexWrap: "wrap" },
  cdColumn: { display: "flex", flexDirection: "column", gap: 8 },
  cdCard: {
    background: "var(--panel)",
    border: "1px solid var(--line)",
    borderRadius: 14,
    padding: "10px 14px",
    minWidth: 120,
    maxWidth: 220,
  },
  cdCardRail: {
    background: "var(--railActive)",
    borderRadius: 14,
    padding: "11px 14px 10px",
    minWidth: 0,
  },
  cdLabel: { fontSize: 11.5, opacity: 0.72 },
  cdBig: { display: "flex", alignItems: "baseline", gap: 7, marginTop: 4 },
  cdNum: { fontFamily: "var(--serif)", fontSize: 30, lineHeight: 1, fontVariantNumeric: "tabular-nums" },
  cdWord: { fontSize: 14 },
  cdName: { fontSize: 12.5, marginTop: 4, lineHeight: 1.35, opacity: 0.85, overflowWrap: "anywhere" },
  head: {
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 20,
    flexWrap: "wrap",
    marginBottom: 22,
  },
  headText: { minWidth: 0 },
  headDate: { fontSize: 14, color: "var(--ink3)", marginBottom: 4 },
  h1: { fontFamily: "var(--serif)", fontSize: 38, margin: 0, fontWeight: 400, lineHeight: 1.12, textWrap: "balance" },
  note: { fontSize: 14.5, color: "var(--ink3)", marginTop: 6, lineHeight: 1.5, maxWidth: 680 },
  headBadge: {
    marginLeft: 12, verticalAlign: "middle", display: "inline-block",
    fontFamily: "var(--sans)", fontSize: 11, fontWeight: 600, letterSpacing: "0.08em",
    padding: "3px 8px", borderRadius: 7, border: "1px solid var(--line)",
    background: "var(--panel2)", color: "var(--mute)", whiteSpace: "nowrap",
  },
  headSide: { display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" },
};
