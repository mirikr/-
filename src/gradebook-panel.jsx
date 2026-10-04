import React, { useMemo, useRef, useState } from "react";
import {
  DAY_KEYS,
  DAY_SHORT,
  classStats,
  markGrade,
  dayOf,
  daysFromSchedule,
  itemKey,
  journalTitle,
  lessonDates,
  markPublished,
  markValue,
  newGradebook,
  parseStudents,
  payloadFor,
  sortStudents,
  studentName,
  pendingChanges,
  withStudents,
} from "./gradebook.js";
import { CLASSES, allStudents } from "./school-roster.js";
import { publishItems } from "./results-inbox.js";

// Журнал учителя (gradebook.js): класс из списка (school-roster.js) — ученики
// строками, даты уроков из расписания — столбцами, отметки в клетках. Отметки
// уходят ученикам кнопкой «Выложить изменения» — только новые, исправленные и
// стёртые. Недостающего ученика учитель добавляет в журнал сам: из другого
// класса или вручную; лишнего — убирает из этого журнала.

const f1 = (n) => (n === null || n === undefined ? "—" : String(Math.round(n * 10) / 10).replace(".", ","));
const ddmm = (iso) => iso.slice(8, 10) + "." + iso.slice(5, 7);
const uid = () => "st-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const todayIso = () => {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
};
const VIEW_KEY = "planner-gradebook-view";

export default function GradebookPanel({ gradebooks, setGradebooks, schedule, subjects, authorName, onPublished, demoEmail, classes = CLASSES }) {
  const list = gradebooks || [];
  const hasLegacy = list.some((g) => !g.classId);
  const [classId, setClassId] = useState(() => (list[0] ? list[0].classId || "" : classes[0] ? classes[0].id : ""));
  const inClass = list.filter((g) => (g.classId || "") === classId);
  const [openId, setOpenId] = useState(() => (inClass[0] ? inClass[0].id : ""));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [paste, setPaste] = useState("");
  const [query, setQuery] = useState("");
  const [manual, setManual] = useState({ last: "", first: "", email: "" });
  const [extraDate, setExtraDate] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  // Удаление журнала — подтверждением здесь же: системное окно confirm() в
  // предпросмотре (и во встроенных окнах) заблокировано и молча отвечает «нет».
  const [confirmDelete, setConfirmDelete] = useState(false);
  const tableRef = useRef(null);
  // Как показывать отметки: баллами (как ставят) или оценками по шкале уроков.
  const [view, setViewState] = useState(() => {
    try {
      return localStorage.getItem(VIEW_KEY) === "grades" ? "grades" : "points";
    } catch (e) {
      return "points";
    }
  });
  const setView = (v) => {
    setViewState(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch (e) {
      /* приватное окно */
    }
  };
  const raw = inClass.find((g) => g.id === openId) || inClass[0] || null;
  const currentClass = classes.find((c) => c.id === classId) || null;
  // Журнал вместе с учениками (класс + добавленные − убранные), по фамилии.
  const gb = useMemo(() => {
    if (!raw) return null;
    const full = withStudents(raw, classes);
    return { ...full, students: raw.classId ? sortStudents(full.students) : full.students, name: journalTitle(raw, classes) };
  }, [raw, classes]);

  function patch(fn) {
    if (!raw) return;
    setGradebooks((prev) => (prev || []).map((g) => (g.id === raw.id ? fn(g) : g)));
  }

  function create() {
    const used = new Set(inClass.map((g) => g.subject));
    const subject = (subjects || []).find((n) => !used.has(n)) || (subjects || [])[0] || "";
    const fresh = { ...newGradebook(subject, schedule), classId, addedStudents: [], excluded: [] };
    // Журнал без класса из списка — со своим списком; в предпросмотре сразу учебный ученик.
    if (!classId) fresh.students = demoEmail ? [{ id: uid(), last: "Учебный", first: "ученик", email: demoEmail }] : [];
    setGradebooks((prev) => [...(prev || []), fresh]);
    setOpenId(fresh.id);
    setSettingsOpen(true);
    setMsg("");
  }

  const dates = useMemo(() => (gb ? lessonDates(gb) : []), [gb]);
  const changes = useMemo(() => (gb ? pendingChanges(gb) : []), [gb]);
  const stats = useMemo(() => (gb ? classStats(gb, dates, todayIso()) : null), [gb, dates]);
  const asGrades = gb && (gb.scale === 5 || view === "grades");
  const fromSchedule = gb ? daysFromSchedule(schedule, gb.subject) : [];
  const noEmail = gb ? gb.students.filter((s) => !String(s.email || "").trim()).length : 0;

  // Правка ученика: добавленного в журнал или из своего списка старого журнала.
  // Учеников из списка класса правит разработчик, здесь они только читаются.
  function editStudent(id, change) {
    patch((g) => ({
      ...g,
      addedStudents: (g.addedStudents || []).map((x) => (x.id === id ? { ...x, ...change } : x)),
      students: (g.students || []).map((x) => (x.id === id ? { ...x, ...change } : x)),
    }));
  }

  function removeStudent(st) {
    patch((g) => ({
      ...g,
      excluded: st.fromClass ? Array.from(new Set([...(g.excluded || []), st.id])) : g.excluded || [],
      addedStudents: (g.addedStudents || []).filter((x) => x.id !== st.id),
      students: (g.students || []).filter((x) => x.id !== st.id),
    }));
  }

  function addStudent(st) {
    patch((g) => {
      // Убранного из этого журнала ученика класса — просто вернуть.
      if ((g.excluded || []).includes(st.id) && currentClass && currentClass.students.some((x) => x.id === st.id)) {
        return { ...g, excluded: g.excluded.filter((x) => x !== st.id) };
      }
      // Из списков классов — помечаем: такой ученик в таблице только читается.
      const entry = { id: st.id || uid(), last: st.last || "", first: st.first || "", email: st.email || "", ...(st.className ? { fromRoster: true, className: st.className } : null) };
      if (!g.classId) return { ...g, students: [...(g.students || []), entry] };
      return { ...g, addedStudents: [...(g.addedStudents || []), entry] };
    });
  }

  function setMark(studentId, date, value) {
    patch((g) => ({ ...g, marks: { ...g.marks, [studentId]: { ...((g.marks || {})[studentId] || {}), [date]: value } } }));
  }

  // Enter и стрелки ходят по клеткам, как в таблице.
  function onCellKey(e, row, col) {
    const go = (r, c) => {
      const el = tableRef.current && tableRef.current.querySelector(`[data-cell="${r}:${c}"]`);
      if (el) {
        e.preventDefault();
        el.focus();
        el.select && el.select();
      }
    };
    if (e.key === "Enter" || e.key === "ArrowDown") go(row + 1, col);
    else if (e.key === "ArrowUp") go(row - 1, col);
    else if (e.key === "ArrowRight" && e.currentTarget.selectionStart === e.currentTarget.value.length) go(row, col + 1);
    else if (e.key === "ArrowLeft" && e.currentTarget.selectionStart === 0) go(row, col - 1);
  }

  async function publishAll() {
    if (!gb || !changes.length) return;
    setBusy(true);
    setMsg("");
    const items = changes.map((c) => ({ ...c, itemKey: itemKey(gb, c.date), payload: c.action === "put" ? payloadFor(gb, c.date, c.value) : null }));
    const res = await publishItems(items, authorName);
    setBusy(false);
    patch((g) => markPublished(g, res.done));
    const puts = res.done.filter((c) => c.action === "put").length;
    const dels = res.done.filter((c) => c.action === "del").length;
    setMsg(
      res.ok
        ? [puts ? `выложено отметок: ${puts}` : "", dels ? `убрано: ${dels}` : ""].filter(Boolean).join(", ").replace(/^./, (c) => c.toUpperCase())
        : res.error
    );
    if (onPublished) onPublished();
  }

  // Выбор класса и предмета — сверху всегда.
  const picker = (
    <>
      {(classes.length > 0 || hasLegacy) && (
        <div style={S.row} role="group" aria-label="Класс">
          <span style={S.label}>Класс:</span>
          {classes.map((c) => (
            <button
              key={c.id}
              type="button"
              aria-pressed={classId === c.id}
              onClick={() => {
                setClassId(c.id);
                const first = list.find((g) => g.classId === c.id);
                setOpenId(first ? first.id : "");
                setMsg("");
              }}
              style={{ ...S.seg, ...(classId === c.id ? S.segOn : null) }}
            >
              {c.name}
            </button>
          ))}
          {(hasLegacy || !classes.length) && (
            <button type="button" aria-pressed={classId === ""} onClick={() => { setClassId(""); const first = list.find((g) => !g.classId); setOpenId(first ? first.id : ""); }} style={{ ...S.seg, ...(classId === "" ? S.segOn : null) }}>
              Свой список
            </button>
          )}
        </div>
      )}
      {classes.length === 0 && (
        <p style={S.text}>Списки классов добавляет разработчик. Пока их нет — журнал можно вести своим списком учеников.</p>
      )}
    </>
  );

  if (!gb) {
    return (
      <section className="ap-card" style={S.card}>
        <div style={S.title}>Журнал</div>
        {picker}
        <p style={S.text}>
          {currentClass ? `У класса ${currentClass.name} журналов пока нет. ` : ""}
          Ученики — строками, уроки по датам из расписания — столбцами. Ставьте отметки, а потом нажмите «Выложить изменения»: каждый
          ученик увидит свои отметки в разделе «Результаты».
        </p>
        <button type="button" onClick={create} style={S.primary}>
          {currentClass ? "+ Журнал " + currentClass.name : "+ Новый журнал"}
        </button>
      </section>
    );
  }

  const changedKeys = new Set(changes.map((c) => c.key));
  const inJournal = new Set(gb.students.map((st) => st.id));
  const q = query.trim().toLowerCase().replace(/ё/g, "е");
  const candidates = allStudents(classes)
    .filter((st) => !inJournal.has(st.id))
    .filter((st) => !q || (studentName(st) + " " + st.email + " " + st.className).toLowerCase().replace(/ё/g, "е").includes(q))
    .slice(0, 30);

  return (
    <section className="ap-card" style={S.card} data-gradebook={gb.name}>
      {picker}
      <div style={S.head}>
        <div style={S.row} role="group" aria-label="Журналы класса">
          {inClass.map((g) => (
            <button key={g.id} type="button" aria-pressed={g.id === raw.id} onClick={() => { setOpenId(g.id); setMsg(""); }} style={{ ...S.seg, ...(g.id === raw.id ? S.segOn : null) }}>
              {g.classId ? g.subject || "Без предмета" : journalTitle(g, classes)}
            </button>
          ))}
          <button type="button" onClick={create} style={S.secondary}>
            {classId ? "+ Предмет" : "+ Журнал"}
          </button>
        </div>
        <button type="button" onClick={() => setSettingsOpen(!settingsOpen)} aria-expanded={settingsOpen} style={S.secondary}>
          {settingsOpen ? "Скрыть настройки" : "Настройки журнала"}
        </button>
      </div>

      {settingsOpen && (
        <div style={S.settings}>
          <div style={S.grid}>
            {!raw.classId && (
              <label style={S.field}>
                <span style={S.label}>Название (класс, группа)</span>
                <input value={raw.name} onChange={(e) => patch((g) => ({ ...g, name: e.target.value }))} style={S.input} aria-label="Название журнала" />
              </label>
            )}
            <label style={S.field}>
              <span style={S.label}>Предмет</span>
              <input
                list="gb-subjects"
                value={raw.subject}
                aria-label="Предмет журнала"
                onChange={(e) => {
                  const subject = e.target.value;
                  // Дни подтягиваются из расписания, пока их не выбирали руками.
                  patch((g) => ({ ...g, subject, days: g.daysManual ? g.days : daysFromSchedule(schedule, subject) }));
                }}
                style={S.input}
              />
              <datalist id="gb-subjects">
                {(subjects || []).map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
            </label>
            <label style={S.field}>
              <span style={S.label}>С</span>
              <input type="date" value={raw.from} onChange={(e) => patch((g) => ({ ...g, from: e.target.value }))} style={S.input} aria-label="Начало периода" />
            </label>
            <label style={S.field}>
              <span style={S.label}>По</span>
              <input type="date" value={raw.to} onChange={(e) => patch((g) => ({ ...g, to: e.target.value }))} style={S.input} aria-label="Конец периода" />
            </label>
          </div>
          <div style={S.field}>
            <span style={S.label}>
              Дни уроков{" "}
              {fromSchedule.length ? "· по расписанию: " + fromSchedule.map((d) => DAY_SHORT[d]).join(", ") : "· в расписании этого предмета нет — выберите дни"}
            </span>
            <div style={S.row} role="group" aria-label="Дни уроков">
              {DAY_KEYS.map((d) => {
                const on = (raw.days || []).includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={on}
                    onClick={() => patch((g) => ({ ...g, daysManual: true, days: on ? g.days.filter((x) => x !== d) : DAY_KEYS.filter((x) => x === d || g.days.includes(x)) }))}
                    style={{ ...S.seg, ...(on ? S.segOn : null) }}
                  >
                    {DAY_SHORT[d]}
                  </button>
                );
              })}
              {fromSchedule.length > 0 && (
                <button type="button" onClick={() => patch((g) => ({ ...g, daysManual: false, days: fromSchedule }))} style={S.link}>
                  как в расписании
                </button>
              )}
            </div>
          </div>
          <div style={S.row} role="group" aria-label="Шкала">
            <span style={S.label}>Шкала:</span>
            {[
              [100, "100-балльная"],
              [5, "5-балльная"],
            ].map(([v, label]) => (
              <button key={v} type="button" aria-pressed={raw.scale === v} onClick={() => patch((g) => ({ ...g, scale: v }))} style={{ ...S.seg, ...(raw.scale === v ? S.segOn : null) }}>
                {label}
              </button>
            ))}
            <span style={{ flex: 1 }} />
            {confirmDelete ? (
              <span style={S.confirm} role="alertdialog" aria-label="Удалить журнал?">
                Удалить журнал «{gb.name}»? Выложенные отметки у учеников останутся.
                <button
                  type="button"
                  onClick={() => {
                    setGradebooks((prev) => (prev || []).filter((g) => g.id !== raw.id));
                    setOpenId("");
                    setConfirmDelete(false);
                    setMsg("");
                  }}
                  style={{ ...S.secondary, color: "var(--red)", borderColor: "var(--red)" }}
                >
                  Да, удалить
                </button>
                <button type="button" onClick={() => setConfirmDelete(false)} style={S.secondary}>
                  Нет
                </button>
              </span>
            ) : (
              <button type="button" onClick={() => setConfirmDelete(true)} style={{ ...S.link, color: "var(--red)" }}>
                Удалить журнал
              </button>
            )}
          </div>
        </div>
      )}

      <div style={S.row}>
        <span style={S.label}>
          {currentClass && raw.classId ? currentClass.name + " · " : ""}Ученики: {gb.students.length} · уроков: {dates.length}
        </span>
        {gb.scale === 100 && (
          <span style={S.viewSwitch} role="group" aria-label="Показывать">
            {[
              ["points", "Баллы"],
              ["grades", "Оценки"],
            ].map(([id, label]) => (
              <button key={id} type="button" aria-pressed={view === id} onClick={() => setView(id)} style={{ ...S.seg, ...(view === id ? S.segOn : null) }}>
                {label}
              </button>
            ))}
          </span>
        )}
        <button type="button" onClick={() => setAddOpen(!addOpen)} style={S.link} aria-expanded={addOpen}>
          + Ученик
        </button>
        {!raw.classId && gb.students.length > 1 && (
          <button type="button" onClick={() => patch((g) => ({ ...g, students: sortStudents(g.students) }))} style={S.link} title="Расставить учеников по фамилии">
            По алфавиту
          </button>
        )}
      </div>
      {addOpen && (
        <div style={S.paste} data-add-student>
          {classes.length > 0 && (
            <>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Найти ученика в списках классов: фамилия, имя, класс"
                aria-label="Найти ученика"
                style={S.input}
              />
              <div style={S.candidates}>
                {candidates.length === 0 ? (
                  <span style={S.label}>{q ? "Никого не нашлось — добавьте вручную ниже." : "Все ученики из списков уже в журнале."}</span>
                ) : (
                  candidates.map((st) => (
                    <button key={st.id} type="button" onClick={() => addStudent(st)} style={S.candidate} data-candidate={studentName(st)}>
                      <b>{studentName(st)}</b> <span style={S.label}>· {st.className}{st.email ? "" : " · без почты"}</span>
                    </button>
                  ))
                )}
              </div>
            </>
          )}
          <div style={S.label}>Нет в списке — вручную:</div>
          <div style={S.row}>
            <input value={manual.last} onChange={(e) => setManual({ ...manual, last: e.target.value })} placeholder="Фамилия" aria-label="Фамилия нового ученика" style={{ ...S.input, width: "auto", flex: "1 1 120px" }} />
            <input value={manual.first} onChange={(e) => setManual({ ...manual, first: e.target.value })} placeholder="Имя" aria-label="Имя нового ученика" style={{ ...S.input, width: "auto", flex: "1 1 120px" }} />
            <input value={manual.email} onChange={(e) => setManual({ ...manual, email: e.target.value.trim() })} placeholder="почта (можно позже)" aria-label="Почта нового ученика" style={{ ...S.input, width: "auto", flex: "1 1 160px" }} />
            <button
              type="button"
              onClick={() => {
                if (!manual.last.trim() && !manual.first.trim()) return;
                addStudent({ id: uid(), last: manual.last.trim(), first: manual.first.trim(), email: manual.email.toLowerCase() });
                setManual({ last: "", first: "", email: "" });
              }}
              style={S.primary}
            >
              Добавить
            </button>
          </div>
          {!raw.classId && (
            <>
              <div style={S.label}>Или сразу списком — по ученику на строку: фамилия, имя, почта.</div>
              <textarea value={paste} onChange={(e) => setPaste(e.target.value)} rows={3} placeholder={"Иванов Иван, ivanov@mail.ru\nПетрова Анна"} style={{ ...S.input, resize: "vertical" }} aria-label="Список учеников" />
              <button
                type="button"
                onClick={() => {
                  parseStudents(paste).forEach((st) => addStudent({ ...st, id: uid() }));
                  setPaste("");
                }}
                style={{ ...S.secondary, alignSelf: "flex-start" }}
              >
                Добавить списком
              </button>
            </>
          )}
        </div>
      )}

      {gb.students.length === 0 ? (
        <p style={S.text}>Добавьте учеников — появится таблица.</p>
      ) : dates.length === 0 ? (
        <p style={S.text}>В выбранном периоде нет дней уроков — выберите дни в настройках журнала или добавьте дату.</p>
      ) : (
        <div style={S.tableWrap} ref={tableRef}>
          <table style={S.table} data-gradebook-table>
            <thead>
              <tr>
                <th style={{ ...S.th, ...S.sticky, textAlign: "left" }}>Ученик</th>
                {dates.map((d) => (
                  <th key={d} style={S.th} data-date={d}>
                    <div style={S.dateTop}>{ddmm(d)}</div>
                    <div style={S.dateDay}>
                      {DAY_SHORT[dayOf(d)]}
                      <button type="button" title="Скрыть дату (урока не было)" aria-label={"Скрыть дату " + ddmm(d)} onClick={() => patch((g) => ({ ...g, skip: [...(g.skip || []), d] }))} style={S.hideBtn}>
                        ×
                      </button>
                    </div>
                  </th>
                ))}
                {gb.scale === 100 && <th style={{ ...S.th, ...S.statTh }} title="Среднее арифметическое баллов">Ср. балл</th>}
                <th style={{ ...S.th, ...S.statTh }} title="Среднее арифметическое оценок">Ср. оценка</th>
                <th style={{ ...S.th, ...S.statTh }} title="Сколько отметок">Отм.</th>
                <th style={{ ...S.th, ...S.statTh }} title="Прошедшие уроки без отметки">Проп.</th>
                <th style={{ ...S.th, ...S.statTh }} title="Сколько каких оценок">5 · 4 · 3 · 2</th>
              </tr>
            </thead>
            <tbody>
              {gb.students.map((st, row) => {
                const ss = stats.per[row];
                return (
                  <tr key={st.id} data-student={studentName(st)}>
                    <td style={{ ...S.td, ...S.sticky, ...S.nameCell }}>
                      {/* Ученик — фамилией и именем; почта ниже мелко: по ней
                          отметки доходят. Ученик из списка класса — только
                          читается (список ведёт разработчик); добавленного
                          учителем можно править. */}
                      {st.fromClass || st.fromRoster ? (
                        <div style={S.rosterName}>
                          <span style={S.rosterText}>
                            <b>{studentName(st)}</b>
                            <span style={{ ...S.rosterEmail, ...(st.email ? null : S.emailMissing) }}>
                              {st.fromRoster && st.className ? st.className + " · " : ""}
                              {st.email || "нет почты — отметки не дойдут"}
                            </span>
                          </span>
                          <button type="button" onClick={() => removeStudent(st)} title="Убрать из этого журнала" aria-label={"Убрать из журнала: " + studentName(st)} style={S.hideBtn}>
                            ×
                          </button>
                        </div>
                      ) : (
                      <div style={S.rosterName}>
                      <div style={S.rosterText}>
                      <div style={S.nameRow}>
                        <input
                          value={st.last ?? ""}
                          placeholder="Фамилия"
                          onChange={(e) => editStudent(st.id, { last: e.target.value })}
                          aria-label={"Фамилия: " + studentName(st)}
                          style={S.nameInput}
                        />
                        <input
                          value={st.first ?? ""}
                          placeholder="Имя"
                          onChange={(e) => editStudent(st.id, { first: e.target.value })}
                          aria-label={"Имя: " + studentName(st)}
                          style={{ ...S.nameInput, fontWeight: 500 }}
                        />
                      </div>
                      <input
                        value={st.email}
                        placeholder="почта — чтобы отметки дошли"
                        onChange={(e) => editStudent(st.id, { email: e.target.value.trim() })}
                        aria-label={"Почта: " + studentName(st)}
                        style={{ ...S.emailInput, ...(st.email ? null : S.emailMissing) }}
                      />
                      </div>
                      <button type="button" onClick={() => removeStudent(st)} title="Убрать из этого журнала" aria-label={"Убрать из журнала: " + studentName(st)} style={S.hideBtn}>
                        ×
                      </button>
                      </div>
                      )}
                    </td>
                    {dates.map((d, col) => {
                      const raw = ((gb.marks || {})[st.id] || {})[d] ?? "";
                      const bad = String(raw).trim() !== "" && markValue(raw, gb.scale) === null;
                      const changed = changedKeys.has(st.id + "|" + d);
                      if (asGrades && gb.scale === 100) {
                        // Оценками — только просмотр: ставят баллы.
                        const v = markValue(raw, gb.scale);
                        const g = markGrade(gb, v);
                        return (
                          <td key={d} style={S.td}>
                            <span data-grade-cell={row + ":" + col} title={v === null ? "" : v + " баллов"} style={{ ...S.gradeCell, ...(g ? GRADE_TONE[g] : null), ...(changed ? S.cellChanged : null) }}>
                              {g || ""}
                            </span>
                          </td>
                        );
                      }
                      return (
                        <td key={d} style={S.td}>
                          <input
                            data-cell={row + ":" + col}
                            value={raw}
                            inputMode="decimal"
                            aria-label={`${studentName(st)}, ${ddmm(d)}`}
                            onChange={(e) => setMark(st.id, d, e.target.value)}
                            onKeyDown={(e) => onCellKey(e, row, col)}
                            onFocus={(e) => e.target.select()}
                            style={{ ...S.cell, ...(changed ? S.cellChanged : null), ...(bad ? S.cellBad : null) }}
                            title={bad ? (gb.scale === 5 ? "Отметка от 1 до 5" : "Отметка от 0 до 100") : changed ? "Ещё не выложена" : ""}
                          />
                        </td>
                      );
                    })}
                    {gb.scale === 100 && (
                      <td style={{ ...S.td, ...S.avgCell }} data-avg={studentName(st)}>
                        {f1(ss.avg)}
                      </td>
                    )}
                    <td style={{ ...S.td, ...S.avgCell, ...(ss.avgGrade !== null && ss.avgGrade < 3 ? { color: "var(--red)" } : null) }} data-avg-grade={studentName(st)}>
                      {f1(ss.avgGrade)}
                    </td>
                    <td style={{ ...S.td, ...S.statCell }}>{ss.count}</td>
                    <td style={{ ...S.td, ...S.statCell, ...(ss.missing ? { color: "var(--red)" } : null) }} data-missing={studentName(st)}>
                      {ss.missing}
                    </td>
                    <td style={{ ...S.td, ...S.statCell, whiteSpace: "nowrap" }} data-dist={studentName(st)}>
                      {[5, 4, 3, 2].map((g) => ss.dist[g]).join(" · ")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td style={{ ...S.td, ...S.sticky, ...S.footLabel }}>Средний по уроку</td>
                {dates.map((d) => {
                  const vals = gb.students.map((st) => markValue(((gb.marks || {})[st.id] || {})[d], gb.scale)).filter((v) => v !== null);
                  const shown = asGrades ? vals.map((v) => markGrade(gb, v)) : vals;
                  return (
                    <td key={d} style={{ ...S.td, ...S.footCell }}>
                      {shown.length ? f1(shown.reduce((a, b) => a + b, 0) / shown.length) : "—"}
                    </td>
                  );
                })}
                {gb.scale === 100 && <td style={{ ...S.td, ...S.footCell, fontWeight: 700 }}>{f1(stats.avg)}</td>}
                <td style={{ ...S.td, ...S.footCell, fontWeight: 700 }}>{f1(stats.avgGrade)}</td>
                <td style={{ ...S.td, ...S.footCell }}>{stats.count}</td>
                <td style={S.td} />
                <td style={{ ...S.td, ...S.footCell, whiteSpace: "nowrap" }}>{[5, 4, 3, 2].map((g) => stats.dist[g]).join(" · ")}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {stats && stats.count > 0 && (
        <div style={S.classStats} data-class-stats>
          <div style={S.classMain}>
            <span style={S.label}>По классу</span>
            {gb.scale === 100 && (
              <span>
                средний балл <b style={S.classBig}>{f1(stats.avg)}</b>
              </span>
            )}
            <span>
              средняя оценка <b style={S.classBig}>{f1(stats.avgGrade)}</b>
            </span>
          </div>
          <div style={S.distRow} aria-label="Распределение оценок">
            {[5, 4, 3, 2].map((g) => {
              const n = stats.dist[g];
              const share = stats.count ? Math.round((n / stats.count) * 100) : 0;
              return (
                <span key={g} style={{ ...S.distItem, ...GRADE_TONE[g] }} data-dist-grade={g}>
                  <b>{g}</b> — {n} <span style={{ color: "var(--mute)" }}>({share} %)</span>
                </span>
              );
            })}
          </div>
          <div style={S.label}>
            {stats.best ? "Лучший средний: " + studentName(stats.best) + ". " : ""}
            {stats.risk.length ? "Средняя оценка ниже 3: " + stats.risk.map(studentName).join(", ") + "." : "Средняя оценка ниже 3 — ни у кого."}
          </div>
          {gb.scale === 100 && <div style={S.label}>Шкала уроков: 0–49 → 2, 50–69 → 3, 70–89 → 4, 90–100 → 5. Средние — среднее арифметическое.</div>}
        </div>
      )}

      <div style={S.row}>
        <input type="date" value={extraDate} onChange={(e) => setExtraDate(e.target.value)} aria-label="Добавить дату урока" style={{ ...S.input, width: "auto" }} />
        <button
          type="button"
          onClick={() => {
            if (!extraDate) return;
            patch((g) => ({ ...g, extra: Array.from(new Set([...(g.extra || []), extraDate])), skip: (g.skip || []).filter((x) => x !== extraDate) }));
            setExtraDate("");
          }}
          style={S.secondary}
        >
          + Дата урока
        </button>
        {(gb.skip || []).length > 0 && (
          <span style={S.label}>
            Скрытые даты:{" "}
            {gb.skip.slice().sort().map((d) => (
              <button key={d} type="button" onClick={() => patch((g) => ({ ...g, skip: g.skip.filter((x) => x !== d) }))} style={S.link} title="Вернуть дату">
                {ddmm(d)} ↺
              </button>
            ))}
          </span>
        )}
      </div>

      <div style={S.publishBar}>
        <button type="button" onClick={publishAll} disabled={!changes.length || busy} style={{ ...S.primary, ...(changes.length ? null : S.off) }}>
          {busy ? "Выкладываю…" : changes.length ? "Выложить изменения · " + changes.length : "Всё выложено"}
        </button>
        <span style={S.label} role="status">
          {msg ||
            (changes.length
              ? "Жёлтые клетки ещё не выложены. Ученики увидят отметки после нажатия."
              : "Ученики видят отметки в своём разделе «Результаты».")}
          {noEmail ? ` Без почты: ${noEmail} — им отметки не уйдут.` : ""}
        </span>
      </div>
    </section>
  );
}

// Оттенок рамки по оценке.
const GRADE_TONE = {
  5: { borderColor: "color-mix(in srgb, var(--green, #3F8F6A) 60%, transparent)" },
  4: { borderColor: "color-mix(in srgb, var(--accent) 60%, transparent)" },
  3: { borderColor: "color-mix(in srgb, var(--ink3) 60%, transparent)" },
  2: { borderColor: "color-mix(in srgb, var(--red) 60%, transparent)", color: "var(--red)" },
};

const S = {
  viewSwitch: { display: "inline-flex", gap: 4, marginLeft: "auto" },
  statTh: { fontSize: 11.5, fontWeight: 600, color: "var(--ink3)", padding: "6px 8px" },
  statCell: { fontSize: 12.5, color: "var(--ink2)", fontVariantNumeric: "tabular-nums", padding: "3px 8px" },
  gradeCell: {
    display: "inline-flex", alignItems: "center", justifyContent: "center", width: 46, height: 32, boxSizing: "border-box", borderRadius: 7,
    border: "1px solid var(--line)", background: "var(--panel2)", fontWeight: 700, fontSize: 15,
  },
  classStats: { display: "flex", flexDirection: "column", gap: 8, padding: "12px", borderRadius: 12, background: "var(--panel2)", border: "1px solid var(--line2, var(--line))" },
  classMain: { display: "flex", alignItems: "baseline", gap: 16, flexWrap: "wrap", fontSize: 13.5, color: "var(--ink2)" },
  classBig: { fontFamily: "var(--serif)", fontSize: 22, color: "var(--ink)" },
  distRow: { display: "flex", flexWrap: "wrap", gap: 6 },
  distItem: { fontSize: 13, padding: "3px 10px", borderRadius: 999, border: "1px solid var(--line)", background: "var(--panel)" },
  card: { padding: "16px 18px", borderRadius: 14, border: "1px solid var(--line)", background: "var(--panel)", display: "flex", flexDirection: "column", gap: 12, minWidth: 0 },
  title: { fontSize: 12, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--mute)" },
  text: { margin: 0, fontSize: 13.5, color: "var(--ink3)", lineHeight: 1.5 },
  head: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
  select: { minHeight: 38, borderRadius: 10, border: "1px solid var(--line)", background: "var(--panel2)", color: "var(--ink)", font: "inherit", fontSize: 15, fontWeight: 600, padding: "0 10px", maxWidth: "100%" },
  settings: { display: "flex", flexDirection: "column", gap: 10, padding: "12px", borderRadius: 12, background: "var(--panel2)", border: "1px solid var(--line2, var(--line))" },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 180px), 1fr))", gap: 10 },
  field: { display: "flex", flexDirection: "column", gap: 4, minWidth: 0 },
  label: { fontSize: 12.5, color: "var(--ink3)" },
  input: {
    minHeight: 36, boxSizing: "border-box", width: "100%", padding: "6px 10px", borderRadius: 9, border: "1px solid var(--line)",
    background: "var(--panel)", color: "var(--ink)", font: "inherit", fontSize: 14,
  },
  row: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
  seg: { minHeight: 32, padding: "0 11px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--panel)", color: "var(--ink)", font: "inherit", fontSize: 13, cursor: "pointer" },
  segOn: { background: "var(--btnBg)", borderColor: "var(--btnBg)", color: "var(--btnInk)", fontWeight: 600 },
  link: { border: "none", background: "none", padding: "2px 4px", color: "var(--accent)", font: "inherit", fontSize: 13, cursor: "pointer" },
  primary: { minHeight: 36, padding: "0 16px", borderRadius: 10, border: "1px solid var(--btnBg)", background: "var(--btnBg)", color: "var(--btnInk)", font: "inherit", fontSize: 14, fontWeight: 600, cursor: "pointer" },
  secondary: { minHeight: 36, padding: "0 12px", borderRadius: 10, border: "1px solid var(--line)", background: "transparent", color: "var(--ink2)", font: "inherit", fontSize: 13.5, cursor: "pointer" },
  off: { opacity: 0.5, cursor: "default" },
  paste: { display: "flex", flexDirection: "column", gap: 8 },
  // Таблица прокручивается вбок внутри карточки, страница — нет.
  // width: 0 + minWidth: 100% — таблица не раздвигает родителя (на телефоне
  // колонка подстраивается под содержимое), а заполняет его и листается внутри.
  tableWrap: { overflowX: "auto", width: 0, minWidth: "100%", border: "1px solid var(--line)", borderRadius: 10 },
  table: { borderCollapse: "separate", borderSpacing: 0, fontSize: 13.5, minWidth: "100%" },
  // Закреплённые шапка и столбец — непрозрачные: карточки в теме полупрозрачны,
  // и прокрученные клетки просвечивали бы сквозь имя ученика.
  th: { position: "sticky", top: 0, padding: "6px 4px", background: "var(--menuBg)", borderBottom: "1px solid var(--line)", fontWeight: 600, textAlign: "center", whiteSpace: "nowrap", zIndex: 1 },
  td: { padding: "3px 4px", borderBottom: "1px solid var(--line2, var(--line))", textAlign: "center" },
  sticky: { position: "sticky", left: 0, zIndex: 2, background: "var(--menuBg)", borderRight: "1px solid var(--line)", boxShadow: "4px 0 6px -4px rgba(0,0,0,.18)" },
  nameCell: { textAlign: "left", minWidth: 170, maxWidth: 230 },
  nameRow: { display: "flex", gap: 2 },
  rosterName: { display: "flex", alignItems: "center", gap: 4, padding: "2px 4px" },
  rosterText: { display: "flex", flexDirection: "column", flex: 1, minWidth: 0, fontSize: 13.5 },
  rosterEmail: { fontSize: 11.5, color: "var(--ink3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  candidates: { display: "flex", flexWrap: "wrap", gap: 6, maxHeight: 180, overflowY: "auto" },
  candidate: { border: "1px solid var(--line)", borderRadius: 999, background: "var(--panel)", color: "var(--ink)", font: "inherit", fontSize: 13, padding: "4px 10px", cursor: "pointer" },
  confirm: { display: "inline-flex", alignItems: "center", flexWrap: "wrap", gap: 8, fontSize: 13, color: "var(--ink2)" },
  nameInput: { display: "block", width: "100%", minWidth: 0, flex: 1, border: "none", background: "transparent", color: "var(--ink)", font: "inherit", fontSize: 13.5, fontWeight: 600, padding: "0 2px", height: 20, minHeight: 0, lineHeight: "20px", boxShadow: "none", borderRadius: 4 },
  emailInput: { display: "block", width: "100%", border: "none", background: "transparent", color: "var(--ink3)", font: "inherit", fontSize: 11.5, padding: "0 2px", height: 16, minHeight: 0, lineHeight: "16px", boxShadow: "none", borderRadius: 4 },
  emailMissing: { color: "var(--red)" },
  dateTop: { fontSize: 13, fontVariantNumeric: "tabular-nums" },
  dateDay: { display: "flex", alignItems: "center", justifyContent: "center", gap: 2, fontSize: 11, fontWeight: 400, color: "var(--mute)" },
  hideBtn: { border: "none", background: "none", color: "var(--mute)", fontSize: 13, lineHeight: 1, padding: "0 2px", cursor: "pointer" },
  cell: {
    width: 46, height: 32, boxSizing: "border-box", textAlign: "center", border: "1px solid var(--line)", borderRadius: 7, background: "var(--panel2)",
    color: "var(--ink)", font: "inherit", fontSize: 14, fontVariantNumeric: "tabular-nums", padding: 0,
  },
  cellChanged: { borderColor: "var(--accent)", background: "var(--warmBg, var(--panel2))" },
  cellBad: { borderColor: "var(--red)", color: "var(--red)" },
  avgCell: { fontWeight: 700, fontVariantNumeric: "tabular-nums", minWidth: 60 },
  footLabel: { textAlign: "left", fontSize: 12, color: "var(--mute)" },
  footCell: { fontSize: 12, color: "var(--mute)", fontVariantNumeric: "tabular-nums" },
  publishBar: { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" },
};
