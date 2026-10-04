import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { KINDS, SCALES, STAGES, STATUSES, blankResult, cleanResult, kindName, overallStats, statusName, subjectSummary, summarize } from "./results-model.js";
import { decryptFeed, recipientCode } from "./results-feed.js";
import { canPublish, fetchInbox, fetchPublished, inboxIsDemo, publish, unpublish } from "./results-inbox.js";
import FEED from "./results-feed.json";
import DEMO_FEED from "./results-demo-feed.json";

// Раздел «Результаты»: КТ, экзамены, олимпиады, пробники.
//
// Свои результаты ученик ведёт сам — добавляет, правит, удаляет. Рядом с ними
// видны выложенные ему: учителем (results-inbox.js) и обновлением приложения
// (results-feed.js). Их нельзя править — только скрыть у себя.
//
// В предпросмотре (sandbox) облака нет, поэтому есть переключатель «Ученик /
// Учитель»: учитель выкладывает результат на учебную почту, ученик (вы же)
// сразу его видит. Аккаунт там — учебный, его код открывает демо-ленту.

const DEMO_EMAIL = "student@demo";
const DEMO_ACCOUNT = "sandbox-demo";
const HIDDEN_KEY = "planner-results-hidden";

function readHidden() {
  try {
    return JSON.parse(localStorage.getItem(HIDDEN_KEY) || "[]");
  } catch (e) {
    return [];
  }
}

function newId() {
  return "res-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6);
}

const todayIso = () => {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
};

const fmtDate = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  return m ? `${m[3]}.${m[2]}.${m[1]}` : "";
};

// allowed — открыт ли раздел этому аккаунту: пока он в разработке, полностью
// его видит только владелец (и предпросмотр); остальным — заглушка.
export default function ResultsScreen({ results, setResults, subjects, accountId, accountEmail, sandbox, onUndo, allowed = true }) {
  const [role, setRole] = useState("student");
  const [kind, setKind] = useState("all");
  // Официальные (выложены учителем или обновлением, не правятся) и свои.
  const [origin, setOrigin] = useState("all");
  const [subject, setSubject] = useState("");
  const [editing, setEditing] = useState(null); // запись или null
  const [published, setPublished] = useState([]);
  const [hidden, setHidden] = useState(readHidden);
  const [showHidden, setShowHidden] = useState(false);
  const [code, setCode] = useState("");
  const [reload, setReload] = useState(0);
  const teacherAllowed = allowed && (sandbox || canPublish());

  // Код аккаунта и выложенное мне: из обновления и от учителя.
  useEffect(() => {
    let alive = true;
    const id = sandbox ? DEMO_ACCOUNT : accountId;
    (async () => {
      const c = id ? await recipientCode(id) : "";
      const fromFeed = c ? await decryptFeed(sandbox ? DEMO_FEED : FEED, c) : [];
      const fromTeacher = sandbox || accountEmail ? await fetchInbox(DEMO_EMAIL) : [];
      if (!alive) return;
      setCode(c);
      setPublished([...fromTeacher, ...fromFeed]);
    })();
    return () => {
      alive = false;
    };
  }, [accountId, accountEmail, sandbox, reload]);

  function hide(id, on) {
    setHidden((prev) => {
      const next = on ? Array.from(new Set([...prev, id])) : prev.filter((x) => x !== id);
      try {
        localStorage.setItem(HIDDEN_KEY, JSON.stringify(next));
      } catch (e) {
        /* приватное окно */
      }
      return next;
    });
  }

  const own = (results || []).map((r) => ({ ...r, source: "self" }));
  const all = useMemo(() => [...own, ...published], [results, published]); // eslint-disable-line react-hooks/exhaustive-deps
  const visible = all.filter((r) => r.source === "self" || showHidden || !hidden.includes(r.id));
  const hiddenCount = all.filter((r) => r.source !== "self" && hidden.includes(r.id)).length;
  const shown = visible
    .filter((r) => origin === "all" || (origin === "own" ? r.source === "self" : r.source !== "self"))
    .filter((r) => kind === "all" || r.kind === kind)
    .filter((r) => !subject || r.subject === subject)
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")) || String(b.id).localeCompare(String(a.id)));

  const subjectList = useMemo(() => {
    const names = new Set([...(subjects || []), ...all.map((r) => r.subject).filter(Boolean)]);
    return Array.from(names).sort((a, b) => a.localeCompare(b, "ru"));
  }, [subjects, all]);

  const bySubject = useMemo(() => {
    const map = new Map();
    visible.filter((r) => kind === "all" || r.kind === kind).forEach((r) => {
      const key = r.subject || "Без предмета";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(r);
    });
    return Array.from(map.entries())
      .map(([name, list]) => ({ name, ...subjectSummary(list) }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "ru"));
  }, [visible, kind]);

  function save(r) {
    const clean = cleanResult({ ...r, id: r.id || newId() });
    delete clean.source;
    setResults((prev) => {
      const list = prev || [];
      return list.some((x) => x.id === clean.id) ? list.map((x) => (x.id === clean.id ? clean : x)) : [...list, clean];
    });
    setEditing(null);
  }

  function remove(r) {
    const before = results || [];
    const index = before.findIndex((x) => x.id === r.id);
    setResults((prev) => (prev || []).filter((x) => x.id !== r.id));
    if (onUndo) {
      onUndo(`Вы удалили результат «${r.title || kindName(r.kind)}»`, () =>
        setResults((prev) => {
          const next = (prev || []).filter((x) => x.id !== r.id);
          next.splice(Math.min(index, next.length), 0, before[index]);
          return next;
        })
      );
    }
  }

  const counts = KINDS.reduce((m, k) => ({ ...m, [k.id]: visible.filter((r) => r.kind === k.id).length }), {});

  return (
    <div style={S.wrap} className="ap-results">
      {sandbox && (
        <div style={S.demoBar} role="group" aria-label="Роль в предпросмотре">
          <span style={S.demoLabel}>Предпросмотр — смотреть как:</span>
          {[
            ["student", "Ученик"],
            ["teacher", "Учитель"],
            ["outsider", "Другой пользователь"],
          ].map(([id, label]) => (
            <button key={id} type="button" aria-pressed={role === id} onClick={() => setRole(id)} style={{ ...S.seg, ...(role === id ? S.segOn : null) }}>
              {label}
            </button>
          ))}
          <span style={S.demoNote}>
            {role === "teacher"
              ? "Выложенное на почту " + DEMO_EMAIL + " увидит «ученик» — переключитесь обратно."
              : role === "outsider"
                ? "Так раздел выглядит у всех, кроме владельца, пока он в разработке."
                : "Учебный ученик — " + DEMO_EMAIL + ". Демо-результаты из обновления уже выложены ему."}
          </span>
        </div>
      )}
      {!sandbox && teacherAllowed && (
        <div style={S.demoBar} role="group" aria-label="Роль">
          {[
            ["student", "Мои результаты"],
            ["teacher", "Выложить ученикам"],
          ].map(([id, label]) => (
            <button key={id} type="button" aria-pressed={role === id} onClick={() => setRole(id)} style={{ ...S.seg, ...(role === id ? S.segOn : null) }}>
              {label}
            </button>
          ))}
        </div>
      )}

      {!allowed || (sandbox && role === "outsider") ? (
        <section className="ap-card" style={S.empty} data-results-wip>
          <div style={S.emptyTitle}>Раздел в разработке</div>
          <p style={S.emptyText}>
            Здесь будут результаты КТ, экзаменов, олимпиад и оценки за уроки — свои записи и выложенные учителем. Раздел ещё
            доделывается и скоро откроется.
          </p>
        </section>
      ) : role === "teacher" && teacherAllowed ? (
        <TeacherPanel subjects={subjectList} sandbox={sandbox} onPublished={() => setReload((n) => n + 1)} />
      ) : (
        <>
          <div style={S.originRow} role="group" aria-label="Чьи результаты">
            {[
              ["all", "Все", visible.length],
              ["official", "Официальные", visible.filter((r) => r.source !== "self").length],
              ["own", "Мои записи", visible.filter((r) => r.source === "self").length],
            ].map(([id, label, n]) => (
              <button key={id} type="button" aria-pressed={origin === id} onClick={() => setOrigin(id)} style={{ ...S.originBtn, ...(origin === id ? S.originOn : null) }}>
                {id === "official" ? "🔒 " : ""}
                {label} <span style={S.chipCount}>{n}</span>
              </button>
            ))}
          </div>
          {origin === "official" && (
            <p style={S.originNote}>Официальные результаты выкладывает учитель или приходят с обновлением приложения. Их нельзя изменить — только скрыть у себя.</p>
          )}
          <div style={S.toolbar}>
            <div style={S.chips} role="group" aria-label="Вид результата">
              <button type="button" aria-pressed={kind === "all"} onClick={() => setKind("all")} style={{ ...S.chip, ...(kind === "all" ? S.chipOn : null) }}>
                Все <span style={S.chipCount}>{visible.length}</span>
              </button>
              {KINDS.filter((k) => counts[k.id] || k.id !== "other").map((k) => (
                <button key={k.id} type="button" aria-pressed={kind === k.id} onClick={() => setKind(k.id)} style={{ ...S.chip, ...(kind === k.id ? S.chipOn : null) }}>
                  {k.name} <span style={S.chipCount}>{counts[k.id] || 0}</span>
                </button>
              ))}
            </div>
            <select value={subject} onChange={(e) => setSubject(e.target.value)} aria-label="Предмет" style={S.select}>
              <option value="">Все предметы</option>
              {subjectList.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <button type="button" onClick={() => setEditing({ ...blankResult(kind === "all" ? "lesson" : kind), subject, date: todayIso() })} style={S.primary}>
              + Результат
            </button>
          </div>

          {shown.length >= 2 && <StatsCard stats={overallStats(shown)} />}

          {bySubject.length > 0 && !subject && (
            <div style={S.summaryGrid}>
              {bySubject.slice(0, 8).map((s) => (
                <button key={s.name} type="button" onClick={() => setSubject(s.name === "Без предмета" ? "" : s.name)} className="ap-card" style={S.summary}>
                  <span style={S.summaryName}>{s.name}</span>
                  <span style={S.summaryBig}>{s.avg === null ? "—" : Math.round(s.avg) + " %"}</span>
                  <span style={S.summaryMeta}>
                    {s.count} {word(s.count, "результат", "результата", "результатов")}
                    {s.last !== null ? " · последний " + Math.round(s.last) + " %" : ""}
                    {s.trend !== null && Math.round(s.trend) !== 0 ? (
                      <b style={{ color: s.trend > 0 ? "var(--green, #3F8F6A)" : "var(--red)" }}> {s.trend > 0 ? "▲" : "▼"} {Math.abs(Math.round(s.trend))}</b>
                    ) : null}
                  </span>
                </button>
              ))}
            </div>
          )}

          <div style={S.list}>
            {shown.length === 0 ? (
              <div className="ap-card" style={S.empty}>
                <div style={S.emptyTitle}>{all.length ? "Здесь пока пусто" : "Результатов пока нет"}</div>
                <p style={S.emptyText}>
                  Записывайте сюда КТ, пробники, экзамены и олимпиады — с баллами так, как их считают: из максимума, первичными и
                  вторичными, оценкой или процентом. Учитель может выложить результаты вам сам — они появятся здесь же.
                </p>
              </div>
            ) : (
              shown.map((r) => (
                <ResultCard
                  key={r.id}
                  r={r}
                  hidden={hidden.includes(r.id)}
                  onEdit={() => setEditing(r)}
                  onRemove={() => remove(r)}
                  onHide={(on) => hide(r.id, on)}
                />
              ))
            )}
            {hiddenCount > 0 && (
              <button type="button" onClick={() => setShowHidden(!showHidden)} style={S.linkBtn}>
                {showHidden ? "Не показывать скрытые" : "Показать скрытые · " + hiddenCount}
              </button>
            )}
          </div>

          <CodePanel code={code} sandbox={sandbox} signedIn={!!accountId} />
        </>
      )}

      {editing && (
        <Modal title={editing.id ? "Изменить результат" : "Новый результат"} onClose={() => setEditing(null)}>
          <ResultForm initial={editing} subjects={subjectList} submitLabel="Сохранить" onSubmit={save} onCancel={() => setEditing(null)} />
        </Modal>
      )}
    </div>
  );
}

// Общая статистика по тому, что сейчас показано (с учётом фильтров).
const f1 = (n) => (n === null ? "—" : String(Math.round(n * 10) / 10).replace(".", ","));
function StatsCard({ stats }) {
  const kinds = KINDS.filter((k) => stats.byKind[k.id]);
  return (
    <section className="ap-card" style={S.stats} aria-label="Статистика" data-results-stats>
      <div style={S.statMain}>
        <span style={S.statLabel}>Средний балл</span>
        <span style={S.statBig} data-results-avg>{f1(stats.avg)}</span>
        <span style={S.statUnit}>из 100</span>
      </div>
      <div style={S.statGrid}>
        <Stat label="Записей" value={stats.count + (stats.scored < stats.count ? " (с баллами " + stats.scored + ")" : "")} />
        <Stat label="Лучший" value={f1(stats.best)} />
        <Stat label="Худший" value={f1(stats.worst)} />
        <Stat
          label="Последний"
          value={
            <>
              {f1(stats.last)}
              {stats.trend !== null && Math.round(stats.trend) !== 0 && (
                <b style={{ color: stats.trend > 0 ? "var(--green, #3F8F6A)" : "var(--red)", fontSize: 12.5 }}> {stats.trend > 0 ? "▲" : "▼"} {f1(Math.abs(stats.trend))}</b>
              )}
            </>
          }
        />
      </div>
      {kinds.length > 1 && (
        <div style={S.statKinds}>
          {kinds.map((k) => (
            <span key={k.id} style={S.statKind}>
              {k.name}: <b>{f1(stats.byKind[k.id].avg)}</b> <span style={{ color: "var(--mute)" }}>· {stats.byKind[k.id].count}</span>
            </span>
          ))}
        </div>
      )}
      <p style={S.statNote}>Всё в 100-балльной шкале: баллы — процентом от максимума, ЕГЭ — тестовым баллом, оценка 5 = 100, 4 ≈ 67, 3 ≈ 33. Средний — среднее арифметическое.</p>
    </section>
  );
}

function Stat({ label, value }) {
  return (
    <div style={S.stat}>
      <span style={S.statLabel}>{label}</span>
      <span style={S.statValue}>{value}</span>
    </div>
  );
}

function word(n, one, few, many) {
  const a = n % 10;
  const b = n % 100;
  if (b >= 11 && b <= 14) return many;
  if (a === 1) return one;
  if (a >= 2 && a <= 4) return few;
  return many;
}

function ResultCard({ r, hidden, onEdit, onRemove, onHide }) {
  const s = summarize(r);
  const mine = r.source === "self";
  const title = r.title || kindName(r.kind) + (r.subject ? " · " + r.subject : "");
  const threshold = r.threshold !== undefined && r.threshold !== null && r.threshold !== "";
  return (
    <article className="ap-card" style={{ ...S.card, ...(hidden ? { opacity: 0.55 } : null) }} data-result={title}>
      <div style={S.cardTop}>
        <span style={{ ...S.kind, ...(r.kind === "olympiad" ? S.kindOlymp : r.kind === "exam" ? S.kindExam : null) }}>{kindName(r.kind)}</span>
        {r.stage && <span style={S.meta}>{r.stage}</span>}
        {r.subject && <span style={S.meta}>{r.subject}</span>}
        {r.date && <span style={S.meta}>{fmtDate(r.date)}</span>}
        {mine ? (
          <span style={S.ownTag}>моя запись</span>
        ) : (
          <span style={S.source} title="Официальный результат: изменить нельзя, можно только скрыть у себя">
            🔒 {r.source === "teacher" ? "от учителя" + (r.author ? " · " + r.author : "") : "официальный · из обновления"}
          </span>
        )}
      </div>
      <div style={S.cardMain}>
        <div style={S.cardText}>
          <div style={S.title}>{title}</div>
          {r.status && <span style={{ ...S.status, ...(r.status === "winner" || r.status === "prize" ? S.statusWin : null) }}>{statusName(r.status)}</span>}
          {r.place ? <span style={S.meta}> · {r.place} место</span> : null}
        </div>
        <div style={S.score}>
          <div style={S.scoreMain}>{s.main}</div>
          {s.sub && <div style={S.scoreSub}>{s.sub}</div>}
        </div>
      </div>
      {s.percent !== null && (
        <div style={S.track} aria-hidden="true">
          <span style={{ ...S.fill, width: s.percent + "%", background: s.percent >= 80 ? "var(--green, #3F8F6A)" : s.percent >= 50 ? "var(--accent)" : "var(--red)" }} />
        </div>
      )}
      {threshold && (
        <div style={S.threshold}>
          Проходной — {String(r.threshold).replace(".", ",")}
          {s.passedThreshold === true && <b style={{ color: "var(--green, #3F8F6A)" }}> · набран ✓</b>}
          {s.passedThreshold === false && <b style={{ color: "var(--red)" }}> · не набран</b>}
        </div>
      )}
      {(r.parts || []).length > 0 && (
        <div style={S.parts}>
          {r.parts.map((p, i) => (
            <span key={i} style={S.part}>
              {p.name || "Часть " + (i + 1)}: <b>{p.score ?? "—"}</b>
              {p.max !== null && p.max !== undefined ? " из " + p.max : ""}
            </span>
          ))}
        </div>
      )}
      {r.note && <p style={S.note}>{r.note}</p>}
      <div style={S.actions}>
        {mine ? (
          <>
            <button type="button" onClick={onEdit} style={S.linkBtn}>
              Изменить
            </button>
            <button type="button" onClick={onRemove} style={{ ...S.linkBtn, color: "var(--red)" }}>
              Удалить
            </button>
          </>
        ) : (
          <button type="button" onClick={() => onHide(!hidden)} style={S.linkBtn}>
            {hidden ? "Показать" : "Скрыть у себя"}
          </button>
        )}
      </div>
    </article>
  );
}

// Поля результата — и в окне ученика, и в форме учителя.
export function ResultForm({ initial, subjects, submitLabel, onSubmit, onCancel, extra }) {
  const [r, setR] = useState(() => ({ ...blankResult(initial && initial.kind), ...initial, parts: (initial && initial.parts) || [] }));
  const [withParts, setWithParts] = useState(() => !!(initial && initial.parts && initial.parts.length));
  const set = (patch) => setR((prev) => ({ ...prev, ...patch }));
  const s = summarize({ ...r, parts: withParts ? r.parts : [] });
  const partsAllowed = r.scale === "points" || r.scale === "grade" || r.scale === "primsec";

  function field(label, key, props = {}) {
    return (
      <label style={S.field}>
        <span style={S.label}>{label}</span>
        <input value={r[key] ?? ""} onChange={(e) => set({ [key]: e.target.value })} style={S.input} {...props} />
      </label>
    );
  }
  const numField = (label, key, props = {}) => field(label, key, { inputMode: "decimal", ...props });

  function submit(e) {
    e.preventDefault();
    onSubmit({ ...r, parts: withParts ? r.parts : [] });
  }

  return (
    <form onSubmit={submit} style={S.form}>
      {extra}
      <div role="group" aria-label="Что это" style={S.segRow}>
        {KINDS.map((k) => (
          <button key={k.id} type="button" aria-pressed={r.kind === k.id} onClick={() => set({ kind: k.id })} style={{ ...S.seg, ...(r.kind === k.id ? S.segOn : null) }}>
            {k.name}
          </button>
        ))}
      </div>
      <div style={S.grid2}>
        <label style={S.field}>
          <span style={S.label}>Предмет</span>
          <input list="results-subjects" value={r.subject || ""} onChange={(e) => set({ subject: e.target.value })} style={S.input} />
          <datalist id="results-subjects">
            {(subjects || []).map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        </label>
        {field("Название", "title", {
          placeholder:
            r.kind === "olympiad" ? "Например: Высшая проба" : r.kind === "lesson" ? "Например: тема урока" : r.kind === "exam" ? "Например: ЕГЭ по обществознанию" : r.kind === "probe" ? "Например: пробник ЕГЭ, октябрь" : "Например: КТ №2 по ТГП",
        })}
        {field("Дата", "date", { type: "date" })}
        {(r.kind === "olympiad" || r.stage) && (
          <label style={S.field}>
            <span style={S.label}>Этап</span>
            <input list="results-stages" value={r.stage || ""} onChange={(e) => set({ stage: e.target.value })} style={S.input} />
            <datalist id="results-stages">
              {STAGES.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </label>
        )}
      </div>

      <label style={S.field}>
        <span style={S.label}>Как считается</span>
        <select value={r.scale} onChange={(e) => set({ scale: e.target.value })} style={S.input} aria-label="Как считается">
          {SCALES.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
      </label>

      <div style={S.grid2}>
        {r.scale === "points" && !withParts && (
          <>
            {numField("Баллы", "score")}
            {numField("Из скольких (максимум)", "max")}
          </>
        )}
        {r.scale === "primsec" && (
          <>
            {!withParts && numField("Первичные баллы", "primary")}
            {!withParts && numField("Максимум первичных", "primaryMax")}
            {numField("Вторичные (тестовые)", "secondary")}
            {numField("Максимум вторичных", "secondaryMax")}
          </>
        )}
        {r.scale === "grade" && (
          <>
            <label style={S.field}>
              <span style={S.label}>Оценка</span>
              <div role="group" aria-label="Оценка" style={S.segRow}>
                {[2, 3, 4, 5].map((g) => (
                  <button key={g} type="button" aria-pressed={Number(r.grade) === g} onClick={() => set({ grade: g })} style={{ ...S.seg, ...(Number(r.grade) === g ? S.segOn : null), minWidth: 40 }}>
                    {g}
                  </button>
                ))}
              </div>
            </label>
            {!withParts && numField("Баллы (если есть)", "score")}
            {!withParts && numField("Из скольких", "max")}
          </>
        )}
        {r.scale === "percent" && numField("Процент", "percent")}
        {r.scale === "pass" && (
          <div role="group" aria-label="Зачёт" style={S.segRow}>
            <button type="button" aria-pressed={r.passed === true} onClick={() => set({ passed: true })} style={{ ...S.seg, ...(r.passed === true ? S.segOn : null) }}>
              Зачёт
            </button>
            <button type="button" aria-pressed={r.passed === false} onClick={() => set({ passed: false })} style={{ ...S.seg, ...(r.passed === false ? S.segOn : null) }}>
              Незачёт
            </button>
          </div>
        )}
      </div>

      {partsAllowed && (
        <div style={S.partsBox}>
          <label style={S.checkRow}>
            <input type="checkbox" checked={withParts} onChange={(e) => setWithParts(e.target.checked)} />
            По частям или турам — сумма посчитается сама
          </label>
          {withParts && (
            <>
              {r.parts.map((p, i) => (
                <div key={i} style={S.partRow}>
                  <input
                    value={p.name || ""}
                    placeholder={"Часть " + (i + 1)}
                    aria-label={"Название части " + (i + 1)}
                    onChange={(e) => set({ parts: r.parts.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })}
                    style={{ ...S.input, flex: 2 }}
                  />
                  <input
                    value={p.score ?? ""}
                    placeholder="баллы"
                    inputMode="decimal"
                    aria-label={"Баллы части " + (i + 1)}
                    onChange={(e) => set({ parts: r.parts.map((x, j) => (j === i ? { ...x, score: e.target.value } : x)) })}
                    style={{ ...S.input, flex: 1 }}
                  />
                  <input
                    value={p.max ?? ""}
                    placeholder="из"
                    inputMode="decimal"
                    aria-label={"Максимум части " + (i + 1)}
                    onChange={(e) => set({ parts: r.parts.map((x, j) => (j === i ? { ...x, max: e.target.value } : x)) })}
                    style={{ ...S.input, flex: 1 }}
                  />
                  <button type="button" aria-label={"Убрать часть " + (i + 1)} onClick={() => set({ parts: r.parts.filter((_, j) => j !== i) })} style={S.iconBtn}>
                    ×
                  </button>
                </div>
              ))}
              <button type="button" onClick={() => set({ parts: [...r.parts, { name: "", score: "", max: "" }] })} style={S.linkBtn}>
                + Часть
              </button>
            </>
          )}
        </div>
      )}

      {r.kind === "olympiad" && (
        <div style={S.grid2}>
          <label style={S.field}>
            <span style={S.label}>Статус</span>
            <select value={r.status || ""} onChange={(e) => set({ status: e.target.value })} style={S.input} aria-label="Статус">
              {STATUSES.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </label>
          {numField("Проходной балл", "threshold")}
          {numField("Место", "place")}
        </div>
      )}
      {r.kind !== "olympiad" && numField("Проходной или порог (если есть)", "threshold")}

      <label style={S.field}>
        <span style={S.label}>Заметка</span>
        <textarea value={r.note || ""} onChange={(e) => set({ note: e.target.value })} rows={2} style={{ ...S.input, resize: "vertical" }} />
      </label>

      <div style={S.preview} aria-live="polite">
        Итог: <b>{s.main}</b>
        {s.sub ? " · " + s.sub : ""}
        {s.passedThreshold === true ? " · проходной набран" : s.passedThreshold === false ? " · проходной не набран" : ""}
      </div>

      <div style={S.formFoot}>
        {onCancel && (
          <button type="button" onClick={onCancel} style={S.secondary}>
            Отмена
          </button>
        )}
        <button type="submit" style={S.primary}>
          {submitLabel}
        </button>
      </div>
    </form>
  );
}

function Modal({ title, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  const host = (typeof document !== "undefined" && (document.querySelector(".ap-shell") || document.body)) || null;
  const view = (
    <div style={S.overlay} onClick={onClose}>
      <div role="dialog" aria-label={title} style={S.dialog} onClick={(e) => e.stopPropagation()}>
        <div style={S.dialogHead}>
          <div style={S.dialogTitle}>{title}</div>
          <button type="button" onClick={onClose} aria-label="Закрыть" style={S.iconBtn}>
            ✕
          </button>
        </div>
        <div style={S.dialogBody}>{children}</div>
      </div>
    </div>
  );
  return host ? createPortal(view, host) : view;
}

// Код для результатов «через обновление».
function CodePanel({ code, sandbox, signedIn }) {
  const [copied, setCopied] = useState(false);
  return (
    <section className="ap-card" style={S.codeCard}>
      <div style={S.codeTitle}>Код для результатов</div>
      {code ? (
        <>
          <div style={S.codeRow}>
            <code style={S.code} data-results-code>
              {code}
            </code>
            <button
              type="button"
              onClick={() => {
                try {
                  navigator.clipboard.writeText(code);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                } catch (e) {
                  /* нет доступа к буферу */
                }
              }}
              style={S.secondary}
            >
              {copied ? "Скопировано" : "Скопировать"}
            </button>
          </div>
          <p style={S.codeText}>
            {sandbox
              ? "В предпросмотре это код учебного аккаунта — по нему уже выложены демо-результаты (с пометкой «из обновления»)."
              : "Этот код знает только ваш аккаунт. Результаты, выложенные с обновлением приложения, шифруются им — открыть их можете только вы. Код можно передать тому, кто выкладывает; в само приложение он не попадает."}
          </p>
        </>
      ) : (
        <p style={S.codeText}>{signedIn ? "Считаю код…" : "Код появится, когда вы войдёте в аккаунт («Синхронизация»): он привязан к аккаунту, а не к устройству."}</p>
      )}
    </section>
  );
}

// Учитель: выложить результат нескольким ученикам по почте и убрать выложенное.
function TeacherPanel({ subjects, sandbox, onPublished }) {
  const [recipients, setRecipients] = useState(sandbox ? DEMO_EMAIL : "");
  const [author, setAuthor] = useState("");
  const [msg, setMsg] = useState("");
  const [mine, setMine] = useState([]);
  const [formKey, setFormKey] = useState(0);

  const load = () => fetchPublished().then(setMine);
  useEffect(() => {
    load();
  }, []);

  async function send(r) {
    const list = recipients.split(/[\s,;]+/).filter(Boolean);
    const res = await publish(list, cleanResult(r), author.trim());
    setMsg(res.ok ? `Выложено: ${res.count} ${word(res.count, "ученику", "ученикам", "ученикам")}` : res.error);
    if (res.ok) {
      setFormKey((k) => k + 1);
      load();
      onPublished();
    }
  }

  return (
    <div style={S.teacher}>
      <section className="ap-card" style={S.teacherCard}>
        <div style={S.codeTitle}>Выложить результат</div>
        <p style={S.codeText}>
          Ученик увидит результат в своём разделе «Результаты» — только тот, чья почта указана.
          {inboxIsDemo ? " В предпросмотре облака нет: выложенное хранится на этом устройстве, а «ученик» — " + DEMO_EMAIL + "." : ""}
        </p>
        <div style={S.grid2}>
          <label style={S.field}>
            <span style={S.label}>Почты учеников (через запятую или с новой строки)</span>
            <textarea value={recipients} onChange={(e) => setRecipients(e.target.value)} rows={2} style={{ ...S.input, resize: "vertical" }} aria-label="Почты учеников" />
          </label>
          <label style={S.field}>
            <span style={S.label}>Подпись (как вас показать)</span>
            <input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Например: Иванова А. Б." style={S.input} />
          </label>
        </div>
        <ResultForm key={formKey} initial={{ ...blankResult("kt"), date: todayIso() }} subjects={subjects} submitLabel="Выложить" onSubmit={send} />
        {msg && (
          <div style={S.preview} role="status">
            {msg}
          </div>
        )}
      </section>
      <section className="ap-card" style={S.teacherCard}>
        <div style={S.codeTitle}>Уже выложено</div>
        {mine.length === 0 ? (
          <p style={S.codeText}>Пока ничего.</p>
        ) : (
          mine.map((row) => {
            const s = summarize(row.payload);
            return (
              <div key={row.id} style={S.pubRow}>
                <span style={S.pubText}>
                  <b>{row.payload.title || kindName(row.payload.kind)}</b> · {row.recipient} · {s.main}
                </span>
                <button
                  type="button"
                  onClick={async () => {
                    await unpublish(row.id);
                    load();
                    onPublished();
                  }}
                  style={{ ...S.linkBtn, color: "var(--red)" }}
                >
                  Убрать
                </button>
              </div>
            );
          })
        )}
      </section>
    </div>
  );
}

const S = {
  wrap: { display: "flex", flexDirection: "column", gap: 16 },
  demoBar: {
    display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, padding: "10px 12px", borderRadius: 12,
    border: "1px dashed var(--warmLine, var(--line))", background: "var(--warmBg, var(--panel2))",
  },
  demoLabel: { fontSize: 13, fontWeight: 600, color: "var(--ink2)" },
  demoNote: { fontSize: 12.5, color: "var(--ink3)", flexBasis: "100%" },
  toolbar: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" },
  chips: { display: "flex", gap: 6, flexWrap: "wrap", flex: "1 1 320px" },
  chip: {
    display: "inline-flex", alignItems: "center", gap: 6, minHeight: 34, padding: "0 12px", borderRadius: 999,
    border: "1px solid var(--line)", background: "var(--panel)", color: "var(--ink)", font: "inherit", fontSize: 13.5, cursor: "pointer",
  },
  chipOn: { background: "var(--btnBg)", borderColor: "var(--btnBg)", color: "var(--btnInk)" },
  chipCount: { fontSize: 12, opacity: 0.7, fontVariantNumeric: "tabular-nums" },
  select: { minHeight: 36, borderRadius: 10, border: "1px solid var(--line)", background: "var(--panel)", color: "var(--ink)", font: "inherit", fontSize: 13.5, padding: "0 10px", maxWidth: "100%" },
  primary: {
    minHeight: 36, padding: "0 16px", borderRadius: 10, border: "1px solid var(--btnBg)", background: "var(--btnBg)", color: "var(--btnInk)",
    font: "inherit", fontSize: 14, fontWeight: 600, cursor: "pointer",
  },
  secondary: {
    minHeight: 36, padding: "0 14px", borderRadius: 10, border: "1px solid var(--line)", background: "transparent", color: "var(--ink2)",
    font: "inherit", fontSize: 13.5, cursor: "pointer",
  },
  stats: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px 24px", padding: "14px 18px", borderRadius: 14, border: "1px solid var(--line)", background: "var(--panel)" },
  statMain: { display: "flex", alignItems: "baseline", gap: 8 },
  statBig: { fontFamily: "var(--serif)", fontSize: 38, lineHeight: 1 },
  statUnit: { fontSize: 13, color: "var(--mute)" },
  statGrid: { display: "flex", flexWrap: "wrap", gap: "8px 22px", flex: "1 1 260px" },
  stat: { display: "flex", flexDirection: "column", gap: 1 },
  statLabel: { fontSize: 12, color: "var(--mute)" },
  statValue: { fontSize: 16, fontWeight: 600, fontVariantNumeric: "tabular-nums" },
  statKinds: { display: "flex", flexWrap: "wrap", gap: 8, flexBasis: "100%" },
  statKind: { fontSize: 12.5, padding: "3px 9px", borderRadius: 999, background: "var(--panel2)", border: "1px solid var(--line2, var(--line))" },
  statNote: { margin: 0, flexBasis: "100%", fontSize: 12, color: "var(--mute)" },
  summaryGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 180px), 1fr))", gap: 10 },
  summary: {
    display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2, padding: "12px 14px", borderRadius: 14,
    border: "1px solid var(--line)", background: "var(--panel)", color: "var(--ink)", textAlign: "left", font: "inherit", cursor: "pointer",
  },
  summaryName: { fontSize: 13, color: "var(--ink3)", fontWeight: 600 },
  summaryBig: { fontFamily: "var(--serif)", fontSize: 26, lineHeight: 1.15 },
  summaryMeta: { fontSize: 12, color: "var(--mute)" },
  list: { display: "flex", flexDirection: "column", gap: 10 },
  originRow: { display: "inline-flex", alignSelf: "flex-start", flexWrap: "wrap", gap: 4, padding: 4, borderRadius: 12, background: "var(--panel2)", border: "1px solid var(--line)" },
  originBtn: { minHeight: 34, padding: "0 14px", borderRadius: 9, border: "none", background: "transparent", color: "var(--ink2)", font: "inherit", fontSize: 14, cursor: "pointer" },
  originOn: { background: "var(--panel)", color: "var(--ink)", fontWeight: 600, boxShadow: "0 1px 3px rgba(0,0,0,.12)" },
  originNote: { margin: "-6px 0 0", fontSize: 13, color: "var(--ink3)" },
  ownTag: { marginLeft: "auto", fontSize: 11.5, color: "var(--mute)" },
  card: { display: "flex", flexDirection: "column", gap: 8, padding: "14px 16px", borderRadius: 14, border: "1px solid var(--line)", background: "var(--panel)" },
  cardTop: { display: "flex", alignItems: "center", flexWrap: "wrap", gap: "4px 10px" },
  kind: { fontSize: 11.5, fontWeight: 700, letterSpacing: "0.03em", padding: "2px 8px", borderRadius: 999, background: "var(--neutralBg)", color: "var(--ink2)" },
  kindOlymp: { background: "var(--warmBg, var(--neutralBg))", color: "var(--warmInk, var(--ink2))" },
  kindExam: { background: "var(--redBg)", color: "var(--red)" },
  meta: { fontSize: 12.5, color: "var(--ink3)" },
  source: { marginLeft: "auto", fontSize: 11.5, fontWeight: 600, padding: "2px 8px", borderRadius: 999, border: "1px solid var(--accent)", color: "var(--accent)" },
  cardMain: { display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" },
  cardText: { flex: "1 1 200px", minWidth: 0 },
  title: { fontSize: 16, fontWeight: 600, lineHeight: 1.3, overflowWrap: "anywhere" },
  status: { display: "inline-block", marginTop: 4, fontSize: 12, fontWeight: 600, padding: "2px 8px", borderRadius: 999, background: "var(--neutralBg)", color: "var(--ink2)" },
  statusWin: { background: "var(--accent)", color: "var(--btnInk)" },
  score: { textAlign: "right", flexShrink: 0 },
  scoreMain: { fontFamily: "var(--serif)", fontSize: 22, lineHeight: 1.15, fontVariantNumeric: "tabular-nums" },
  scoreSub: { fontSize: 12.5, color: "var(--ink3)" },
  track: { height: 6, borderRadius: 3, background: "var(--line2, var(--line))", overflow: "hidden" },
  fill: { display: "block", height: "100%", borderRadius: 3 },
  threshold: { fontSize: 12.5, color: "var(--ink3)" },
  parts: { display: "flex", flexWrap: "wrap", gap: 6 },
  part: { fontSize: 12.5, padding: "3px 8px", borderRadius: 8, background: "var(--panel2)", border: "1px solid var(--line2, var(--line))" },
  note: { margin: 0, fontSize: 13.5, color: "var(--ink2)", lineHeight: 1.45, whiteSpace: "pre-wrap" },
  actions: { display: "flex", gap: 14 },
  linkBtn: { alignSelf: "flex-start", border: "none", background: "none", padding: 0, color: "var(--accent)", font: "inherit", fontSize: 13, cursor: "pointer" },
  empty: { padding: "22px 20px", borderRadius: 14, border: "1px solid var(--line)", background: "var(--panel)" },
  emptyTitle: { fontFamily: "var(--serif)", fontSize: 20, marginBottom: 6 },
  emptyText: { margin: 0, fontSize: 14, color: "var(--ink3)", lineHeight: 1.5 },
  codeCard: { padding: "14px 16px", borderRadius: 14, border: "1px solid var(--line)", background: "var(--panel)", display: "flex", flexDirection: "column", gap: 8 },
  codeTitle: { fontSize: 12, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--mute)" },
  codeRow: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" },
  code: { fontSize: 17, letterSpacing: "0.08em", padding: "6px 10px", borderRadius: 8, background: "var(--panel2)", border: "1px solid var(--line)", color: "var(--ink)" },
  codeText: { margin: 0, fontSize: 13, color: "var(--ink3)", lineHeight: 1.5 },
  form: { display: "flex", flexDirection: "column", gap: 12 },
  segRow: { display: "flex", gap: 6, flexWrap: "wrap" },
  seg: {
    minHeight: 34, padding: "0 12px", borderRadius: 9, border: "1px solid var(--line)", background: "var(--panel)", color: "var(--ink)",
    font: "inherit", fontSize: 13.5, cursor: "pointer",
  },
  segOn: { background: "var(--btnBg)", borderColor: "var(--btnBg)", color: "var(--btnInk)", fontWeight: 600 },
  grid2: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 200px), 1fr))", gap: 10 },
  field: { display: "flex", flexDirection: "column", gap: 4, minWidth: 0 },
  label: { fontSize: 12.5, color: "var(--ink3)" },
  input: {
    minHeight: 38, boxSizing: "border-box", width: "100%", padding: "7px 10px", borderRadius: 9, border: "1px solid var(--line)",
    background: "var(--panel2)", color: "var(--ink)", font: "inherit", fontSize: 14,
  },
  partsBox: { display: "flex", flexDirection: "column", gap: 8, padding: "10px 12px", borderRadius: 10, border: "1px solid var(--line2, var(--line))" },
  checkRow: { display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, color: "var(--ink2)" },
  partRow: { display: "flex", gap: 6, alignItems: "center" },
  iconBtn: {
    width: 34, height: 34, flexShrink: 0, border: "1px solid var(--line)", borderRadius: 9, background: "transparent", color: "var(--ink2)",
    font: "inherit", fontSize: 14, cursor: "pointer",
  },
  preview: { fontSize: 13.5, color: "var(--ink2)", padding: "8px 10px", borderRadius: 9, background: "var(--panel2)" },
  formFoot: { display: "flex", justifyContent: "flex-end", gap: 8 },
  overlay: {
    position: "fixed", inset: 0, zIndex: 140, display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
    background: "rgba(24, 22, 18, 0.45)", backdropFilter: "blur(5px)", WebkitBackdropFilter: "blur(5px)",
  },
  dialog: {
    width: "100%", maxWidth: 620, maxHeight: "90vh", display: "flex", flexDirection: "column", background: "var(--menuBg, var(--panel))",
    border: "1px solid var(--line)", borderRadius: 16, boxShadow: "0 18px 50px rgba(0,0,0,0.3)", color: "var(--ink)", overflow: "hidden",
  },
  dialogHead: { display: "flex", alignItems: "center", gap: 10, padding: "14px 18px 8px" },
  dialogTitle: { flex: 1, fontFamily: "var(--serif)", fontSize: 21 },
  dialogBody: { padding: "4px 18px 18px", overflowY: "auto" },
  teacher: { display: "flex", flexDirection: "column", gap: 16 },
  teacherCard: { padding: "16px 18px", borderRadius: 14, border: "1px solid var(--line)", background: "var(--panel)", display: "flex", flexDirection: "column", gap: 12 },
  pubRow: { display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: "1px solid var(--line2, var(--line))" },
  pubText: { flex: 1, minWidth: 0, fontSize: 13.5, overflowWrap: "anywhere" },
};
