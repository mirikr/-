import React, { useEffect, useRef, useState } from "react";

// Коротко о том, что менялось. Подробная история — в CHANGELOG.md репозитория;
// здесь по несколько строк на версию, чтобы понять, что нового, не уходя с сайта.
// Снимок версии лежит в public/versions. В предпросмотре, где приложение живёт
// одной страницей без файлов рядом, снимки подкладываются в window сборщиком.
const shotUrl = (version) => {
  const inlined = typeof window !== "undefined" && window.__PLANNER_SHOTS__;
  return (inlined && inlined[version]) || `${import.meta.env.BASE_URL}versions/${version}.png`;
};

const RELEASES = [
  {
    v: "0.5.0",
    date: "12 сентября",
    items: [
      "Разделы стали экранами: на компьютере колонка слева, на телефоне — полоса внизу.",
      "Переходы между разделами анимированы, разделы подсвечиваются под курсором.",
      "Новый экран «Сегодня»: уроки дня, быстрая запись занятия, сроки и прогресс.",
      "Ночная тема, «Авто» включает её в заданные вами часы.",
      "Отсчёт до ближайшего события и до главного — всегда на виду.",
      "«Баланс предметов»: план и факт сразу по всем предметам на одной картинке.",
      "График часов: коридор дневной цели, зелёный столбец — цель взята.",
      "Дневник: календарь и выбранный день рядом, клетка заливается и красится по доле цели.",
      "Тетради всех предметов — на отдельном экране.",
      "В «Распределении» — рекомендация по каждому предмету, она же кольцо на диагонали баланса.",
      "Новая иконка приложения: кривая возможностей вместо столбиков.",
      "Напоминание о занятиях и счёт дней подряд, вердикт о темпе рядом с главным событием.",
      "Пропущенный день попадает в календарь телефона напоминанием на вечер.",
      "История изменений открывается окном, внутри — сравнение версий шторкой по снимкам и словами.",
      "Починено: подписка на календарь со второго устройства, тёмное уведомление об удалении, рамка выбранного дня.",
    ],
    changes: [
      ["Одна длинная страница: чтобы попасть в дневник, приходилось прокручивать расписание", "Разделы стали экранами: колонка слева, полоса вкладок внизу на телефоне"],
      ["Только светлая тема", "Светлая, ночная и «Авто» по часам, которые вы задаёте сами"],
      ["Перекос искали, перебирая предметы по два", "«Баланс предметов»: план, факт и рекомендация сразу по всем"],
      ["Пропущенные дни никак не замечались", "Напоминание в приложении и в календаре телефона"],
      ["Иконкой была столбиковая диаграмма", "Иконка — кривая возможностей: оси, дуга и точка выбора"],
    ],
  },
  {
    v: "0.4.0",
    date: "11 сентября",
    items: [
      "Экзамены и олимпиады в расписании: время, место, ссылка, выбор одного из двух.",
      "Экзамен из расписания сам становится событием с отсчётом наверху.",
      "День недели у экзамена берётся из даты, в сетке он виден за неделю до неё.",
      "Календарь телефона одной подпиской — события, экзамены и задания обновляются сами.",
      "Инструкция к подписке своя для iPhone, Android и компьютера.",
      "Резервная копия — под кнопкой обновления; внизу номер версии и эта история.",
    ],
    changes: [
      ["Экзамен заводили дважды: в расписании и в событиях", "Одна запись: экзамен из расписания сам становится событием с отсчётом"],
      ["Файл .ics на каждое событие — на iPhone он до календаря не доходил", "Подписка: календарь обновляется сам, править нужно только в ежедневнике"],
      ["День недели у экзамена выбирали руками", "Берётся из даты, и воскресенье включается само"],
    ],
  },
  {
    v: "0.3.0",
    date: "11 сентября",
    items: [
      "Правки с двух устройств больше не затирают друг друга.",
      "Сделанное без сети уходит в облако, как только она появится.",
      "Название «Ежедневник лицеиста» и описание в шапке.",
    ],
    changes: [
      ["Правки с телефона и ноутбука затирали друг друга целиком", "Сливаются поэлементно: у каждой записи своя метка времени"],
      ["Сделанное без сети ждало, пока о нём вспомнят", "Уходит в облако само, как только появляется связь"],
    ],
  },
  {
    v: "0.2.0",
    date: "10 сентября",
    items: [
      "События с приоритетами вместо единственной даты.",
      "Тетради: блоки, ветки, конспекты с форматированием и файлами.",
      "Лицей: предметы отдельно от расписания, роли уроков, важность значками.",
      "Дела без привязки к уроку, график часов, свои цвета предметов.",
      "Удаление чего угодно с отменой в течение двадцати секунд.",
    ],
    changes: [
      ["Одна дата экзамена, вписанная в код", "События с приоритетами: план считается до самого важного"],
      ["Только самостоятельная подготовка", "Лицей: расписание с ролями уроков и домашние задания со сроками"],
      ["Заметки простым текстом", "Тетради: блоки, ветки, конспект с форматированием и файлами"],
      ["Удалённое исчезало навсегда", "Двадцать секунд на отмену любого удаления"],
    ],
  },
  {
    v: "0.1.0",
    date: "10 сентября",
    items: [
      "Переезд из чата в самостоятельное приложение с установкой на телефон.",
      "Хранение в облаке вместо памяти браузера, работа без сети.",
    ],
    changes: [
      ["Планировщик жил в чате и открывался только оттуда", "Своё приложение: ставится на экран «Домой» и работает без сети"],
      ["Данные лежали в памяти браузера и пропадали", "Облако: один аккаунт на все устройства"],
    ],
  },
];

// Патч-ноут: окно по центру с размытым фоном. Раньше история пряталась в
// подвале «Синхронизации» — туда за ней никто не заходил, поэтому теперь её
// открывает номер версии, который виден всегда.
// Сравнение версий: ползунок ходит по истории, а рядом видно, как было до
// обновления и как стало после. Список «что нового» отвечает на вопрос «что
// добавили», а это — на вопрос «чем теперь иначе», и на больших обновлениях
// второй вопрос интереснее.
// Шторка «было / стало»: слева кусок старой версии, справа новой, между ними
// ручка. Так сравнивают карты в обзорах игр — и здесь это честнее любого
// описания: видно саму разницу, а не рассказ о ней.
function Wipe({ before, after, beforeLabel, afterLabel }) {
  const [pos, setPos] = useState(50);
  const boxRef = useRef(null);
  const dragging = useRef(false);

  function setFromEvent(e) {
    const box = boxRef.current;
    if (!box) return;
    const rect = box.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    setPos(Math.max(0, Math.min(100, x)));
  }

  return (
    <div
      ref={boxRef}
      style={styles.wipe}
      onPointerDown={(e) => {
        dragging.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        setFromEvent(e);
      }}
      onPointerMove={(e) => dragging.current && setFromEvent(e)}
      onPointerUp={() => (dragging.current = false)}
      onPointerCancel={() => (dragging.current = false)}
    >
      <img src={after} alt={afterLabel} style={styles.wipeImg} draggable="false" />
      {/* Старая версия лежит сверху и обрезается ручкой — двигая её влево,
          вы «стираете» прошлое и видите нынешнее. */}
      <div style={{ ...styles.wipeClip, clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
        <img src={before} alt={beforeLabel} style={styles.wipeImg} draggable="false" />
      </div>

      <div style={{ ...styles.wipeLine, left: pos + "%" }}>
        <div
          style={styles.wipeGrip}
          tabIndex={0}
          role="slider"
          aria-label="Сравнение версий"
          aria-valuenow={Math.round(pos)}
          aria-valuemin={0}
          aria-valuemax={100}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") setPos((p) => Math.max(0, p - 4));
            if (e.key === "ArrowRight") setPos((p) => Math.min(100, p + 4));
          }}
        >
          ‹ ›
        </div>
      </div>

      <div style={{ ...styles.wipeTag, left: 8, opacity: pos > 12 ? 1 : 0 }}>{beforeLabel}</div>
      <div style={{ ...styles.wipeTag, right: 8, opacity: pos < 88 ? 1 : 0 }}>{afterLabel}</div>
    </div>
  );
}

function Compare({ onBack }) {
  const ordered = [...RELEASES].reverse();
  const [index, setIndex] = useState(ordered.length - 1);
  const release = ordered[index];
  const previous = index > 0 ? ordered[index - 1] : null;

  return (
    <>
      <div style={styles.compareHead}>
        <button onClick={onBack} className="ap-version" style={styles.backBtn}>
          ← вся история
        </button>
        <div style={styles.compareVersions}>
          {previous ? `${previous.v} → ${release.v}` : `до приложения → ${release.v}`}
        </div>
      </div>

      <input
        type="range"
        min="0"
        max={ordered.length - 1}
        step="1"
        value={index}
        onChange={(e) => setIndex(Number(e.target.value))}
        style={styles.slider}
        aria-label="Версия"
      />
      <div style={styles.scaleRow}>
        {ordered.map((r, i) => (
          <button
            key={r.v}
            onClick={() => setIndex(i)}
            className="ap-version"
            style={{ ...styles.scaleMark, color: i === index ? "var(--accent)" : "var(--mute)" }}
          >
            {r.v}
          </button>
        ))}
      </div>

      {/* Картинки сняты из истории репозитория скриптом scripts/make-version-shots.mjs. */}
      {previous && (
        <Wipe
          before={shotUrl(previous.v)}
          after={shotUrl(release.v)}
          beforeLabel={previous.v}
          afterLabel={release.v}
        />
      )}

      <div style={styles.compareBody}>
        {(release.changes || []).map((pair, i) => (
          <div key={i} style={styles.pair}>
            <div style={styles.before}>
              <div style={styles.pairLabel}>было</div>
              {pair[0]}
            </div>
            <div style={styles.arrow} aria-hidden="true">
              →
            </div>
            <div style={styles.after}>
              <div style={styles.pairLabel}>стало</div>
              {pair[1]}
            </div>
          </div>
        ))}
        {!(release.changes || []).length && <div style={styles.list}>Для этой версии сравнение не записано.</div>}
      </div>
    </>
  );
}

export default function ReleaseNotesDialog({ open, onClose }) {
  const [compare, setCompare] = useState(false);

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
        style={{ ...styles.dialog, maxWidth: compare ? 760 : 520 }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="История изменений"
      >
        <div style={styles.head}>
          <div style={styles.title}>{compare ? "Что изменилось" : "История изменений"}</div>
          <button onClick={onClose} style={styles.close} title="Закрыть" aria-label="Закрыть">
            ✕
          </button>
        </div>
        <div style={styles.body}>
          {compare ? (
            <Compare onBack={() => setCompare(false)} />
          ) : (
            <>
              <button onClick={() => setCompare(true)} style={styles.compareBtn}>
                Сравнить версии: было → стало
              </button>
              {RELEASES.map((r) => (
                <div key={r.v} style={styles.release}>
                  <div style={styles.version}>
                    {r.v} <span style={styles.date}>· {r.date}</span>
                  </div>
                  <ul style={styles.list}>
                    {r.items.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </>
          )}
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
    maxWidth: 520,
    maxHeight: "80vh",
    display: "flex",
    flexDirection: "column",
    background: "var(--panel)",
    border: "1px solid var(--line)",
    borderRadius: 14,
    boxShadow: "0 18px 50px rgba(0,0,0,0.3)",
    color: "var(--ink)",
  },
  head: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: "16px 18px 10px",
    borderBottom: "1px solid var(--line2)",
  },
  title: { fontFamily: "'PT Serif', Georgia, serif", fontSize: 19 },
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
  release: { marginBottom: 16 },
  version: { fontSize: 13.5, fontWeight: 600, color: "var(--ink)" },
  date: { fontWeight: 400, color: "var(--mute)" },
  list: { margin: "6px 0 0", paddingLeft: 18, fontSize: 13, lineHeight: 1.6, color: "var(--ink2)" },
  compareBtn: {
    border: "1px solid var(--line)",
    background: "var(--panel2)",
    color: "var(--ink)",
    borderRadius: 9,
    padding: "8px 12px",
    fontSize: 13,
    fontWeight: 600,
    marginBottom: 16,
    width: "100%",
  },
  compareHead: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10 },
  backBtn: { fontSize: 12.5, color: "var(--ink3)", border: "none", background: "none", padding: 0 },
  compareVersions: { fontFamily: "'PT Serif', Georgia, serif", fontSize: 16 },
  slider: { width: "100%", accentColor: "var(--accent)" },
  scaleRow: { display: "flex", justifyContent: "space-between", marginBottom: 14 },
  scaleMark: { border: "none", background: "none", padding: 0, fontSize: 11, fontWeight: 600 },
  wipe: {
    position: "relative",
    width: "100%",
    aspectRatio: "1180 / 820",
    borderRadius: 10,
    overflow: "hidden",
    border: "1px solid var(--line)",
    background: "var(--neutralBg)",
    marginBottom: 14,
    touchAction: "none",
    cursor: "ew-resize",
    userSelect: "none",
  },
  wipeImg: { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "top left" },
  wipeClip: { position: "absolute", inset: 0 },
  wipeLine: { position: "absolute", top: 0, bottom: 0, width: 2, background: "var(--accent)", transform: "translateX(-1px)" },
  wipeGrip: {
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    width: 34,
    height: 34,
    borderRadius: "50%",
    background: "var(--accent)",
    color: "var(--accentInk)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: 1,
    boxShadow: "0 2px 10px rgba(0,0,0,.25)",
  },
  wipeTag: {
    position: "absolute",
    top: 8,
    fontSize: 11,
    fontWeight: 600,
    padding: "3px 8px",
    borderRadius: 999,
    background: "rgba(18,17,14,.65)",
    color: "#EDE7D8",
    transition: "opacity .15s ease",
  },
  compareBody: { display: "flex", flexDirection: "column", gap: 10 },
  pair: { display: "flex", alignItems: "stretch", gap: 8, flexWrap: "wrap" },
  before: {
    flex: "1 1 180px",
    minWidth: 0,
    background: "var(--neutralBg)",
    border: "1px solid var(--line2)",
    borderRadius: 9,
    padding: "8px 10px",
    fontSize: 12.5,
    lineHeight: 1.5,
    color: "var(--ink3)",
  },
  after: {
    flex: "1 1 180px",
    minWidth: 0,
    background: "var(--warmBg)",
    border: "1px solid var(--warmLine)",
    borderRadius: 9,
    padding: "8px 10px",
    fontSize: 12.5,
    lineHeight: 1.5,
    color: "var(--ink)",
  },
  pairLabel: { fontSize: 10, textTransform: "uppercase", letterSpacing: 0.4, color: "var(--mute)", marginBottom: 3 },
  arrow: { alignSelf: "center", color: "var(--mute)", fontSize: 15 },
};
