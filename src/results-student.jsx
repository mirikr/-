import React, { useEffect, useMemo, useRef, useState } from "react";
import MoreMenu from "./more-menu.jsx";
import { KINDS, expandResults, gradeOf, kindName, olympiadStages, percentOfGrade, scoreColor, stageSummary, statusName, summarize } from "./results-model.js";

// Экран ученика в «Результатах» — вариант B из макетов: слева предметы со
// средним баллом и отдельной группой олимпиады, справа страница выбранного —
// четыре цифры, график «как менялся балл» с порогом и все записи. На телефоне
// предметы — чипами сверху, под ними сводка с графиком и записи.

const NARROW = "(max-width: 760px)";
const DONE_STATUSES = ["next", "prize", "winner"];

function useNarrow() {
  const [narrow, setNarrow] = useState(() => typeof window !== "undefined" && !!window.matchMedia && window.matchMedia(NARROW).matches);
  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const mq = window.matchMedia(NARROW);
    const on = () => setNarrow(mq.matches);
    mq.addEventListener ? mq.addEventListener("change", on) : mq.addListener(on);
    return () => (mq.removeEventListener ? mq.removeEventListener("change", on) : mq.removeListener(on));
  }, []);
  return narrow;
}

const f1 = (n) => (n === null || n === undefined ? "—" : String(Math.round(n * 10) / 10).replace(".", ","));
const ddmm = (iso) => (/^\d{4}-\d{2}-\d{2}/.test(String(iso || "")) ? iso.slice(8, 10) + "." + iso.slice(5, 7) : "");
const MONTHS = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
const MONTHS_FULL = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
const dayMon = (iso) => (/^\d{4}-\d{2}-\d{2}/.test(String(iso || "")) ? Number(iso.slice(8, 10)) + " " + MONTHS[Number(iso.slice(5, 7)) - 1] : "");
const dayMonFull = (iso) => (/^\d{4}-\d{2}-\d{2}/.test(String(iso || "")) ? Number(iso.slice(8, 10)) + " " + MONTHS_FULL[Number(iso.slice(5, 7)) - 1] : "");

function word(n, one, few, many) {
  const a = n % 10;
  const b = n % 100;
  if (b >= 11 && b <= 14) return many;
  if (a === 1) return one;
  if (a >= 2 && a <= 4) return few;
  return many;
}

// Оттенки меток вида — как в макете.
const KIND_TONE = {
  lesson: { background: "var(--greenSoft)", color: "var(--green)" },
  kt: { background: "var(--warmBg)", color: "var(--warmInk)" },
  olympiad: { background: "var(--redBg)", color: "var(--red)" },
  exam: { background: "color-mix(in srgb, var(--blue) 16%, transparent)", color: "var(--blue)" },
  probe: { background: "var(--neutralBg)", color: "var(--ink2)" },
  other: { background: "var(--neutralBg)", color: "var(--ink2)" },
};

// Значение записи для подсчётов и графика: в баллах — процент (100-балльная),
// в оценках — оценка. Олимпиады — только в баллах. «н» — без значения.
function valueIn(r, mode) {
  if (r.scale === "absent") return null;
  if (mode === "grades") return r.kind === "olympiad" ? null : gradeOf(r);
  return summarize(r).percent;
}

// Цифры для страницы: средний, лучший и последний (с записью), средняя оценка.
// Этапы олимпиады — отдельными значениями.
function pageStats(list, mode) {
  const rows = expandResults(list)
    .map((r) => ({ r, v: valueIn(r, mode) }))
    .filter((x) => x.v !== null)
    .sort((a, b) => String(a.r.date || "").localeCompare(String(b.r.date || "")));
  const mean = (arr) => (arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : null);
  const best = rows.length ? rows.reduce((b, x) => (x.v > b.v ? x : b)) : null;
  const last = rows.length ? rows[rows.length - 1] : null;
  const prev = rows.length > 1 ? rows[rows.length - 2] : null;
  const grades = expandResults(list)
    .filter((r) => r.kind !== "olympiad" && r.scale !== "absent")
    .map((r) => gradeOf(r))
    .filter((g) => g !== null);
  const points = expandResults(list)
    .filter((r) => r.scale !== "absent")
    .map((r) => summarize(r).percent)
    .filter((p) => p !== null);
  return { rows, avg: mean(rows.map((x) => x.v)), best, last, trend: last && prev ? last.v - prev.v : null, avgGrade: mean(grades), avgPoints: mean(points) };
}

// Цвет числа по его величине: в баллах — сам балл, в оценках — место оценки
// на той же шкале.
const tint = (v, mode) => scoreColor(mode === "grades" ? percentOfGrade(v) : v);

// Что показать крупно у записи и подписью под этим.
function scoreOf(r, mode) {
  if (r.scale === "absent") return { big: "н", sub: "не был", pct: null };
  const s = summarize(r);
  const pct = s.percent;
  if (r.kind === "olympiad") return { pct, big: s.percent === null ? "—" : f1(Number(String(s.main).split(" ")[0].replace(",", "."))), sub: s.main.includes(" из ") ? "из " + s.main.split(" из ")[1] : "баллов" };
  const g = gradeOf(r);
  if (mode === "grades") return { pct: g === null ? null : percentOfGrade(g), big: g === null ? "—" : String(g), sub: s.percent === null ? "оценка" : f1(s.percent) + " из 100" };
  if (s.percent === null) return { pct, big: r.scale === "pass" ? (r.passed ? "зачёт" : r.passed === false ? "незачёт" : "—") : "—", sub: "" };
  return { pct, big: f1(s.percent), sub: g === null ? "из 100" : "оценка " + g };
}

// Подробность под названием: кто выложил или «моя запись» и исходные баллы.
function detailOf(r, withSubject) {
  const s = summarize(r);
  const raw = r.scale === "primsec" && s.sub ? s.sub.split(" · ")[0] : r.kind !== "olympiad" && s.main && s.main !== "нет баллов" && !/^оценка/.test(s.main) && !(r.scale === "points" && Number(r.max) === 100) ? s.main : "";
  const who = r.source === "self" ? "моя запись" : (r.author || (r.source === "teacher" ? "учитель" : "из обновления")) + " · 🔒 официальный";
  return [withSubject && r.subject, r.kind === "olympiad" ? s.sub : raw, who].filter(Boolean).join(" · ");
}

// Последний этап олимпиады с баллами и что дальше.
function olympiadState(r) {
  const stages = olympiadStages(r);
  let lastIdx = -1;
  stages.forEach((st, i) => {
    if (stageSummary(st).main !== "нет баллов") lastIdx = i;
  });
  const last = lastIdx >= 0 ? stages[lastIdx] : null;
  const next = stages[lastIdx + 1] || null;
  const s = last ? stageSummary(last) : null;
  const passed = last && (s.passedThreshold === true || DONE_STATUSES.includes(last.status));
  const value = s && s.main !== "нет баллов" ? s.main.split(" ")[0] : "";
  let badge = { text: "ждём", tone: "wait" };
  if (last) {
    if (last.status === "winner") badge = { text: value + " · победитель", tone: "good" };
    else if (last.status === "prize") badge = { text: value + " · призёр", tone: "good" };
    else if (passed) badge = { text: value + " · прошёл ✓", tone: "good" };
    else if (s.passedThreshold === false) badge = { text: value + " · не прошёл", tone: "bad" };
    else badge = { text: value, tone: "plain" };
  }
  const where = last ? [String(last.name || "этап").toLowerCase(), dayMon(last.date)].filter(Boolean).join(", ") : [next && String(next.name || "этап").toLowerCase(), next && dayMon(next.date)].filter(Boolean).join(", ");
  const then = last && next ? "дальше " + String(next.name || "следующий этап").toLowerCase() : "";
  return { badge, line: [where, then].filter(Boolean).join(" · ") };
}

// focus — открыть сразу предмет (из расписания): { subject, n }; n меняется
// при каждом переходе, чтобы повторный переход сработал.
export default function StudentView({ items, hiddenIds, showHidden, setShowHidden, onHide, onEdit, onRemove, onAdd, mode, setMode, colorOf, onCode, focus }) {
  const narrow = useNarrow();
  const [sel, setSel] = useState(() => (focus && focus.subject ? { type: "subject", name: focus.subject } : { type: "all" }));
  const [query, setQuery] = useState("");
  useEffect(() => {
    if (focus && focus.subject) {
      setSel({ type: "subject", name: focus.subject });
      setQuery("");
    }
  }, [focus]);
  const [kind, setKind] = useState("all");
  const hidden = new Set(hiddenIds || []);
  const visible = items.filter((r) => r.source === "self" || showHidden || !hidden.has(r.id));
  const hiddenCount = items.filter((r) => r.source !== "self" && hidden.has(r.id)).length;
  const color = (name) => (colorOf && name ? colorOf(name) : "var(--ink3)");

  const subjects = useMemo(() => {
    const map = new Map();
    visible.forEach((r) => {
      const key = r.subject || "Без предмета";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(r);
    });
    return Array.from(map.entries())
      .map(([name, list]) => ({ name, list, stats: pageStats(list, mode) }))
      .sort((a, b) => b.list.length - a.list.length || a.name.localeCompare(b.name, "ru"));
  }, [visible, mode]); // eslint-disable-line react-hooks/exhaustive-deps
  const olympiads = visible.filter((r) => r.kind === "olympiad").sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  // Поиск по предметам (и олимпиадам — по названию и предмету).
  const norm = (t) => String(t || "").toLowerCase().replace(/ё/g, "е");
  const q = norm(query.trim());
  const shownSubjects = q ? subjects.filter((x) => norm(x.name).includes(q)) : subjects;
  const shownOlympiads = q ? olympiads.filter((r) => norm(r.title).includes(q) || norm(r.subject).includes(q)) : olympiads;
  const overall = pageStats(visible, "points");
  const official = visible.filter((r) => r.source !== "self").length;

  // Выбранное могло пропасть (скрыли, удалили) — тогда «Все предметы».
  const current =
    sel.type === "subject" ? subjects.find((s) => s.name === sel.name) : sel.type === "olympiad" ? olympiads.find((r) => r.id === sel.id) : null;
  const view = current ? sel.type : sel.type === "olympiads" ? "olympiads" : sel.type === "subject" ? "emptySubject" : "all";
  const pageList = view === "subject" ? current.list : visible;

  if (!items.length) {
    return (
      <section className="ap-card" style={S.empty} data-results-empty>
        <div style={S.emptyTitle}>Результатов пока нет</div>
        <p style={S.emptyText}>
          Записывайте сюда оценки за уроки, КТ, пробники, экзамены и олимпиады — с баллами так, как их считают: из максимума,
          первичными и вторичными, оценкой или процентом. Учитель может выложить результаты вам сам — они появятся здесь же с
          пометкой 🔒.
        </p>
        <div style={S.row}>
          <button type="button" onClick={() => onAdd()} style={S.primary}>
            + Результат
          </button>
          <button type="button" onClick={onCode} style={S.secondary}>
            Код ученика
          </button>
        </div>
      </section>
    );
  }

  const top = (
    <div style={S.top}>
      <div style={S.topText} data-results-summary>
        {overall.avg !== null ? (
          <>
            Средний балл <b style={{ color: "var(--ink)" }}>{f1(overall.avg)}</b> из 100 по {overall.rows.length}{" "}
            {word(overall.rows.length, "записи", "записям", "записям")}
          </>
        ) : (
          "Баллов пока нет"
        )}
        {" · "}
        {official} {word(official, "официальная", "официальных", "официальных")}, {visible.length - official} {word(visible.length - official, "своя", "своих", "своих")}
      </div>
      {!narrow && (
        <button type="button" onClick={onCode} style={S.secondary}>
          Код ученика
        </button>
      )}
      <button type="button" onClick={() => onAdd()} style={S.primary}>
        {narrow ? "+ Добавить" : "+ Результат"}
      </button>
    </div>
  );

  const toggle = (
    <div role="group" aria-label="Показывать" style={S.seg}>
      {[
        ["points", "Баллы"],
        ["grades", "Оценки"],
      ].map(([id, label]) => (
        <button key={id} type="button" aria-pressed={mode === id} onClick={() => setMode(id)} style={{ ...S.segBtn, ...(mode === id ? S.segOn : null) }}>
          {label}
        </button>
      ))}
    </div>
  );

  const page =
    view === "emptySubject" ? (
      <section className="ap-card" style={narrow ? S.phoneCard : S.page} data-subject-page={sel.name} data-subject-empty>
        <div style={S.pageHead}>
          <span style={{ ...S.dot, width: 12, height: 12, background: color(sel.name) }} />
          <h2 style={{ ...S.pageTitle, ...(narrow ? { fontSize: 22 } : null) }}>{sel.name}</h2>
        </div>
        <p style={S.muted}>По этому предмету результатов пока нет. Добавьте свой — или они появятся, когда учитель выложит отметки.</p>
        <button type="button" onClick={() => onAdd(sel.name)} style={{ ...S.primary, alignSelf: "flex-start" }}>
          + Результат по предмету
        </button>
      </section>
    ) : view === "olympiad" ? (
      <OlympiadPage r={current} color={color(current.subject)} onEdit={onEdit} onRemove={onRemove} onHide={onHide} hidden={hidden.has(current.id)} narrow={narrow} />
    ) : view === "olympiads" ? (
      <section className="ap-card" style={S.page}>
        <h2 style={S.pageTitle}>Олимпиады</h2>
        {olympiads.length === 0 ? (
          <p style={S.muted}>Олимпиад пока нет.</p>
        ) : (
          shownOlympiads.map((r) => <OlympiadNavItem key={r.id} r={r} color={color(r.subject)} onPick={() => setSel({ type: "olympiad", id: r.id })} />)
        )}
      </section>
    ) : (
      <SubjectPage
        title={view === "subject" ? current.name : "Все предметы"}
        color={view === "subject" ? color(current.name) : "var(--ink)"}
        list={pageList}
        mode={mode}
        toggle={toggle}
        kind={kind}
        setKind={setKind}
        withSubject={view !== "subject"}
        hidden={hidden}
        onEdit={onEdit}
        onRemove={onRemove}
        onHide={onHide}
        narrow={narrow}
        footer={
          hiddenCount > 0 && (
            <button type="button" onClick={() => setShowHidden(!showHidden)} style={S.link}>
              {showHidden ? "Не показывать скрытые" : "Показать скрытые · " + hiddenCount}
            </button>
          )
        }
      />
    );

  const pickFirst = () => {
    if (shownSubjects.length) setSel({ type: "subject", name: shownSubjects[0].name });
    else if (shownOlympiads.length) setSel({ type: "olympiad", id: shownOlympiads[0].id });
  };
  const search = (
    <div style={S.searchWrap}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" style={S.searchIcon}>
        <circle cx="11" cy="11" r="7" />
        <path d="M20 20l-3.5-3.5" />
      </svg>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") pickFirst();
          if (e.key === "Escape") setQuery("");
        }}
        placeholder="Найти предмет"
        aria-label="Найти предмет"
        style={S.search}
      />
    </div>
  );
  const nothing = q && !shownSubjects.length && !shownOlympiads.length ? <div style={{ ...S.muted, padding: "4px 12px" }} data-search-empty>Ничего не нашлось</div> : null;

  if (narrow) {
    return (
      <div style={S.wrap} className="ap-results-b" data-layout="phone">
        {top}
        {(subjects.length > 3 || q) && search}
        {nothing}
        <div style={S.chips} role="tablist" aria-label="Предметы">
          <Chip on={view === "all"} onClick={() => setSel({ type: "all" })} dot="var(--ink)" label="Все" />
          {shownSubjects.map((s) => (
            <Chip key={s.name} on={view === "subject" && current.name === s.name} onClick={() => setSel({ type: "subject", name: s.name })} dot={color(s.name)} label={s.name} />
          ))}
          {shownOlympiads.length > 0 && <Chip on={view === "olympiads" || view === "olympiad"} onClick={() => setSel({ type: "olympiads" })} dot="var(--red)" diamond label="Олимпиады" />}
        </div>
        {page}
      </div>
    );
  }

  return (
    <div style={S.wrap} className="ap-results-b" data-layout="desktop">
      {top}
      <div style={S.grid}>
        <nav aria-label="Предметы и олимпиады" className="ap-card" style={S.nav}>
          {search}
          <div style={S.navLabel}>Предметы</div>
          <NavSubject on={view === "all"} onClick={() => setSel({ type: "all" })} name="Все предметы" color="var(--ink)" stats={pageStats(visible, mode)} count={visible.length} mode={mode} />
          {nothing}
          {shownSubjects.map((s) => (
            <NavSubject key={s.name} on={view === "subject" && current.name === s.name} onClick={() => setSel({ type: "subject", name: s.name })} name={s.name} color={color(s.name)} stats={s.stats} count={s.list.length} mode={mode} />
          ))}
          {shownOlympiads.length > 0 && (
            <>
              <div style={{ ...S.navLabel, ...S.navLabelSep }}>Олимпиады</div>
              {shownOlympiads.map((r) => (
                <OlympiadNavItem key={r.id} r={r} color={color(r.subject)} on={view === "olympiad" && current.id === r.id} onPick={() => setSel({ type: "olympiad", id: r.id })} />
              ))}
            </>
          )}
        </nav>
        {page}
      </div>
    </div>
  );
}

function Chip({ on, onClick, dot, label, diamond }) {
  return (
    <button type="button" role="tab" aria-selected={on} onClick={onClick} style={{ ...S.chip, ...(on ? S.chipOn : null) }} data-chip={label}>
      <span style={{ ...S.dot, background: on ? "currentColor" : dot, ...(diamond ? S.diamond : null) }} />
      {label}
    </button>
  );
}

function NavSubject({ on, onClick, name, color, stats, count, mode }) {
  const pct = stats.avg === null ? 0 : mode === "grades" ? ((stats.avg - 2) / 3) * 100 : stats.avg;
  return (
    <button type="button" onClick={onClick} aria-current={on ? "true" : undefined} className="ap-rb-nav" style={{ ...S.navItem, ...(on ? S.navOn : null) }} data-nav-subject={name}>
      <span style={S.navRow}>
        <span style={{ ...S.dot, background: color }} />
        <span style={S.navName}>{name}</span>
        <span style={{ ...S.navValue, color: tint(stats.avg, mode) }} data-nav-avg={name}>
          {f1(stats.avg)}
        </span>
      </span>
      <span style={S.navBarRow}>
        <span style={S.navTrack}>
          <span style={{ ...S.navFill, width: Math.max(0, Math.min(100, pct)) + "%", background: color }} />
        </span>
        <span style={S.navCount}>{count}</span>
      </span>
    </button>
  );
}

function OlympiadNavItem({ r, color, on, onPick }) {
  const st = olympiadState(r);
  return (
    <button type="button" onClick={onPick} aria-current={on ? "true" : undefined} className="ap-rb-nav" style={{ ...S.navItem, ...S.navOlymp, ...(on ? S.navOn : null) }} data-nav-olympiad={r.title}>
      <span style={S.navRow}>
        <span style={{ ...S.dot, ...S.diamond, background: color }} />
        <span style={{ ...S.navName, fontSize: 14 }}>{r.title || "Олимпиада"}</span>
        <span style={{ ...S.badge, ...(st.badge.tone === "good" ? S.badgeGood : st.badge.tone === "bad" ? S.badgeBad : S.badgeWait) }} data-olympiad-badge>
          {st.badge.text}
        </span>
      </span>
      {st.line && <span style={S.navSub}>{st.line}</span>}
    </button>
  );
}

function SubjectPage({ title, color, list, mode, toggle, kind, setKind, withSubject, hidden, onEdit, onRemove, onHide, narrow, footer }) {
  const st = pageStats(list, mode);
  const grades = mode === "grades";
  const kindsHere = KINDS.filter((k) => list.some((r) => r.kind === k.id));
  const rows = list
    .filter((r) => kind === "all" || r.kind === kind)
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")) || String(b.id).localeCompare(String(a.id)));
  const valueText = (x) => (x ? (grades ? f1(x.v) : f1(x.v)) : "—");
  const whatWhen = (x) => (x ? [kindName(x.r.kind).toLowerCase(), dayMonFull(x.r.date)].filter(Boolean).join(", ") : "");
  const trend = st.trend !== null && Math.abs(st.trend) >= 0.05 ? (
    <b style={{ color: st.trend > 0 ? "var(--green, #2F6B4F)" : "var(--red)" }}>
      {" "}
      {st.trend > 0 ? "▲" : "▼"} {f1(Math.abs(st.trend))}
    </b>
  ) : null;

  const chart = <ScoreChart rows={st.rows} mode={mode} color={color === "var(--ink)" ? "var(--ink2)" : color} height={narrow ? 120 : 176} compact={narrow} />;
  const list_ = (
    <div style={S.records} data-records>
      {!narrow && (
        <div style={S.recordsHead}>
          <span style={S.recordsTitle}>Записи</span>
          {kindsHere.length > 1 && (
            <>
              <button type="button" aria-pressed={kind === "all"} onClick={() => setKind("all")} style={{ ...S.kindChip, ...(kind === "all" ? S.kindChipOn : null) }}>
                Все
              </button>
              {kindsHere.map((k) => (
                <button key={k.id} type="button" aria-pressed={kind === k.id} onClick={() => setKind(k.id)} style={{ ...S.kindChip, ...(kind === k.id ? S.kindChipOn : null) }}>
                  {k.name}
                </button>
              ))}
            </>
          )}
        </div>
      )}
      {rows.length === 0 ? (
        <p style={S.muted}>Записей этого вида нет.</p>
      ) : (
        rows.map((r) => <RecordRow key={r.id} r={r} mode={mode} withSubject={withSubject} hidden={hidden.has(r.id)} onEdit={onEdit} onRemove={onRemove} onHide={onHide} narrow={narrow} />)
      )}
      {footer}
    </div>
  );

  if (narrow) {
    return (
      <>
        <section className="ap-card" style={S.phoneCard} aria-label={title}>
          <div style={S.phoneHead}>
            <h2 style={{ ...S.pageTitle, fontSize: 22 }}>{title}</h2>
            <span style={{ ...S.phoneBig, color: tint(st.avg, mode) }} data-page-avg>
              {f1(st.avg)} <span style={S.phoneUnit}>{grades ? "из 5" : "из 100"}</span>
            </span>
          </div>
          <div style={S.phoneLine}>
            {list.length} {word(list.length, "запись", "записи", "записей")}
            {st.best ? " · лучший " + valueText(st.best) : ""}
            {st.last ? " · последний " + valueText(st.last) : ""}
            {trend}
            {!grades && st.avgGrade !== null ? " · средняя оценка " + f1(st.avgGrade) : ""}
            {grades && st.avgPoints !== null ? " · средний балл " + f1(st.avgPoints) : ""}
          </div>
          {st.rows.length > 1 && chart}
          {toggle}
        </section>
        <section className="ap-card" style={S.phoneCard}>
          {list_}
        </section>
      </>
    );
  }

  return (
    <section className="ap-card" style={S.page} aria-label={title} data-subject-page={title}>
      <div style={S.pageHead}>
        <span style={{ ...S.dot, width: 12, height: 12, background: color }} />
        <h2 style={S.pageTitle}>{title}</h2>
        {toggle}
      </div>
      <div style={S.tiles}>
        <Tile label={grades ? "Средняя оценка" : "Средний"} value={f1(st.avg)} color={tint(st.avg, mode)} sub={(grades ? "из 5 · " : "из 100 · ") + list.length + " " + word(list.length, "запись", "записи", "записей")} id="avg" />
        <Tile label={grades ? "Лучшая" : "Лучший"} value={valueText(st.best)} color={st.best ? tint(st.best.v, mode) : null} sub={whatWhen(st.best)} id="best" />
        <Tile
          label={grades ? "Последняя" : "Последний"}
          value={valueText(st.last)}
          color={st.last ? tint(st.last.v, mode) : null}
          sub={
            <>
              {st.last ? kindName(st.last.r.kind).toLowerCase() : ""}
              {trend}
            </>
          }
          id="last"
        />
        {grades ? (
          <Tile label="Средний балл" value={f1(st.avgPoints)} color={scoreColor(st.avgPoints)} sub="из 100" id="other" />
        ) : (
          <Tile label="Средняя оценка" value={f1(st.avgGrade)} color={scoreColor(percentOfGrade(st.avgGrade))} sub="из 5" id="other" />
        )}
      </div>
      {st.rows.length > 1 ? (
        <div>
          <div style={S.chartHead}>
            <span style={S.recordsTitle}>{grades ? "Как менялась оценка" : "Как менялся балл"}</span>
            <span style={S.legend}>● КТ · ▲ пробник · ■ урок · ◆ олимпиада · пунктир — {grades ? "оценка «4»" : "порог 70 (оценка «4»)"}</span>
          </div>
          {chart}
        </div>
      ) : null}
      {list_}
    </section>
  );
}

function Tile({ label, value, sub, id, color }) {
  return (
    <div style={S.tile} data-tile={id}>
      <div style={S.tileLabel}>{label}</div>
      <div style={{ ...S.tileValue, ...(color ? { color } : null) }}>{value}</div>
      <div style={S.tileSub}>{sub}</div>
    </div>
  );
}

function RecordRow({ r, mode, withSubject, hidden, onEdit, onRemove, onHide, narrow }) {
  const sc = scoreOf(r, mode);
  const mine = r.source === "self";
  const title = r.title || kindName(r.kind) + (r.subject ? " · " + r.subject : "");
  const items = mine
    ? [
        { label: "Изменить", onSelect: () => onEdit(r) },
        { label: "Удалить", danger: true, onSelect: () => onRemove(r) },
      ]
    : [{ label: hidden ? "Показать" : "Скрыть у себя", onSelect: () => onHide(r.id, !hidden) }];
  const menu = <MoreMenu label={"Действия: " + title} items={items} size={30} quiet />;
  const chip = <span style={{ ...S.kindTag, ...(KIND_TONE[r.kind] || KIND_TONE.other) }}>{kindName(r.kind)}</span>;
  if (narrow) {
    return (
      <div style={{ ...S.phoneRow, ...(hidden ? { opacity: 0.55 } : null) }} data-result={title} data-score={sc.big} data-official={mine ? undefined : "true"}>
        <div style={S.phoneRowMain}>
          <div style={S.phoneRowTop}>
            {chip}
            <span style={S.meta}>{dayMon(r.date)}</span>
            {!mine && <span title="Официальный: изменить нельзя">🔒</span>}
          </div>
          <div style={S.rowTitle}>{title}</div>
          {withSubject && r.subject && <div style={S.rowSub}>{r.subject}</div>}
        </div>
        <div style={S.rowScore}>
          <div style={{ ...S.scoreBig, color: scoreColor(sc.pct) }} data-score-color>{sc.big}</div>
          <div style={S.scoreSub}>{r.kind !== "olympiad" && mode !== "grades" && summarize(r).main.includes(" из ") && Number(r.max) !== 100 && r.scale === "points" ? summarize(r).main : sc.sub}</div>
        </div>
        {menu}
      </div>
    );
  }
  return (
    <div style={{ ...S.row5, ...(hidden ? { opacity: 0.55 } : null) }} data-result={title} data-score={sc.big} data-official={mine ? undefined : "true"}>
      <span style={S.rowDate}>{ddmm(r.date)}</span>
      <span style={{ justifySelf: "start" }}>{chip}</span>
      <span style={{ minWidth: 0 }}>
        <span style={S.rowTitle}>{title}</span>
        <span style={S.rowSub}>{detailOf(r, withSubject)}</span>
      </span>
      <span style={S.rowScore}>
        <span style={{ ...S.scoreBig, color: scoreColor(sc.pct) }} data-score-color>{sc.big}</span>
        <span style={S.scoreSub}>{sc.sub}</span>
      </span>
      {menu}
    </div>
  );
}

function OlympiadPage({ r, color, onEdit, onRemove, onHide, hidden, narrow }) {
  const mine = r.source === "self";
  const stages = olympiadStages(r);
  const items = mine
    ? [
        { label: "Изменить", onSelect: () => onEdit(r) },
        { label: "Удалить", danger: true, onSelect: () => onRemove(r) },
      ]
    : [{ label: hidden ? "Показать" : "Скрыть у себя", onSelect: () => onHide(r.id, !hidden) }];
  return (
    <section className="ap-card" style={narrow ? S.phoneCard : S.page} aria-label={r.title} data-olympiad-page={r.title}>
      <div style={S.pageHead}>
        <span style={{ ...S.dot, ...S.diamond, width: 11, height: 11, background: color }} />
        <h2 style={{ ...S.pageTitle, fontSize: narrow ? 22 : 28 }}>{r.title || "Олимпиада"}</h2>
        <MoreMenu label={"Действия: " + (r.title || "олимпиада")} items={items} size={34} quiet />
      </div>
      <div style={S.rowSub}>
        {[r.subject, mine ? "моя запись" : (r.author || "из обновления") + " · 🔒 официальный", "только в баллах: туры складываются, этапы — отдельно"].filter(Boolean).join(" · ")}
      </div>
      <div style={S.stages} data-olympiad-stages>
        {stages.map((st, i) => {
          const s = stageSummary(st);
          const hasThreshold = st.threshold !== undefined && st.threshold !== null && st.threshold !== "";
          const empty = s.main === "нет баллов";
          return (
            <div key={st.id || i} style={{ ...S.stage, ...(empty ? S.stageWait : null) }} data-stage={st.name || "Этап " + (i + 1)}>
              <div style={S.stageHead}>
                <span style={S.stageName}>{st.name || "Этап " + (i + 1)}</span>
                {st.date && <span style={S.meta}>{dayMonFull(st.date)}</span>}
                <span style={S.stageSum} data-stage-sum>
                  {empty ? "ждём" : s.main}
                </span>
              </div>
              {(st.tours || []).length > 0 && (
                <div style={S.tours}>
                  {st.tours.map((t, j) => (
                    <span key={j} style={S.tour}>
                      {t.name || "Тур " + (j + 1)} <b>{t.score ?? "—"}</b>
                      {t.max !== null && t.max !== undefined && t.max !== "" ? " из " + t.max : ""}
                    </span>
                  ))}
                  {st.tours.length > 1 && !empty && <span style={{ ...S.tour, fontWeight: 700 }}>сумма {s.main}</span>}
                </div>
              )}
              {s.percent !== null && (
                <div style={S.track} aria-hidden="true">
                  <span style={{ ...S.fill, width: s.percent + "%", background: color }} />
                </div>
              )}
              {(hasThreshold || st.status || st.place) && (
                <div style={S.tours}>
                  {hasThreshold && (
                    <span style={{ ...S.tour, ...(s.passedThreshold === true ? S.badgeGood : s.passedThreshold === false ? S.badgeBad : null) }}>
                      проходной {String(st.threshold).replace(".", ",")}
                      {s.passedThreshold === true ? " — прошёл дальше ✓" : s.passedThreshold === false ? " — не хватило " + f1(Number(st.threshold) - Number(String(s.main).split(" ")[0].replace(",", "."))) : ""}
                    </span>
                  )}
                  {st.status && <span style={{ ...S.tour, ...(st.status === "winner" || st.status === "prize" ? S.badgeGood : null) }}>{statusName(st.status)}</span>}
                  {st.place ? <span style={S.tour}>{st.place} место</span> : null}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {r.note && <p style={S.muted}>{r.note}</p>}
    </section>
  );
}

// График «как менялся балл»: точки по датам, форма — вид результата, пунктир —
// порог (70 баллов = оценка «4»; в оценках — сама «4»). Подписи у точек, при
// наведении — подсказка с названием. Ширина — по контейнеру.
const SHAPE = { kt: "circle", probe: "triangle", lesson: "square", olympiad: "diamond", exam: "circle", other: "circle" };

function ScoreChart({ rows, mode, color, height = 176, compact }) {
  const ref = useRef(null);
  const [width, setWidth] = useState(720);
  const [hover, setHover] = useState(null);
  useEffect(() => {
    if (!ref.current || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver((entries) => {
      const w = Math.round(entries[0].contentRect.width);
      if (w > 0) setWidth(w);
    });
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  const grades = mode === "grades";
  const lo = grades ? 2 : 0;
  const hi = grades ? 5 : 100;
  const threshold = grades ? 4 : 70;
  const left = compact ? 12 : 40;
  const right = compact ? 12 : 14;
  const topPad = 22;
  const bottom = 24;
  const plotH = height - topPad - bottom;
  const y = (v) => topPad + plotH - ((v - lo) / (hi - lo)) * plotH;
  const n = rows.length;
  const x = (i) => (n === 1 ? (left + width - right) / 2 : left + 28 + (i * (width - left - right - 56)) / (n - 1));
  const labelAll = n <= (compact ? 6 : 10);
  const vals = rows.map((r) => r.v);
  const maxV = Math.max(...vals);
  const minV = Math.min(...vals);
  const show = (i) => labelAll || i === n - 1 || vals[i] === maxV || vals[i] === minV;
  const ticks = grades ? [2, 3, 4, 5] : [0, 50, 100];
  const fmt = (v) => String(Math.round(v * 10) / 10).replace(".", ",");
  const marker = (shape, cx, cy) => {
    const r = 6;
    if (shape === "square") return <rect x={cx - r + 1} y={cy - r + 1} width={(r - 1) * 2} height={(r - 1) * 2} rx="2" />;
    if (shape === "triangle") return <path d={`M${cx} ${cy - r - 1} L${cx + r + 1} ${cy + r - 1} L${cx - r - 1} ${cy + r - 1} Z`} />;
    if (shape === "diamond") return <path d={`M${cx} ${cy - r - 1} L${cx + r + 1} ${cy} L${cx} ${cy + r + 1} L${cx - r - 1} ${cy} Z`} />;
    return <circle cx={cx} cy={cy} r={r} />;
  };
  return (
    <div ref={ref} style={{ position: "relative", width: 0, minWidth: "100%" }} data-score-chart>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={(grades ? "Оценки" : "Баллы") + " по датам"} style={{ display: "block", overflow: "visible" }}>
        {!compact &&
          ticks.map((t) => (
            <g key={t}>
              <line x1={left} y1={y(t)} x2={width - right} y2={y(t)} stroke="var(--line2, var(--line))" />
              <text x={left - 8} y={y(t) + 4} fill="var(--mute)" fontSize="11" textAnchor="end">
                {t}
              </text>
            </g>
          ))}
        {compact && <line x1={left} y1={y(lo)} x2={width - right} y2={y(lo)} stroke="var(--line2, var(--line))" />}
        <line x1={left} y1={y(threshold)} x2={width - right} y2={y(threshold)} stroke="var(--accent)" strokeDasharray="5 5" opacity=".6" />
        <polyline points={rows.map((r, i) => `${x(i)},${y(r.v)}`).join(" ")} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {rows.map((r, i) => (
          <g key={i} fill={scoreColor(grades ? percentOfGrade(r.v) : r.v)} stroke="var(--panel)" strokeWidth="2" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} style={{ cursor: "default" }}>
            <circle cx={x(i)} cy={y(r.v)} r="14" fill="transparent" stroke="none" />
            {marker(SHAPE[r.r.kind] || "circle", x(i), y(r.v))}
            {show(i) && (
              <text x={x(i)} y={y(r.v) - 12} fill="var(--ink)" stroke="none" fontSize="12.5" fontWeight="700" textAnchor="middle">
                {fmt(r.v)}
              </text>
            )}
            {(labelAll || i === 0 || i === n - 1) && (
              <text x={x(i)} y={height - 6} fill="var(--mute)" stroke="none" fontSize="11" textAnchor="middle">
                {ddmm(r.r.date)}
              </text>
            )}
          </g>
        ))}
      </svg>
      {hover !== null && rows[hover] && (
        <div style={{ ...S.tip, left: Math.min(Math.max(x(hover) - 90, 0), width - 180), top: Math.max(y(rows[hover].v) - 64, 0) }} role="status">
          <b>{fmt(rows[hover].v)}</b> {grades ? "— оценка" : "из 100"}
          <div>{rows[hover].r.title || kindName(rows[hover].r.kind)}</div>
          <div style={{ color: "var(--mute)" }}>
            {kindName(rows[hover].r.kind)}
            {rows[hover].r.stageName ? " · " + rows[hover].r.stageName : ""} · {ddmm(rows[hover].r.date)}
          </div>
        </div>
      )}
    </div>
  );
}

const S = {
  wrap: { display: "flex", flexDirection: "column", gap: 16, minWidth: 0 },
  top: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" },
  topText: { flex: "1 1 260px", fontSize: 14, color: "var(--ink3)" },
  row: { display: "flex", gap: 8, flexWrap: "wrap" },
  primary: { minHeight: 40, padding: "0 16px", borderRadius: 12, border: "none", background: "var(--btnBg)", color: "var(--btnInk)", font: "inherit", fontSize: 14, fontWeight: 600, cursor: "pointer" },
  secondary: { minHeight: 40, padding: "0 14px", borderRadius: 12, border: "1px solid var(--line)", background: "var(--panel)", color: "var(--ink)", font: "inherit", fontSize: 13.5, fontWeight: 600, cursor: "pointer" },
  link: { alignSelf: "flex-start", border: "none", background: "none", padding: "8px 0 0", color: "var(--accent)", font: "inherit", fontSize: 13, cursor: "pointer" },
  muted: { margin: 0, fontSize: 13.5, color: "var(--ink3)" },
  grid: { display: "grid", gridTemplateColumns: "300px minmax(0, 1fr)", gap: 20, alignItems: "start" },
  nav: { display: "flex", flexDirection: "column", gap: 2, padding: "10px 8px", borderRadius: 18, border: "1px solid var(--line)", background: "var(--panel)" },
  searchWrap: { position: "relative", display: "flex", alignItems: "center", margin: "0 4px 6px" },
  searchIcon: { position: "absolute", left: 11, color: "var(--mute)", pointerEvents: "none" },
  search: { width: "100%", boxSizing: "border-box", height: 36, padding: "0 10px 0 32px", borderRadius: 10, border: "1px solid var(--line)", background: "var(--panel2)", color: "var(--ink)", font: "inherit", fontSize: 14 },
  navLabel: { padding: "2px 12px 4px", fontSize: 11.5, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--mute)" },
  navLabelSep: { padding: "10px 12px 4px", marginTop: 4, borderTop: "1px solid var(--line2, var(--line))" },
  navItem: { display: "flex", flexDirection: "column", gap: 6, width: "100%", padding: "10px 12px", border: "none", borderRadius: 11, background: "transparent", color: "var(--ink)", font: "inherit", textAlign: "left", cursor: "pointer" },
  navOlymp: { gap: 3, padding: "9px 12px" },
  navOn: { background: "color-mix(in srgb, var(--ink) 9%, transparent)" },
  navRow: { display: "flex", alignItems: "center", gap: 9, width: "100%" },
  navName: { flex: 1, minWidth: 0, fontSize: 14.5, fontWeight: 600, overflowWrap: "anywhere" },
  navValue: { fontSize: 15, fontWeight: 700, fontVariantNumeric: "tabular-nums" },
  navBarRow: { display: "flex", alignItems: "center", gap: 8, width: "100%", paddingLeft: 18, boxSizing: "border-box" },
  navTrack: { flex: 1, height: 5, borderRadius: 3, background: "var(--line2, var(--line))", overflow: "hidden" },
  navFill: { display: "block", height: "100%", borderRadius: 3 },
  navCount: { fontSize: 12, color: "var(--mute)", fontVariantNumeric: "tabular-nums" },
  navSub: { paddingLeft: 18, fontSize: 12, color: "var(--mute)" },
  dot: { width: 9, height: 9, borderRadius: "50%", flexShrink: 0, display: "inline-block" },
  diamond: { borderRadius: 2, transform: "rotate(45deg)" },
  badge: { height: 22, padding: "0 8px", borderRadius: 11, fontSize: 11.5, fontWeight: 700, display: "inline-flex", alignItems: "center", whiteSpace: "nowrap" },
  badgeGood: { background: "var(--greenSoft)", color: "var(--green)" },
  badgeBad: { background: "var(--redBg)", color: "var(--red)" },
  badgeWait: { background: "var(--neutralBg)", color: "var(--ink3)" },
  page: { display: "flex", flexDirection: "column", gap: 14, minWidth: 0, padding: "20px 24px", borderRadius: 18, border: "1px solid var(--line)", background: "var(--panel)" },
  pageHead: { display: "flex", alignItems: "center", gap: 12 },
  pageTitle: { margin: 0, flex: 1, minWidth: 0, fontFamily: "var(--serif)", fontWeight: 400, fontSize: 28, lineHeight: 1.2 },
  seg: { display: "inline-flex", gap: 2, padding: 3, borderRadius: 10, background: "color-mix(in srgb, var(--ink) 8%, transparent)", alignSelf: "flex-start" },
  segBtn: { height: 30, padding: "0 10px", border: "none", borderRadius: 8, background: "transparent", color: "var(--ink2)", font: "inherit", fontSize: 13, cursor: "pointer" },
  segOn: { background: "var(--panel2)", color: "var(--ink)", fontWeight: 600, boxShadow: "0 1px 2px rgba(0,0,0,.08)" },
  tiles: { display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10 },
  tile: { padding: "10px 14px", borderRadius: 12, background: "color-mix(in srgb, var(--ink) 3%, var(--panel2))", border: "1px solid var(--line2, var(--line))", minWidth: 0 },
  tileLabel: { fontSize: 12, color: "var(--ink3)" },
  tileValue: { fontFamily: "var(--serif)", fontSize: 24, lineHeight: 1.25, fontVariantNumeric: "tabular-nums" },
  tileSub: { fontSize: 12, color: "var(--ink3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  chartHead: { display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: 6 },
  legend: { marginLeft: "auto", fontSize: 12, color: "var(--mute)" },
  records: { display: "flex", flexDirection: "column" },
  recordsHead: { display: "flex", alignItems: "center", gap: 8, paddingBottom: 6, flexWrap: "wrap" },
  recordsTitle: { flex: 1, fontSize: 14, fontWeight: 600 },
  kindChip: { height: 28, padding: "0 10px", borderRadius: 14, border: "1px solid var(--line)", background: "var(--panel)", color: "var(--ink)", font: "inherit", fontSize: 12.5, cursor: "pointer" },
  kindChipOn: { background: "var(--btnBg)", borderColor: "var(--btnBg)", color: "var(--btnInk)", fontWeight: 600 },
  row5: { display: "grid", gridTemplateColumns: "56px 96px minmax(0, 1fr) 110px 30px", gap: 12, alignItems: "center", padding: "11px 0", borderTop: "1px solid var(--line2, var(--line))" },
  rowDate: { fontSize: 13.5, color: "var(--ink2)", fontVariantNumeric: "tabular-nums" },
  kindTag: { height: 22, padding: "0 8px", borderRadius: 11, fontSize: 12, fontWeight: 700, display: "inline-flex", alignItems: "center", whiteSpace: "nowrap" },
  rowTitle: { display: "block", fontSize: 14.5, fontWeight: 600, overflowWrap: "anywhere" },
  rowSub: { display: "block", fontSize: 12.5, color: "var(--ink3)" },
  rowScore: { textAlign: "right", display: "flex", flexDirection: "column", alignItems: "flex-end" },
  scoreBig: { fontFamily: "var(--serif)", fontSize: 20, lineHeight: 1.15, fontVariantNumeric: "tabular-nums" },
  scoreSub: { fontSize: 12, color: "var(--ink3)" },
  meta: { fontSize: 12.5, color: "var(--ink3)" },
  chips: { display: "flex", gap: 8, width: 0, minWidth: "100%", boxSizing: "border-box", overflowX: "auto", paddingBottom: 2, scrollbarWidth: "none", margin: "0 -2px" },
  chip: { display: "inline-flex", alignItems: "center", gap: 7, flexShrink: 0, height: 36, padding: "0 14px", borderRadius: 999, border: "1px solid var(--line)", background: "var(--panel)", color: "var(--ink)", font: "inherit", fontSize: 14, whiteSpace: "nowrap", cursor: "pointer" },
  chipOn: { background: "var(--btnBg)", borderColor: "var(--btnBg)", color: "var(--btnInk)", fontWeight: 600 },
  phoneCard: { display: "flex", flexDirection: "column", gap: 10, padding: "14px 16px", borderRadius: 18, border: "1px solid var(--line)", background: "var(--panel)", minWidth: 0 },
  phoneHead: { display: "flex", alignItems: "baseline", gap: 10 },
  phoneBig: { fontFamily: "var(--serif)", fontSize: 24, whiteSpace: "nowrap" },
  phoneUnit: { fontFamily: "inherit", fontSize: 13, color: "var(--ink3)" },
  phoneLine: { fontSize: 13, color: "var(--ink3)", lineHeight: 1.45 },
  phoneRow: { display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderTop: "1px solid var(--line2, var(--line))" },
  phoneRowMain: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 },
  phoneRowTop: { display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" },
  stages: { display: "flex", flexDirection: "column", gap: 10 },
  stage: { display: "flex", flexDirection: "column", gap: 8, padding: "12px 14px", borderRadius: 12, border: "1px solid var(--line2, var(--line))", background: "color-mix(in srgb, var(--ink) 3%, var(--panel2))" },
  stageWait: { borderStyle: "dashed", background: "transparent" },
  stageHead: { display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" },
  stageName: { fontSize: 15, fontWeight: 600 },
  stageSum: { marginLeft: "auto", fontFamily: "var(--serif)", fontSize: 20, fontVariantNumeric: "tabular-nums" },
  tours: { display: "flex", flexWrap: "wrap", gap: 6 },
  tour: { height: 24, padding: "0 9px", borderRadius: 12, background: "var(--neutralBg)", fontSize: 12, display: "inline-flex", alignItems: "center" },
  track: { height: 6, borderRadius: 3, background: "var(--line2, var(--line))", overflow: "hidden" },
  fill: { display: "block", height: "100%", borderRadius: 3 },
  tip: {
    position: "absolute", width: 180, padding: "8px 10px", borderRadius: 10, background: "var(--menuBg, var(--panel))", border: "1px solid var(--line)",
    boxShadow: "0 8px 20px rgba(0,0,0,.18)", fontSize: 12.5, color: "var(--ink)", pointerEvents: "none", zIndex: 3,
  },
  empty: { padding: "22px 20px", borderRadius: 14, border: "1px solid var(--line)", background: "var(--panel)", display: "flex", flexDirection: "column", gap: 10 },
  emptyTitle: { fontFamily: "var(--serif)", fontSize: 20 },
  emptyText: { margin: 0, fontSize: 14, color: "var(--ink3)", lineHeight: 1.5 },
};
