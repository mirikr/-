import React, { useMemo, useState } from "react";
import { OLYMPIADS } from "./vosh/vosh-society.js";
import { KIND_NAMES, scoreTask, hasResponse, responseText, keyText, lastAttempts } from "./vosh-check.js";
import { timeWord } from "./bank-answer.js";
import { useStopwatch } from "./stopwatch.js";

// Тесты ВсОШ по обществознанию — отдельный раздел тренажёра.
//
// У олимпиады другой вид заданий, чем у банка ФИПИ: не одна строка ответа, а
// «да/нет» по пунктам, выбор нескольких, соответствия, раскладка картинок по
// группам, пропуски в тексте с выпадающими вариантами. Поэтому и ввод здесь у
// каждого вида свой, а баллы считаются по критериям олимпиады — частично: за
// каждый верный пункт, со штрафом за лишний выбор.
//
// Олимпиаду можно пройти целиком по порядку — тогда в конце виден итог в
// баллах, как на настоящем туре, — или решать вперемешку задания нескольких
// олимпиад сразу. Ответы идут в общий журнал тренажёра: время и решённые
// задания засчитываются в часы и серию по обществознанию.

const BASE = (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.BASE_URL) || "/";
const url = (src) => BASE + src;

const ALL = OLYMPIADS.flatMap((o) => o.tasks.map((t) => ({ ...t, olymp: o })));
const BY_ID = new Map(ALL.map((t) => [t.id, t]));
const OLYMP = new Map(OLYMPIADS.map((o) => [o.id, o]));
const IDS = new Set(ALL.map((t) => t.id));
const MIX = "mix";
const DONE = "done";

const STAGES = [
  { id: "", name: "Все этапы" },
  { id: "school", name: "Школьный" },
  { id: "municipal", name: "Муниципальный" },
];
const GRADES = [0, 9, 10, 11];

function taskWord(n) {
  const last = n % 10;
  const tens = n % 100;
  if (tens >= 11 && tens <= 14) return "заданий";
  if (last === 1) return "задание";
  if (last >= 2 && last <= 4) return "задания";
  return "заданий";
}

function pointWord(n) {
  const last = n % 10;
  const tens = n % 100;
  if (tens >= 11 && tens <= 14) return "баллов";
  if (last === 1) return "балл";
  if (last >= 2 && last <= 4) return "балла";
  return "баллов";
}

// Перемешивание с зерном: после перезагрузки набор «вперемешку» тот же.
function shuffle(list, seed) {
  let s = seed >>> 0 || 1;
  const rnd = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function emptyResponse(task) {
  if (task.kind === "yesno") return task.items.map(() => null);
  if (task.kind === "multi") return [];
  if (task.kind === "one" || task.kind === "short") return "";
  return {};
}

const olympName = (o) => o.stageName + " · " + o.grade + " класс";
const olympSub = (o) => o.year + (o.region ? " · " + o.region : "");
const testPoints = (o) => o.tasks.reduce((n, t) => n + t.max, 0);

// Как засчитывается ответ — коротко, над вариантами: у олимпиады правила
// строже, чем «верно/неверно», и лучше знать их до ответа.
function ruleText(task) {
  switch (task.kind) {
    case "yesno":
      return "Для каждого суждения — «да» или «нет». " + task.per + " " + pointWord(task.per) + " за каждый верный ответ.";
    case "multi":
      if (task.exact) return "Выберите все верные. Баллы — только за точное совпадение с ключом.";
      return (
        "Выберите все верные. " + task.per + " " + pointWord(task.per) + " за верный выбор" +
        (task.over
          ? ", штраф " + task.penalty + " за каждый пункт сверх нужного числа"
          : task.penalty ? ", штраф " + task.penalty + " за неверный" : "") +
        (task.limit ? "; больше " + task.limit + " — ноль" : "") + "."
      );
    case "one":
      return "Выберите один вариант.";
    case "match":
      return "Для каждой позиции выберите вариант. Один вариант может подходить нескольким позициям.";
    case "matchmany":
      return "Каждой позиции может соответствовать несколько вариантов. Лишний выбор снимает балл.";
    case "groups":
      return "Разложите изображения по группам" + (task.extra ? ", лишние отметьте «лишнее»" : "") + ". Балл за каждое верное соотнесение.";
    case "gaps":
      return "Выберите вариант для каждого пропуска — на месте пропуска выпадающий список.";
    case "short":
      return "Впишите ответ. Число — без единиц измерения, дробное — через запятую.";
    default:
      return "";
  }
}

export default function VoshTrainer({ log, state, onState, onAttempt, onLeave, styles }) {
  const st = state || {};
  const [olymp, setOlymp] = useState(st.olymp || "");
  const [taskId, setTaskId] = useState(st.taskId || "");
  const [stage, setStage] = useState(st.stage || "");
  const [grade, setGrade] = useState(Number(st.grade) || 0);
  const [seed, setSeed] = useState(st.seed || 1);

  const save = (patch) => {
    const next = { olymp, taskId, stage, grade, seed, ...patch };
    onState(next);
  };

  const last = useMemo(() => lastAttempts(log, IDS), [log]);
  const seconds = useMemo(
    () => (log || []).filter((a) => IDS.has(a.taskId)).reduce((n, a) => n + (Number(a.seconds) || 0), 0),
    [log],
  );
  const shown = OLYMPIADS.filter((o) => (!stage || o.stage === stage) && (!grade || o.grade === grade));
  const shownIds = new Set(shown.map((o) => o.id));

  // Порядок заданий открытого набора. Вперемешку — все задания выбранных
  // олимпиад, решённые верно пропускаются.
  const order = useMemo(() => {
    if (olymp === MIX) return shuffle(ALL.filter((t) => shownIds.has(t.olymp.id)), seed);
    const o = OLYMP.get(olymp);
    return o ? o.tasks.map((t) => BY_ID.get(t.id)) : [];
    // shownIds выводится из stage и grade
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [olymp, seed, stage, grade]);
  const solvedOk = (t) => {
    const a = last.get(t.id);
    return !!(a && a.ok);
  };
  const mixLeft = olymp === MIX ? order.filter((t) => !solvedOk(t)) : [];

  // Какое задание на экране. Пока не выбрано — первое без ответа.
  const current = (() => {
    if (!olymp || taskId === DONE) return null;
    if (taskId && BY_ID.has(taskId)) return BY_ID.get(taskId);
    if (olymp === MIX) return mixLeft[0] || null;
    return order.find((t) => !last.has(t.id)) || order[0] || null;
  })();

  // Олимпиада, где отвечено на всё, открывается сразу на итогах.
  function open(id) {
    const all = OLYMP.get(id).tasks.every((t) => last.has(t.id));
    const at = all ? DONE : "";
    setOlymp(id);
    setTaskId(at);
    save({ olymp: id, taskId: at });
  }

  function restart(id) {
    // Заново — это про порядок показа: прежние ответы остаются в журнале,
    // просто задания снова идут с первого.
    const first = OLYMP.get(id).tasks[0].id;
    setOlymp(id);
    setTaskId(first);
    save({ olymp: id, taskId: first });
  }

  function openMix() {
    const s = (Date.now() % 2147483647) || 1;
    setSeed(s);
    setOlymp(MIX);
    setTaskId("");
    save({ olymp: MIX, taskId: "", seed: s });
  }

  function toList() {
    setOlymp("");
    setTaskId("");
    save({ olymp: "", taskId: "" });
  }

  function go(id) {
    setTaskId(id);
    save({ taskId: id });
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function next() {
    if (!current) return;
    const i = order.findIndex((t) => t.id === current.id);
    if (olymp === MIX) {
      const after = order.slice(i + 1).concat(order.slice(0, Math.max(0, i))).find((t) => !solvedOk(t) && t.id !== current.id);
      go(after ? after.id : DONE);
      return;
    }
    go(i >= 0 && i < order.length - 1 ? order[i + 1].id : DONE);
  }

  function pickStage(id) {
    setStage(id);
    save({ stage: id });
  }
  function pickGrade(g) {
    setGrade(g);
    save({ grade: g });
  }

  // --- список олимпиад ---------------------------------------------------
  if (!olymp) {
    const solvedAll = ALL.filter(solvedOk).length;
    const leftShown = ALL.filter((t) => shownIds.has(t.olymp.id) && !solvedOk(t)).length;
    return (
      <section className="ap-card" style={styles.card}>
        <div style={S.head0}>
          <div style={styles.cardTitle}>ВсОШ · Обществознание</div>
          <button onClick={onLeave} className="ap-row" style={S.back}>К выбору предмета</button>
        </div>
        <p style={S.intro}>
          Тестовые задания школьного и муниципального этапов Всероссийской олимпиады (Москва) с официальными
          ключами и критериями. Развёрнутые задания — эссе, объяснения, примеры — сюда не входят: их проверяет
          жюри, а не ключ. Баллы считаются по критериям олимпиады, частично: за каждый верный пункт.
        </p>

        <div style={S.stats}>
          <div style={S.stat}><span style={S.statValue}>{ALL.length}</span><span style={S.statName}>заданий в {OLYMPIADS.length} олимпиадах</span></div>
          <div style={S.stat}><span style={S.statValue}>{solvedAll}</span><span style={S.statName}>решено верно</span></div>
          <div style={S.stat}><span style={S.statValue}>{timeWord(seconds)}</span><span style={S.statName}>за секундомером</span></div>
        </div>

        <div style={S.chips} role="group" aria-label="Этап">
          {STAGES.map((s) => (
            <button key={s.id || "all"} onClick={() => pickStage(s.id)} className="ap-row" style={{ ...S.chip, ...(stage === s.id ? S.chipOn : null) }} aria-pressed={stage === s.id}>
              {s.name}
            </button>
          ))}
        </div>
        <div style={S.chips} role="group" aria-label="Класс">
          {GRADES.map((g) => (
            <button key={g} onClick={() => pickGrade(g)} className="ap-row" style={{ ...S.chip, ...(grade === g ? S.chipOn : null) }} aria-pressed={grade === g}>
              {g ? g + " класс" : "Все классы"}
            </button>
          ))}
        </div>

        <div style={S.mix}>
          <div>
            <div style={S.mixTitle}>Вперемешку</div>
            <div style={S.pickLine}>
              {leftShown
                ? leftShown + " " + taskWord(leftShown) + " ещё не решено верно из выбранных олимпиад"
                : "Все задания выбранных олимпиад решены верно"}
            </div>
          </div>
          <button onClick={openMix} disabled={!leftShown} className="ap-btn" style={{ ...S.primary, ...(leftShown ? null : S.off) }}>
            Решать вперемешку
          </button>
        </div>

        {!shown.length && <p style={styles.muted}>Таких олимпиад пока нет.</p>}
        {[...new Set(shown.map((o) => o.year))].map((year) => (
        <div key={year}>
        <div style={S.year}>{year} учебный год</div>
        <div style={S.picker}>
          {shown.filter((o) => o.year === year).map((o) => {
            const points = testPoints(o);
            const answered = o.tasks.filter((t) => last.has(t.id));
            const got = answered.reduce((n, t) => n + (Number(last.get(t.id).score) || 0), 0);
            const all = answered.length === o.tasks.length;
            return (
              <div key={o.id} style={S.pick} data-vosh={o.id}>
                <div style={S.pickName}>{olympName(o)}</div>
                <div style={S.pickLine}>
                  {o.tasks.length} {taskWord(o.tasks.length)} на {points} {pointWord(points)}
                </div>
                <div style={S.pickSub}>
                  {points < o.max ? "тестовая часть; во всей работе — " + o.max + " " + pointWord(o.max) : "вся работа — тестовая"}
                </div>
                {answered.length ? (
                  <>
                    <div style={S.pickLine}>
                      Набрано <b>{got}</b> из {points} · отвечено {answered.length} из {o.tasks.length}
                    </div>
                    <div style={S.bar}><div style={{ ...S.barFill, width: Math.max(2, (got / points) * 100) + "%" }} /></div>
                  </>
                ) : null}
                <div style={S.pickButtons}>
                  <button onClick={() => open(o.id)} className="ap-btn" style={S.primary}>
                    {answered.length ? (all ? "Итоги" : "Продолжить") : "Начать"}
                  </button>
                  {answered.length ? (
                    <button onClick={() => restart(o.id)} className="ap-row" style={S.keyBtn}>Пройти заново</button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
        </div>
        ))}
        <p style={S.source}>
          Источник: задания и критерии оценивания школьного и муниципального этапов ВсОШ по обществознанию,
          Москва, 2023/24 – 2025/26. Где в опубликованном ключе замечена опечатка, это сказано под заданием.
        </p>
      </section>
    );
  }

  const o = OLYMP.get(olymp);
  const title = olymp === MIX ? "ВсОШ вперемешку" : o ? olympName(o) : "ВсОШ";

  // --- итог олимпиады или конец набора -------------------------------------
  if (!current) {
    if (olymp === MIX || !o) {
      return (
        <section className="ap-card" style={styles.card}>
          <div style={S.head0}>
            <div style={styles.cardTitle}>{title}</div>
            <button onClick={toList} className="ap-row" style={S.back}>К списку олимпиад</button>
          </div>
          <p style={styles.muted}>Все задания выбранных олимпиад решены верно. Можно выбрать другие этапы и классы.</p>
        </section>
      );
    }
    const points = testPoints(o);
    const got = o.tasks.reduce((n, t) => n + (last.has(t.id) ? Number(last.get(t.id).score) || 0 : 0), 0);
    const firstWrong = o.tasks.find((t) => !solvedOk(t));
    return (
      <section className="ap-card" style={styles.card}>
        <div style={S.head0}>
          <div style={styles.cardTitle}>{title}</div>
          <button onClick={toList} className="ap-row" style={S.back}>К списку олимпиад</button>
        </div>
        <div style={S.pickSub}>{olympSub(o)}</div>
        <div style={S.total} data-vosh-total>
          Набрано <b>{got}</b> из {points} {pointWord(points)}
        </div>
        {points < o.max && (
          <p style={S.intro}>
            За всю работу можно было получить {o.max} {pointWord(o.max)}. Остальное — развёрнутые задания,
            их проверяет жюри, и сюда они не перенесены.
          </p>
        )}
        <div style={S.bar}><div style={{ ...S.barFill, width: Math.max(2, (got / points) * 100) + "%" }} /></div>
        <ul style={S.sumList}>
          {o.tasks.map((t) => {
            const a = last.get(t.id);
            return (
              <li key={t.id}>
                <button onClick={() => go(t.id)} className="ap-row" style={S.sumRow}>
                  <span style={S.sumNo}>№ {t.no}</span>
                  <span style={S.sumKind}>{KIND_NAMES[t.kind]}</span>
                  <span style={{ ...S.sumScore, color: !a ? "var(--mute)" : a.ok ? "var(--green)" : a.score ? "var(--warmInk)" : "var(--red)" }}>
                    {a ? (a.score || 0) + " из " + t.max : "не решено"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <div style={S.pickButtons}>
          {firstWrong && (
            <button onClick={() => go(firstWrong.id)} className="ap-btn" style={S.primary}>Перерешать неверные</button>
          )}
          <button onClick={() => restart(o.id)} className="ap-row" style={S.keyBtn}>Пройти заново</button>
        </div>
      </section>
    );
  }

  // Задание закрепляется за экраном в момент ответа. Пока номер не выбран,
  // на экране первое нерешённое, — а ответ делает его решённым, и без этого
  // на его месте молча оказалось бы следующее: ни итога, ни разбора.
  function attempt(entry) {
    if (taskId !== current.id) {
      setTaskId(current.id);
      save({ taskId: current.id });
    }
    onAttempt(entry);
  }

  const index = order.findIndex((t) => t.id === current.id);
  return (
    <section className="ap-card" style={styles.card}>
      <div style={S.head0}>
        <div>
          <div style={styles.cardTitle}>{title}</div>
          {o ? <div style={S.pickSub}>{olympSub(o)}</div> : null}
        </div>
        <button onClick={toList} className="ap-row" style={S.back}>К списку олимпиад</button>
      </div>

      {olymp === MIX ? (
        <div style={S.navNote}>
          Осталось {mixLeft.length} {taskWord(mixLeft.length)} · задание из олимпиады «{olympName(current.olymp)}, {current.olymp.year}»
        </div>
      ) : (
        <nav style={S.nav} aria-label="Задания олимпиады">
          {order.map((t) => {
            const a = last.get(t.id);
            const tone = !a ? null : a.ok ? S.navOk : a.score ? S.navPart : S.navBad;
            return (
              <button
                key={t.id}
                onClick={() => go(t.id)}
                className="ap-row"
                style={{ ...S.navChip, ...tone, ...(t.id === current.id ? S.navOn : null) }}
                aria-current={t.id === current.id ? "step" : undefined}
                title={KIND_NAMES[t.kind]}
              >
                {t.no}
              </button>
            );
          })}
          <button onClick={() => go(DONE)} className="ap-row" style={S.navChip}>Итог</button>
        </nav>
      )}

      <TaskCard
        key={current.id}
        task={current}
        prev={last.get(current.id)}
        onAttempt={attempt}
        onNext={next}
        isLast={olymp !== MIX && index === order.length - 1}
      />
    </section>
  );
}

// --- одно задание --------------------------------------------------------

function TaskCard({ task, prev, onAttempt, onNext, isLast }) {
  // Уже решённое задание открывается с прошлым ответом и разбором. «Решить
  // заново» — чистый лист и новый отсчёт времени.
  const [round, setRound] = useState(prev && prev.resp ? 0 : 1);
  const [resp, setResp] = useState(() => (prev && prev.resp ? prev.resp : emptyResponse(task)));
  const [result, setResult] = useState(() => (prev && prev.resp ? { ...scoreTask(task, prev.resp), seconds: prev.seconds || 0, old: true } : null));
  const watch = useStopwatch(task.id + ":" + round);
  const ctx = task.ctx ? task.olymp.contexts[task.ctx] : null;
  const done = !!result;
  const ready = hasResponse(task, resp);

  function answer() {
    if (done || !ready) return;
    const r = scoreTask(task, resp);
    const seconds = Math.round(watch.read());
    setResult({ ...r, seconds });
    onAttempt({ taskId: task.id, answer: responseText(task, resp), ok: r.ok, seconds, score: r.score, max: task.max, resp });
  }

  function again() {
    setResp(emptyResponse(task));
    setResult(null);
    setRound((n) => n + 1);
  }

  const props = { task, resp, setResp: done ? () => {} : setResp, done, result };

  return (
    <div style={S.task} data-vosh-task={task.id}>
      <div style={S.head}>
        <span style={S.code}>№ {task.no}</span>
        <span style={S.headKind}>{KIND_NAMES[task.kind]} · {task.max} {pointWord(task.max)}</span>
        {!done && <span style={S.clock} aria-label="Время на задание">{timeWord(watch.seconds)}</span>}
      </div>

      {ctx && <Context ctx={ctx} />}

      <div style={S.q}>{task.q}</div>
      {(task.pictures || []).map((p, i) => (
        <Figure key={i} pic={p} />
      ))}
      <div style={S.rule}>{ruleText(task)}</div>

      {task.kind === "yesno" && <YesNo {...props} />}
      {(task.kind === "multi" || task.kind === "one") && <Options {...props} />}
      {task.kind === "match" && <Match {...props} />}
      {task.kind === "matchmany" && <MatchMany {...props} />}
      {task.kind === "groups" && <Groups {...props} />}
      {task.kind === "gaps" && <Gaps {...props} />}
      {task.kind === "short" && <Short {...props} onEnter={answer} />}

      {done && (
        <div style={{ ...S.verdict, ...(result.ok ? S.verdictOk : result.score ? S.verdictPart : S.verdictBad) }} role="status">
          <div style={S.verdictHead}>
            {result.ok ? "Верно" : result.score ? "Частично верно" : "Неверно"}
            <span style={S.verdictScore}>
              {result.score} из {task.max} {pointWord(task.max)}
            </span>
            {result.seconds ? <span style={S.verdictTime}>{timeWord(result.seconds)}</span> : null}
          </div>
          {result.old && <div style={S.old}>Это ваш прошлый ответ.</div>}
          {!result.ok && (
            <div style={S.key}>
              Ключ: <b>{keyText(task)}</b>
            </div>
          )}
          {task.why && <div style={S.why}>{task.why}</div>}
          {task.note && <div style={S.note}>{task.note}</div>}
        </div>
      )}
      <div style={S.actions}>
        {!done ? (
          <>
            <button onClick={answer} disabled={!ready} className="ap-btn" style={{ ...S.primary, ...(ready ? null : S.off) }}>
              Ответить
            </button>
            <button onClick={onNext} className="ap-row" style={S.skip}>Пропустить</button>
          </>
        ) : (
          <>
            <button onClick={onNext} className="ap-btn" style={S.primary}>{isLast ? "К итогам" : "Следующее"}</button>
            <button onClick={again} className="ap-row" style={S.keyBtn}>Решить заново</button>
          </>
        )}
      </div>

    </div>
  );
}

function Context({ ctx }) {
  const paras = String(ctx.text || "").split(/\n{2,}/).filter(Boolean);
  return (
    <details open style={S.ctx}>
      <summary style={S.ctxTitle}>{ctx.title}</summary>
      <div style={S.ctxBody}>
        {paras.map((p, i) => (
          <p key={i} style={S.ctxPara}>{p}</p>
        ))}
        {ctx.table && (
          <div style={S.tableWrap}>
            <table style={S.table}>
              <thead>
                <tr>{ctx.table.head.map((h, i) => <th key={i} style={S.th}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {ctx.table.rows.map((row, i) => (
                  <tr key={i}>{row.map((c, j) => <td key={j} style={j ? S.tdNum : S.td}>{c}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {(ctx.pictures || []).map((p, i) => (
          <Figure key={i} pic={p} />
        ))}
        {ctx.source && <div style={S.ctxSource}>{ctx.source}</div>}
      </div>
    </details>
  );
}

// Рисунок открывается целиком в новой вкладке: инфографику на телефоне иначе
// не разглядеть.
function Figure({ pic }) {
  return (
    <figure style={S.figure}>
      <a href={url(pic.src)} target="_blank" rel="noreferrer" title="Открыть крупно">
        <img src={url(pic.src)} alt={pic.alt || ""} loading="lazy" style={S.picture} />
      </a>
      {pic.alt ? <figcaption style={S.caption}>{pic.alt}</figcaption> : null}
    </figure>
  );
}

// Отметка у пункта после ответа.
function Mark({ ok }) {
  if (ok == null) return null;
  return <span style={ok ? S.markOk : S.markBad} aria-label={ok ? "верно" : "неверно"}>{ok ? "✓" : "✗"}</span>;
}

function YesNo({ task, resp, setResp, done, result }) {
  return (
    <ol style={S.rows}>
      {task.items.map((text, i) => {
        const want = task.answer[i];
        return (
          <li key={i} style={S.row}>
            <span style={S.rowNo}>{i + 1}.</span>
            <span style={S.rowText}>{text}</span>
            <span style={S.pair} role="group" aria-label={"Суждение " + (i + 1)}>
              {[true, false].map((v) => {
                const on = resp[i] === v;
                const tone = done ? (v === want ? S.optRight : on ? S.optWrong : null) : on ? S.optOn : null;
                return (
                  <button
                    key={String(v)}
                    data-yn={i + (v ? "-y" : "-n")}
                    onClick={() => setResp(resp.map((x, j) => (j === i ? (x === v ? null : v) : x)))}
                    aria-pressed={on}
                    className="ap-row"
                    style={{ ...S.yn, ...tone }}
                  >
                    {v ? "да" : "нет"}
                  </button>
                );
              })}
            </span>
            {done && <Mark ok={result.marks[i]} />}
          </li>
        );
      })}
    </ol>
  );
}

function Options({ task, resp, setResp, done, result }) {
  const multi = task.kind === "multi";
  const pics = task.options.some((o) => o.img);
  const key = multi ? result && result.key ? result.key : task.answer : [task.answer];
  const picked = (k) => (multi ? resp.includes(k) : resp === k);
  function toggle(k) {
    if (multi) setResp(resp.includes(k) ? resp.filter((x) => x !== k) : [...resp, k]);
    else setResp(resp === k ? "" : k);
  }
  return (
    <div style={pics ? S.tiles : S.opts} role={multi ? "group" : "radiogroup"}>
      {task.options.map((o) => {
        const on = picked(o.k);
        const should = key.includes(o.k);
        const tone = done ? (on && should ? S.optRight : on ? S.optWrong : should ? S.optMissed : null) : on ? S.optOn : null;
        return (
          <button
            key={o.k}
            data-opt={o.k}
            onClick={() => toggle(o.k)}
            aria-pressed={multi ? on : undefined}
            role={multi ? undefined : "radio"}
            aria-checked={multi ? undefined : on}
            className="ap-row"
            style={{ ...(pics ? S.tile : S.opt), ...tone }}
          >
            <span style={S.optKey}>{o.k}</span>
            {o.img ? <img src={url(o.img)} alt={"Вариант " + o.k} style={S.tileImg} /> : <span style={S.optText}>{o.t}</span>}
            {done && should && !on ? <span style={S.missedNote}>нужно было</span> : null}
          </button>
        );
      })}
    </div>
  );
}

function OptionList({ options }) {
  return (
    <ol style={S.optList}>
      {options.map((o) => (
        <li key={o.k} style={S.optListRow}>
          <b style={S.optListKey}>{o.k}.</b> {o.t}
        </li>
      ))}
    </ol>
  );
}

const short = (t, n) => (t.length > n ? t.slice(0, n - 1) + "…" : t);

function Match({ task, resp, setResp, done, result }) {
  return (
    <>
      <div style={S.listTitle}>Варианты</div>
      <OptionList options={task.options} />
      <ol style={S.rows}>
        {task.items.map((it, i) => {
          const want = [].concat(task.answer[i]);
          return (
            <li key={it.k} style={S.matchRow}>
              <span style={S.rowNo}>{it.k})</span>
              <span style={S.rowText}>{it.t}</span>
              <span style={S.matchPick}>
                <select
                  data-item={it.k}
                  value={resp[it.k] || ""}
                  disabled={done}
                  onChange={(e) => setResp({ ...resp, [it.k]: e.target.value })}
                  aria-label={"Позиция " + it.k}
                  style={{ ...S.select, ...(done ? (result.marks[it.k] ? S.selRight : S.selWrong) : null) }}
                >
                  <option value="">—</option>
                  {task.options.map((o) => (
                    <option key={o.k} value={o.k}>{o.k}. {short(o.t, 48)}</option>
                  ))}
                </select>
                {done && <Mark ok={result.marks[it.k] == null ? false : result.marks[it.k]} />}
                {done && !result.marks[it.k] ? <span style={S.wantNote}>ключ: {want.join(" или ")}</span> : null}
              </span>
            </li>
          );
        })}
      </ol>
    </>
  );
}

function MatchMany({ task, resp, setResp, done, result }) {
  return (
    <ol style={S.rows}>
      {task.items.map((it, i) => {
        const picked = resp[it.k] || [];
        const want = task.answer[i];
        return (
          <li key={it.k} style={S.matchRow}>
            <span style={S.rowNo}>{it.k})</span>
            <span style={S.rowText}>{it.t}</span>
            <span style={S.chipRow} role="group" aria-label={"Позиция " + it.k}>
              {task.options.map((o) => {
                const on = picked.includes(o.k);
                const should = want.includes(o.k);
                const tone = done ? (on && should ? S.optRight : on ? S.optWrong : should ? S.optMissed : null) : on ? S.optOn : null;
                return (
                  <button
                    key={o.k}
                    data-mm={it.k + "-" + o.k}
                    onClick={() => setResp({ ...resp, [it.k]: on ? picked.filter((x) => x !== o.k) : [...picked, o.k] })}
                    aria-pressed={on}
                    className="ap-row"
                    style={{ ...S.small, ...tone }}
                    title={o.t}
                  >
                    {o.k}
                  </button>
                );
              })}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function Groups({ task, resp, setResp, done, result }) {
  const choices = Array.from({ length: task.groups }, (_, i) => i + 1).concat(task.extra ? [0] : []);
  return (
    <div style={S.groupGrid}>
      {task.items.map((it, i) => {
        const want = task.answer[i] ? (result && result.perm ? result.perm[task.answer[i] - 1] : task.answer[i]) : 0;
        return (
          <div key={it.k} style={S.groupTile}>
            <div style={S.groupKey}>{it.k})</div>
            {it.img ? (
              <a href={url(it.img)} target="_blank" rel="noreferrer" title="Открыть крупно">
                <img src={url(it.img)} alt={"Изображение " + it.k} loading="lazy" style={S.groupImg} />
              </a>
            ) : (
              <div style={S.rowText}>{it.t}</div>
            )}
            <div style={S.chipRow} role="group" aria-label={"Изображение " + it.k}>
              {choices.map((g) => {
                const on = resp[it.k] === g;
                const tone = done ? (g === want ? S.optRight : on ? S.optWrong : null) : on ? S.optOn : null;
                return (
                  <button
                    key={g}
                    data-group={it.k + "-" + g}
                    onClick={() => setResp({ ...resp, [it.k]: on ? undefined : g })}
                    aria-pressed={on}
                    className="ap-row"
                    style={{ ...S.small, ...tone }}
                  >
                    {g ? "группа " + g : "лишнее"}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Текст с пропусками: на месте каждого «(А)» — выпадающий список вариантов.
function Gaps({ task, resp, setResp, done, result }) {
  const parts = String(task.text).split(/\(([А-ЯЁ])\)/);
  return (
    <>
      <p style={S.gapText}>
        {parts.map((p, i) => {
          if (i % 2 === 0) return <React.Fragment key={i}>{p}</React.Fragment>;
          const want = task.answer[task.gaps.indexOf(p)];
          return (
            <span key={i} style={S.gap}>
              <select
                data-gap={p}
                value={resp[p] || ""}
                disabled={done}
                onChange={(e) => setResp({ ...resp, [p]: e.target.value })}
                aria-label={"Пропуск " + p}
                style={{ ...S.gapSelect, ...(done ? (result.marks[p] ? S.selRight : S.selWrong) : null) }}
              >
                <option value="">({p}) …</option>
                {task.options.map((o) => (
                  <option key={o.k} value={o.k}>({p}) {o.t}</option>
                ))}
              </select>
              {done && !result.marks[p] ? (
                <span style={S.wantNote}>{(task.options.find((o) => o.k === want) || {}).t}</span>
              ) : null}
            </span>
          );
        })}
      </p>
      <div style={S.listTitle}>Варианты</div>
      <OptionList options={task.options} />
    </>
  );
}

function Short({ task, resp, setResp, done, result, onEnter }) {
  return (
    <div style={S.shortRow}>
      <input
        data-short
        value={resp}
        onChange={(e) => setResp(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onEnter()}
        disabled={done}
        placeholder="Ответ"
        aria-label="Ваш ответ"
        style={{ ...S.input, ...(done ? (result.ok ? S.selRight : S.selWrong) : null) }}
      />
    </div>
  );
}

const S = {
  head0: { display: "flex", alignItems: "flex-start", gap: 10, flexWrap: "wrap", justifyContent: "space-between", marginBottom: 10 },
  back: {
    border: "1px solid var(--line2)", background: "var(--panel)", color: "var(--ink2)", borderRadius: 8,
    padding: "6px 11px", font: "inherit", fontSize: 13, cursor: "pointer",
  },
  intro: { fontSize: 13.5, color: "var(--ink3)", lineHeight: 1.55, margin: "0 0 14px" },
  stats: { display: "flex", flexWrap: "wrap", gap: 18, marginBottom: 14 },
  stat: { display: "flex", flexDirection: "column", gap: 2, minWidth: 92 },
  statValue: { fontSize: 22, fontFamily: "'PT Serif', Georgia, serif", fontVariantNumeric: "tabular-nums" },
  statName: { fontSize: 12, color: "var(--mute)" },
  chips: { display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 },
  chip: {
    display: "inline-flex", alignItems: "center", gap: 6, border: "1px solid var(--line2)",
    background: "var(--panel2)", color: "var(--ink2)", borderRadius: 999, padding: "5px 12px",
    font: "inherit", fontSize: 13, cursor: "pointer",
  },
  chipOn: { background: "var(--ink)", color: "var(--bg)", borderColor: "var(--ink)", fontWeight: 600 },
  mix: {
    display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", justifyContent: "space-between",
    border: "1px solid var(--line2)", borderRadius: 12, padding: "12px 14px", background: "var(--panel)", margin: "4px 0 12px",
  },
  mixTitle: { fontSize: 15.5, fontWeight: 600 },
  year: { fontFamily: "'PT Serif', Georgia, serif", fontSize: 17, margin: "6px 0 8px" },
  picker: { display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", marginBottom: 14 },
  pick: { border: "1px solid var(--line2)", borderRadius: 12, padding: "12px 14px", background: "var(--panel2)" },
  pickName: { fontSize: 15.5, fontWeight: 600, color: "var(--ink)" },
  pickSub: { fontSize: 12.5, color: "var(--mute)", marginTop: 2 },
  pickLine: { fontSize: 13, color: "var(--ink3)", margin: "6px 0 0" },
  pickButtons: { display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 },
  bar: { height: 6, borderRadius: 999, background: "var(--line2)", overflow: "hidden", margin: "8px 0 0" },
  barFill: { height: "100%", borderRadius: 999, background: "var(--btnBg)" },
  primary: {
    border: "1px solid var(--ink)", background: "var(--ink)", color: "var(--bg)", borderRadius: 9,
    padding: "9px 16px", font: "inherit", fontSize: 14, fontWeight: 600, cursor: "pointer",
  },
  off: { opacity: 0.45, cursor: "default" },
  keyBtn: {
    border: "1px solid var(--line2)", background: "var(--panel)", color: "var(--ink2)", borderRadius: 8,
    padding: "7px 12px", font: "inherit", fontSize: 13, cursor: "pointer",
  },
  skip: { border: "none", background: "none", color: "var(--mute)", font: "inherit", fontSize: 13, cursor: "pointer", padding: 0 },
  source: { marginTop: 6, fontSize: 11.5, color: "var(--mute)", lineHeight: 1.5 },

  total: { fontFamily: "'PT Serif', Georgia, serif", fontSize: 24, margin: "12px 0 6px" },
  sumList: { listStyle: "none", margin: "14px 0 0", padding: 0, display: "flex", flexDirection: "column", gap: 2 },
  sumRow: {
    display: "flex", alignItems: "baseline", gap: 10, width: "100%", textAlign: "left", background: "none",
    border: "none", borderRadius: 8, padding: "6px 8px", font: "inherit", color: "inherit", cursor: "pointer",
  },
  sumNo: { minWidth: 52, fontWeight: 600, fontVariantNumeric: "tabular-nums" },
  sumKind: { flex: 1, fontSize: 13, color: "var(--ink3)" },
  sumScore: { fontSize: 13.5, fontVariantNumeric: "tabular-nums", fontWeight: 600 },

  nav: { display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 12 },
  navNote: { fontSize: 12.5, color: "var(--mute)", marginBottom: 12 },
  navChip: {
    minWidth: 34, border: "1px solid var(--line2)", background: "var(--panel2)", color: "var(--ink2)",
    borderRadius: 8, padding: "4px 7px", font: "inherit", fontSize: 12.5, cursor: "pointer", fontVariantNumeric: "tabular-nums",
  },
  navOk: { borderColor: "var(--green)", color: "var(--green)" },
  navPart: { borderColor: "var(--warmLine)", background: "var(--warmBg)", color: "var(--warmInk)" },
  navBad: { borderColor: "var(--redLine)", background: "var(--redBg)", color: "var(--red)" },
  navOn: { background: "var(--ink)", color: "var(--bg)", borderColor: "var(--ink)", fontWeight: 700 },

  task: { border: "1px solid var(--line2)", borderRadius: 12, padding: "14px 15px", background: "var(--panel2)", minWidth: 0 },
  head: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 },
  code: {
    fontFamily: "ui-monospace, monospace", fontSize: 12.5, fontWeight: 600, letterSpacing: "0.03em",
    border: "1px solid var(--line2)", borderRadius: 6, padding: "2px 7px", color: "var(--ink2)",
  },
  headKind: { fontSize: 12.5, color: "var(--ink3)" },
  clock: { marginLeft: "auto", fontVariantNumeric: "tabular-nums", fontSize: 15, fontWeight: 600, color: "var(--ink2)" },
  q: { fontSize: 15, lineHeight: 1.6, whiteSpace: "pre-wrap", marginBottom: 10 },
  rule: { fontSize: 12.5, color: "var(--mute)", lineHeight: 1.5, marginBottom: 12 },

  ctx: { border: "1px solid var(--line)", borderRadius: 10, background: "var(--panel)", marginBottom: 12 },
  ctxTitle: { cursor: "pointer", padding: "9px 12px", fontSize: 13.5, fontWeight: 600, color: "var(--ink2)" },
  ctxBody: { padding: "0 12px 12px", maxHeight: "70vh", overflowY: "auto" },
  ctxPara: { fontSize: 14, lineHeight: 1.6, margin: "0 0 9px" },
  ctxSource: { fontSize: 12, color: "var(--mute)", lineHeight: 1.5, marginTop: 6 },
  tableWrap: { overflowX: "auto", margin: "4px 0 10px" },
  table: { borderCollapse: "collapse", fontSize: 13.5, minWidth: "100%" },
  th: { borderBottom: "1px solid var(--line)", padding: "5px 8px", textAlign: "right", fontWeight: 600, whiteSpace: "nowrap" },
  td: { borderBottom: "1px solid var(--line2)", padding: "5px 8px", textAlign: "left" },
  tdNum: { borderBottom: "1px solid var(--line2)", padding: "5px 8px", textAlign: "right", fontVariantNumeric: "tabular-nums" },
  figure: { margin: "0 0 12px" },
  picture: {
    display: "block", maxWidth: "100%", height: "auto", background: "#fff",
    border: "1px solid var(--line2)", borderRadius: 8, padding: 4,
  },
  caption: { fontSize: 12, color: "var(--mute)", lineHeight: 1.45, marginTop: 5 },

  rows: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 },
  row: {
    display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", border: "1px solid var(--line2)",
    borderRadius: 10, padding: "9px 11px", background: "var(--panel)",
  },
  matchRow: {
    display: "flex", alignItems: "flex-start", gap: 10, flexWrap: "wrap", border: "1px solid var(--line2)",
    borderRadius: 10, padding: "9px 11px", background: "var(--panel)",
  },
  rowNo: { fontWeight: 600, color: "var(--ink3)", minWidth: 20, fontVariantNumeric: "tabular-nums" },
  rowText: { flex: "1 1 260px", minWidth: 0, fontSize: 14, lineHeight: 1.55 },
  pair: { display: "inline-flex", gap: 6, marginLeft: "auto" },
  yn: {
    minWidth: 52, border: "1px solid var(--line)", background: "var(--panel2)", color: "var(--ink2)",
    borderRadius: 8, padding: "6px 10px", font: "inherit", fontSize: 13.5, cursor: "pointer",
  },
  optOn: { background: "var(--ink)", color: "var(--bg)", borderColor: "var(--ink)", fontWeight: 600 },
  optRight: { borderColor: "var(--green)", boxShadow: "inset 0 0 0 1px var(--green)", color: "var(--ink)", fontWeight: 600 },
  optWrong: { borderColor: "var(--redLine)", background: "var(--redBg)", color: "var(--ink)" },
  optMissed: { borderColor: "var(--green)", borderStyle: "dashed" },
  markOk: { color: "var(--green)", fontWeight: 700 },
  markBad: { color: "var(--red)", fontWeight: 700 },
  opts: { display: "flex", flexDirection: "column", gap: 7 },
  opt: {
    display: "flex", alignItems: "flex-start", gap: 10, width: "100%", textAlign: "left", border: "1px solid var(--line2)",
    borderRadius: 10, padding: "9px 11px", background: "var(--panel)", color: "var(--ink)", font: "inherit",
    fontSize: 14, lineHeight: 1.5, cursor: "pointer",
  },
  optKey: { fontWeight: 700, minWidth: 22, fontVariantNumeric: "tabular-nums" },
  optText: { flex: 1, minWidth: 0 },
  missedNote: { fontSize: 11.5, color: "var(--green)", marginLeft: "auto", whiteSpace: "nowrap" },
  tiles: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 8 },
  tile: {
    display: "flex", flexDirection: "column", alignItems: "center", gap: 6, border: "1px solid var(--line2)",
    borderRadius: 10, padding: 8, background: "#fff", color: "#222", font: "inherit", cursor: "pointer",
  },
  tileImg: { display: "block", maxWidth: "100%", maxHeight: 130, height: "auto" },
  listTitle: { fontSize: 12.5, fontWeight: 600, color: "var(--ink3)", margin: "4px 0 6px" },
  optList: { margin: "0 0 12px", padding: "8px 12px", listStyle: "none", border: "1px solid var(--line2)", borderRadius: 10, background: "var(--panel)" },
  optListRow: { fontSize: 13.5, lineHeight: 1.5, padding: "2px 0" },
  optListKey: { fontVariantNumeric: "tabular-nums" },
  matchPick: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", flex: "1 1 220px", minWidth: 0, maxWidth: "100%" },
  // Ширина списка задана явно: иначе браузер растягивает его по самому
  // длинному варианту, и на телефоне вся карточка уезжала вбок.
  select: {
    flex: "1 1 200px", width: "100%", minWidth: 0, maxWidth: "100%", border: "1px solid var(--line)", borderRadius: 8, padding: "7px 8px",
    font: "inherit", fontSize: 13.5, background: "var(--panel2)", color: "var(--ink)",
  },
  selRight: { borderColor: "var(--green)", boxShadow: "inset 0 0 0 1px var(--green)" },
  selWrong: { borderColor: "var(--redLine)", background: "var(--redBg)" },
  wantNote: { fontSize: 12.5, color: "var(--green)", fontWeight: 600 },
  chipRow: { display: "flex", flexWrap: "wrap", gap: 5 },
  small: {
    border: "1px solid var(--line)", background: "var(--panel2)", color: "var(--ink2)", borderRadius: 7,
    padding: "5px 9px", font: "inherit", fontSize: 13, cursor: "pointer", minWidth: 34,
  },
  groupGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 10 },
  groupTile: { display: "flex", flexDirection: "column", gap: 7, border: "1px solid var(--line2)", borderRadius: 10, padding: 8, background: "var(--panel)" },
  groupKey: { fontWeight: 700, fontSize: 13.5 },
  groupImg: { display: "block", width: "100%", height: 130, objectFit: "contain", background: "#fff", borderRadius: 6 },
  gapText: { fontSize: 14.5, lineHeight: 2, margin: "0 0 12px" },
  gap: { display: "inline-flex", alignItems: "baseline", gap: 6, flexWrap: "wrap", verticalAlign: "baseline" },
  gapSelect: {
    maxWidth: 220, border: "1px solid var(--line)", borderRadius: 7, padding: "3px 6px",
    font: "inherit", fontSize: 13.5, background: "var(--panel)", color: "var(--ink)",
  },
  shortRow: { display: "flex", gap: 8, flexWrap: "wrap" },
  input: {
    flex: "1 1 200px", minWidth: 0, border: "1px solid var(--line)", borderRadius: 9, padding: "9px 12px",
    font: "inherit", fontSize: 15, background: "var(--panel)", color: "var(--ink)",
  },
  actions: { display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", marginTop: 14 },

  verdict: { marginTop: 12, borderRadius: 10, padding: "11px 13px", border: "1px solid" },
  verdictOk: { borderColor: "var(--green)", background: "var(--panel)" },
  verdictPart: { borderColor: "var(--warmLine)", background: "var(--warmBg)" },
  verdictBad: { borderColor: "var(--redLine)", background: "var(--redBg)" },
  verdictHead: { display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", fontWeight: 600, fontSize: 15.5, fontFamily: "'PT Serif', Georgia, serif" },
  verdictScore: { fontSize: 14, fontFamily: "inherit", fontWeight: 600, color: "var(--ink2)" },
  verdictTime: { marginLeft: "auto", fontSize: 13, fontWeight: 400, color: "var(--ink3)", fontVariantNumeric: "tabular-nums" },
  old: { fontSize: 12.5, color: "var(--mute)", marginTop: 4 },
  key: { marginTop: 6, fontSize: 14, lineHeight: 1.5 },
  why: { marginTop: 7, fontSize: 13.5, lineHeight: 1.55, color: "var(--ink2)" },
  note: {
    marginTop: 9, fontSize: 12.5, lineHeight: 1.5, color: "var(--ink3)",
    borderLeft: "3px solid var(--warmLine)", paddingLeft: 9,
  },
};
