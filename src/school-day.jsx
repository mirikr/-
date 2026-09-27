import React, { useEffect, useMemo, useState } from "react";
import MoreMenu from "./more-menu.jsx";
import { buildDay, openingDay, spanLabel, timeOf, weekDates } from "./school-timeline.js";

// «Лицей КЭО», вариант A: день лентой по времени.
//
// Раньше над расписанием стояли настройки — школа, группы, треки, воскресенье,
// легенда, — и до уроков надо было листать, на телефоне — за первый экран.
// У каждого урока было пять кнопок, одновременные пары шли строками подряд, а
// два урока истории — двумя одинаковыми карточками. Теперь сверху дни недели,
// открыт сегодняшний, ниже — сам день: пары склеены, одновременные уроки — одним
// выбором, линия «сейчас», перерывы. Всё редкое — в «⋯» у урока, настройка
// расписания и предметы — отдельными окнами по кнопкам в шапке.

const DAY_NAME = { mon: "понедельник", tue: "вторник", wed: "среда", thu: "четверг", fri: "пятница", sat: "суббота", sun: "воскресенье" };
const DAY_SHORT = { mon: "Пн", tue: "Вт", wed: "Ср", thu: "Чт", fri: "Пт", sat: "Сб", sun: "Вс" };
const DAY_IN = { mon: "В понедельник", tue: "Во вторник", wed: "В среду", thu: "В четверг", fri: "В пятницу", sat: "В субботу", sun: "В воскресенье" };
const DOW = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const MONTH_SHORT = ["янв.", "февр.", "марта", "апр.", "мая", "июня", "июля", "авг.", "сент.", "окт.", "нояб.", "дек."];
const EVENING = 17 * 60;

function plural(n, one, few, many) {
  const last = n % 10;
  const two = n % 100;
  if (two >= 11 && two <= 14) return many;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return few;
  return many;
}
const lessonsWord = (n) => plural(n, "урок", "урока", "уроков");
const numberWord = (n) => ["", "один", "два", "три", "четыре", "пять"][n] || String(n);

// Минуты от полуночи, раз в полминуты: линия «сейчас» и подсветка урока
// должны сдвигаться сами, без перезагрузки.
export function useNowMinutes() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

// Важность — три столбика, как везде в приложении, но без подписи.
export function Bars({ value, info, height = 11 }) {
  const v = Number(value) || 1;
  return (
    <span style={S.bars} aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{ ...S.bar, height: Math.round(height * (0.45 + i * 0.275)), background: i < v ? info.strong : "var(--line)" }}
        />
      ))}
    </span>
  );
}

function PriorityChip({ value, kit }) {
  const v = Number(value) || 1;
  if (v < 2) return null;
  const info = kit.priorityInfo(v);
  return (
    <span style={{ ...S.chip, background: info.tint, color: v === 3 ? "var(--red)" : "var(--warmInk)" }}>
      {info.label}
    </span>
  );
}

function metaOf(entry, kit) {
  if (entry.kind === "exam") {
    return [kit.examKindLabel(entry.examKind), entry.date ? kit.formatEventDate(entry.date) : "", entry.place]
      .filter(Boolean)
      .join(" · ");
  }
  const level = kit.levelInfo(entry.level);
  return [level.value === "base" ? "база" : level.short, entry.room, entry.teacher].filter(Boolean).join(" · ");
}

// Задания всех уроков карточки: у пары их может быть и у первого, и у второго.
function tasksOfUnit(unit, tasks) {
  if (!tasks) return [];
  const seen = new Set();
  const out = [];
  unit.entries.forEach((e) =>
    tasks.forLesson(e).forEach((h) => {
      if (seen.has(h.id)) return;
      seen.add(h.id);
      out.push(h);
    })
  );
  return out;
}

function TimeCol({ start, end, state }) {
  return (
    <div className="ap-sd-time">
      <div className="ap-sd-t1" style={state === "current" ? { color: "var(--red)" } : null}>
        {start}
      </div>
      {end && <div className="ap-sd-t2">{end}</div>}
    </div>
  );
}

// Карточка урока или пары. Всё редкое — важность, задание, правка, тетрадь,
// удаление — за «⋯»: пять кнопок у каждой строки делали день шумным.
function LessonCard({ unit, state, day, kit, colorOf, tasks, handlers }) {
  const [editing, setEditing] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [taskText, setTaskText] = useState("");
  const [taskMinutes, setTaskMinutes] = useState("30");
  const first = unit.entries[0];
  const isExam = unit.kind === "exam";
  const title = unit.subject || (isExam ? "Экзамен" : "Урок");
  const list = tasksOfUnit(unit, tasks);
  const due = tasks ? tasks.dueDate(day) : "";
  const priority = Number(first.priority) || 1;

  // Крестик в уведомлении о переезде экзамена обещает «вернётесь к правке»:
  // карточка этого экзамена открывает свои поля сама (саму правку и прокрутку
  // к ней дальше ведёт ScheduleEntryRow по тому же запросу).
  useEffect(() => {
    const req = handlers.editRequest;
    if (req && unit.entries.some((e) => e.id === req.id)) setEditing(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handlers.editRequest]);

  if (editing) {
    return (
      <div style={S.editWrap}>
        {unit.entries.map((e) => (
          <kit.ScheduleEntryRow
            key={e.id}
            entry={e}
            autoEdit
            onClose={() => setEditing(false)}
            onUpdate={handlers.onUpdate}
            onMoveDate={handlers.onMoveDate}
            editRequest={handlers.editRequest}
            onEditDone={handlers.onEditDone}
            onRemove={() => handlers.onRemove(e.id)}
          />
        ))}
      </div>
    );
  }

  function addTask() {
    if (!taskText.trim()) return;
    tasks.add(first, taskText, taskMinutes);
    setTaskText("");
    setTaskOpen(false);
  }

  const items = [
    !isExam && {
      render: () => (
        <div>
          <div style={S.menuLabel}>Важность предмета</div>
          <div role="group" aria-label="Важность" style={S.seg}>
            {kit.EVENT_PRIORITIES.map((p) => (
              <button
                key={p.value}
                type="button"
                aria-pressed={priority === p.value}
                onClick={() => handlers.onUpdate(first.id, { priority: p.value })}
                style={priority === p.value ? { ...S.segBtn, ...S.segOn, background: p.value === 3 ? "var(--red)" : p.value === 2 ? "var(--accent)" : "var(--btnBg)" } : S.segBtn}
              >
                {p.value === 1 ? "обычно" : p.value === 2 ? "важно" : "очень"}
              </button>
            ))}
          </div>
          <div style={S.menuNote}>меняется во всех уроках предмета</div>
        </div>
      ),
    },
    !isExam && tasks && { label: "+ Задание к уроку", onSelect: () => setTaskOpen(true) },
    !isExam && handlers.onNotebook && { label: "Тетрадь предмета", onSelect: () => handlers.onNotebook(unit.subject) },
    { label: unit.entries.length > 1 ? "Изменить уроки" : isExam ? "Изменить" : "Изменить урок", onSelect: () => setEditing(true) },
    unit.entries.length === 1 && { label: "Удалить", danger: true, onSelect: () => handlers.onRemove(first.id) },
  ];

  return (
    <div className={"ap-sd-card" + (state === "current" ? " is-current" : "") + (isExam ? " is-exam" : "")}>
      {/* Поиск ведёт к уроку по его id: у пары их два, и подсветиться должна
          вся карточка, какой бы из двух ни нашли. */}
      {unit.entries.map((e) => (
        <span key={e.id} data-focus-id={"lesson:" + e.id} style={S.focusBox} aria-hidden="true" />
      ))}
      <span style={{ ...S.stripe, background: isExam ? "var(--red)" : colorOf(unit.subject) }} aria-hidden="true" />
      <div style={S.cardHead}>
        {/* Название и метки переносятся сами по себе, а «⋯» всегда в правом
            углу: на телефоне она иначе уезжала на отдельную строку. */}
        <div style={S.cardTitleWrap}>
          <span style={S.cardName}>{title}</span>
          {unit.entries.length > 1 && <span style={S.chipQuiet}>{unit.entries.length + " " + lessonsWord(unit.entries.length)}</span>}
          {isExam ? (
            <span style={{ ...S.chip, background: "var(--redBg)", color: "var(--red)" }}>{kit.examKindLabel(first.examKind)}</span>
          ) : (
            <PriorityChip value={priority} kit={kit} />
          )}
          {state === "current" && <span style={S.nowTag}>идёт</span>}
        </div>
        <MoreMenu label={"Действия: " + title} items={items} size={34} quiet />
      </div>
      <div style={S.cardMeta}>{metaOf(first, kit)}</div>
      {isExam && first.url && (
        <a className="lesson-link" href={first.url} target="_blank" rel="noreferrer" style={S.examLink}>
          Открыть ссылку
        </a>
      )}
      {list.length > 0 && (
        <div style={S.tasks}>
          <kit.LessonTasks
            list={list}
            due={due}
            folded={tasks.folded(first.id, due)}
            onFold={(v) => tasks.setFolded(first.id, due, v)}
            onToggle={(id) => tasks.toggle(id)}
          />
        </div>
      )}
      {taskOpen && (
        <div style={S.taskForm}>
          <input
            autoFocus
            type="text"
            placeholder="Что задали?"
            value={taskText}
            onChange={(ev) => setTaskText(ev.target.value)}
            onKeyDown={(ev) => {
              if (ev.key === "Enter") addTask();
              if (ev.key === "Escape") setTaskOpen(false);
            }}
            style={S.taskInput}
          />
          <input
            type="number"
            min="0"
            step="5"
            value={taskMinutes}
            onChange={(ev) => setTaskMinutes(ev.target.value)}
            style={S.taskMinutes}
            aria-label="Сколько минут займёт"
            title="Сколько минут займёт"
          />
          <button type="button" onClick={addTask} disabled={!taskText.trim()} style={S.taskAdd}>
            К {due.slice(8)}.{due.slice(5, 7)}
          </button>
          <button type="button" onClick={() => setTaskOpen(false)} style={S.taskCancel} aria-label="Отмена">
            ×
          </button>
        </div>
      )}
    </div>
  );
}

function optionMeta(option, kit) {
  const head = option.entries[0];
  const where = [head.room, head.teacher].filter(Boolean).join(" · ");
  return timeOf(option.from) + "–" + timeOf(option.to) + (where ? " · " + where : "");
}

// Уроки в одно время: человек ходит на один из них. Выбор запоминается в
// самих уроках (skip у остальных) и едет на другие устройства вместе с ними.
function ChoiceBlock({ block, kit, onPick }) {
  const n = block.options.length;
  return (
    <div className="ap-sd-row">
      <TimeCol start={timeOf(block.from)} end={timeOf(block.to)} state={block.state} />
      <div className="ap-sd-choice">
        <div style={S.choiceHead}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 9v4M12 17h.01" />
            <path d="M10.3 3.9L2 18a2 2 0 0 0 1.7 3h16.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
          </svg>
          Одновременно {numberWord(n)} {plural(n, "вариант", "варианта", "вариантов")} — отметьте, куда ходите
        </div>
        <div className="ap-sd-opts">
          {block.options.map((o) => (
            <button key={o.key} type="button" className="ap-sd-opt" onClick={() => onPick(o.ids, block.allIds)}>
              {o.entries.map((e) => (
                <span key={e.id} data-focus-id={"lesson:" + e.id} style={S.focusBox} aria-hidden="true" />
              ))}
              <span style={S.optName}>{o.names.join(" → ")}</span>
              <span style={S.optMeta}>
                {o.entries.length > 1 ? o.entries.length + " " + lessonsWord(o.entries.length) + " · " : ""}
                {optionMeta(o, kit)}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Blocks({ blocks, day, kit, colorOf, tasks, handlers }) {
  return blocks.map((b) => {
    if (b.type === "now") {
      return (
        <div key={b.key} className="ap-sd-now" role="presentation">
          <span className="ap-sd-time ap-sd-nowlabel">
            <span className="ap-sd-noww">сейчас </span>
            {timeOf(b.minutes)}
          </span>
          <span style={S.nowLine} />
        </div>
      );
    }
    if (b.type === "gap") {
      return (
        <div key={b.key} className="ap-sd-gap">
          <span className="ap-sd-time" />
          <span style={S.gapText}>перерыв {spanLabel(b.minutes)}</span>
          <span style={S.gapLine} />
        </div>
      );
    }
    if (b.type === "choice") {
      return <ChoiceBlock key={b.key} block={b} kit={kit} onPick={handlers.onPick} />;
    }
    if (b.type === "picked") {
      const others = b.others.map((o) => o.names.join(" → ")).join(", ");
      return (
        <React.Fragment key={b.key}>
          {b.option.units.map((u) => (
            <div key={u.key} className={"ap-sd-row" + (b.state === "past" ? " is-past" : "")}>
              <TimeCol start={u.start} end={u.end} state={b.state} />
              <LessonCard unit={u} state={b.state} day={day} kit={kit} colorOf={colorOf} tasks={tasks} handlers={handlers} />
            </div>
          ))}
          <div className="ap-sd-alt">
            <span className="ap-sd-time" />
            <span style={S.altText}>В это же время: {others}</span>
            <button type="button" onClick={() => handlers.onUnpick(b.allIds)} style={S.altBtn}>
              Изменить выбор
            </button>
          </div>
        </React.Fragment>
      );
    }
    return (
      <div key={b.key} className={"ap-sd-row" + (b.state === "past" ? " is-past" : "")}>
        <TimeCol start={b.unit.start} end={b.unit.end} state={b.state} />
        <LessonCard unit={b.unit} state={b.state} day={day} kit={kit} colorOf={colorOf} tasks={tasks} handlers={handlers} />
      </div>
    );
  });
}

// Весь экран «Лицея».
export default function SchoolDay({
  days,
  todayKey,
  entriesOf,
  hasSchedule,
  kit,
  colorOf,
  tasks,
  handlers,
  soon,
  onToggleTask,
  dueLabel,
  homeworkOn,
  onSetup,
  onJournal,
  focus,
  findEntry,
  reopen,
  onReopenDone,
}) {
  const now = useNowMinutes();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  // Открывается всегда сегодняшний день: расписание смотрят про сегодня, а
  // вчерашний выбор дня, запомненный с прошлого раза, был бы ответом не на тот
  // вопрос. Экран пересобирается при каждом заходе, и выбор сбрасывается сам.
  const [day, setDay] = useState(() => openingDay(todayKey, days));
  const [addOpen, setAddOpen] = useState(null);
  const [formSeed, setFormSeed] = useState(null);

  // Скрыли день, который был открыт, — возвращаемся к сегодняшнему.
  useEffect(() => {
    if (!days.includes(day)) setDay(openingDay(todayKey, days));
  }, [days, day, todayKey]);

  // Урок из поиска может стоять в другом дне — открываем его день.
  useEffect(() => {
    if (!focus || !String(focus.id).startsWith("lesson:")) return;
    const found = findEntry(String(focus.id).slice("lesson:".length));
    if (found && days.includes(found.day)) setDay(found.day);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);

  // Правка экзамена по крестику в уведомлении — в его дне: открываем этот день.
  useEffect(() => {
    const req = handlers.editRequest;
    if (!req || !req.id) return;
    const found = findEntry(req.id);
    if (found && days.includes(found.day)) setDay(found.day);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handlers.editRequest]);

  // Крестик в уведомлении о переносе экзамена: форма его дня открывается снова.
  useEffect(() => {
    if (!reopen) return;
    if (days.includes(reopen.day)) setDay(reopen.day);
    setFormSeed(reopen);
    setAddOpen("exam");
    if (onReopenDone) onReopenDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reopen]);

  // Неделя, которую показывают вкладки. В воскресенье без уроков — следующая:
  // открыт понедельник, и дата под ним должна быть завтрашней, а не прошлой.
  const dates = useMemo(() => {
    const base = new Date(now);
    if (todayKey === "sun" && !days.includes("sun")) base.setDate(base.getDate() + 1);
    return weekDates(base);
  }, [now.toDateString(), todayKey, days]); // eslint-disable-line react-hooks/exhaustive-deps

  const lessonsOf = (key) => entriesOf(key).filter((e) => e.kind !== "exam" || kit.examPlace(e) !== "far");
  const summaries = useMemo(() => {
    const out = {};
    days.forEach((key) => {
      out[key] = buildDay(lessonsOf(key), key === todayKey ? nowMin : null);
    });
    return out;
  }, [days, entriesOf, todayKey, nowMin]); // eslint-disable-line react-hooks/exhaustive-deps

  const current = summaries[day] || buildDay([]);
  const far = entriesOf(day).filter((e) => e.kind === "exam" && kit.examPlace(e) === "far");
  const isToday = day === todayKey;

  return (
    <div className="ap-sd">
      <div className="ap-sd-days" role="tablist" aria-label="День недели" style={{ "--n": days.length }}>
        {days.map((key) => {
          const d = dates[key];
          const n = summaries[key] ? summaries[key].count : 0;
          const today = key === todayKey;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={key === day}
              onClick={() => setDay(key)}
              className={"ap-sd-dayb" + (today ? " is-today" : "")}
              aria-label={DAY_NAME[key] + ", " + d.getDate() + " " + MONTH_SHORT[d.getMonth()] + (today ? ", сегодня" : "") + ", " + n + " " + lessonsWord(n)}
            >
              <span className="d1">{DAY_SHORT[key]}</span>
              <span className="d2">
                {d.getDate()}
                <span className="mon"> {MONTH_SHORT[d.getMonth()]}</span>
              </span>
              <span className="d3">{today ? (n ? n + " · сегодня" : "сегодня") : n ? n + " " + lessonsWord(n) : "нет уроков"}</span>
            </button>
          );
        })}
      </div>

      <div className="ap-sd-grid">
        <section className="ap-card ap-sd-line" aria-label={DAY_NAME[day] + (isToday ? ", сегодня" : "")}>
          {!hasSchedule ? (
            <div style={S.empty}>
              <div style={S.emptyTitle}>Расписание ещё не собрано</div>
              <p style={S.emptyText}>
                Выберите академическую школу, группы и олимпиадные треки — уроки встанут сюда со звонками, кабинетами и
                преподавателями.
              </p>
              <button type="button" onClick={onSetup} style={S.primary}>
                Выбрать школу и группы
              </button>
            </div>
          ) : current.blocks.length === 0 ? (
            <div style={S.emptyDay}>{isToday ? "Сегодня уроков нет." : "В этот день уроков нет."}</div>
          ) : (
            <Blocks blocks={current.blocks} day={day} kit={kit} colorOf={colorOf} tasks={tasks} handlers={handlers} />
          )}

          {far.length > 0 && (
            <div style={S.far}>
              <div style={S.farTitle}>Позже в этот день недели</div>
              {far.map((e) => (
                <div key={e.id} data-focus-id={"lesson:" + e.id}>
                  <kit.ScheduleEntryRow
                    entry={e}
                    compact
                    onUpdate={handlers.onUpdate}
                    onMoveDate={handlers.onMoveDate}
                    editRequest={handlers.editRequest}
                    onEditDone={handlers.onEditDone}
                    onRemove={() => handlers.onRemove(e.id)}
                  />
                </div>
              ))}
            </div>
          )}

          <div style={S.addRow}>
            <button type="button" onClick={() => setAddOpen(addOpen === "lesson" ? null : "lesson")} style={S.addBtn} aria-expanded={addOpen === "lesson"}>
              {addOpen === "lesson" ? "Скрыть" : "+ Урок"}
            </button>
            <button type="button" onClick={() => setAddOpen(addOpen === "exam" ? null : "exam")} style={S.addBtn} aria-expanded={addOpen === "exam"}>
              {addOpen === "exam" ? "Скрыть" : "+ Экзамен или олимпиада"}
            </button>
          </div>
          {addOpen === "lesson" && (
            <kit.AddScheduleForm
              onAdd={(entry) => {
                handlers.onAdd(day, entry);
                setAddOpen(null);
              }}
            />
          )}
          {addOpen === "exam" && (
            <kit.AddExamForm
              key={formSeed ? formSeed.at : "new"}
              initial={formSeed ? formSeed.values : null}
              onAdd={(entry) => {
                handlers.onAdd(day, { ...entry, kind: "exam" });
                setAddOpen(null);
                setFormSeed(null);
              }}
            />
          )}
        </section>

        <aside className="ap-sd-side">
          <section className="ap-card" style={S.sideCard}>
            <h2 style={S.sideTitle}>Сдать скоро</h2>
            {soon.length === 0 ? (
              <p style={S.sideMuted}>Заданий со сроком нет.</p>
            ) : (
              soon.map((h, i) => (
                <label key={h.id} style={{ ...S.soonRow, ...(i ? S.soonRule : null) }}>
                  <input type="checkbox" checked={!!h.done} onChange={() => onToggleTask(h.id)} style={S.check} />
                  <span style={S.soonText}>
                    <span style={{ textDecoration: h.done ? "line-through" : "none" }}>{h.text || "без описания"}</span>
                    <span style={S.soonMeta}>
                      {[h.subjectName, h.minutes ? h.minutes + " мин" : ""].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <span style={{ ...S.soonDue, color: h.daysUntil <= 0 ? "var(--red)" : "var(--ink3)" }}>{dueLabel(h.daysUntil)}</span>
                </label>
              ))
            )}
            <button type="button" onClick={onJournal} style={S.sideLink}>
              Все задания →
            </button>
          </section>
          <NextDayCard days={days} todayKey={todayKey} summaries={summaries} entriesOf={lessonsOf} kit={kit} homeworkOn={homeworkOn} now={now} />
          <section style={S.legend}>
            <div style={S.legendTitle}>Как читать</div>
            <div>
              <Bars value={3} info={kit.priorityInfo(3)} /> очень важно · <Bars value={2} info={kit.priorityInfo(2)} /> важно · полоска слева — цвет
              предмета
            </div>
            <div>Важность меняется в «⋯» у урока — сразу для всего предмета.</div>
          </section>
        </aside>
      </div>
    </div>
  );
}

// «Завтра, четверг»: сколько уроков, с какого по какой час, первый урок и
// вечерние онлайн-пары — то, что нужно, чтобы собраться с вечера.
function NextDayCard({ days, todayKey, summaries, entriesOf, kit, homeworkOn, now }) {
  const at = DOW.indexOf(todayKey);
  let key = null;
  let step = 1;
  for (; step <= 7; step += 1) {
    const k = DOW[(at + step) % 7];
    if (days.includes(k) && summaries[k] && summaries[k].count > 0) {
      key = k;
      break;
    }
  }
  if (!key) return null;
  const date = new Date(now);
  date.setDate(date.getDate() + step);
  const iso = date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
  const plan = buildDay(entriesOf(key));
  const units = plan.blocks.filter((b) => b.type === "unit" || b.type === "picked");
  const firstBlock = plan.blocks.find((b) => b.type !== "gap");
  const firstUnit = firstBlock && (firstBlock.type === "unit" ? firstBlock.unit : firstBlock.type === "picked" ? firstBlock.option.units[0] : null);
  const evening = units
    .filter((b) => b.from >= EVENING)
    .map((b) => (b.type === "unit" ? b.unit.subject : b.option.names.join(", ")));
  const due = homeworkOn ? homeworkOn(iso).filter((h) => !h.done) : [];
  return (
    <section className="ap-card" style={S.sideCard}>
      <h2 style={S.sideTitle}>{step === 1 ? "Завтра, " + DAY_NAME[key] : DAY_IN[key]}</h2>
      <div style={S.nextLine}>
        {plan.count} {lessonsWord(plan.count)} · {timeOf(plan.from)}–{timeOf(plan.to)}
      </div>
      <div style={S.sideMuted}>
        {firstUnit ? "Первый — " + firstUnit.subject + (firstUnit.entries[0].room ? ", " + firstUnit.entries[0].room : "") + ". " : ""}
        {evening.length ? "Вечером: " + [...new Set(evening)].join(", ") + "." : ""}
      </div>
      {due.length > 0 && (
        <div style={S.nextDue}>
          К этому дню: {due.map((h) => h.text).join("; ")}
        </div>
      )}
    </section>
  );
}

// Компактная лента для карточки на «Сегодня»: только чтение, без меню.
export function CompactDay({ blocks, kit, colorOf, tasksFor, onOpen }) {
  return (
    <div style={S.compact}>
      {blocks.map((b) => {
        if (b.type === "now") {
          return (
            <div key={b.key} style={S.cNow} role="presentation">
              <span style={S.cNowTime}>{timeOf(b.minutes)}</span>
              <span style={S.nowLine} />
            </div>
          );
        }
        if (b.type === "gap") {
          return (
            <div key={b.key} style={S.cGap}>
              <span style={S.cTime} />
              перерыв {spanLabel(b.minutes)}
            </div>
          );
        }
        if (b.type === "choice") {
          return (
            <button key={b.key} type="button" onClick={onOpen} style={{ ...S.cRow, ...S.cChoice }} className="ap-row">
              <span style={S.cTime}>{timeOf(b.from)}</span>
              <span style={S.cName}>{b.options.map((o) => o.names[0]).join(" / ")}</span>
              <span style={S.cPick}>выбрать →</span>
            </button>
          );
        }
        const units = b.type === "picked" ? b.option.units : [b.unit];
        return units.map((u) => {
          const first = u.entries[0];
          const info = kit.priorityInfo(first.priority || 1);
          const list = tasksFor ? u.entries.flatMap((e) => tasksFor(e)) : [];
          return (
            <div key={u.key} style={{ opacity: b.state === "past" ? 0.5 : 1 }}>
              <div style={{ ...S.cRow, ...(b.state === "current" ? S.cCurrent : null) }}>
                <span style={{ ...S.cTime, color: b.state === "current" ? "var(--red)" : "var(--ink)" }}>{u.start}</span>
                <span style={{ ...S.cStripe, background: u.kind === "exam" ? "var(--red)" : colorOf(u.subject) }} aria-hidden="true" />
                <span style={S.cName}>
                  {u.subject}
                  {u.entries.length > 1 && <span style={S.cPair}> · {u.entries.length} {lessonsWord(u.entries.length)}</span>}
                </span>
                <span style={S.cMeta}>{u.kind === "exam" ? kit.examKindLabel(first.examKind) : first.room}</span>
                {u.kind !== "exam" && Number(first.priority) > 1 ? <Bars value={first.priority} info={info} /> : <span style={S.cBarsGap} />}
              </div>
              {list.map((h) => (
                <div key={h.id} style={S.cTask}>
                  <span style={{ textDecoration: h.done ? "line-through" : "none" }}>задано: {h.text}</span>
                  {h.minutes ? <span style={S.cTaskMin}> · {h.minutes} мин</span> : null}
                </div>
              ))}
            </div>
          );
        });
      })}
    </div>
  );
}

// Окно для настройки расписания и списка предметов. На телефоне — лист снизу.
export function SchoolSheet({ title, onClose, children }) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  return (
    <div className="ap-sd-overlay" onClick={onClose}>
      <div className="ap-dialog ap-sd-sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div style={S.sheetHead}>
          <h2 style={S.sheetTitle}>{title}</h2>
          <button type="button" onClick={onClose} style={S.sheetClose} aria-label="Закрыть" autoFocus>
            ×
          </button>
        </div>
        <div style={S.sheetBody}>{children}</div>
      </div>
    </div>
  );
}

export const SCHOOL_CSS = `
.ap-sd { display: flex; flex-direction: column; gap: 16px; }
.ap-sd-days { display: grid; grid-template-columns: repeat(var(--n), minmax(0, 1fr)); gap: 8px; }
.ap-sd-dayb {
  display: flex; flex-direction: column; align-items: flex-start; gap: 1px; min-width: 0;
  padding: 10px 14px; border-radius: 14px; border: 1px solid var(--line); background: var(--panel);
  color: var(--ink); text-align: left; transition: background .16s ease, border-color .16s ease;
}
.ap-sd-dayb:hover { border-color: var(--ink3); }
.ap-sd-dayb .d1 { font-size: 13px; font-weight: 600; color: var(--ink3); }
.ap-sd-dayb .d2 { font-family: var(--serif); font-size: 19px; line-height: 1.25; }
.ap-sd-dayb .d3 { font-size: 12px; color: var(--mute); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
.ap-sd-dayb.is-today { border-color: var(--accent); }
.ap-sd-dayb[aria-selected="true"] { background: var(--btnBg); border-color: var(--btnBg); color: var(--btnInk); }
.ap-sd-dayb[aria-selected="true"] .d1, .ap-sd-dayb[aria-selected="true"] .d3 { color: var(--btnInk); opacity: .78; }
.ap-sd-grid { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 20px; align-items: start; }
.ap-sd-line {
  display: flex; flex-direction: column; gap: 6px; padding: 18px 22px 20px;
  background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius);
}
.ap-sd-side { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
.ap-sd-row, .ap-sd-now, .ap-sd-gap, .ap-sd-alt { display: flex; gap: 12px; }
.ap-sd-row { align-items: stretch; transition: opacity .2s ease; }
.ap-sd-row.is-past { opacity: .55; }
.ap-sd-row.is-past:hover, .ap-sd-row.is-past:focus-within { opacity: 1; }
.ap-sd-time { width: 92px; flex-shrink: 0; text-align: right; padding-top: 10px; font-variant-numeric: tabular-nums; }
.ap-sd-t1 { font-size: 14px; font-weight: 600; }
.ap-sd-t2 { font-size: 12px; color: var(--mute); }
.ap-sd-card {
  flex: 1; min-width: 0; position: relative; display: flex; flex-direction: column; gap: 3px;
  padding: 9px 10px 10px 16px; border-radius: 14px; background: var(--panel2); border: 1px solid var(--line2);
}
.ap-sd-card.is-current { border: 1.5px solid var(--red); box-shadow: var(--shadow); }
.ap-sd-now { align-items: center; margin: 2px 0; }
.ap-sd-nowlabel { padding-top: 0; font-size: 12.5px; font-weight: 700; color: var(--red); }
.ap-sd-gap { align-items: center; min-height: 30px; }
.ap-sd-alt { align-items: center; flex-wrap: wrap; margin: -2px 0 4px; }
.ap-sd-choice {
  flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 8px; padding: 10px 12px;
  border: 1px dashed var(--warmLine); border-radius: 14px; background: var(--warmBg);
}
.ap-sd-opts { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 8px; }
.ap-sd-opt {
  position: relative; display: flex; flex-direction: column; gap: 3px; min-width: 0; padding: 9px 11px; text-align: left;
  background: var(--panel2); border: 1px solid var(--line2); border-radius: 11px; color: var(--ink);
  transition: border-color .16s ease, box-shadow .16s ease;
}
.ap-sd-opt:hover { border-color: var(--accent); box-shadow: var(--shadow); }
.ap-sd-headbtn { display: inline-flex; align-items: center; gap: 8px; }
.ap-sd-overlay {
  position: fixed; inset: 0; z-index: 110; display: flex; align-items: center; justify-content: center; padding: 16px;
  background: rgba(24, 22, 18, 0.45); backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px);
}
.ap-sd-sheet {
  width: 100%; max-width: 760px; max-height: 88vh; display: flex; flex-direction: column; overflow: hidden;
  background: var(--menuBg); border: 1px solid var(--line); border-radius: 18px; box-shadow: 0 18px 50px rgba(0,0,0,.3); color: var(--ink);
}
`;

// Телефон: день без внешней карточки, дни — плотной полосой, время — узкой
// колонкой, окна — листом снизу.
export const SCHOOL_MOBILE_CSS = `
.ap-sd { gap: 12px; }
.ap-sd-days { gap: 4px; }
.ap-sd-dayb { align-items: center; padding: 7px 2px 8px; border-radius: 12px; }
.ap-sd-dayb .d1 { font-size: 11.5px; font-weight: 500; }
.ap-sd-dayb .d2 { font-size: 18px; }
.ap-sd-dayb .d2 .mon, .ap-sd-dayb .d3 { display: none; }
.ap-sd-grid { grid-template-columns: minmax(0, 1fr); gap: 16px; }
.ap-main section.ap-card.ap-sd-line { padding: 0; background: transparent; border: none; box-shadow: none; }
.ap-sd-row, .ap-sd-now, .ap-sd-gap, .ap-sd-alt { gap: 8px; }
.ap-sd-time { width: 46px; padding-top: 9px; }
.ap-sd-nowlabel { padding-top: 0; }
.ap-sd-noww { display: none; }
.ap-sd-t1 { font-size: 13.5px; }
.ap-sd-t2 { font-size: 11.5px; }
.ap-sd-opts { grid-template-columns: minmax(0, 1fr); }
.ap-sd-headbtn .lbl { display: none; }
.ap-sd-headbtn { width: 44px; padding: 0 !important; justify-content: center; }
.ap-sd-overlay { align-items: flex-end; padding: 0; }
.ap-sd-sheet { max-width: none; max-height: 92vh; border-radius: 18px 18px 0 0; border-bottom: none; }
`;

const S = {
  bars: { display: "inline-flex", alignItems: "flex-end", gap: 2, verticalAlign: "-1px" },
  bar: { width: 4, borderRadius: 1.5, display: "inline-block" },
  chip: { height: 22, padding: "0 8px", borderRadius: 11, fontSize: 12, fontWeight: 600, display: "inline-flex", alignItems: "center", whiteSpace: "nowrap" },
  chipQuiet: { height: 22, padding: "0 8px", borderRadius: 11, fontSize: 12, background: "var(--neutralBg)", color: "var(--ink2)", display: "inline-flex", alignItems: "center", whiteSpace: "nowrap" },
  nowTag: { fontSize: 12, fontWeight: 700, color: "var(--red)" },
  focusBox: { position: "absolute", inset: -1, borderRadius: 14, pointerEvents: "none" },
  stripe: { position: "absolute", left: 0, top: 10, bottom: 10, width: 4, borderRadius: "0 3px 3px 0" },
  cardHead: { display: "flex", alignItems: "flex-start", gap: 8, minHeight: 34 },
  cardTitleWrap: { flex: 1, minWidth: 0, display: "flex", alignItems: "center", flexWrap: "wrap", gap: "4px 8px", paddingTop: 5 },
  cardName: { fontSize: 15.5, fontWeight: 600, lineHeight: 1.3, minWidth: 0 },
  cardMeta: { fontSize: 13, color: "var(--ink3)", lineHeight: 1.45 },
  examLink: { fontSize: 13, color: "var(--accent)", alignSelf: "flex-start" },
  tasks: { marginTop: 4 },
  editWrap: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 8 },
  menuLabel: { fontSize: 12, color: "var(--mute)", marginBottom: 6 },
  menuNote: { fontSize: 11.5, color: "var(--mute)", marginTop: 6 },
  seg: { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 2, padding: 3, borderRadius: 10, background: "var(--neutralBg)" },
  segBtn: { height: 32, border: "none", borderRadius: 8, background: "transparent", fontSize: 12.5, color: "var(--ink2)", padding: "0 6px" },
  segOn: { color: "var(--accentInk)", fontWeight: 600 },
  taskForm: { display: "flex", gap: 6, alignItems: "center", marginTop: 6, flexWrap: "wrap" },
  taskInput: { flex: "1 1 180px", minWidth: 0, height: 38, padding: "0 10px", borderRadius: 9, border: "1px solid var(--line)", background: "var(--panel)", fontSize: 14 },
  taskMinutes: { width: 58, height: 38, padding: "0 8px", borderRadius: 9, border: "1px solid var(--line)", background: "var(--panel)", fontSize: 14 },
  taskAdd: { height: 38, padding: "0 12px", borderRadius: 9, border: "none", background: "var(--btnBg)", color: "var(--btnInk)", fontSize: 13.5, fontWeight: 600 },
  taskCancel: { width: 38, height: 38, borderRadius: 9, border: "1px solid var(--line)", background: "transparent", fontSize: 18, color: "var(--ink3)" },
  choiceHead: { display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--warmInk)", fontWeight: 600, lineHeight: 1.35 },
  optName: { fontSize: 14, fontWeight: 600, lineHeight: 1.3 },
  optMeta: { fontSize: 12, color: "var(--ink3)", lineHeight: 1.4 },
  nowLine: { flex: 1, height: 2, background: "var(--red)", borderRadius: 2 },
  gapText: { fontSize: 12.5, color: "var(--mute)", whiteSpace: "nowrap" },
  gapLine: { flex: 1, borderTop: "1px dashed var(--line)" },
  altText: { fontSize: 12.5, color: "var(--mute)", minWidth: 0 },
  altBtn: { border: "none", background: "none", padding: "4px 2px", fontSize: 12.5, color: "var(--accent)", fontWeight: 600, textDecoration: "underline", textUnderlineOffset: 3 },
  empty: { padding: "28px 8px", display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 10, maxWidth: 520 },
  emptyTitle: { fontFamily: "var(--serif)", fontSize: 24 },
  emptyText: { margin: 0, fontSize: 14.5, lineHeight: 1.6, color: "var(--ink2)" },
  emptyDay: { padding: "18px 4px", fontSize: 14.5, color: "var(--ink3)" },
  primary: { height: 44, padding: "0 18px", borderRadius: 12, border: "none", background: "var(--btnBg)", color: "var(--btnInk)", fontSize: 14.5, fontWeight: 600 },
  far: { marginTop: 14, display: "flex", flexDirection: "column", gap: 8 },
  farTitle: { fontSize: 12, color: "var(--mute)", letterSpacing: "0.05em", textTransform: "uppercase" },
  addRow: { display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 },
  addBtn: { height: 38, padding: "0 14px", borderRadius: 10, border: "1px dashed var(--line)", background: "transparent", fontSize: 13.5, color: "var(--ink2)" },
  sideCard: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: "var(--radius)", padding: "18px 20px", display: "flex", flexDirection: "column", gap: 10 },
  sideTitle: { margin: 0, fontFamily: "var(--serif)", fontWeight: 400, fontSize: 21 },
  sideMuted: { margin: 0, fontSize: 13, color: "var(--ink3)", lineHeight: 1.5 },
  sideLink: { alignSelf: "flex-start", border: "none", background: "none", padding: "2px 0", fontSize: 13, color: "var(--accent)", fontWeight: 600 },
  soonRow: { display: "flex", gap: 10, fontSize: 14, lineHeight: 1.4, cursor: "pointer" },
  soonRule: { borderTop: "1px solid var(--line2)", paddingTop: 10 },
  check: { width: 18, height: 18, margin: "2px 0 0", flexShrink: 0, accentColor: "var(--green)" },
  soonText: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column" },
  soonMeta: { fontSize: 12.5, color: "var(--ink3)" },
  soonDue: { fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap" },
  nextLine: { fontSize: 14 },
  nextDue: { fontSize: 13, lineHeight: 1.5, padding: "7px 10px", borderRadius: 9, background: "var(--warmBg)" },
  legend: { borderRadius: "var(--radius)", padding: "16px 18px", background: "var(--neutralBg)", display: "flex", flexDirection: "column", gap: 6, fontSize: 13, color: "var(--ink2)", lineHeight: 1.6 },
  legendTitle: { fontWeight: 600, color: "var(--ink)" },
  sheetHead: { display: "flex", alignItems: "center", gap: 12, padding: "16px 20px", borderBottom: "1px solid var(--line2)" },
  sheetTitle: { margin: 0, flex: 1, fontFamily: "var(--serif)", fontWeight: 400, fontSize: 23 },
  sheetClose: { width: 40, height: 40, borderRadius: 10, border: "1px solid var(--line)", background: "transparent", fontSize: 22, lineHeight: 1, color: "var(--ink2)" },
  sheetBody: { padding: "16px 20px 24px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 14 },
  compact: { display: "flex", flexDirection: "column", gap: 2 },
  cRow: { display: "flex", alignItems: "center", gap: 10, minHeight: 38, padding: "4px 8px", borderRadius: 10, width: "100%", textAlign: "left", border: "none", background: "transparent", color: "var(--ink)", fontSize: 14 },
  cCurrent: { background: "var(--redBg)" },
  cChoice: { background: "var(--warmBg)", cursor: "pointer" },
  cPick: { fontSize: 12.5, color: "var(--warmInk)", fontWeight: 600, flexShrink: 0 },
  cTime: { width: 44, flexShrink: 0, fontSize: 13.5, fontWeight: 600, fontVariantNumeric: "tabular-nums" },
  cStripe: { width: 4, height: 18, borderRadius: 2, flexShrink: 0 },
  // Без nowrap: неразрывная строка задаёт карточке минимальную ширину, и
  // «Математические методы в экономике» раздвигали экран телефона вбок.
  cName: { flex: 1, minWidth: 0, fontWeight: 600, lineHeight: 1.3, overflowWrap: "break-word" },
  cPair: { fontWeight: 400, color: "var(--ink3)" },
  cMeta: { fontSize: 12.5, color: "var(--ink3)", textAlign: "right", maxWidth: 110, overflowWrap: "break-word" },
  cBarsGap: { width: 16, flexShrink: 0 },
  cNow: { display: "flex", alignItems: "center", gap: 10, padding: "0 8px", margin: "1px 0" },
  cNowTime: { width: 44, flexShrink: 0, fontSize: 12, fontWeight: 700, color: "var(--red)" },
  cGap: { display: "flex", alignItems: "center", gap: 10, padding: "2px 8px", fontSize: 12.5, color: "var(--mute)" },
  cTask: { margin: "0 8px 4px 76px", fontSize: 12.5, color: "var(--warmInk)", lineHeight: 1.4 },
  cTaskMin: { color: "var(--ink3)" },
};
