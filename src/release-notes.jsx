import React, { useEffect } from "react";

// Коротко о том, что менялось. Подробная история — в CHANGELOG.md репозитория;
// здесь по несколько строк на версию, чтобы понять, что нового, не уходя с сайта.
const RELEASES = [
  {
    v: "0.5.0",
    date: "12 сентября",
    items: [
      "Разделы стали экранами: на компьютере колонка слева, на телефоне — полоса внизу.",
      "Переходы между разделами анимированы, разделы подсвечиваются под курсором.",
      "Новый экран «Сегодня»: уроки дня, быстрая запись занятия, сроки и прогресс.",
      "Ночная тема, «Авто» включает её с 20:00 до 07:00.",
      "Отсчёт до ближайшего события и до главного — всегда на виду.",
      "«Баланс предметов»: план и факт сразу по всем предметам на одной картинке.",
      "График часов: коридор дневной цели, зелёный столбец — цель взята.",
      "Дневник: календарь и выбранный день рядом, клетка заливается и красится по доле цели.",
      "Тетради всех предметов — на отдельном экране.",
      "В «Распределении» — рекомендация по каждому предмету, она же кольцо на диагонали баланса.",
      "Новая иконка приложения: кривая возможностей вместо столбиков.",
      "Напоминание о занятиях и счёт дней подряд, вердикт о темпе рядом с главным событием.",
      "Починено: подписка на календарь со второго устройства, тёмное уведомление об удалении, рамка выбранного дня.",
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
  },
  {
    v: "0.3.0",
    date: "11 сентября",
    items: [
      "Правки с двух устройств больше не затирают друг друга.",
      "Сделанное без сети уходит в облако, как только она появится.",
      "Название «Ежедневник лицеиста» и описание в шапке.",
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
  },
  {
    v: "0.1.0",
    date: "10 сентября",
    items: [
      "Переезд из чата в самостоятельное приложение с установкой на телефон.",
      "Хранение в облаке вместо памяти браузера, работа без сети.",
    ],
  },
];

// Патч-ноут: окно по центру с размытым фоном. Раньше история пряталась в
// подвале «Синхронизации» — туда за ней никто не заходил, поэтому теперь её
// открывает номер версии, который виден всегда.
export default function ReleaseNotesDialog({ open, onClose }) {
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
        aria-label="История изменений"
      >
        <div style={styles.head}>
          <div style={styles.title}>История изменений</div>
          <button onClick={onClose} style={styles.close} title="Закрыть" aria-label="Закрыть">
            ✕
          </button>
        </div>
        <div style={styles.body}>
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
};
