import React, { memo, useEffect, useMemo, useRef, useState } from "react";
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
  isAbsent,
  cleanMark,
  markIssue,
  markIssues,
  withStudents,
} from "./gradebook.js";
import { percentOfGrade, scoreTone } from "./results-model.js";
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
const WIDE = "(min-width: 1100px)";

function useWide() {
  const [wide, setWide] = useState(() => typeof window !== "undefined" && !!window.matchMedia && window.matchMedia(WIDE).matches);
  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const mq = window.matchMedia(WIDE);
    const on = () => setWide(mq.matches);
    mq.addEventListener ? mq.addEventListener("change", on) : mq.addListener(on);
    return () => (mq.removeEventListener ? mq.removeEventListener("change", on) : mq.removeListener(on));
  }, []);
  return wide;
}

export default function GradebookPanel({ gradebooks, setGradebooks, schedule, subjects, authorName, onPublished, demoEmail, classes = CLASSES, authorField = null }) {
  const list = gradebooks || [];
  const wide = useWide();
  const hasLegacy = list.some((g) => !g.classId);
  const [classId, setClassId] = useState(() => (list[0] ? list[0].classId || "" : classes[0] ? classes[0].id : ""));
  const inClass = list.filter((g) => (g.classId || "") === classId);
  const [openId, setOpenId] = useState(() => (inClass[0] ? inClass[0].id : ""));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
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
  const cardRef = useRef(null);
  const scrollToCard = useRef(false);
  // Только что созданный журнал: в его карточке — предмет и дни уроков.
  const [freshId, setFreshId] = useState("");
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
    // Настройки сами не раскрываем: на телефоне они занимали весь экран и
    // журнал уезжал вниз — казалось, что он не создался. Предмет и дни уроков
    // спрашиваем прямо в карточке нового журнала, а к ней прокручиваем.
    setSettingsOpen(false);
    setFreshId(fresh.id);
    scrollToCard.current = true;
    setMsg("");
  }

  function toggleDay(d) {
    patch((g) => {
      const on = (g.days || []).includes(d);
      return { ...g, daysManual: true, days: on ? g.days.filter((x) => x !== d) : DAY_KEYS.filter((x) => x === d || (g.days || []).includes(x)) };
    });
  }

  function setSubject(subject) {
    // Дни подтягиваются из расписания, пока их не выбирали руками.
    patch((g) => ({ ...g, subject, days: g.daysManual ? g.days : daysFromSchedule(schedule, subject) }));
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

  // Клетки — лёгкие кнопки, полем ввода становится только та, которую правят:
  // две тысячи полей разом (четыре месяца на класс) заметно тормозили прокрутку.
  // Enter и стрелки ходят по клеткам, как в таблице; начать печатать можно
  // сразу — клетка откроется сама.
  const [editing, setEditing] = useState(null); // { row, col, initial }
  const focusCell = (r, c) =>
    requestAnimationFrame(() => {
      const el = tableRef.current && tableRef.current.querySelector(`[data-cell="${r}:${c}"]`);
      if (el) el.focus();
    });
  const live = useRef(null);
  live.current = {
    commit(row, col, value) {
      const st = gb && gb.students[row];
      const d = dates[col];
      if (!st || !d) return;
      const next = cleanMark(value);
      const prev = ((gb.marks || {})[st.id] || {})[d] ?? "";
      if (next !== String(prev)) setMark(st.id, d, next);
    },
    has(row, col) {
      return !!(gb && gb.students[row] && dates[col]);
    },
  };
  const api = useMemo(
    () => ({
      start: (row, col, initial) => setEditing({ row, col, initial }),
      // Закончить правку: сохранить и (по желанию) перейти к соседней клетке.
      finish: (row, col, value, move) => {
        live.current.commit(row, col, value);
        if (move && live.current.has(row + move[0], col + move[1])) {
          const r = row + move[0];
          const c = col + move[1];
          if (move[2]) setEditing({ row: r, col: c, initial: null });
          else {
            setEditing(null);
            focusCell(r, c);
          }
        } else {
          setEditing((e) => (e && e.row === row && e.col === col ? null : e));
          if (move) focusCell(row, col);
        }
      },
      cancel: (row, col) => {
        setEditing(null);
        focusCell(row, col);
      },
      clear: (row, col) => live.current.commit(row, col, ""),
      go: (row, col) => {
        if (live.current.has(row, col)) focusCell(row, col);
      },
    }),
    [] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Новый журнал — прокрутить к его карточке.
  const openKey = raw ? raw.id : "";
  useEffect(() => {
    if (!scrollToCard.current || !cardRef.current) return;
    scrollToCard.current = false;
    const el = cardRef.current;
    requestAnimationFrame(() => el.scrollIntoView && el.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, [openKey]);

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
  const MONTHS = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
  // Сводка настроек на кнопке: «Октябрь · пн, чт · 100-балльная».
  const settingsSummary = raw
    ? (() => {
        const f = raw.from || "";
        const t = raw.to || "";
        const wholeMonth = f.slice(0, 7) === t.slice(0, 7) && f.slice(8) === "01" && Number(t.slice(8)) >= 28;
        const period = wholeMonth ? MONTHS[Number(f.slice(5, 7)) - 1] : f && t ? ddmm(f) + "–" + ddmm(t) : "период не задан";
        const days = (raw.days || []).map((d) => DAY_SHORT[d].toLowerCase()).join(", ") || "дни не выбраны";
        return [period, days, raw.scale === 5 ? "5-балльная" : "100-балльная"].join(" · ");
      })()
    : "";

  function pickClass(id) {
    setClassId(id);
    const first = list.find((g) => (g.classId || "") === id);
    setOpenId(first ? first.id : "");
    setMsg("");
    setSettingsOpen(false);
  }
  const wordN = (n, one, few, many) => (n % 100 >= 11 && n % 100 <= 14 ? many : n % 10 === 1 ? one : n % 10 >= 2 && n % 10 <= 4 ? few : many);
  const summaryBtn = raw && (
    <button type="button" onClick={() => setSettingsOpen(!settingsOpen)} aria-expanded={settingsOpen} aria-label="Настройки журнала" title="Настройки журнала: период, дни уроков, шкала" style={S.summaryBtn} data-settings-summary>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></svg>
      {settingsSummary}
    </button>
  );

  // На широком экране классы — списком слева, у выбранного класса под ним его
  // журналы (предметы). На узком — чипами в строку, как раньше.
  const journalButtons = (
    <div style={S.sideJournals} role="group" aria-label="Журналы класса">
      {inClass.map((g) => {
        const on = raw && g.id === raw.id;
        return (
          <button key={g.id} type="button" aria-pressed={on} onClick={() => { setOpenId(g.id); setMsg(""); }} style={{ ...S.sideJournal, ...(on ? S.sideJournalOn : null) }} data-journal={g.classId ? g.subject || "Без предмета" : journalTitle(g, classes)}>
            {g.classId ? g.subject || "Без предмета" : journalTitle(g, classes)}
          </button>
        );
      })}
      <button type="button" onClick={create} style={{ ...S.sideJournal, ...S.sideJournalAdd }}>
        {classId ? "+ Предмет" : "+ Журнал"}
      </button>
    </div>
  );
  const sideNav = (
    <nav aria-label="Классы и журналы" className="ap-card" style={S.side} data-class-list>
      <div style={S.sideLabel}>Классы</div>
      <div role="group" aria-label="Класс" style={S.sideList}>
        {classes.map((c) => {
          const on = classId === c.id;
          const n = (c.students || []).length;
          const js = list.filter((g) => g.classId === c.id).length;
          return (
            <div key={c.id} style={S.sideBlock}>
              <button type="button" aria-pressed={on} onClick={() => pickClass(c.id)} style={{ ...S.sideItem, ...(on ? S.sideOn : null) }} data-class={c.name}>
                <span style={S.sideName}>{c.name}</span>
                <span style={S.sideMeta}>
                  {n} {wordN(n, "ученик", "ученика", "учеников")} · {js ? js + " " + wordN(js, "журнал", "журнала", "журналов") : "журналов нет"}
                </span>
              </button>
              {on && journalButtons}
            </div>
          );
        })}
        {(hasLegacy || !classes.length) && (
          <div style={S.sideBlock}>
            <button type="button" aria-pressed={classId === ""} onClick={() => pickClass("")} style={{ ...S.sideItem, ...(classId === "" ? S.sideOn : null) }} data-class="Свой список">
              <span style={S.sideName}>Свой список</span>
              <span style={S.sideMeta}>ученики вписаны вручную</span>
            </button>
            {classId === "" && journalButtons}
          </div>
        )}
      </div>
    </nav>
  );

  // Класс и предмет — чипами в одну строку, справа — сводка настроек.
  const topRow = (
    <div style={S.topRow}>
      {(classes.length > 0 || hasLegacy) && (
        <div style={S.chipGroup} role="group" aria-label="Класс">
          <span style={S.label}>Класс</span>
          {classes.map((c) => (
            <button
              key={c.id}
              type="button"
              aria-pressed={classId === c.id}
              onClick={() => pickClass(c.id)}
              style={{ ...S.chip, ...(classId === c.id ? S.chipOn : null) }}
              data-class={c.name}
            >
              {c.name}
            </button>
          ))}
          {(hasLegacy || !classes.length) && (
            <button
              type="button"
              aria-pressed={classId === ""}
              onClick={() => {
                setClassId("");
                const first = list.find((g) => !g.classId);
                setOpenId(first ? first.id : "");
              }}
              style={{ ...S.chip, ...(classId === "" ? S.chipOn : null) }}
            >
              Свой список
            </button>
          )}
        </div>
      )}
      {raw && <span style={S.vsep} aria-hidden="true" />}
      {raw && (
        <div style={S.chipGroup} role="group" aria-label="Журналы класса">
          <span style={S.label}>{classId ? "Предмет" : "Журнал"}</span>
          {inClass.map((g) => (
            <button key={g.id} type="button" aria-pressed={g.id === raw.id} onClick={() => { setOpenId(g.id); setMsg(""); }} style={{ ...S.chip, ...(g.id === raw.id ? S.chipOn : null) }}>
              {g.classId ? g.subject || "Без предмета" : journalTitle(g, classes)}
            </button>
          ))}
          <button type="button" onClick={create} style={{ ...S.chip, ...S.chipDashed }}>
            {classId ? "+ Предмет" : "+ Журнал"}
          </button>
        </div>
      )}
      {raw && <span style={{ flex: 1 }} />}
      {summaryBtn}
    </div>
  );

  // Обёртка: список классов сбоку (широкий экран) или чипы сверху.
  const shell = (body, attrs) =>
    wide ? (
      <div style={S.split} {...attrs}>
        {sideNav}
        <div style={S.outer}>
          {raw && <div style={S.summaryRow}>{summaryBtn}</div>}
          {body}
        </div>
      </div>
    ) : (
      <div style={S.outer} {...attrs}>
        {topRow}
        {body}
      </div>
    );

  if (!gb) {
    return shell(
      <>
        {classes.length === 0 && <p style={S.text}>Списки классов добавляет разработчик. Пока их нет — журнал можно вести своим списком учеников.</p>}
        <section className="ap-card" style={S.card}>
          <div style={S.title}>Журнал</div>
          <p style={S.text}>
            {currentClass ? `У класса ${currentClass.name} журналов пока нет. ` : ""}
            Ученики — строками, уроки по датам из расписания — столбцами. Ставьте отметки, а потом нажмите «Выложить изменения»: каждый
            ученик увидит свои отметки в разделе «Результаты».
          </p>
          <button type="button" onClick={create} style={{ ...S.primary, alignSelf: "flex-start" }}>
            {currentClass ? "+ Журнал " + currentClass.name : "+ Новый журнал"}
          </button>
        </section>
      </>
    );
  }

  const changedKeys = new Set(changes.map((c) => c.key));
  const issues = markIssues(gb, dates);
  const inJournal = new Set(gb.students.map((st) => st.id));
  const q = query.trim().toLowerCase().replace(/ё/g, "е");
  const candidates = allStudents(classes)
    .filter((st) => !inJournal.has(st.id))
    .filter((st) => !q || (studentName(st) + " " + st.email + " " + st.className).toLowerCase().replace(/ё/g, "е").includes(q))
    .slice(0, 30);
  const today = todayIso();
  const noEmailNames = gb.students.filter((s) => !String(s.email || "").trim()).map(studentName);
  const word = (n, one, few, many) => (n % 100 >= 11 && n % 100 <= 14 ? many : n % 10 === 1 ? one : n % 10 >= 2 && n % 10 <= 4 ? few : many);

  // Цвет клетки — пропорционально баллу (в 5-балльном — по оценке); «н» —
  // серым; пустая — пунктиром.
  const toneOf = (rawValue) => toneOfMark(rawValue, gb.scale);

  return shell(
      <>

      {settingsOpen && (
        <div style={S.settings} data-settings>
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
                onChange={(e) => setSubject(e.target.value)}
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
            {authorField}
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
                    onClick={() => toggleDay(d)}
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
            {(gb.skip || []).length > 0 && (
              <span style={S.label}>
                · скрытые даты:{" "}
                {gb.skip.slice().sort().map((d) => (
                  <button key={d} type="button" onClick={() => patch((g) => ({ ...g, skip: g.skip.filter((x) => x !== d) }))} style={S.link} title="Вернуть дату">
                    {ddmm(d)} ↺
                  </button>
                ))}
              </span>
            )}
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
                    setSettingsOpen(false);
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

      {/* Без стекла: размытие фона под большой таблицей пересчитывалось на
          каждом шаге прокрутки. */}
      <section className="ap-card" style={{ ...S.card, ...S.cardSolid }} ref={cardRef}>
        <div style={S.cardHead}>
          {/* Название — своей строкой, когда места мало; кнопки — под ним. */}
          <div style={S.cardTitleBox}>
            <h3 style={S.cardTitle}>{gb.name}</h3>
            <div style={S.cardMeta}>
              {gb.students.length} {word(gb.students.length, "ученик", "ученика", "учеников")} · {dates.length} {word(dates.length, "урок", "урока", "уроков")}
            </div>
          </div>
          <div style={S.cardTools}>
          {gb.scale === 100 && (
            <span style={S.segWrap} role="group" aria-label="Показывать">
              {[
                ["points", "Баллы"],
                ["grades", "Оценки"],
              ].map(([id, label]) => (
                <button key={id} type="button" aria-pressed={view === id} onClick={() => setView(id)} style={{ ...S.segBtn, ...(view === id ? S.segBtnOn : null) }}>
                  {label}
                </button>
              ))}
            </span>
          )}
          <button type="button" onClick={() => setAddOpen(!addOpen)} style={S.dashedBtn} aria-expanded={addOpen}>
            + Ученик
          </button>
          <button type="button" onClick={() => setDateOpen(!dateOpen)} style={S.dashedBtn} aria-expanded={dateOpen}>
            + Дата
          </button>
          {!raw.classId && gb.students.length > 1 && (
            <button type="button" onClick={() => patch((g) => ({ ...g, students: sortStudents(g.students) }))} style={S.link} title="Расставить учеников по фамилии">
              По алфавиту
            </button>
          )}
          </div>
        </div>

        {dateOpen && (
          <div style={S.row}>
            <input type="date" value={extraDate} onChange={(e) => setExtraDate(e.target.value)} aria-label="Добавить дату урока" style={{ ...S.input, width: "auto" }} />
            <button
              type="button"
              onClick={() => {
                if (!extraDate) return;
                patch((g) => ({ ...g, extra: Array.from(new Set([...(g.extra || []), extraDate])), skip: (g.skip || []).filter((x) => x !== extraDate) }));
                setExtraDate("");
                setDateOpen(false);
              }}
              style={S.secondary}
            >
              Добавить урок
            </button>
            <span style={S.label}>Например, перенесённый урок. Лишнюю дату скрывает × в шапке столбца.</span>
          </div>
        )}

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

        {issues.length > 0 && (
          <div style={S.issues} data-mark-issues role="alert">
            <div>
              <b>
                Похоже на опечатку: {issues.length} {word(issues.length, "отметка", "отметки", "отметок")}
              </b>{" "}
              — такие не уходят ученикам, пока их не исправить. Уже выложенная отметка у ученика остаётся прежней.
            </div>
            {issues.slice(0, 8).map((it) => (
              <div key={it.student.id + it.date} style={S.issueRow} data-issue={studentName(it.student) + " · " + ddmm(it.date)}>
                <button type="button" onClick={() => api.go(it.row, it.col)} style={S.issueWhere} title="Перейти к клетке">
                  {studentName(it.student)} · {ddmm(it.date)}
                </button>
                <span style={S.issueText}>{it.text}</span>
                {it.fix !== null && (
                  <button type="button" onClick={() => setMark(it.student.id, it.date, it.fix)} style={S.issueFix} aria-label={`Исправить на ${it.fix}: ${studentName(it.student)}, ${ddmm(it.date)}`}>
                    Исправить на {it.fix}
                  </button>
                )}
                <button type="button" onClick={() => setMark(it.student.id, it.date, "")} style={S.link} aria-label={`Стереть: ${studentName(it.student)}, ${ddmm(it.date)}`}>
                  Стереть
                </button>
              </div>
            ))}
            {issues.length > 8 && <div style={S.label}>…и ещё {issues.length - 8}</div>}
          </div>
        )}

        {!settingsOpen && (dates.length === 0 || raw.id === freshId) && (
          <div style={S.setup} data-journal-setup>
            <div style={S.setupTitle}>{dates.length === 0 ? "Выберите предмет и дни уроков — появится таблица" : "Новый журнал"}</div>
            <label style={{ ...S.field, maxWidth: 360 }}>
              <span style={S.label}>Предмет</span>
              <input list="gb-subjects-setup" value={raw.subject} aria-label="Предмет журнала" onChange={(e) => setSubject(e.target.value)} style={S.input} />
              <datalist id="gb-subjects-setup">
                {(subjects || []).map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
            </label>
            <div style={S.field}>
              <span style={S.label}>
                Дни уроков{" "}
                {fromSchedule.length ? "· по расписанию: " + fromSchedule.map((d) => DAY_SHORT[d]).join(", ") : "· в расписании этого предмета нет — отметьте дни"}
              </span>
              <div style={S.row} role="group" aria-label="Дни уроков">
                {DAY_KEYS.map((d) => {
                  const on = (raw.days || []).includes(d);
                  return (
                    <button key={d} type="button" aria-pressed={on} onClick={() => toggleDay(d)} style={{ ...S.seg, ...(on ? S.segOn : null) }}>
                      {DAY_SHORT[d]}
                    </button>
                  );
                })}
              </div>
            </div>
            <div style={S.row}>
              <span style={S.label}>Период — {settingsSummary.split(" · ")[0].toLowerCase()}; поменять его и шкалу можно в настройках (кнопка со сводкой).</span>
              {raw.id === freshId && dates.length > 0 && (
                <button type="button" onClick={() => setFreshId("")} style={S.secondary}>
                  Готово
                </button>
              )}
            </div>
          </div>
        )}

        {gb.students.length === 0 ? (
          <p style={S.text}>Добавьте учеников — появится таблица.</p>
        ) : dates.length === 0 ? null : (
          <div style={S.tableWrap} ref={tableRef}>
            <table style={S.table} data-gradebook-table>
              <thead>
                <tr>
                  <th style={{ ...S.th, ...S.sticky, ...S.thName }}>Ученик</th>
                  {dates.map((d) => (
                    <th key={d} style={{ ...S.th, ...(d === today ? S.todayCol : null) }} data-date={d} title={d === today ? "Сегодня" : undefined}>
                      <div style={S.dateTop}>{d.slice(8, 10)}</div>
                      <div style={S.dateDay}>
                        {DAY_SHORT[dayOf(d)].toLowerCase()}
                        <button type="button" title="Скрыть дату (урока не было)" aria-label={"Скрыть дату " + ddmm(d)} onClick={() => patch((g) => ({ ...g, skip: [...(g.skip || []), d] }))} style={S.hideBtn}>
                          ×
                        </button>
                      </div>
                    </th>
                  ))}
                  <th style={{ ...S.th, ...S.statTh }} title={asGrades ? "Среднее арифметическое оценок" : "Среднее арифметическое баллов"}>
                    Средняя
                  </th>
                  <th style={{ ...S.th, ...S.statTh }} title="Сколько раз не был («н»)">н</th>
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
                                {st.email || "нет почты — отметки не уйдут"}
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
                                <input value={st.last ?? ""} placeholder="Фамилия" onChange={(e) => editStudent(st.id, { last: e.target.value })} aria-label={"Фамилия: " + studentName(st)} style={S.nameInput} />
                                <input value={st.first ?? ""} placeholder="Имя" onChange={(e) => editStudent(st.id, { first: e.target.value })} aria-label={"Имя: " + studentName(st)} style={{ ...S.nameInput, fontWeight: 500, fontSize: 13 }} />
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
                        const cellRaw = ((gb.marks || {})[st.id] || {})[d] ?? "";
                        const absent = isAbsent(cellRaw);
                        const changed = changedKeys.has(st.id + "|" + d);
                        const todayStyle = d === today ? S.todayCol : null;
                        if (asGrades && gb.scale === 100) {
                          // Оценками — только просмотр: ставят баллы.
                          const v = markValue(cellRaw, gb.scale);
                          const g = absent ? "н" : markGrade(gb, v);
                          return (
                            <td key={d} style={{ ...S.td, ...todayStyle }}>
                              <span data-grade-cell={row + ":" + col} title={v === null ? "" : v + " баллов"} style={{ ...S.cell, ...S.gradeCell, ...toneOf(cellRaw), ...(changed ? S.cellChanged : null) }}>
                                {g || "·"}
                              </span>
                            </td>
                          );
                        }
                        const ed = editing && editing.row === row && editing.col === col ? editing : null;
                        return (
                          <MarkCell
                            key={d}
                            row={row}
                            col={col}
                            value={String(cellRaw)}
                            scale={gb.scale}
                            changed={changed}
                            today={d === today}
                            editing={ed}
                            label={`${studentName(st)}, ${ddmm(d)}`}
                            api={api}
                          />
                        );
                      })}
                      <td style={{ ...S.td, ...S.avgCell }}>
                        <span style={{ ...S.avgMain, ...(ss.avgGrade !== null && ss.avgGrade < 3 ? { color: "var(--red)" } : null) }}>
                          {asGrades ? <span data-avg-grade={studentName(st)}>{f1(ss.avgGrade)}</span> : <span data-avg={studentName(st)}>{f1(ss.avg ?? ss.avgGrade)}</span>}
                        </span>
                        {gb.scale === 100 && (
                          <span style={S.avgSub}>
                            {asGrades ? (
                              <>
                                <span data-avg={studentName(st)}>{f1(ss.avg)}</span> б.
                              </>
                            ) : (
                              <>
                                оц. <span data-avg-grade={studentName(st)}>{f1(ss.avgGrade)}</span>
                              </>
                            )}
                          </span>
                        )}
                      </td>
                      <td style={{ ...S.td, ...S.statCell, ...(ss.absent ? { color: "var(--red)" } : null) }} data-absent={studentName(st)}>
                        {ss.absent || "—"}
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
                  <td style={{ ...S.td, ...S.sticky, ...S.footLabel }}>Средняя по уроку</td>
                  {dates.map((d) => {
                    const vals = gb.students.map((st) => markValue(((gb.marks || {})[st.id] || {})[d], gb.scale)).filter((v) => v !== null);
                    const shown = asGrades ? vals.map((v) => markGrade(gb, v)) : vals;
                    return (
                      <td key={d} style={{ ...S.td, ...S.footCell, ...(d === today ? S.todayCol : null) }}>
                        {shown.length ? f1(shown.reduce((x, y) => x + y, 0) / shown.length) : "—"}
                      </td>
                    );
                  })}
                  <td style={{ ...S.td, ...S.footCell, fontWeight: 700 }}>{f1(asGrades ? stats.avgGrade : stats.avg ?? stats.avgGrade)}</td>
                  <td style={S.td} />
                  <td style={{ ...S.td, ...S.footCell, whiteSpace: "nowrap" }}>{[5, 4, 3, 2].map((g) => stats.dist[g]).join(" · ")}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {stats && stats.count > 0 && (
          <div style={S.classStats} data-class-stats>
            <span style={S.label}>По классу</span>
            {gb.scale === 100 && (
              <span>
                средний балл <b style={S.classBig}>{f1(stats.avg)}</b>
              </span>
            )}
            <span>
              средняя оценка <b style={S.classBig}>{f1(stats.avgGrade)}</b>
            </span>
            <span style={S.distRow} aria-label="Распределение оценок">
              {[5, 4, 3, 2].map((g) => {
                const n = stats.dist[g];
                const share = stats.count ? Math.round((n / stats.count) * 100) : 0;
                return (
                  <span key={g} style={{ ...S.distItem, ...CELL_TONE[g] }} data-dist-grade={g}>
                    <b>{g}</b> — {n} <span style={{ opacity: 0.7 }}>({share} %)</span>
                  </span>
                );
              })}
            </span>
            <span style={{ ...S.label, flexBasis: "100%" }}>
              {stats.best ? "Лучший средний: " + studentName(stats.best) + ". " : ""}
              {stats.risk.length ? "Средняя оценка ниже 3: " + stats.risk.map(studentName).join(", ") + "." : "Средняя оценка ниже 3 — ни у кого."}
            </span>
          </div>
        )}

        {(dates.length > 0 || changes.length > 0) && (
        <div style={{ ...S.publishBar, ...(changes.length ? null : S.publishIdle) }}>
          {changes.length > 0 && <span style={S.publishDot} aria-hidden="true" />}
          <span style={S.publishText} role="status">
            {msg ? (
              msg
            ) : changes.length ? (
              <>
                <b>
                  {changes.length} {word(changes.length, "новая отметка", "новые отметки", "новых отметок")}
                </b>{" "}
                ещё не {changes.length === 1 ? "выложена" : "выложены"}
              </>
            ) : (
              "Всё выложено — ученики видят отметки в своих «Результатах»"
            )}
            {issues.length > 0 && ` · С опечаткой: ${issues.length} — не уйдут, пока не исправить`}
            {noEmailNames.length > 0 &&
              ` · Без почты: ${noEmailNames.length} (${noEmailNames.slice(0, 2).join(", ")}${noEmailNames.length > 2 ? "…" : ""}) — им отметки не уйдут`}
          </span>
          <button type="button" onClick={publishAll} disabled={!changes.length || busy} style={{ ...S.primary, ...(changes.length ? null : S.off) }}>
            {busy ? "Выкладываю…" : changes.length ? "Выложить изменения · " + changes.length : "Всё выложено"}
          </button>
        </div>
        )}
      </section>
      <p style={S.hint}>
        Отметка — цифра в клетке{gb.scale === 100 ? " (0–100)" : " (1–5)"}, «н» — не был, пусто — без отметки. Enter и стрелки ходят по клеткам. Жёлтая рамка — ещё
        не выложено. Отметки видны ученику в его «Результатах» как официальные.
        {gb.scale === 100 ? " Оценки — по шкале уроков: 0–49 → 2, 50–69 → 3, 70–89 → 4, 90–100 → 5." : ""} Цвет клетки — по баллу: чем выше, тем зеленее.
        Буква или лишняя цифра подсветятся красным — такая отметка не уйдёт, пока её не исправить.
      </p>
      </>,
    { "data-gradebook": gb.name }
  );
}

// Цвет клетки по оценке — как в макете: 5 и 4 зелёные, 3 жёлтая, 2 красная.
const CELL_TONE = {
  5: { background: "var(--greenSoft)", color: "var(--green)", borderColor: "transparent" },
  4: { background: "color-mix(in srgb, var(--greenSoft) 60%, var(--panel2))", color: "var(--green)", borderColor: "transparent" },
  3: { background: "var(--warmBg)", color: "var(--warmInk)", borderColor: "transparent" },
  2: { background: "var(--redBg)", color: "var(--red)", borderColor: "transparent" },
};

// Оттенок рамки по оценке.
const GRADE_TONE = {
  5: { borderColor: "color-mix(in srgb, var(--green, #3F8F6A) 60%, transparent)" },
  4: { borderColor: "color-mix(in srgb, var(--accent) 60%, transparent)" },
  3: { borderColor: "color-mix(in srgb, var(--ink3) 60%, transparent)" },
  2: { borderColor: "color-mix(in srgb, var(--red) 60%, transparent)", color: "var(--red)" },
};

function toneOfMark(rawValue, scale) {
  if (String(rawValue ?? "").trim() === "") return S.cellEmpty;
  if (isAbsent(rawValue)) return S.cellAbsent;
  if (markIssue(rawValue, scale)) return S.cellBad;
  const v = markValue(rawValue, scale);
  if (v === null) return null;
  const t = scoreTone(scale === 5 ? percentOfGrade(v) : v);
  return t ? { ...t, borderStyle: "solid" } : null;
}

// Клетка журнала. Пока не правят — кнопка (дёшево и для прокрутки, и для
// перерисовки: React.memo пропускает клетки, где ничего не поменялось).
const MarkCell = memo(function MarkCell({ row, col, value, scale, changed, today, editing, label, api }) {
  const done = useRef(false);
  const inputRef = useRef(null);
  useEffect(() => {
    if (!editing || !inputRef.current) return;
    done.current = false;
    const el = inputRef.current;
    el.focus();
    if (editing.initial === null || editing.initial === undefined) el.select();
    else el.setSelectionRange(el.value.length, el.value.length);
  }, [editing]);
  const issue = markIssue(value, scale);
  const absent = isAbsent(value);
  const style = { ...S.cell, ...toneOfMark(value, scale), ...(changed ? S.cellChanged : null), ...(issue ? S.cellBad : null) };
  const title = issue ? issue.text + (issue.fix !== null ? ` — может, ${issue.fix}?` : "") : changed ? "Ещё не выложена" : absent ? "Не был" : "";
  const finish = (e, move) => {
    if (done.current) return;
    done.current = true;
    api.finish(row, col, e.currentTarget.value, move);
  };
  return (
    <td style={{ ...S.td, ...(today ? S.todayCol : null) }}>
      {editing ? (
        <input
          ref={inputRef}
          data-cell={row + ":" + col}
          defaultValue={editing.initial ?? value}
          inputMode="text"
          autoComplete="off"
          aria-label={label}
          aria-invalid={issue ? "true" : undefined}
          onBlur={(e) => finish(e, null)}
          onKeyDown={(e) => {
            const el = e.currentTarget;
            if (e.key === "Enter" || e.key === "ArrowDown") {
              e.preventDefault();
              finish(e, [1, 0, true]);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              finish(e, [-1, 0, true]);
            } else if (e.key === "ArrowRight" && el.selectionStart === el.value.length && el.selectionEnd === el.value.length) {
              e.preventDefault();
              finish(e, [0, 1, true]);
            } else if (e.key === "ArrowLeft" && el.selectionStart === 0 && el.selectionEnd === 0) {
              e.preventDefault();
              finish(e, [0, -1, true]);
            } else if (e.key === "Escape") {
              e.preventDefault();
              done.current = true;
              api.cancel(row, col);
            }
          }}
          style={{ ...style, ...S.cellEditing }}
          title={title}
        />
      ) : (
        <button
          type="button"
          data-cell={row + ":" + col}
          aria-label={label + (value ? ": " + value : ": пусто")}
          aria-invalid={issue ? "true" : undefined}
          onClick={() => api.start(row, col, null)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === "F2") {
              e.preventDefault();
              api.start(row, col, null);
            } else if (e.key === "Delete" || e.key === "Backspace") {
              e.preventDefault();
              api.clear(row, col);
            } else if (e.key === "ArrowDown") {
              e.preventDefault();
              api.go(row + 1, col);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              api.go(row - 1, col);
            } else if (e.key === "ArrowRight") {
              e.preventDefault();
              api.go(row, col + 1);
            } else if (e.key === "ArrowLeft") {
              e.preventDefault();
              api.go(row, col - 1);
            } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
              // Начали печатать — клетка открывается с этой буквой.
              e.preventDefault();
              api.start(row, col, e.key);
            }
          }}
          style={style}
          title={title}
        >
          {value || "·"}
        </button>
      )}
    </td>
  );
});

const S = {
  outer: { display: "flex", flexDirection: "column", gap: 12, minWidth: 0 },
  split: { display: "grid", gridTemplateColumns: "220px minmax(0, 1fr)", gap: 16, alignItems: "start" },
  side: { position: "sticky", top: 16, display: "flex", flexDirection: "column", gap: 4, padding: "10px 8px", borderRadius: 16, border: "1px solid var(--line)", background: "var(--panel)" },
  sideLabel: { padding: "2px 10px 4px", fontSize: 11.5, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--mute)" },
  sideList: { display: "flex", flexDirection: "column", gap: 2 },
  sideBlock: { display: "flex", flexDirection: "column", gap: 2 },
  sideItem: { display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2, width: "100%", padding: "9px 10px", border: "none", borderRadius: 10, background: "transparent", color: "var(--ink)", font: "inherit", textAlign: "left", cursor: "pointer" },
  sideOn: { background: "color-mix(in srgb, var(--ink) 9%, transparent)" },
  sideName: { fontSize: 15, fontWeight: 700 },
  sideMeta: { fontSize: 12, color: "var(--ink3)" },
  sideJournals: { display: "flex", flexDirection: "column", gap: 2, margin: "2px 0 6px 12px", paddingLeft: 8, borderLeft: "2px solid var(--line)" },
  sideJournal: { width: "100%", padding: "7px 10px", border: "none", borderRadius: 9, background: "transparent", color: "var(--ink2)", font: "inherit", fontSize: 13.5, textAlign: "left", cursor: "pointer" },
  sideJournalOn: { background: "var(--btnBg)", color: "var(--btnInk)", fontWeight: 600 },
  sideJournalAdd: { color: "var(--ink3)", border: "1px dashed var(--line)", marginTop: 2 },
  summaryRow: { display: "flex", justifyContent: "flex-end" },
  topRow: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" },
  chipGroup: { display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" },
  chip: { height: 34, padding: "0 13px", borderRadius: 999, border: "1px solid var(--line)", background: "var(--panel)", color: "var(--ink)", font: "inherit", fontSize: 13.5, cursor: "pointer" },
  chipOn: { background: "var(--btnBg)", borderColor: "var(--btnBg)", color: "var(--btnInk)", fontWeight: 600 },
  chipDashed: { borderStyle: "dashed", background: "transparent", color: "var(--ink2)" },
  vsep: { width: 1, height: 22, background: "var(--line)" },
  summaryBtn: { display: "inline-flex", alignItems: "center", gap: 8, height: 36, padding: "0 12px", borderRadius: 10, border: "1px solid var(--line)", background: "var(--panel)", color: "var(--ink)", font: "inherit", fontSize: 13, cursor: "pointer" },
  cardHead: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
  cardTitleBox: { flex: "1 1 260px", minWidth: 0, display: "flex", flexDirection: "column", gap: 2 },
  cardTitle: { margin: 0, fontFamily: "var(--serif)", fontWeight: 400, fontSize: 21, lineHeight: 1.2, overflowWrap: "anywhere" },
  cardMeta: { fontSize: 13, color: "var(--ink3)" },
  cardTools: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
  segWrap: { display: "inline-flex", gap: 2, padding: 3, borderRadius: 10, background: "color-mix(in srgb, var(--ink) 8%, transparent)" },
  segBtn: { height: 30, padding: "0 10px", border: "none", borderRadius: 8, background: "transparent", color: "var(--ink2)", font: "inherit", fontSize: 13, cursor: "pointer" },
  segBtnOn: { background: "var(--panel2)", color: "var(--ink)", fontWeight: 600, boxShadow: "0 1px 2px rgba(0,0,0,.08)" },
  dashedBtn: { height: 32, padding: "0 12px", borderRadius: 9, border: "1px dashed var(--line)", background: "transparent", color: "var(--ink)", font: "inherit", fontSize: 12.5, cursor: "pointer" },
  thName: { textAlign: "left", fontSize: 11.5, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--mute)", fontWeight: 600 },
  todayCol: { background: "color-mix(in srgb, var(--warmBg) 70%, transparent)" },
  cellEmpty: { borderStyle: "dashed", background: "transparent" },
  cellAbsent: { background: "var(--neutralBg)", color: "var(--ink3)", borderColor: "transparent", fontFamily: "var(--serif)" },
  avgMain: { display: "block", fontFamily: "var(--serif)", fontSize: 17 },
  avgSub: { display: "block", fontSize: 11, fontWeight: 400, color: "var(--mute)" },
  publishIdle: { background: "transparent", borderColor: "var(--line2, var(--line))" },
  publishDot: { width: 8, height: 8, borderRadius: "50%", background: "var(--accent)", flexShrink: 0 },
  publishText: { flex: 1, minWidth: 200, fontSize: 13.5, color: "var(--ink2)" },
  hint: { margin: 0, fontSize: 12.5, color: "var(--mute)", lineHeight: 1.5 },
  viewSwitch: { display: "inline-flex", gap: 4, marginLeft: "auto" },
  statTh: { fontSize: 11.5, fontWeight: 600, color: "var(--ink3)", padding: "6px 8px" },
  statCell: { fontSize: 12.5, color: "var(--ink2)", fontVariantNumeric: "tabular-nums", padding: "3px 8px" },
  gradeCell: { cursor: "default" },
  classStats: { display: "flex", alignItems: "baseline", flexWrap: "wrap", gap: "6px 16px", padding: "10px 12px", borderRadius: 12, background: "color-mix(in srgb, var(--ink) 3%, var(--panel2))", border: "1px solid var(--line2, var(--line))", fontSize: 13.5, color: "var(--ink2)" },
  classMain: { display: "flex", alignItems: "baseline", gap: 16, flexWrap: "wrap", fontSize: 13.5, color: "var(--ink2)" },
  classBig: { fontFamily: "var(--serif)", fontSize: 22, color: "var(--ink)" },
  distRow: { display: "flex", flexWrap: "wrap", gap: 6 },
  distItem: { fontSize: 13, padding: "3px 10px", borderRadius: 999, border: "1px solid var(--line)", background: "var(--panel)" },
  card: { padding: "16px 18px 0", borderRadius: 18, border: "1px solid var(--line)", background: "var(--panel)", display: "flex", flexDirection: "column", gap: 12, minWidth: 0, overflow: "hidden" },
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
  th: { position: "sticky", top: 0, padding: "8px 5px", background: "var(--menuBg)", borderBottom: "1px solid var(--line)", fontWeight: 600, textAlign: "center", whiteSpace: "nowrap", zIndex: 1 },
  td: { padding: "6px 5px", borderBottom: "1px solid var(--line2, var(--line))", textAlign: "center" },
  sticky: { position: "sticky", left: 0, zIndex: 2, background: "var(--menuBg)", borderRight: "1px solid var(--line)", boxShadow: "4px 0 6px -4px rgba(0,0,0,.18)" },
  nameCell: { textAlign: "left", minWidth: 170, maxWidth: 230 },
  // Фамилия и имя — двумя строками: в узком столбце имя иначе обрезалось.
  nameRow: { display: "flex", flexDirection: "column" },
  rosterName: { display: "flex", alignItems: "center", gap: 4, padding: "2px 4px" },
  rosterText: { display: "flex", flexDirection: "column", flex: 1, minWidth: 0, fontSize: 13.5 },
  rosterEmail: { fontSize: 11.5, color: "var(--ink3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  candidates: { display: "flex", flexWrap: "wrap", gap: 6, maxHeight: 180, overflowY: "auto" },
  candidate: { border: "1px solid var(--line)", borderRadius: 999, background: "var(--panel)", color: "var(--ink)", font: "inherit", fontSize: 13, padding: "4px 10px", cursor: "pointer" },
  confirm: { display: "inline-flex", alignItems: "center", flexWrap: "wrap", gap: 8, fontSize: 13, color: "var(--ink2)" },
  nameInput: { display: "block", width: "100%", minWidth: 0, flex: 1, border: "none", background: "transparent", color: "var(--ink)", font: "inherit", fontSize: 13.5, fontWeight: 600, padding: "0 2px", height: 20, minHeight: 0, lineHeight: "20px", boxShadow: "none", borderRadius: 4 },
  emailInput: { display: "block", width: "100%", border: "none", background: "transparent", color: "var(--ink3)", font: "inherit", fontSize: 11.5, padding: "0 2px", height: 16, minHeight: 0, lineHeight: "16px", boxShadow: "none", borderRadius: 4 },
  emailMissing: { color: "var(--red)" },
  dateTop: { fontSize: 13, fontWeight: 700, fontVariantNumeric: "tabular-nums" },
  dateDay: { display: "flex", alignItems: "center", justifyContent: "center", gap: 2, fontSize: 11, fontWeight: 400, color: "var(--mute)" },
  hideBtn: { border: "none", background: "none", color: "var(--mute)", fontSize: 13, lineHeight: 1, padding: "0 2px", cursor: "pointer" },
  cell: { width: 40, height: 36, boxSizing: "border-box", textAlign: "center", border: "1px solid var(--line)", borderRadius: 8, background: "var(--panel2)", color: "var(--ink)", fontFamily: "var(--serif)", fontSize: 18, fontVariantNumeric: "tabular-nums", padding: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer" },
  // Ещё не выложено — жёлтое кольцо поверх цвета оценки.
  cellChanged: { boxShadow: "inset 0 0 0 2px var(--warmLine)", borderColor: "var(--warmLine)", borderStyle: "solid" },
  cellBad: { borderColor: "var(--red)", borderStyle: "solid", color: "var(--red)", background: "var(--redBg)" },
  setup: { display: "flex", flexDirection: "column", gap: 10, padding: "12px 14px", borderRadius: 12, border: "1px dashed var(--accent)", background: "color-mix(in srgb, var(--accent) 6%, transparent)" },
  setupTitle: { fontSize: 14, fontWeight: 700 },
  cardSolid: { backdropFilter: "none", WebkitBackdropFilter: "none", background: "var(--menuBg)" },
  cellEditing: { outline: "2px solid var(--accent)", outlineOffset: 1, cursor: "text" },
  issues: { display: "flex", flexDirection: "column", gap: 6, padding: "10px 12px", borderRadius: 12, border: "1px solid color-mix(in srgb, var(--red) 40%, transparent)", background: "var(--redBg)", fontSize: 13, color: "var(--ink)" },
  issueRow: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" },
  issueWhere: { border: "none", background: "none", padding: 0, font: "inherit", fontWeight: 700, color: "var(--ink)", textDecoration: "underline", textDecorationStyle: "dotted", cursor: "pointer" },
  issueText: { color: "var(--red)" },
  issueFix: { minHeight: 30, padding: "0 12px", borderRadius: 9, border: "1px solid var(--line)", background: "var(--panel)", color: "var(--ink)", font: "inherit", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  avgCell: { fontWeight: 700, fontVariantNumeric: "tabular-nums", minWidth: 60 },
  footLabel: { textAlign: "left", fontSize: 12, color: "var(--mute)" },
  footCell: { fontSize: 12, color: "var(--mute)", fontVariantNumeric: "tabular-nums" },
  publishBar: { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", margin: "0 -18px", padding: "12px 18px", background: "color-mix(in srgb, var(--warmBg) 85%, transparent)", borderTop: "1px solid var(--line2, var(--line))" },
};
