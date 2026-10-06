import React, { useEffect, useMemo, useState } from "react";
import { SchoolSheet } from "./school-day.jsx";

// Части нового «Сегодня» (вариант B на компьютере, A на телефоне) и вкладки
// «Факт и прогноз» в «Распределении».
//
// «Сегодня» было колонкой из восьми карточек, и половину её занимало то, что не
// про сегодня: график часов за месяц и прогресс «Подготовки». Теперь день — три
// части: в лицее, после уроков, впереди; статистика переехала в «Распределение»,
// рядом с планом, который по ней и правят. «Записать занятие» — не форма в
// самом низу, а окно: предмет, сколько (кнопками или таймером), когда, тема.

const DOW = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const DAY_SHORT = { mon: "пн", tue: "вт", wed: "ср", thu: "чт", fri: "пт", sat: "сб", sun: "вс" };
const MONTHS = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

export function ymd(date) {
  return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
}
const round1 = (n) => Math.round(n * 10) / 10;
const num = (n) => String(round1(n)).replace(".", ",");
const hours = (n) => num(n) + " ч";

export function minutesLabel(m) {
  const h = Math.floor(m / 60);
  const mm = Math.round(m % 60);
  if (!h) return mm + " мин";
  return mm ? h + " ч " + mm + " мин" : h + " ч";
}

function clock(seconds) {
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return (h ? h + ":" + String(m).padStart(2, "0") : String(m)) + ":" + String(ss).padStart(2, "0");
}

// --- таймер занятия ---------------------------------------------------------
// Засекли — можно закрыть приложение: время старта лежит в localStorage, и
// после возвращения таймер продолжает с того же места. Это настройка
// устройства, а не запись: в облако не едет.
//
// Таймер помнит, чем заняты: { kind: "study", subjectId, topicId?, topicName?,
// topicCustom? } — своя подготовка (предмет и, если выбран, урок курса), или
// { kind: "hw", hwId, label } — домашнее задание, которое по окончании
// отмечается сделанным. Предмет у подготовки необязателен: можно просто
// засечь время и выбрать предмет в конце.
const TIMER_KEY = "planner-study-timer";

function readTimer() {
  try {
    const t = JSON.parse(localStorage.getItem(TIMER_KEY) || "null");
    if (!t || !t.startedAt) return null;
    if (t.kind === "hw") return t.hwId ? t : null;
    return { kind: "study", ...t };
  } catch (e) {
    return null;
  }
}

export function useStudyTimer() {
  const [timer, setTimer] = useState(readTimer);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!timer) return undefined;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [timer]);
  function save(next) {
    setTimer(next);
    try {
      if (next) localStorage.setItem(TIMER_KEY, JSON.stringify(next));
      else localStorage.removeItem(TIMER_KEY);
    } catch (e) {
      /* приватный режим — таймер проживёт до перезагрузки */
    }
  }
  const seconds = timer ? Math.max(0, (Date.now() - timer.startedAt) / 1000) : 0;
  return {
    running: !!timer,
    context: timer,
    subjectId: timer ? timer.subjectId : null,
    seconds,
    start: (ctx) => save({ ...ctx, startedAt: Date.now() }),
    startedAt: timer ? timer.startedAt : null,
    // Сколько минут насчитал таймер; сам таймер останавливается.
    stop: () => {
      const m = timer ? Math.max(1, Math.round((Date.now() - timer.startedAt) / 60000)) : 0;
      save(null);
      return m;
    },
    // Передумали записывать — таймер идёт дальше с того же старта.
    restore: (ctx) => ctx && save(ctx),
    cancel: () => save(null),
  };
}

function PlayIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 4.5v15l12.5-7.5z" fill="currentColor" />
    </svg>
  );
}

// Кнопки в шапке «Сегодня». Таймер — главная: «засечь» проще, чем потом
// вспоминать, сколько занимались. Пока он идёт, на его месте — время и «стоп».
export function LogActions({ timer, subjectName, onStart, onStop, onOpen }) {
  if (timer.running) {
    return (
      <div style={S.actions}>
        <button type="button" onClick={onStop} className="ap-row ap-timer-live" style={{ ...S.actBtn, ...S.timerBtn }} aria-label="Остановить таймер и записать занятие">
          <span style={S.timerDot} aria-hidden="true" />
          <span style={S.clockText}>{clock(timer.seconds)}</span>
          <span style={S.timerName}>{subjectName}</span>
          <span style={S.stopWord}>■ стоп</span>
        </button>
      </div>
    );
  }
  return (
    <div style={S.actions}>
      <button type="button" onClick={onStart} className="ap-row ap-start-head" style={{ ...S.actBtn, ...S.startBtn }} title="Включите и занимайтесь — время запишется само">
        <PlayIcon />
        Засечь занятие
      </button>
      <button type="button" onClick={onOpen} className="ap-row" style={{ ...S.actBtn, ...S.addBtn }} title="Записать уже прошедшее занятие">
        <span aria-hidden="true" style={S.plus}>+</span>
        Записать
      </button>
    </div>
  );
}

// Телефон: плавающая кнопка над нижней панелью. На «Сегодня» — «засечь»,
// а пока таймер идёт, — время на любом экране.
export function TimerFab({ timer, show, onStart, onStop }) {
  if (!timer.running && !show) return null;
  return (
    <button
      type="button"
      className="ap-timer-fab"
      onClick={timer.running ? onStop : onStart}
      style={timer.running ? { ...S.fab, ...S.timerBtn } : { ...S.fab, ...S.startBtn }}
      aria-label={timer.running ? "Остановить таймер и записать" : "Засечь занятие"}
    >
      {timer.running ? (
        <>
          <span style={S.timerDot} aria-hidden="true" />
          <span style={S.clockText}>{clock(timer.seconds)}</span>
          <span style={S.stopWord}>■</span>
        </>
      ) : (
        <>
          <PlayIcon size={16} />
          Засечь
        </>
      )}
    </button>
  );
}

// Подпись идущего таймера: чем заняты.
export function timerLabel(ctx, subjects) {
  if (!ctx) return "";
  if (ctx.kind === "hw") return "ДЗ · " + (ctx.label || "задание");
  const s = ctx.subjectId ? subjects.find((x) => x.id === ctx.subjectId) : null;
  return (s ? s.name : "Занятие") + (ctx.topicName ? " · " + ctx.topicName : "");
}

const dueWord = (d) => (d < 0 ? "просрочено" : d === 0 ? "сегодня" : d === 1 ? "завтра" : "через " + d + " дн.");

// --- окно «Засечь занятие» ----------------------------------------------------
// Перед стартом — чем заняты. Подготовка: предмет списком, как в «Тетрадях», и,
// если нужно, урок внутри него. Домашнее задание: само задание — по окончании
// таймера оно отметится сделанным. На телефоне подготовка — в два шага:
// предметы, потом уроки.
export function StartDialog({ subjects, statsOf, topicsOf, homework, colorOfLyceum, defaultSubjectId, onStart, onClose }) {
  const [kind, setKind] = useState("study");
  const [subjectId, setSubjectId] = useState(defaultSubjectId || (subjects[0] && subjects[0].id) || "");
  const [topicId, setTopicId] = useState("");
  const [hwId, setHwId] = useState(homework[0] ? homework[0].id : "");
  const [step, setStep] = useState("subjects");
  const topics = useMemo(() => (subjectId ? topicsOf(subjectId) : []), [subjectId, topicsOf]);
  const nextTopic = topics.find((t) => !t.done);
  const subject = subjects.find((s) => s.id === subjectId);
  const topic = topics.find((t) => t.id === topicId);
  const hw = homework.find((h) => h.id === hwId);

  const groups = [
    ["Просрочено", homework.filter((h) => h.daysUntil < 0)],
    ["Сегодня", homework.filter((h) => h.daysUntil === 0)],
    ["Завтра", homework.filter((h) => h.daysUntil === 1)],
    ["Позже", homework.filter((h) => h.daysUntil > 1)],
  ].filter(([, l]) => l.length);

  function start() {
    if (kind === "hw") {
      if (!hw) return;
      onStart({ kind: "hw", hwId: hw.id, label: hw.text.length > 40 ? hw.text.slice(0, 38) + "…" : hw.text });
    } else {
      if (!subjectId) return onStart({ kind: "study" });
      onStart(topic ? { kind: "study", subjectId, topicId: topic.id, topicName: topic.name, topicCustom: !!topic.custom } : { kind: "study", subjectId });
    }
  }

  const ready = kind === "hw" ? !!hw : true;
  return (
    <SchoolSheet title="Засечь занятие" onClose={onClose}>
      <div style={S.kindTabs} role="tablist" aria-label="Чем заняты">
        {[
          ["study", "Подготовка", "свой предмет или урок курса"],
          ["hw", "Домашнее задание", homework.length ? homework.length + " не сделано" : "заданий нет"],
        ].map(([k, l, n]) => (
          <button key={k} type="button" role="tab" aria-selected={kind === k} onClick={() => setKind(k)} style={kind === k ? { ...S.kindTab, ...S.kindTabOn } : S.kindTab}>
            <span style={S.kindTitle}>{l}</span>
            <span style={S.kindNote}>{n}</span>
          </button>
        ))}
      </div>

      {kind === "study" ? (
        <div className="ap-start-grid" data-step={step}>
          <nav className="ap-start-subjects" aria-label="Предметы" style={S.pane}>
            <div style={S.groupLabel}>Предметы</div>
            {/* Без предмета — просто засечь время; предмет выбирается, когда
                таймер остановлен, или запись так и остаётся без него. */}
            <button
              type="button"
              className="ap-notes-subject"
              aria-current={!subjectId ? "true" : undefined}
              data-no-subject
              onClick={() => {
                setSubjectId("");
                setTopicId("");
              }}
              style={{ "--c": "var(--mute)", ...S.subjRow, ...(!subjectId ? S.subjRowOn : null) }}
            >
              <span style={{ ...S.dot, background: "var(--mute)" }} />
              <span style={S.subjName}>Без предмета</span>
            </button>
            {subjects.length === 0 && <div style={S.small}>Своих предметов пока нет — добавьте их в «Подготовке».</div>}
            {subjects.map((s) => {
              const st = statsOf(s.id);
              const on = s.id === subjectId;
              return (
                <button
                  key={s.id}
                  type="button"
                  className="ap-notes-subject"
                  aria-current={on ? "true" : undefined}
                  onClick={() => {
                    setSubjectId(s.id);
                    setTopicId("");
                    setStep("topics");
                  }}
                  style={{ "--c": s.color, ...S.subjRow, ...(on ? S.subjRowOn : null) }}
                >
                  <span style={{ ...S.dot, background: s.color }} />
                  <span style={S.subjName}>{s.name}</span>
                  <span style={S.subjCount}>{st.total ? st.done + "/" + st.total : ""}</span>
                </button>
              );
            })}
          </nav>
          <section className="ap-start-topics" aria-label="Уроки" style={S.pane}>
            <button type="button" className="ap-start-back" onClick={() => setStep("subjects")} style={S.back}>
              ‹ Предметы
            </button>
            <div style={S.topicsHead}>
              <span style={{ ...S.dot, width: 11, height: 11, background: subject ? subject.color : "var(--line)" }} />
              <span style={S.topicsTitle}>{subject ? subject.name : "Без предмета"}</span>
            </div>
            {!subject ? (
              <div style={S.small}>Таймер просто считает время. Когда остановите, можно выбрать предмет или записать занятие без него.</div>
            ) : (
            <div style={S.topicList}>
              <button type="button" onClick={() => setTopicId("")} aria-pressed={!topicId} className="ap-notes-subject" style={!topicId ? { ...S.topicRow, ...S.topicRowOn } : S.topicRow}>
                <span style={S.radio(!topicId)} aria-hidden="true" />
                <span style={S.topicName}>
                  Весь предмет
                  <span style={S.topicMeta}>без привязки к уроку</span>
                </span>
              </button>
              {topics.map((t) => {
                const on = t.id === topicId;
                return (
                  <button key={t.id} type="button" onClick={() => setTopicId(t.id)} aria-pressed={on} className="ap-notes-subject" style={on ? { ...S.topicRow, ...S.topicRowOn } : { ...S.topicRow, opacity: t.done ? 0.6 : 1 }}>
                    <span style={S.radio(on)} aria-hidden="true" />
                    <span style={S.topicName}>
                      {t.done ? "✓ " : ""}
                      {t.name}
                      <span style={S.topicMeta}>
                        {t.duration ? minutesLabel(t.duration) : ""}
                        {nextTopic && nextTopic.id === t.id ? " · следующий по курсу" : t.done ? " · пройден" : ""}
                      </span>
                    </span>
                  </button>
                );
              })}
              {topics.length === 0 && <div style={S.small}>Уроков в курсе пока нет — время запишется на предмет.</div>}
            </div>
            )}
          </section>
        </div>
      ) : (
        <div style={S.hwList}>
          {homework.length === 0 && <div style={S.small}>Несделанных заданий нет. Добавить задание можно в «Дневнике» или у урока в «Лицее».</div>}
          {groups.map(([label, list]) => (
            <div key={label} style={S.hwGroup}>
              <div style={{ ...S.groupLabel, color: label === "Просрочено" ? "var(--red)" : "var(--mute)" }}>{label}</div>
              {list.map((h) => {
                const on = h.id === hwId;
                return (
                  <button key={h.id} type="button" onClick={() => setHwId(h.id)} aria-pressed={on} style={on ? { ...S.hwRow, ...S.hwRowOn } : S.hwRow}>
                    <span style={S.radio(on)} aria-hidden="true" />
                    <span style={{ ...S.dot, background: h.subjectName ? colorOfLyceum(h.subjectName) : "var(--mute)" }} />
                    <span style={S.topicName}>
                      {h.text}
                      <span style={S.topicMeta}>
                        {[h.subjectName, h.minutes ? "≈ " + minutesLabel(h.minutes) : ""].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    <span style={{ ...S.hwDue, color: h.daysUntil <= 0 ? "var(--red)" : "var(--ink3)" }}>{dueWord(h.daysUntil)}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}

      <div className="ap-sheet-foot" style={S.footer}>
        <span style={S.preview}>
          {kind === "hw"
            ? hw
              ? "ДЗ · " + hw.text
              : "Выберите задание"
            : (subject ? subject.name : "Без предмета") + (topic ? " · " + topic.name : "")}
          <span style={{ display: "block", fontWeight: 400, color: "var(--ink3)", fontSize: 12.5 }}>
            {kind === "hw"
              ? "когда остановите таймер, задание отметится сделанным"
              : subject
                ? "время запишется в дневник, когда остановите таймер"
                : "предмет можно выбрать, когда остановите таймер"}
          </span>
        </span>
        <button type="button" onClick={onClose} style={S.btnGhost}>
          Отмена
        </button>
        <button type="button" onClick={start} disabled={!ready} style={{ ...S.bigBtn, ...S.startBig, flex: "0 0 auto" }}>
          <PlayIcon size={15} />
          Начать
        </button>
      </div>
    </SchoolSheet>
  );
}

// --- окно «Занятие окончено» -------------------------------------------------
// Таймер остановлен: время уже стоит, остаётся проверить и записать. Домашнее
// задание отмечается сделанным, урок курса — пройденным (по галочке).
// draft — что было выбрано, если запись отменили и вернулись к окну: окно
// открывается с теми же минутами, предметом, уроком и заметкой.
// onDiscard — «Не записывать»: занятие не попадёт в дневник.
export function FinishDialog({ context, minutes: initialMinutes, draft, subjects, topicsOf, homeworkItem, todayHours, goalHours, onSave, onResume, onDiscard, onClose }) {
  const isHw = context && context.kind === "hw";
  const d = draft || {};
  const [minutes, setMinutes] = useState(d.minutes || initialMinutes);
  const [subjectId, setSubjectId] = useState(d.subjectId !== undefined ? d.subjectId : (context && context.subjectId) || "");
  const [topicId, setTopicId] = useState(d.topicId !== undefined ? d.topicId : (context && context.topicId) || "");
  const [markDone, setMarkDone] = useState(d.markDone !== undefined ? d.markDone : isHw ? true : false);
  const [note, setNote] = useState(d.note || "");
  const topics = useMemo(() => (subjectId && !isHw ? topicsOf(subjectId) : []), [subjectId, topicsOf, isHw]);
  const topic = topics.find((t) => t.id === topicId);
  const subject = subjects.find((s) => s.id === subjectId);
  const after = round1(todayHours + minutes / 60);

  function save() {
    if (minutes <= 0) return;
    if (isHw) onSave({ kind: "hw", hwId: context.hwId, minutes, markDone });
    else onSave({ kind: "study", subjectId, topic: topic || null, markDone: !!topic && markDone && !topic.done, minutes, note: note.trim() });
  }

  return (
    <SchoolSheet title="Занятие окончено" onClose={onClose}>
      <div style={S.doneHead}>
        <span style={S.stoppedMark} aria-hidden="true">■</span>
        <div style={{ flex: 1 }}>
          <div style={S.doneWhat}>{isHw ? "Домашнее задание" : subject ? subject.name + (topic ? " · " + topic.name : "") : "Занятие без предмета"}</div>
          <div style={S.small}>таймер насчитал {minutesLabel(initialMinutes)} — можно поправить</div>
        </div>
        <div style={S.minuteEdit}>
          <button type="button" onClick={() => setMinutes((m) => Math.max(1, m - 5))} style={S.stepBtn} aria-label="Меньше на 5 минут">
            −
          </button>
          <span style={S.minuteValue}>{minutesLabel(minutes)}</span>
          <button type="button" onClick={() => setMinutes((m) => m + 5)} style={S.stepBtn} aria-label="Больше на 5 минут">
            +
          </button>
        </div>
      </div>

      {isHw ? (
        <div style={{ ...S.hwRow, ...S.hwRowOn, cursor: "default" }}>
          <span style={{ ...S.dot, background: "var(--accent)" }} />
          <span style={S.topicName}>
            {homeworkItem ? homeworkItem.text : context.label}
            <span style={S.topicMeta}>
              {homeworkItem ? [homeworkItem.subjectName, homeworkItem.minutes ? "оценка — " + minutesLabel(homeworkItem.minutes) : ""].filter(Boolean).join(" · ") : "задание удалено"}
            </span>
          </span>
        </div>
      ) : (
        <>
          <div style={S.field}>
            <span style={S.label}>Предмет</span>
            <div style={S.chips}>
              <button type="button" onClick={() => { setSubjectId(""); setTopicId(""); }} aria-pressed={!subjectId} data-no-subject style={!subjectId ? { ...S.chip, ...S.chipOn } : S.chip}>
                Без предмета
              </button>
              {subjects.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    setSubjectId(s.id);
                    setTopicId("");
                  }}
                  aria-pressed={s.id === subjectId}
                  style={s.id === subjectId ? { ...S.chip, ...S.chipOn } : S.chip}
                >
                  <span style={{ ...S.dot, background: s.id === subjectId ? "var(--btnInk)" : s.color }} />
                  {s.name}
                </button>
              ))}
            </div>
          </div>
          {topics.length > 0 && (
            <div style={S.field}>
              <span style={S.label}>Урок</span>
              <select value={topicId} onChange={(e) => setTopicId(e.target.value)} style={S.input}>
                <option value="">— весь предмет —</option>
                {topics.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.done ? "✓ " : ""}
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div style={S.field}>
            <span style={S.label}>Что прошли — необязательно</span>
            <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Например: конституционные права, § 4" style={{ ...S.input, height: "auto", padding: "9px 12px", resize: "vertical" }} />
          </div>
        </>
      )}

      {(isHw || (topic && !topic.done)) && (
        <label style={S.markRow}>
          <input type="checkbox" checked={markDone} onChange={(e) => setMarkDone(e.target.checked)} style={{ width: 20, height: 20, accentColor: "var(--green)" }} />
          <span>{isHw ? "Задание сделано — отметить" : "Урок пройден — отметить в «Подготовке»"}</span>
        </label>
      )}

      <div className="ap-sheet-foot" style={S.footer}>
        <span style={S.preview}>
          {minutesLabel(minutes)}
          {!isHw && goalHours > 0 && (
            <span style={{ display: "block", color: after >= goalHours ? "var(--green)" : "var(--ink3)" }}>
              Сегодня станет {hours(after)} из {hours(goalHours)}
              {after >= goalHours ? " — цель дня взята ✓" : ""}
            </span>
          )}
        </span>
        <button type="button" onClick={onDiscard} style={S.btnGhost} data-discard>
          Не записывать
        </button>
        <button type="button" onClick={onResume} style={S.btnGhost}>
          ▶ Продолжить таймер
        </button>
        <button type="button" onClick={save} disabled={minutes <= 0} style={S.btnDark}>
          Записать
        </button>
      </div>
    </SchoolSheet>
  );
}

// --- окно «+ Записать» --------------------------------------------------------
// Для занятия, которое уже было: таймер не включали.
const QUICK = [15, 30, 45, 60, 90, 120];

// initialDate — день, выбранный в «Дневнике»: запись сразу ляжет на него.
export function LogDialog({ subjects, topicsOf, initialSubjectId, initialDate, todayHours, goalHours, onSave, onClose, onTimer }) {
  const today = ymd(new Date());
  const yesterday = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return ymd(d);
  })();
  const startDate = initialDate && initialDate < today ? initialDate : today;
  const [subjectId, setSubjectId] = useState(initialSubjectId || "");
  const [minutes, setMinutes] = useState(60);
  const [custom, setCustom] = useState("");
  const [when, setWhen] = useState(startDate === today ? "today" : startDate === yesterday ? "yesterday" : "other");
  const [otherDate, setOtherDate] = useState(startDate);
  const [topic, setTopic] = useState("");
  const [note, setNote] = useState("");

  const date = when === "today" ? today : when === "yesterday" ? yesterday : otherDate;
  const customHours = Number(String(custom).replace(",", "."));
  const total = custom.trim() && Number.isFinite(customHours) ? Math.max(0, customHours * 60) : minutes;
  const topics = useMemo(() => (subjectId ? topicsOf(subjectId) : []), [subjectId, topicsOf]);
  const subject = subjects.find((s) => s.id === subjectId);
  const after = round1(todayHours + total / 60);

  function save() {
    if (total <= 0) return;
    const text = [topic, note.trim()].filter(Boolean).join(" — ");
    // Две цифры после запятой: четверть часа — это 0,25, а не округлённые 0,3.
    onSave({ date, subjectId, hours: Math.round((total / 60) * 100) / 100, note: text });
  }

  return (
    <SchoolSheet title="Записать занятие" onClose={onClose}>
      <div style={S.field}>
        <span style={S.label}>Предмет</span>
        <div style={S.chips}>
          <button type="button" onClick={() => { setSubjectId(""); setTopic(""); }} aria-pressed={!subjectId} data-no-subject style={!subjectId ? { ...S.chip, ...S.chipOn } : S.chip}>
            Без предмета
          </button>
          {subjects.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                setSubjectId(s.id);
                setTopic("");
              }}
              aria-pressed={s.id === subjectId}
              style={s.id === subjectId ? { ...S.chip, ...S.chipOn } : S.chip}
            >
              <span style={{ ...S.dot, background: s.id === subjectId ? "var(--btnInk)" : s.color }} />
              {s.name}
            </button>
          ))}
        </div>
      </div>

      <div style={S.field}>
        <span style={S.label}>Сколько</span>
        <div style={S.chips}>
          {QUICK.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMinutes(m);
                setCustom("");
              }}
              aria-pressed={!custom.trim() && minutes === m}
              style={!custom.trim() && minutes === m ? { ...S.chip, ...S.chipOn } : S.chip}
            >
              {minutesLabel(m)}
            </button>
          ))}
          <label style={S.customWrap}>
            <input
              type="text"
              inputMode="decimal"
              placeholder="другое"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              style={S.customInput}
              aria-label="Своё время в часах"
            />
            <span style={S.unit}>ч</span>
          </label>
        </div>
        {onTimer && (
          <button type="button" onClick={onTimer} style={S.timerStart}>
            ▶ Лучше засечь таймером — время посчитается само
          </button>
        )}
      </div>

      <div style={S.field}>
        <span style={S.label}>Когда</span>
        <div style={S.seg}>
          {[
            ["today", "Сегодня"],
            ["yesterday", "Вчера"],
            ["other", "Другой день"],
          ].map(([k, l]) => (
            <button key={k} type="button" onClick={() => setWhen(k)} aria-pressed={when === k} style={when === k ? { ...S.segBtn, ...S.segOn } : S.segBtn}>
              {l}
            </button>
          ))}
        </div>
        {when === "other" && <input type="date" value={otherDate} max={today} onChange={(e) => setOtherDate(e.target.value)} style={S.input} />}
      </div>

      {topics.length > 0 && (
        <div style={S.field}>
          <span style={S.label}>Урок из курса — необязательно</span>
          <select value={topic} onChange={(e) => setTopic(e.target.value)} style={S.input}>
            <option value="">— без привязки к уроку —</option>
            {topics.map((t) => (
              <option key={t.id} value={t.name}>
                {t.done ? "✓ " : ""}
                {t.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div style={S.field}>
        <span style={S.label}>Что прошли</span>
        <textarea
          rows={2}
          placeholder="Например: конституционные права, § 4"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          style={{ ...S.input, height: "auto", padding: "9px 12px", resize: "vertical" }}
        />
      </div>

      <div className="ap-sheet-foot" style={S.footer}>
        <span style={S.preview}>
          {(subject ? subject.name : "Без предмета") + " · " + minutesLabel(total)}
          {date === today && goalHours > 0 && total > 0 && (
            <span style={{ display: "block", color: after >= goalHours ? "var(--green)" : "var(--ink3)" }}>
              Сегодня станет {hours(after)} из {hours(goalHours)}
              {after >= goalHours ? " — цель дня взята ✓" : ""}
            </span>
          )}
        </span>
        <button type="button" onClick={onClose} style={S.btnGhost}>
          Отмена
        </button>
        <button type="button" onClick={save} disabled={total <= 0} style={S.btnDark}>
          Записать
        </button>
      </div>
    </SchoolSheet>
  );
}

// --- «Сегодня»: неделя -------------------------------------------------------
// Семь дней столбиками и предметы, что отстают от плана. Подробности — во
// вкладке «Факт и прогноз».
export function WeekCard({ journal, subjects, alloc, goalForDate, onFact }) {
  const days = [];
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = ymd(d);
    const h = journal.filter((e) => e.date === key).reduce((s, e) => s + (Number(e.hours) || 0), 0);
    days.push({ key, label: DAY_SHORT[DOW[d.getDay()]], h, goal: goalForDate(d), today: i === 0 });
  }
  const max = Math.max(1, ...days.map((d) => Math.max(d.h, d.goal)));
  const total = round1(days.reduce((s, d) => s + d.h, 0));
  const since = days[0].key;
  const by = {};
  journal.forEach((e) => {
    if (e.date >= since) by[e.subjectId] = (by[e.subjectId] || 0) + (Number(e.hours) || 0);
  });
  const plan = subjects.reduce((s, x) => s + (Number(alloc[x.id]) || 0), 0);
  const lag = subjects
    .map((s) => ({ name: s.name, plan: Number(alloc[s.id]) || 0, fact: round1(by[s.id] || 0) }))
    .filter((x) => x.plan > 0 && x.fact < x.plan * 0.6)
    .sort((a, b) => a.fact / a.plan - b.fact / b.plan)
    .slice(0, 3);
  const topId = Object.keys(by).sort((a, b) => by[b] - by[a])[0];
  const top = subjects.find((s) => s.id === topId);
  return (
    <section className="ap-card" style={S.card} aria-label="Последние 7 дней">
      <div style={S.cardHead}>
        <span style={S.cardTitle}>Последние 7 дней</span>
        <span style={S.cardMeta}>
          {hours(total)}
          {plan > 0 ? " из " + hours(plan) : ""}
        </span>
      </div>
      <div style={S.week} role="img" aria-label={"По дням: " + days.map((d) => d.label + " " + num(d.h)).join(", ")}>
        {days.map((d) => (
          <div key={d.key} style={S.weekCol}>
            <div style={S.weekBarBox}>
              {d.goal > 0 && <span style={{ ...S.weekGoal, bottom: (d.goal / max) * 100 + "%" }} />}
              <span
                style={{
                  ...S.weekBar,
                  height: Math.max(d.h > 0 ? 4 : 0, (d.h / max) * 100) + "%",
                  background: d.goal > 0 && d.h >= d.goal ? "var(--green)" : d.h > 0 ? "var(--accent)" : "transparent",
                }}
              />
            </div>
            <span style={{ ...S.weekLabel, ...(d.today ? S.weekToday : null) }}>{d.label}</span>
          </div>
        ))}
      </div>
      {top && <span style={S.small}>больше всего — {top.name}</span>}
      {lag.length > 0 && (
        <div style={S.lag}>
          <span style={S.lagTitle}>Отстают от плана</span>
          {lag.map((x) => (
            <span key={x.name} style={S.small}>
              {x.name} · {num(x.fact)} из {hours(x.plan)}
            </span>
          ))}
        </div>
      )}
      <button type="button" onClick={onFact} style={S.link}>
        Факт и прогноз в «Распределении» →
      </button>
    </section>
  );
}

// --- «Распределение» → «Факт и прогноз» ------------------------------------
// Дополняет «План» (там КПВ и настройки): как время уходило на самом деле и
// что из этого следует. Ничего не настраивает — только считает.
function mondayOf(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

export function BudgetFact({ journal, subjects, extraSubjects, alloc, weeklyBudget, remaining, mainEvent, formatDate, onPlan, children }) {
  const [span, setSpan] = useState(4);
  const now = new Date();
  const thisMonday = mondayOf(now);
  const weeks = [];
  for (let i = span - 1; i >= 0; i -= 1) {
    const from = new Date(thisMonday);
    from.setDate(from.getDate() - i * 7);
    const to = new Date(from);
    to.setDate(to.getDate() + 6);
    weeks.push({ from: ymd(from), to: ymd(to), current: i === 0, label: i === 0 ? "эта неделя" : from.getDate() + " " + MONTHS[from.getMonth()] });
  }
  const all = subjects.concat(extraSubjects || []);
  weeks.forEach((w) => {
    w.by = {};
    journal.forEach((e) => {
      if (e.date >= w.from && e.date <= w.to) w.by[e.subjectId] = (w.by[e.subjectId] || 0) + (Number(e.hours) || 0);
    });
    w.total = round1(Object.values(w.by).reduce((s, v) => s + v, 0));
  });
  const plan = round1(subjects.reduce((s, x) => s + (Number(alloc[x.id]) || 0), 0));
  // Темп — часы за последние 4 недели, пересчитанные на неделю. Но только с
  // первой записи: кто начал вести дневник пять дней назад, не «стоял» три
  // недели до этого — их просто не было.
  const todayKey = ymd(now);
  const firstDate = journal.reduce((min, e) => (e.date && e.date <= todayKey && (!min || e.date < min) ? e.date : min), "");
  const windowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 27);
  const startKey = firstDate && firstDate > ymd(windowStart) ? firstDate : ymd(windowStart);
  const daysCovered = Math.max(1, Math.round((new Date(todayKey + "T00:00:00") - new Date(startKey + "T00:00:00")) / 86400000) + 1);
  const sumBy = {};
  journal.forEach((e) => {
    if (e.date >= startKey && e.date <= todayKey) sumBy[e.subjectId] = (sumBy[e.subjectId] || 0) + (Number(e.hours) || 0);
  });
  const avgOf = (id) => ((sumBy[id] || 0) / daysCovered) * 7;
  const avgTotal = (Object.values(sumBy).reduce((s, v) => s + v, 0) / daysCovered) * 7;
  const full = weeks.filter((w) => !w.current);
  const scale = Math.max(1, plan, weeklyBudget, ...weeks.map((w) => w.total)) * 1.08;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const eventDate = mainEvent ? new Date(mainEvent.date + "T00:00:00") : null;
  const weeksToEvent = eventDate ? Math.max(0.15, (eventDate - today) / (7 * 86400000)) : null;

  const rows = subjects.map((s) => {
    const p = Number(alloc[s.id]) || 0;
    const avg = round1(avgOf(s.id));
    const rem = remaining[s.id] || { lessons: 0, hours: 0 };
    let end = "—";
    let ok = null;
    let todo = "";
    if (rem.lessons === 0) {
      todo = avg > 0 ? "уроков не осталось — часы можно отдать другим" : "уроков нет";
      ok = true;
      end = rem.total ? "курс пройден" : "—";
    } else if (avg <= 0) {
      end = "не движется";
      ok = false;
      todo = p > 0 ? "по плану " + hours(p) + " в неделю, а записей нет" : "часов в плане нет";
    } else {
      const w = rem.hours / avg;
      const d = new Date(today);
      d.setDate(d.getDate() + Math.ceil(w * 7));
      end = d.getDate() + " " + MONTHS[d.getMonth()] + (d.getFullYear() !== today.getFullYear() ? " " + d.getFullYear() : "");
      ok = eventDate ? d <= eventDate : null;
      if (eventDate && !ok) {
        const need = round1(rem.hours / weeksToEvent);
        todo = "к «" + mainEvent.name + "» нужно ≈ " + hours(need) + " в неделю";
      } else if (p > 0 && avg < p * 0.6) todo = "отстаёт от плана";
      else todo = "держите темп";
    }
    return { ...s, plan: p, avg, facts: full.concat(weeks.filter((w) => w.current)).map((w) => round1(w.by[s.id] || 0)), rem, end, ok, todo };
  });

  const insights = [];
  if (plan > 0 && weeklyBudget > 0 && plan > weeklyBudget + 0.25) {
    insights.push({
      tone: "bad",
      title: `План ${hours(plan)}, а в неделю делаете ${hours(avgTotal)}`,
      text: `Бюджет — ${hours(weeklyBudget)}: план на ${hours(plan - weeklyBudget)} больше, чем есть. Снимите часы во вкладке «План».`,
    });
  } else if (plan > 0 && avgTotal < plan * 0.8 && journal.length) {
    insights.push({ tone: "warn", title: `В среднем ${hours(avgTotal)} из ${hours(plan)} по плану`, text: "План реальный, но недели не добираются до него." });
  }
  const lag = rows.filter((r) => r.plan > 0 && r.avg < r.plan * 0.6);
  if (lag.length) {
    insights.push({
      tone: "bad",
      title: lag.map((r) => r.name).join(", ") + (lag.length > 1 ? " почти стоят" : " почти стоит"),
      text: lag.map((r) => `${r.name} — ${num(r.avg)} из ${hours(r.plan)} в неделю`).join("; ") + ".",
    });
  }
  const over = rows.filter((r) => r.plan >= 0 && r.avg > r.plan * 1.2 + 0.5);
  if (over.length) {
    insights.push({
      tone: "warn",
      title: over.map((r) => r.name).join(", ") + " берёт больше плана",
      text: over.map((r) => `${r.name} — ${num(r.avg)} при плане ${hours(r.plan)}${r.rem.lessons === 0 ? ", а уроков не осталось" : ""}`).join("; ") + ".",
    });
  }
  const good = rows.filter((r) => r.ok && r.rem.lessons > 0 && r.avg > 0);
  if (good.length) {
    insights.push({ tone: "ok", title: good.map((r) => r.name).join(", ") + (eventDate ? " успеваете к событию" : " идут по плану"), text: good.map((r) => `${r.name} — курс к ${r.end}`).join("; ") + "." });
  }
  if (!journal.length) {
    insights.push({ tone: "warn", title: "Пока нет записей", text: "Прогноз появится, когда в дневнике будут занятия." });
  } else if (daysCovered < 7) {
    insights.push({ tone: "warn", title: "Записей меньше недели", text: `Темп посчитан по ${daysCovered} ${daysCovered === 1 ? "дню" : "дням"} — прогноз станет точнее через неделю.` });
  }

  return (
    <div className="ap-fact">
      <div className="ap-fact-top">
        <section className="ap-card" style={S.card} aria-label="Неделя за неделей">
          <div style={S.cardHead}>
            <span style={S.cardTitle}>Неделя за неделей</span>
            <div style={S.seg}>
              {[
                [4, "4 недели"],
                [8, "8 недель"],
                [12, "12 недель"],
              ].map(([n, l]) => (
                <button key={n} type="button" onClick={() => setSpan(n)} aria-pressed={span === n} style={span === n ? { ...S.segBtn, ...S.segOn } : S.segBtn}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          <div style={S.legendLine}>
            столбик — сделано по предметам · <span style={{ color: "var(--red)" }}>пунктир — план {hours(plan)}</span> ·{" "}
            <span style={{ color: "var(--green)" }}>линия — бюджет {hours(weeklyBudget)}</span>
          </div>
          <div style={S.chart}>
            {plan > 0 && <span style={{ ...S.planLine, bottom: (plan / scale) * 100 + "%" }} />}
            {weeklyBudget > 0 && <span style={{ ...S.budgetLine, bottom: (weeklyBudget / scale) * 100 + "%" }} />}
            {weeks.map((w) => (
              <div key={w.from} style={S.chartCol}>
                <span style={S.chartTotal}>{w.total ? num(w.total) : ""}</span>
                <div style={{ ...S.stack, height: (w.total / scale) * 100 + "%", opacity: w.current ? 0.75 : 1 }}>
                  {all
                    .filter((s) => w.by[s.id])
                    .map((s) => (
                      <span key={s.id} title={s.name + ": " + hours(w.by[s.id])} style={{ flexGrow: w.by[s.id], background: s.color }} />
                    ))}
                </div>
              </div>
            ))}
          </div>
          <div style={S.chartLabels}>
            {weeks.map((w) => (
              <span key={w.from} style={{ ...S.chartLabel, fontWeight: w.current ? 700 : 400 }}>
                {w.label}
              </span>
            ))}
          </div>
        </section>

        <section style={S.insights} aria-label="Выводы">
          {insights.map((i) => (
            <div key={i.title} style={i.tone === "bad" ? S.insBad : i.tone === "ok" ? S.insOk : S.insWarn}>
              <span style={{ ...S.insMark, background: i.tone === "bad" ? "var(--red)" : i.tone === "ok" ? "var(--green)" : "var(--accent)" }} aria-hidden="true">
                {i.tone === "bad" ? "!" : i.tone === "ok" ? "✓" : "↔"}
              </span>
              <div style={S.insBody}>
                <span style={S.insTitle}>{i.title}</span>
                <span style={S.insText}>{i.text}</span>
              </div>
            </div>
          ))}
          <button type="button" onClick={onPlan} style={S.link}>
            Поправить план и посмотреть КПВ — вкладка «План» →
          </button>
        </section>
      </div>

      <section className="ap-card" style={S.card} aria-label="По предметам">
        <div style={S.cardHead}>
          <span style={S.cardTitle}>По предметам</span>
          <span style={S.cardMeta}>
            «в среднем» — часы в неделю за последние {daysCovered} {daysCovered % 10 === 1 && daysCovered !== 11 ? "день" : [2, 3, 4].includes(daysCovered % 10) && ![12, 13, 14].includes(daysCovered) ? "дня" : "дней"}; прогноз — если так и дальше
            {mainEvent ? " · событие «" + mainEvent.name + "», " + formatDate(mainEvent.date) : ""}
          </span>
        </div>
        <div className="ap-fact-table">
          <div className="ap-fact-row ap-fact-head">
            <span>Предмет</span>
            <span className="r">План</span>
            <span>По неделям</span>
            <span className="r">В среднем</span>
            <span className="r">Осталось</span>
            <span>Закончите</span>
            <span>Что сделать</span>
          </div>
          {rows.map((r) => (
            <div key={r.id} className="ap-fact-row">
              <span style={S.rowName}>
                <span style={{ ...S.dot, background: r.color }} />
                {r.name}
              </span>
              <span className="r">{r.plan ? hours(r.plan) : "—"}</span>
              <span style={S.minis} aria-label={"по неделям: " + r.facts.map(num).join(", ")}>
                {r.facts.map((v, i) => (
                  <span
                    key={i}
                    style={{
                      ...S.mini,
                      height: Math.max(2, (v / Math.max(1, r.plan * 1.4, ...r.facts)) * 26),
                      background: r.plan && v > r.plan * 1.2 ? "var(--red)" : r.color,
                      opacity: v === 0 ? 0.25 : 1,
                    }}
                  />
                ))}
              </span>
              <span className="r" style={{ fontWeight: 600, color: r.plan && r.avg < r.plan * 0.6 ? "var(--red)" : "var(--ink)" }}>
                {hours(r.avg)}
              </span>
              <span className="r" style={S.muted}>
                {r.rem.lessons ? r.rem.lessons + " ур. · " + hours(r.rem.hours) : "—"}
              </span>
              <span style={{ fontWeight: 600, color: r.ok === null ? "var(--ink2)" : r.ok ? "var(--green)" : "var(--red)" }}>
                {r.end}
                {r.ok && r.rem.lessons > 0 && eventDate ? " ✓" : ""}
              </span>
              <span style={S.muted}>{r.todo}</span>
            </div>
          ))}
        </div>
      </section>

      {children}
    </div>
  );
}

export const TODAY_CSS = `
/* Идущий таймер: точка мягко пульсирует — видно, что время идёт. */
.ap-timer-live > span:first-child, .ap-timer-fab > span:first-child { animation: ap-timer-pulse 1.6s ease-in-out infinite; }
@keyframes ap-timer-pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: .35; transform: scale(.7); } }
@media (prefers-reduced-motion: reduce) { .ap-timer-live > span:first-child, .ap-timer-fab > span:first-child { animation: none; } }
.ap-timer-fab { display: none !important; }
.ap-timer-card.is-live { box-shadow: var(--shadow); }
.ap-start-grid { display: grid; grid-template-columns: 250px minmax(0, 1fr); gap: 12px; height: min(52vh, 460px); }
.ap-start-back { display: none !important; }
.ap-today-pulse { display: flex; align-items: stretch; gap: 0; border: 1px solid var(--line); border-radius: 14px; background: var(--panel); }
.ap-today-pulse > div { padding: 7px 16px; display: flex; flex-direction: column; justify-content: center; }
.ap-today-pulse > div + div { border-left: 1px solid var(--line2); }
.ap-today3 { display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr) minmax(0, .85fr); gap: 16px; align-items: start; }
.ap-today3 > div { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
.ap-today3 .ap-card { margin-bottom: 0 !important; }
.ap-fact { display: flex; flex-direction: column; gap: 16px; }
.ap-fact-top { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); gap: 16px; align-items: start; }
.ap-fact .ap-card { margin-bottom: 0 !important; }
.ap-fact-table { overflow-x: auto; }
.ap-fact-row {
  display: grid; grid-template-columns: 150px 64px 120px 84px 116px 110px minmax(160px, 1fr); gap: 12px; align-items: center;
  min-height: 46px; border-bottom: 1px solid var(--line2); font-size: 14px; min-width: 820px;
}
.ap-fact-row .r { text-align: right; }
.ap-fact-head { min-height: 34px; font-size: 11.5px; letter-spacing: .05em; text-transform: uppercase; color: var(--mute); border-bottom-color: var(--line); }
@media (max-width: 1280px) {
  .ap-today3 { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
  .ap-today3 > div:last-child { grid-column: 1 / -1; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
  .ap-fact-top { grid-template-columns: minmax(0, 1fr); }
}
`;

// Телефон: вариант A — полоса чисел, уроки, дела, неделя, впереди.
export const TODAY_MOBILE_CSS = `
.ap-timer-fab { display: inline-flex !important; }
/* На телефоне «засечь» — плавающей кнопкой у большого пальца, в шапке — только «+ Записать». */
.ap-start-head { display: none !important; }
/* Окно «Засечь занятие» на телефоне — в два шага: предметы, потом уроки. */
.ap-start-grid { grid-template-columns: minmax(0, 1fr); height: auto; max-height: 56vh; }
.ap-start-grid > * { max-height: 56vh; }
.ap-start-grid[data-step="subjects"] .ap-start-topics, .ap-start-grid[data-step="topics"] .ap-start-subjects { display: none !important; }
.ap-start-back { display: inline-flex !important; }
.ap-sheet-foot > span { flex: 1 1 100% !important; }
.ap-sheet-foot > button { flex: 1 1 0 !important; justify-content: center; }
.ap-today3, .ap-today3 > div:last-child { grid-template-columns: minmax(0, 1fr) !important; display: flex; flex-direction: column; gap: 12px; }
.ap-today3 > div { gap: 12px; }
.ap-today-pulse { width: 100%; margin-bottom: 12px; }
.ap-today-pulse > div { flex: 1; padding: 8px 6px; align-items: center; text-align: center; }
.ap-fact-row { min-width: 0; grid-template-columns: minmax(0, 1fr) auto; row-gap: 2px; padding: 8px 0; }
.ap-fact-row > span:nth-child(2), .ap-fact-row > span:nth-child(3), .ap-fact-row > span:nth-child(5) { display: none; }
.ap-fact-row > span:nth-child(7) { grid-column: 1; font-size: 12px; }
.ap-fact-row > span:nth-child(6) { grid-column: 2; grid-row: 2; text-align: right; font-size: 12.5px; }
.ap-fact-head { display: none; }
`;

const S = {
  card: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: "var(--radius)", padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10 },
  cardHead: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" },
  cardTitle: { flex: 1, minWidth: 0, fontFamily: "var(--serif)", fontSize: 20 },
  cardMeta: { fontSize: 12.5, color: "var(--ink3)" },
  small: { fontSize: 12.5, color: "var(--ink3)" },
  muted: { fontSize: 13, color: "var(--ink3)" },
  link: { alignSelf: "flex-start", border: "none", background: "none", padding: "2px 0", color: "var(--accent)", fontSize: 13, fontWeight: 600, textAlign: "left" },
  dot: { width: 9, height: 9, borderRadius: "50%", flexShrink: 0, display: "inline-block" },
  plus: { fontSize: 18, lineHeight: 1, marginRight: 2 },
  actions: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" },
  actBtn: { minHeight: 46, padding: "0 18px", border: "none", borderRadius: 12, fontSize: 14.5, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 9 },
  startBtn: { background: "var(--green)", color: "#FBF8F1", boxShadow: "0 6px 18px rgba(47,107,79,.28)" },
  addBtn: { background: "var(--btnBg)", color: "var(--btnInk)" },
  timerBtn: { background: "var(--red)", color: "#FBF8F1", fontVariantNumeric: "tabular-nums", boxShadow: "0 6px 18px rgba(164,69,44,.3)" },
  timerDot: { width: 9, height: 9, borderRadius: "50%", background: "#FBF8F1", flexShrink: 0 },
  timerName: { fontWeight: 400, opacity: 0.85 },
  clockText: { fontVariantNumeric: "tabular-nums", fontSize: 16 },
  stopWord: { marginLeft: 4, padding: "2px 8px", borderRadius: 8, background: "rgba(251,248,241,.18)", fontSize: 12.5 },
  timerCard: { background: "linear-gradient(135deg, var(--greenSoft), var(--panel) 70%)", borderColor: "var(--green)" },
  timerCardLive: { background: "linear-gradient(135deg, var(--redBg), var(--panel) 75%)", borderColor: "var(--red)" },
  timerBadge: { height: 22, padding: "0 9px", borderRadius: 11, background: "var(--btnBg)", color: "var(--btnInk)", fontSize: 11.5, fontWeight: 700, display: "inline-flex", alignItems: "center", letterSpacing: ".02em" },
  bigClock: { fontFamily: "var(--serif)", fontSize: 46, lineHeight: 1, fontVariantNumeric: "tabular-nums", color: "var(--red)" },
  timerSub: { fontSize: 14, fontWeight: 600 },
  timerPitch: { fontSize: 14, lineHeight: 1.5, color: "var(--ink2)" },
  chipSm: { minHeight: 32, padding: "0 10px", borderRadius: 16, border: "1px solid var(--line)", background: "var(--panel2)", color: "var(--ink)", fontSize: 13, display: "inline-flex", alignItems: "center", gap: 6 },
  timerBtns: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" },
  bigBtn: { minHeight: 46, padding: "0 18px", border: "none", borderRadius: 12, fontSize: 15, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 9 },
  startBig: { background: "var(--green)", color: "#FBF8F1", flex: "1 1 auto", justifyContent: "center" },
  stopBtn: { background: "var(--red)", color: "#FBF8F1", flex: "1 1 auto", justifyContent: "center" },
  kindTabs: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 },
  kindTab: { display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2, padding: "10px 14px", borderRadius: 14, border: "1px solid var(--line)", background: "var(--panel2)", color: "var(--ink)", textAlign: "left" },
  kindTabOn: { background: "var(--btnBg)", borderColor: "var(--btnBg)", color: "var(--btnInk)" },
  kindTitle: { fontSize: 15, fontWeight: 700 },
  kindNote: { fontSize: 12.5, opacity: 0.75 },
  pane: { display: "flex", flexDirection: "column", gap: 2, minWidth: 0, overflowY: "auto", padding: "8px 6px", border: "1px solid var(--line2)", borderRadius: 14, background: "var(--panel)" },
  groupLabel: { padding: "2px 10px 6px", fontSize: 11.5, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--mute)" },
  subjRow: { display: "flex", alignItems: "center", gap: 10, width: "100%", minHeight: 42, padding: "0 10px", border: "none", borderRadius: 10, color: "var(--ink)", fontSize: 14, textAlign: "left", background: "transparent" },
  subjRowOn: { fontWeight: 600, background: "var(--neutralBg)" },
  subjName: { flex: 1, minWidth: 0, lineHeight: 1.25, padding: "5px 0" },
  subjCount: { fontSize: 12, color: "var(--mute)" },
  back: { alignSelf: "flex-start", border: "none", background: "none", padding: "4px 6px", fontSize: 14, color: "var(--ink3)" },
  topicsHead: { display: "flex", alignItems: "center", gap: 10, padding: "4px 10px 8px" },
  topicsTitle: { fontFamily: "var(--serif)", fontSize: 19 },
  topicList: { display: "flex", flexDirection: "column", gap: 2 },
  topicRow: { display: "flex", alignItems: "flex-start", gap: 10, width: "100%", padding: "8px 10px", border: "none", borderRadius: 10, background: "transparent", color: "var(--ink)", textAlign: "left" },
  topicRowOn: { background: "var(--greenSoft)" },
  topicName: { flex: 1, minWidth: 0, fontSize: 14, lineHeight: 1.35, display: "flex", flexDirection: "column" },
  topicMeta: { fontSize: 12, color: "var(--ink3)", marginTop: 1 },
  radio: (on) => ({ width: 18, height: 18, flexShrink: 0, marginTop: 1, borderRadius: "50%", border: on ? "6px solid var(--green)" : "2px solid var(--line)", boxSizing: "border-box", background: "var(--panel2)" }),
  hwList: { display: "flex", flexDirection: "column", gap: 12, maxHeight: "52vh", overflowY: "auto" },
  hwGroup: { display: "flex", flexDirection: "column", gap: 4 },
  hwRow: { display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 12px", borderRadius: 12, border: "1px solid var(--line2)", background: "var(--panel2)", color: "var(--ink)", textAlign: "left" },
  hwRowOn: { borderColor: "var(--green)", background: "var(--greenSoft)" },
  hwDue: { fontSize: 12.5, fontWeight: 700, whiteSpace: "nowrap" },
  doneHead: { display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 14, background: "var(--greenSoft)", flexWrap: "wrap" },
  doneWhat: { fontSize: 15, fontWeight: 600 },
  minuteEdit: { display: "flex", alignItems: "center", gap: 6 },
  stepBtn: { width: 34, height: 34, borderRadius: 9, border: "1px solid var(--line)", background: "var(--panel2)", fontSize: 17, color: "var(--ink2)" },
  minuteValue: { minWidth: 78, textAlign: "center", fontFamily: "var(--serif)", fontSize: 22 },
  markRow: { display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 12, border: "1px solid var(--line)", fontSize: 14, cursor: "pointer" },
  fab: { position: "fixed", right: 16, bottom: "calc(96px + env(safe-area-inset-bottom))", zIndex: 30, minHeight: 52, padding: "0 20px", border: "none", borderRadius: 26, fontSize: 15, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 9 },
  stoppedBox: { display: "flex", gap: 10, alignItems: "center", padding: "10px 12px", borderRadius: 12, background: "var(--greenSoft)", fontSize: 14, lineHeight: 1.45 },
  stoppedMark: { width: 26, height: 26, borderRadius: 8, background: "var(--green)", color: "#FBF8F1", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, flexShrink: 0 },
  timerBox: { display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 12, background: "var(--redBg)", border: "1px solid var(--redLine)", fontSize: 14, flexWrap: "wrap" },
  timerStart: { alignSelf: "flex-start", border: "1px dashed var(--line)", borderRadius: 10, background: "transparent", padding: "8px 12px", fontSize: 13.5, color: "var(--ink2)", marginTop: 4 },
  field: { display: "flex", flexDirection: "column", gap: 7 },
  label: { fontSize: 12.5, color: "var(--ink3)", fontWeight: 600 },
  chips: { display: "flex", flexWrap: "wrap", gap: 6 },
  chip: { minHeight: 36, padding: "0 12px", borderRadius: 18, border: "1px solid var(--line)", background: "var(--panel2)", color: "var(--ink)", fontSize: 13.5, display: "inline-flex", alignItems: "center", gap: 7 },
  chipOn: { background: "var(--btnBg)", borderColor: "var(--btnBg)", color: "var(--btnInk)", fontWeight: 600 },
  customWrap: { display: "inline-flex", alignItems: "center", gap: 4 },
  customInput: { width: 76, height: 36, borderRadius: 18, padding: "0 12px", fontSize: 13.5 },
  unit: { fontSize: 13, color: "var(--ink3)" },
  hint: { fontSize: 12.5, color: "var(--green)", fontWeight: 600 },
  seg: { display: "inline-flex", gap: 2, padding: 3, borderRadius: 11, background: "var(--neutralBg)", alignSelf: "flex-start" },
  segBtn: { height: 32, padding: "0 12px", border: "none", borderRadius: 8, background: "transparent", fontSize: 13, color: "var(--ink2)" },
  segOn: { background: "var(--panel)", color: "var(--ink)", fontWeight: 600, boxShadow: "0 1px 2px rgba(0,0,0,.08)" },
  input: { height: 40, padding: "0 12px", borderRadius: 10, fontSize: 14, maxWidth: "100%" },
  footer: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", borderTop: "1px solid var(--line2)", paddingTop: 12 },
  preview: { flex: "1 1 200px", fontSize: 13.5, fontWeight: 600, lineHeight: 1.45 },
  btnDark: { height: 40, padding: "0 16px", border: "none", borderRadius: 10, background: "var(--btnBg)", color: "var(--btnInk)", fontSize: 14, fontWeight: 600 },
  btnGhost: { height: 40, padding: "0 14px", border: "1px solid var(--line)", borderRadius: 10, background: "transparent", fontSize: 14, color: "var(--ink2)" },
  week: { display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 6, alignItems: "end" },
  weekCol: { display: "flex", flexDirection: "column", alignItems: "center", gap: 4 },
  weekBarBox: { position: "relative", height: 56, width: "100%", display: "flex", alignItems: "flex-end", justifyContent: "center" },
  weekBar: { width: "62%", maxWidth: 26, borderRadius: "4px 4px 2px 2px" },
  weekGoal: { position: "absolute", left: "12%", right: "12%", height: 0, borderTop: "2px dashed var(--line)" },
  weekLabel: { fontSize: 11, color: "var(--mute)" },
  weekToday: { color: "var(--accent)", fontWeight: 700 },
  lag: { display: "flex", flexDirection: "column", gap: 3, borderTop: "1px solid var(--line2)", paddingTop: 8 },
  lagTitle: { fontSize: 12.5, fontWeight: 700, color: "var(--red)" },
  legendLine: { fontSize: 12.5, color: "var(--ink3)" },
  chart: { position: "relative", height: 190, display: "flex", alignItems: "flex-end", gap: 12, padding: "0 4px", borderBottom: "1px solid var(--line)" },
  chartCol: { flex: 1, height: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center", minWidth: 0 },
  chartTotal: { fontSize: 12.5, fontWeight: 700, marginBottom: 3 },
  stack: { width: "70%", maxWidth: 76, display: "flex", flexDirection: "column-reverse", borderRadius: "5px 5px 0 0", overflow: "hidden", gap: 1 },
  planLine: { position: "absolute", left: 0, right: 0, borderTop: "2px dashed var(--red)", pointerEvents: "none" },
  budgetLine: { position: "absolute", left: 0, right: 0, borderTop: "2px solid var(--green)", pointerEvents: "none" },
  chartLabels: { display: "flex", gap: 12, padding: "0 4px" },
  chartLabel: { flex: 1, textAlign: "center", fontSize: 11.5, color: "var(--ink3)", minWidth: 0 },
  insights: { display: "flex", flexDirection: "column", gap: 10 },
  insBad: { display: "flex", gap: 12, padding: "12px 14px", borderRadius: 14, background: "var(--redBg)", border: "1px solid var(--redLine)" },
  insWarn: { display: "flex", gap: 12, padding: "12px 14px", borderRadius: 14, background: "var(--warmBg)", border: "1px solid var(--warmLine)" },
  insOk: { display: "flex", gap: 12, padding: "12px 14px", borderRadius: 14, background: "var(--greenSoft)", border: "1px solid var(--line)" },
  insMark: { width: 26, height: 26, flexShrink: 0, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", color: "#FBF8F1", fontWeight: 700, fontSize: 14 },
  insBody: { display: "flex", flexDirection: "column", gap: 2, minWidth: 0 },
  insTitle: { fontSize: 14.5, fontWeight: 600 },
  insText: { fontSize: 13, color: "var(--ink2)", lineHeight: 1.45 },
  rowName: { display: "flex", alignItems: "center", gap: 8, fontWeight: 600, minWidth: 0 },
  minis: { display: "flex", alignItems: "flex-end", gap: 3, height: 28 },
  mini: { width: 12, borderRadius: "3px 3px 1px 1px", display: "inline-block" },
};
