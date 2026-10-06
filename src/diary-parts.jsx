// «Дневник», вариант A: месяц, в клетке которого всё подписано словами.
//
// Раньше одна клетка показывала четыре вещи точками и заливкой (часы, уроки
// «Подготовки», задание, оценка), и что где — приходилось угадывать. Теперь у
// каждой вещи свой вид: оценка — цифрой в углу, цвет по баллу; задание —
// предметом; событие — красной плашкой с названием; часы — полоской внизу.
// Слои включаются и выключаются кнопками над календарём.
//
// Здесь только то, что не зависит от состояния приложения: календарь, кнопки
// слоёв и строка «Скоро сдавать». Выбранный день собирается в study-planner.jsx —
// ему нужны задания, расписание и формы оттуда.

import { useState } from "react";

const LAYERS_KEY = "planner-diary-layers";
const LAYERS = [
  ["grades", "Оценки"],
  ["hw", "Задания"],
  ["events", "События"],
  ["hours", "Часы"],
];
const ALL_ON = { grades: true, hw: true, events: true, hours: true };

function readLayers() {
  try {
    const saved = JSON.parse(localStorage.getItem(LAYERS_KEY) || "null");
    return saved && typeof saved === "object" ? { ...ALL_ON, ...saved } : ALL_ON;
  } catch (e) {
    return ALL_ON;
  }
}

// Какие слои видны — настройка устройства, как тема: на телефоне можно
// оставить одни оценки, на компьютере — всё.
export function useDiaryLayers() {
  const [layers, setLayers] = useState(readLayers);
  function toggle(key) {
    setLayers((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try {
        localStorage.setItem(LAYERS_KEY, JSON.stringify(next));
      } catch (e) {
        /* приватный режим — переключатель проживёт до перезагрузки */
      }
      return next;
    });
  }
  return [layers, toggle];
}

export function DiaryLayers({ layers, onToggle, counts, hasGrades }) {
  return (
    <div className="ap-diary-layers" role="group" aria-label="Что показывать в календаре">
      {LAYERS.filter(([key]) => key !== "grades" || hasGrades).map(([key, label]) => (
        <button key={key} type="button" className="ap-dlayer" aria-pressed={!!layers[key]} onClick={() => onToggle(key)} data-layer={key}>
          {label}
          {counts && counts[key] > 0 && <small>{counts[key]}</small>}
        </button>
      ))}
    </div>
  );
}

// Три полоски важности — та же метка, что у задания в приложении, только мельче.
function Bars({ value }) {
  const p = Number(value) || 1;
  if (p < 2) return null;
  return (
    <span className={"ap-dbars p" + p} aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  );
}

function dueWord(days) {
  if (days < 0) return "просрочено";
  if (days === 0) return "сегодня";
  if (days === 1) return "завтра";
  return "через " + days + " дн.";
}

// «Скоро сдавать» одной строкой: раньше это была плашка на четверть экрана над
// календарём. Нажатие открывает день задания.
export function DueStrip({ items, colorOf, onOpen, max = 4 }) {
  if (!items.length) return null;
  const shown = items.slice(0, max);
  const rest = items.length - shown.length;
  return (
    <div className="ap-due-strip" data-due-strip>
      <b>Скоро сдавать</b>
      {shown.map((h) => (
        <button
          key={h.id}
          type="button"
          className={"ap-due-item" + (h.daysUntil < 0 ? " is-late" : "")}
          onClick={() => onOpen(h)}
          title={(h.subjectName ? h.subjectName + ": " : "") + h.text}
          data-due={h.id}
        >
          <Bars value={h.priority} />
          {h.subjectName && <span className="ap-dot" style={{ background: colorOf(h.subjectName) }} />}
          <span className="ap-due-text">{h.subjectName ? h.subjectName + " · " : ""}{h.text}</span>
          <em className={h.daysUntil <= 0 ? "is-hot" : ""}>{dueWord(h.daysUntil)}</em>
        </button>
      ))}
      {rest > 0 && (
        <button type="button" className="ap-due-more" onClick={() => onOpen(items[max])}>
          ещё {rest} →
        </button>
      )}
    </div>
  );
}

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

function hoursText(h) {
  return String(Math.round(h * 10) / 10).replace(".", ",");
}

// Клетка календаря. Метки рисуются дважды: подписями — для компьютера и
// значками — для телефона, где на подпись нет места; показывает нужные CSS.
function DayCell({ cell, layers, selected, toneOf, onSelect }) {
  const grades = layers.grades ? cell.grades : [];
  const events = layers.events ? cell.events : [];
  const hw = layers.hw ? cell.hw : [];
  const tags = [
    ...events.map((e) => ({ kind: "event", key: "e" + e.id, text: e.name })),
    ...hw.map((h) => ({ kind: h.late ? "late" : h.done ? "done" : "hw", key: "h" + h.id, text: h.label, priority: h.priority })),
  ];
  const tagLimit = 3;
  const extra = tags.length - tagLimit;
  const ratio = cell.goal > 0 ? Math.min(cell.hours / cell.goal, 1) : cell.hours > 0 ? 1 : 0;
  const bar = layers.hours && !cell.future && cell.inMonth && (cell.hours > 0 || cell.goal > 0);
  const label = [
    cell.date.toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" }),
    grades.length ? "оценки: " + grades.map((g) => (g.subject ? g.subject + " " : "") + g.label).join(", ") : "",
    hw.length ? "заданий: " + hw.length : "",
    events.map((e) => e.name).join(", "),
    cell.hours > 0 ? hoursText(cell.hours) + " ч занятий" : "",
  ]
    .filter(Boolean)
    .join("; ");
  const cls = [
    "ap-dcell",
    cell.inMonth ? "" : "is-out",
    cell.future ? "is-future" : "",
    cell.today ? "is-today" : "",
    selected ? "is-sel" : "",
    events.length ? "has-event" : "",
    cell.far ? "is-far" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button type="button" className={cls} aria-pressed={selected} aria-label={label} title={label} onClick={() => onSelect(cell.key)} data-day={cell.key}>
      <span className="ap-dcell-top">
        <span className="ap-dcell-n">{cell.date.getDate()}</span>
        {grades.slice(0, 2).map((g) => (
          <span key={g.id} className="ap-dgrade" style={toneOf(g)} data-day-grade={cell.key}>
            {g.label}
          </span>
        ))}
        {grades.length > 2 && <span className="ap-dmore">+{grades.length - 2}</span>}
      </span>
      <span className="ap-dcell-tags">
        {tags.slice(0, extra > 0 ? tagLimit - 1 : tagLimit).map((t) => (
          <span key={t.key} className={"ap-dtag is-" + t.kind}>
            {t.kind === "event" ? <span className="ap-dflag" /> : t.priority > 1 && t.kind === "hw" ? <Bars value={t.priority} /> : <span className="ap-dsq" />}
            {t.text}
            {t.kind === "done" ? " ✓" : ""}
          </span>
        ))}
        {extra > 0 && <span className="ap-dtag is-more">ещё {extra + 1}</span>}
      </span>
      {(hw.length > 0 || events.length > 0) && (
        <span className="ap-dcell-marks" aria-hidden="true">
          {events.length > 0 && <span className="ap-dflag" />}
          {hw.slice(0, 3).map((h) => (
            <span key={h.id} className={"ap-dsq" + (h.late ? " is-late" : h.done ? " is-done" : "")} />
          ))}
        </span>
      )}
      {bar && (
        <span className="ap-dcell-bar">
          <i style={{ width: Math.round(ratio * 100) + "%", background: ratio >= 1 ? "var(--green)" : "color-mix(in srgb, var(--accent) 70%, transparent)" }} />
        </span>
      )}
    </button>
  );
}

export function DiaryMonth({ title, cells, selected, layers, toneOf, onSelect, onPrev, onNext, onToday, showToday, compact, onCompact }) {
  // Неделя целиком за пределами месяца — лишняя строка: не рисуем.
  const rows = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  const visible = rows.filter((r) => r.some((c) => c.inMonth));
  const canCompact = cells.some((c) => c.far);
  return (
    <div className="ap-dcal">
      <div className="ap-dcal-top">
        <button type="button" className="ap-dnav" onClick={onPrev} aria-label="Предыдущий месяц">
          ‹
        </button>
        <div className="ap-dcal-title">{title}</div>
        {showToday && (
          <button type="button" className="ap-dtoday" onClick={onToday}>
            Сегодня
          </button>
        )}
        <button type="button" className="ap-dnav" onClick={onNext} aria-label="Следующий месяц">
          ›
        </button>
      </div>
      <div className="ap-dweek" aria-hidden="true">
        {WEEKDAYS.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="ap-dgrid" data-compact={compact && canCompact ? "1" : "0"}>
        {visible.flat().map((cell) => (
          <DayCell key={cell.key} cell={cell} layers={layers} selected={cell.key === selected} toneOf={toneOf} onSelect={onSelect} />
        ))}
      </div>
      {canCompact && (
        <button type="button" className="ap-dcompact ap-only-mobile" onClick={() => onCompact(!compact)} aria-expanded={!compact}>
          {compact ? "Весь месяц ▾" : "Две недели ▴"}
        </button>
      )}
      <div className="ap-dlegend">
        {layers.grades && (
          <span>
            <span className="ap-dgrade" style={toneOf({ percent: 95 })}>5</span>
            <span className="ap-dgrade" style={toneOf({ percent: 58 })}>58</span>
            оценка или балл, цвет — по баллу
          </span>
        )}
        {layers.hw && (
          <span>
            <span className="ap-dsq" /> задание к этому дню
          </span>
        )}
        {layers.events && (
          <span>
            <span className="ap-dflag" /> событие
          </span>
        )}
        {layers.hours && (
          <span>
            <span className="ap-dlegend-bar" /> часы занятий от цели
          </span>
        )}
      </div>
    </div>
  );
}

export const DIARY_CSS = `
.ap-diary { display: grid; grid-template-columns: minmax(0, 1.55fr) minmax(330px, 1fr); gap: 16px; align-items: start; }
.ap-diary-layers { display: flex; flex-wrap: wrap; gap: 6px; }
.ap-dlayer { height: 36px; padding: 0 13px; border-radius: 999px; border: 1px solid var(--line); background: var(--panel); color: var(--ink2); font-size: 13.5px; display: inline-flex; align-items: center; gap: 7px; }
.ap-dlayer small { font-size: 12px; opacity: .7; font-weight: 500; }
.ap-dlayer[aria-pressed="true"] { background: var(--btnBg); border-color: var(--btnBg); color: var(--btnInk); font-weight: 600; }
/* contain: свои чипы строка не раздвигает — иначе на телефоне весь экран становился шириной с неё. */
.ap-due-strip { contain: inline-size; min-width: 0; display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-radius: 14px; background: var(--panel); border: 1px solid var(--line); font-size: 13px; overflow-x: auto; scrollbar-width: none; margin-bottom: 14px; }
.ap-due-strip::-webkit-scrollbar { display: none; }
.ap-due-strip > b { white-space: nowrap; }
.ap-due-item { display: inline-flex; align-items: center; gap: 6px; max-width: 340px; flex-shrink: 0; padding: 4px 10px; border-radius: 999px; border: none; background: var(--neutralBg); color: var(--ink); font-size: 13px; }
.ap-due-item .ap-due-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ap-due-item em { font-style: normal; font-weight: 700; font-size: 12px; white-space: nowrap; color: var(--ink3); }
.ap-due-item em.is-hot { color: var(--red); }
.ap-due-item.is-late { background: var(--redBg); color: var(--red); }
.ap-due-item.is-late em { color: var(--red); }
.ap-due-more { border: none; background: none; color: var(--ink3); font-size: 13px; white-space: nowrap; }
.ap-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; display: inline-block; }
.ap-dbars { display: inline-flex; align-items: flex-end; gap: 1.5px; height: 10px; flex-shrink: 0; margin-right: 4px; vertical-align: -1px; }
.ap-dbars i { width: 2.5px; border-radius: 1px; background: color-mix(in srgb, var(--ink3) 35%, transparent); }
.ap-dbars i:nth-child(1) { height: 4px; } .ap-dbars i:nth-child(2) { height: 7px; } .ap-dbars i:nth-child(3) { height: 10px; }
.ap-dbars.p2 i:nth-child(-n+2) { background: var(--gold); }
.ap-dbars.p3 i { background: var(--red); }
.ap-dcal { padding: 14px 16px 12px; display: flex; flex-direction: column; gap: 8px; }
.ap-dcal-top { display: flex; align-items: center; gap: 8px; }
.ap-dcal-title { flex: 1; font-family: var(--serif); font-size: 22px; }
.ap-dnav { width: 34px; height: 34px; border-radius: 10px; border: 1px solid var(--line); background: var(--panel2); color: var(--ink2); font-size: 18px; line-height: 1; }
.ap-dtoday { height: 34px; padding: 0 12px; border-radius: 999px; border: 1px solid var(--line); background: var(--panel2); color: var(--ink); font-size: 13.5px; }
.ap-dweek { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 6px; font-size: 12px; color: var(--mute); }
.ap-dweek span { padding-left: 7px; }
.ap-dgrid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); grid-auto-rows: minmax(98px, auto); gap: 6px; }
.ap-dcell { position: relative; display: flex; flex-direction: column; align-items: stretch; gap: 3px; min-width: 0; padding: 6px 7px 13px; border: none; border-radius: 11px; background: var(--neutralBg); color: var(--ink); text-align: left; overflow: hidden; font: inherit; }
.ap-dcell:hover { box-shadow: inset 0 0 0 1.5px var(--line); }
.ap-dcell.is-future { background: color-mix(in srgb, var(--neutralBg) 50%, transparent); }
.ap-dcell.is-out { background: transparent; box-shadow: inset 0 0 0 1px var(--line2); }
.ap-dcell.is-out .ap-dcell-n { color: var(--mute); font-weight: 500; }
.ap-dcell.is-out > :not(.ap-dcell-top) { opacity: .6; }
.ap-dcell.is-today { box-shadow: inset 0 0 0 2px var(--ink3); background: var(--panel2); }
.ap-dcell.is-sel { box-shadow: inset 0 0 0 2px var(--ink); }
.ap-dcell-top { display: flex; align-items: center; gap: 3px; min-width: 0; }
.ap-dcell-n { flex: 1; font-size: 13px; font-weight: 700; }
.ap-dgrade { display: inline-flex; align-items: center; justify-content: center; min-width: 20px; height: 19px; padding: 0 4px; border-radius: 6px; border: 1px solid transparent; font-size: 11.5px; font-weight: 700; flex-shrink: 0; }
.ap-dmore { font-size: 10.5px; color: var(--ink3); }
.ap-dcell-tags { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.ap-dtag { display: block; min-width: 0; padding: 1px 5px; border-radius: 5px; background: var(--panel); color: var(--ink2); font-size: 11px; line-height: 1.35; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ap-dtag.is-late { background: var(--redBg); color: var(--red); font-weight: 600; }
.ap-dtag.is-done { background: transparent; padding-left: 0; color: var(--ink3); }
.ap-dtag.is-event { background: var(--red); color: var(--panel); font-weight: 600; }
.ap-dtag.is-event .ap-dflag { background: var(--panel); }
.ap-dtag.is-more { background: transparent; padding-left: 0; color: var(--ink3); }
.ap-dsq { display: inline-block; width: 7px; height: 7px; margin-right: 4px; border-radius: 2px; border: 1.4px solid currentColor; vertical-align: 0; flex-shrink: 0; }
.ap-dflag { display: inline-block; width: 8px; height: 10px; margin-right: 4px; background: var(--red); clip-path: polygon(0 0, 100% 0, 72% 50%, 100% 100%, 0 100%); vertical-align: -1px; flex-shrink: 0; }
.ap-dcell-marks { display: none; }
.ap-dcell-bar { position: absolute; left: 7px; right: 7px; bottom: 5px; height: 4px; border-radius: 2px; background: color-mix(in srgb, var(--ink) 8%, transparent); }
.ap-dcell-bar i { display: block; height: 100%; border-radius: 2px; }
.ap-dcompact { align-self: center; border: none; background: none; color: var(--ink3); font-size: 13px; padding: 2px 8px; }
.ap-dlegend { display: flex; flex-wrap: wrap; gap: 6px 16px; align-items: center; font-size: 12px; color: var(--ink3); padding-top: 2px; }
.ap-dlegend > span { display: inline-flex; align-items: center; gap: 5px; }
.ap-dlegend .ap-dgrade { height: 17px; min-width: 18px; font-size: 10.5px; }
.ap-dlegend-bar { display: inline-block; width: 22px; height: 4px; border-radius: 2px; background: var(--green); }
.ap-dday { padding: 16px 18px; display: flex; flex-direction: column; gap: 10px; position: sticky; top: 16px; }
.ap-dday-kicker { font-size: 11.5px; letter-spacing: .07em; text-transform: uppercase; color: var(--mute); }
.ap-dday-date { margin: 0; font-family: var(--serif); font-weight: 400; font-size: 22px; line-height: 1.2; }
.ap-dpills { display: flex; flex-wrap: wrap; gap: 6px; }
.ap-dpill { height: 28px; padding: 0 10px; border-radius: 999px; background: var(--neutralBg); color: var(--ink2); font-size: 12.5px; display: inline-flex; align-items: center; }
.ap-dpill.is-ok { background: var(--greenSoft); color: var(--green); font-weight: 600; }
.ap-devent { display: flex; align-items: center; gap: 8px; width: 100%; padding: 7px 10px; border: none; border-radius: 10px; background: var(--redBg); color: var(--red); font-size: 13.5px; font-weight: 600; text-align: left; }
.ap-dlabel { font-size: 11.5px; letter-spacing: .07em; text-transform: uppercase; color: var(--mute); margin-top: 4px; }
.ap-dlesson { padding: 7px 0; border-bottom: 1px solid var(--line2); }
.ap-dlesson-row { display: grid; grid-template-columns: 44px 4px minmax(0, 1fr) auto; column-gap: 9px; align-items: center; }
.ap-dlesson-time { font-size: 12.5px; font-weight: 600; color: var(--ink3); }
.ap-dlesson-strip { width: 4px; height: 18px; border-radius: 2px; }
.ap-dlesson-name { min-width: 0; font-size: 14px; font-weight: 600; }
.ap-dlesson-name small { font-weight: 400; color: var(--ink3); }
.ap-dlesson-side { display: flex; align-items: center; gap: 6px; }
.ap-dlesson-side .ap-dgrade { height: 22px; min-width: 24px; font-size: 12.5px; cursor: pointer; }
/* «+ задание» видно всегда: спрятанное до наведения его просто не находили. */
.ap-dadd { border: 1px solid var(--line); border-radius: 8px; background: transparent; color: var(--ink2); font-size: 12.5px; padding: 3px 9px; white-space: nowrap; transition: background .15s ease, color .15s ease, border-color .15s ease; }
.ap-dadd:hover { background: var(--panel2); color: var(--ink); border-color: var(--ink3); }
.ap-dadd[aria-expanded="true"] { color: var(--ink3); }
.ap-dlesson-body { padding-left: 57px; display: flex; flex-direction: column; gap: 4px; margin-top: 5px; }
.ap-dlesson-body:empty { display: none; }
.ap-dentry { display: flex; align-items: center; gap: 8px; font-size: 13.5px; padding: 4px 0; }
.ap-dentry b { font-weight: 600; }
.ap-dentry .ap-dentry-note { flex: 1; min-width: 0; color: var(--ink3); font-size: 12.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ap-dentry .ap-dentry-h { font-weight: 600; white-space: nowrap; }
.ap-dactions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 4px; }
.ap-dbtn { height: 40px; padding: 0 16px; border-radius: 12px; border: 1px solid var(--line); background: var(--panel2); color: var(--ink); font-size: 14px; font-weight: 600; }
.ap-dbtn.is-go { background: var(--green); border-color: var(--green); color: var(--panel); }
.ap-dall > summary { cursor: pointer; list-style: none; font-size: 14px; color: var(--ink2); padding: 12px 16px; }
.ap-dall > summary::-webkit-details-marker { display: none; }
.ap-dall[open] > summary { border-bottom: 1px solid var(--line2); }
`;

export const DIARY_MOBILE_CSS = `
.ap-diary { grid-template-columns: minmax(0, 1fr); gap: 12px; }
.ap-dlayer { height: 32px; padding: 0 11px; font-size: 13px; }
.ap-dcal { padding: 12px 10px 10px; }
.ap-dcal-title { font-size: 19px; text-align: center; }
.ap-dweek { gap: 4px; }
.ap-dweek span { padding-left: 0; text-align: center; }
.ap-dgrid { grid-auto-rows: 56px; gap: 4px; }
.ap-dgrid[data-compact="1"] .is-far { display: none; }
.ap-dcell { align-items: center; gap: 2px; padding: 4px 2px 8px; border-radius: 9px; }
.ap-dcell-top { flex-direction: column; gap: 2px; }
.ap-dcell-n { flex: none; font-size: 12.5px; }
.ap-dcell-top .ap-dgrade ~ .ap-dgrade, .ap-dmore, .ap-dcell-tags { display: none; }
.ap-dgrade { height: 15px; min-width: 15px; padding: 0 3px; border-radius: 4px; font-size: 10px; }
.ap-dcell-marks { display: flex; align-items: center; gap: 2px; }
.ap-dcell-marks .ap-dsq { width: 6px; height: 6px; margin: 0; border-width: 1.3px; color: var(--ink2); }
.ap-dcell-marks .ap-dsq.is-late { color: var(--red); background: var(--red); }
.ap-dcell-marks .ap-dsq.is-done { color: var(--mute); }
.ap-dcell-marks .ap-dflag { width: 7px; height: 8px; margin: 0; }
.ap-dcell.has-event { box-shadow: inset 0 0 0 2px var(--red); }
.ap-dcell.is-sel.has-event, .ap-dcell.is-sel { box-shadow: inset 0 0 0 2px var(--ink); }
.ap-dcell-bar { left: 5px; right: 5px; bottom: 4px; height: 3px; }
.ap-dlegend { gap: 4px 12px; font-size: 11.5px; }
.ap-dday { position: static; padding: 14px; }
.ap-dlesson-row { grid-template-columns: 40px 4px minmax(0, 1fr) auto; }
.ap-dlesson-body { padding-left: 0; }
.ap-dadd { opacity: 1; }
.ap-due-strip { margin-bottom: 10px; }
.ap-due-item { max-width: 250px; }
`;
