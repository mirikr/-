import React, { useEffect, useMemo, useRef, useState } from "react";
import { BANK_SOURCE, BANK_TASKS, BANK_URL } from "./fipi-bank.js";
import { isRight, keyState, streakOf, timeWord, trainerStats } from "./bank-answer.js";

// Тренажёр по открытому банку ФИПИ.
//
// Секундомер здесь настоящий: время считается от показа условия до нажатия
// «Ответить», а не прикидывается «примерно минута на задание». Пока вкладка
// свёрнута, счёт останавливается — иначе отложенное на перемене задание
// показывало бы полчаса раздумий.
//
// Ключи решены нами, а не взяты у банка: он правильный ответ не отдаёт. Поэтому
// у каждого ответа честно написано, сверен он или нет, и есть две кнопки —
// подтвердить и пожаловаться.

function useStopwatch(taskId) {
  const [shown, setShown] = useState(0);
  const started = useRef(Date.now());
  const hiddenAt = useRef(0);
  const lost = useRef(0);

  function elapsed() {
    const away = hiddenAt.current ? Date.now() - hiddenAt.current : 0;
    return Math.max(0, (Date.now() - started.current - lost.current - away) / 1000);
  }

  useEffect(() => {
    started.current = Date.now();
    lost.current = 0;
    hiddenAt.current = 0;
    setShown(0);
    const timer = setInterval(() => setShown(elapsed()), 500);
    function onVisibility() {
      if (document.visibilityState === "hidden") {
        hiddenAt.current = Date.now();
      } else if (hiddenAt.current) {
        lost.current += Date.now() - hiddenAt.current;
        hiddenAt.current = 0;
      }
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  return { seconds: shown, read: elapsed };
}

export default function Trainer({ log, marks, onAttempt, onMark, styles }) {
  const [section, setSection] = useState("");
  const [onlyNew, setOnlyNew] = useState(true);
  // Какое задание на экране. Держим именно его, а не позицию в списке: стоит
  // ответить верно, как решённое задание уходит из набора, список сдвигается —
  // и на месте разобранного задания оказывается следующее, а разбор под ним
  // остаётся от предыдущего. По номеру такого не бывает.
  const [currentId, setCurrentId] = useState("");
  const [value, setValue] = useState("");
  const [result, setResult] = useState(null);

  const sections = useMemo(() => {
    const seen = [];
    BANK_TASKS.forEach((t) => {
      if (!seen.includes(t.section)) seen.push(t.section);
    });
    return seen;
  }, []);

  // Что человек уже одолел: по последней попытке, тренируются ведь до победы.
  const solved = useMemo(() => {
    const last = new Map();
    (log || []).forEach((a) => last.set(a.taskId, a.ok));
    const out = new Set();
    last.forEach((ok, id) => ok && out.add(id));
    return out;
  }, [log]);

  const queue = useMemo(() => {
    return BANK_TASKS.filter((t) => (!section || t.section === section) && (!onlyNew || !solved.has(t.id)));
  }, [section, onlyNew, solved]);

  const task = (currentId && BANK_TASKS.find((t) => t.id === currentId)) || queue[0] || null;
  const watch = useStopwatch(task ? task.id : "нет");

  const ids = useMemo(() => new Set(queue.map((t) => t.id)), [queue]);
  const stats = useMemo(() => trainerStats(log, null), [log]);
  const streak = streakOf(log);
  const key = task ? keyState(marks, task.id) : null;
  const myMark = task ? (marks || []).find((m) => m.taskId === task.id) : null;

  const disputed = useMemo(() => {
    const out = [];
    (marks || []).forEach((m) => {
      if (m.kind !== "wrong") return;
      const t = BANK_TASKS.find((x) => x.id === m.taskId);
      if (t && !out.some((x) => x.task.id === t.id)) out.push({ task: t, mark: m });
    });
    return out;
  }, [marks]);

  function answer() {
    if (!task || result) return;
    const ok = isRight(task, value);
    const seconds = Math.round(watch.read());
    setResult({ ok, seconds });
    onAttempt({ taskId: task.id, answer: value, ok, seconds });
  }

  function next() {
    setResult(null);
    setValue("");
    const rest = queue.filter((t) => !task || t.id !== task.id);
    const after = task ? rest.find((t) => t.id > task.id) : null;
    const pick = after || rest[0] || null;
    setCurrentId(pick ? pick.id : "");
  }

  function pickSection(name) {
    setSection(name);
    setCurrentId("");
    setResult(null);
    setValue("");
  }

  if (!BANK_TASKS.length) return null;

  return (
    <>
      <section className="ap-card" style={styles.card}>
        <div style={styles.cardTitle}>Тренажёр по банку ФИПИ</div>
        <p style={styles.cardNote}>
          Условия взяты из открытого банка заданий ЕГЭ по физике. У каждого задания подписан его номер —
          по нему задание находится в самом банке. Время засекается настоящим секундомером, а не прикидкой.
        </p>

        <div style={S.chips}>
          <button onClick={() => pickSection("")} className="ap-row" style={{ ...S.chip, ...(section ? null : S.chipOn) }}>
            Все разделы
          </button>
          {sections.map((name) => (
            <button
              key={name}
              onClick={() => pickSection(name)}
              className="ap-row"
              style={{ ...S.chip, ...(section === name ? S.chipOn : null) }}
            >
              {name}
              <span style={S.chipCount}>{BANK_TASKS.filter((t) => t.section === name).length}</span>
            </button>
          ))}
        </div>

        <label style={S.only}>
          <input type="checkbox" checked={onlyNew} onChange={(e) => { setOnlyNew(e.target.checked); setCurrentId(""); setResult(null); setValue(""); }} />
          Только нерешённые
        </label>

        {!task ? (
          <p style={styles.muted}>
            {onlyNew
              ? "В этом разделе решено всё. Снимите галочку, чтобы прорешать заново."
              : "Здесь пока нет заданий."}
          </p>
        ) : (
          <div style={S.task}>
            <div style={S.head}>
              <span style={S.code} title="Номер задания в банке ФИПИ">№ {task.id}</span>
              <span style={S.headSection}>{task.section}</span>
              <span style={S.clock} aria-label="Время на задание">{timeWord(watch.seconds)}</span>
            </div>
            {task.kes && <div style={S.kes}>{task.kes}</div>}
            {task.lead && <div style={S.lead}>{task.lead}</div>}
            <div style={S.text}>{task.text}</div>

            <div style={S.answerRow}>
              <input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && answer()}
                disabled={!!result}
                placeholder="Ответ"
                style={S.input}
                aria-label="Ваш ответ"
              />
              {task.units && <span style={S.units}>{task.units}</span>}
              {!result ? (
                <button onClick={answer} className="ap-btn" style={S.primary}>Ответить</button>
              ) : (
                <button onClick={next} className="ap-btn" style={S.primary}>Следующее</button>
              )}
            </div>

            {!result && (
              <button onClick={next} className="ap-row" style={S.skip}>Пропустить</button>
            )}

            {result && (
              <div style={{ ...S.verdict, ...(result.ok ? S.verdictOk : S.verdictBad) }}>
                <div style={S.verdictHead}>
                  {result.ok ? "Верно" : "Неверно"}
                  <span style={S.verdictTime}>{timeWord(result.seconds)}</span>
                </div>
                {!result.ok && (
                  <div style={S.right}>
                    Ответ: <b>{task.answer}</b> {task.units}
                  </div>
                )}
                <div style={S.why}>{task.why}</div>
              </div>
            )}

            {result && (
              <div style={S.keyBox}>
                <div style={{ ...S.keyState, ...(key.state === "disputed" ? S.keyBad : key.state === "confirmed" ? S.keyOk : S.keyWarn) }}>
                  {key.state === "confirmed"
                    ? "Ответ сверен с банком" + (key.confirmed > 1 ? " (" + key.confirmed + ")" : "")
                    : key.state === "disputed"
                      ? "Спорный ответ: кто-то получил в банке другой"
                      : "Ответ решён нами и с банком не сверен"}
                </div>
                <p style={S.keyNote}>
                  Банк правильный ответ не показывает — он только говорит «верно» или «неверно».
                  Если проверишь это задание на сайте, отметь, что получилось: так ключ станет надёжнее для всех.
                </p>
                <div style={S.keyButtons}>
                  <button
                    onClick={() => onMark({ taskId: task.id, kind: "ok" })}
                    className="ap-row"
                    style={{ ...S.keyBtn, ...(myMark && myMark.kind === "ok" ? S.keyBtnOn : null) }}
                  >
                    Сверил — банк согласен
                  </button>
                  <button
                    onClick={() => onMark({ taskId: task.id, kind: "wrong" })}
                    className="ap-row"
                    style={{ ...S.keyBtn, ...(myMark && myMark.kind === "wrong" ? S.keyBtnOn : null) }}
                  >
                    В банке другой ответ
                  </button>
                  <a href={BANK_URL} target="_blank" rel="noreferrer" style={S.bankLink}>Открыть банк</a>
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="ap-card" style={styles.card}>
        <div style={styles.cardTitle}>Как идут дела</div>
        <div style={S.stats}>
          <div style={S.stat}><span style={S.statValue}>{stats.done}</span><span style={S.statName}>прорешано</span></div>
          <div style={S.stat}><span style={S.statValue}>{stats.percent}%</span><span style={S.statName}>верных</span></div>
          <div style={S.stat}><span style={S.statValue}>{stats.averageSeconds ? timeWord(stats.averageSeconds) : "—"}</span><span style={S.statName}>в среднем</span></div>
          <div style={S.stat}><span style={S.statValue}>{streak}</span><span style={S.statName}>подряд верно</span></div>
          <div style={S.stat}><span style={S.statValue}>{queue.length}</span><span style={S.statName}>осталось в наборе</span></div>
        </div>

        {disputed.length > 0 && (
          <div style={S.disputed}>
            <div style={S.disputedTitle}>Спорные ключи — их надо перепроверить</div>
            {disputed.map(({ task: t }) => (
              <div key={t.id} style={S.disputedRow}>
                <span style={S.code}>№ {t.id}</span>
                <span style={S.disputedText}>{t.text.slice(0, 90)}…</span>
                <span style={S.disputedAnswer}>наш ответ: {t.answer}</span>
              </div>
            ))}
          </div>
        )}

        <p style={S.source}>{BANK_SOURCE}</p>
      </section>
    </>
  );
}

const S = {
  chips: { display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 },
  chip: {
    display: "inline-flex", alignItems: "center", gap: 6, border: "1px solid var(--line2)",
    background: "var(--panel2)", color: "var(--ink2)", borderRadius: 999, padding: "5px 12px",
    font: "inherit", fontSize: 13, cursor: "pointer",
  },
  chipOn: { background: "var(--ink)", color: "var(--bg)", borderColor: "var(--ink)", fontWeight: 600 },
  chipCount: { fontSize: 11.5, opacity: 0.7 },
  only: { display: "flex", alignItems: "center", gap: 7, fontSize: 13.5, color: "var(--ink3)", marginBottom: 14 },

  task: { border: "1px solid var(--line2)", borderRadius: 12, padding: "14px 15px", background: "var(--panel2)" },
  head: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 4 },
  code: {
    fontFamily: "ui-monospace, monospace", fontSize: 12.5, fontWeight: 600, letterSpacing: "0.03em",
    border: "1px solid var(--line2)", borderRadius: 6, padding: "2px 7px", color: "var(--ink2)",
  },
  headSection: { fontSize: 12.5, color: "var(--ink3)" },
  clock: { marginLeft: "auto", fontVariantNumeric: "tabular-nums", fontSize: 15, fontWeight: 600, color: "var(--ink2)" },
  kes: { fontSize: 12, color: "var(--mute)", marginBottom: 8, lineHeight: 1.45 },
  lead: { fontSize: 13, color: "var(--ink3)", marginBottom: 6 },
  text: { fontSize: 15, lineHeight: 1.6, whiteSpace: "pre-wrap", marginBottom: 14 },

  answerRow: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
  input: {
    flex: "1 1 160px", minWidth: 0, border: "1px solid var(--line)", borderRadius: 9, padding: "9px 12px",
    font: "inherit", fontSize: 15, background: "var(--panel)", color: "var(--ink)",
  },
  units: { fontSize: 14, color: "var(--ink3)" },
  primary: {
    border: "1px solid var(--ink)", background: "var(--ink)", color: "var(--bg)", borderRadius: 9,
    padding: "9px 16px", font: "inherit", fontSize: 14, fontWeight: 600, cursor: "pointer",
  },
  skip: {
    marginTop: 8, border: "none", background: "none", color: "var(--mute)", font: "inherit",
    fontSize: 13, cursor: "pointer", padding: 0,
  },

  verdict: { marginTop: 12, borderRadius: 10, padding: "11px 13px", border: "1px solid" },
  verdictOk: { borderColor: "var(--green)", background: "var(--panel)" },
  verdictBad: { borderColor: "var(--redLine)", background: "var(--redBg)" },
  verdictHead: { display: "flex", alignItems: "baseline", gap: 10, fontWeight: 600, fontSize: 15.5, fontFamily: "'PT Serif', Georgia, serif" },
  verdictTime: { marginLeft: "auto", fontSize: 13, fontWeight: 400, color: "var(--ink3)", fontVariantNumeric: "tabular-nums" },
  right: { marginTop: 6, fontSize: 14.5 },
  why: { marginTop: 7, fontSize: 13.5, lineHeight: 1.55, color: "var(--ink2)" },

  keyBox: { marginTop: 12, borderTop: "1px solid var(--line2)", paddingTop: 11 },
  keyState: { display: "inline-block", fontSize: 12.5, borderRadius: 999, padding: "3px 10px", border: "1px solid" },
  keyWarn: { borderColor: "var(--warmLine)", background: "var(--warmBg)", color: "var(--warmInk)" },
  keyOk: { borderColor: "var(--green)", color: "var(--ink2)" },
  keyBad: { borderColor: "var(--redLine)", background: "var(--redBg)", color: "var(--ink2)" },
  keyNote: { fontSize: 12.5, color: "var(--mute)", lineHeight: 1.5, margin: "8px 0 9px" },
  keyButtons: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" },
  keyBtn: {
    border: "1px solid var(--line2)", background: "var(--panel)", color: "var(--ink2)", borderRadius: 8,
    padding: "7px 12px", font: "inherit", fontSize: 13, cursor: "pointer",
  },
  keyBtnOn: { borderColor: "var(--ink)", color: "var(--ink)", fontWeight: 600 },
  bankLink: { fontSize: 13, color: "var(--ink3)" },

  stats: { display: "flex", flexWrap: "wrap", gap: 18 },
  stat: { display: "flex", flexDirection: "column", gap: 2, minWidth: 92 },
  statValue: { fontSize: 22, fontFamily: "'PT Serif', Georgia, serif", fontVariantNumeric: "tabular-nums" },
  statName: { fontSize: 12, color: "var(--mute)" },

  disputed: { marginTop: 16, borderTop: "1px solid var(--line2)", paddingTop: 12 },
  disputedTitle: { fontSize: 13, fontWeight: 600, marginBottom: 8 },
  disputedRow: { display: "flex", gap: 9, alignItems: "baseline", flexWrap: "wrap", fontSize: 12.5, marginBottom: 6 },
  disputedText: { color: "var(--ink3)", flex: "1 1 200px", minWidth: 0 },
  disputedAnswer: { color: "var(--mute)" },

  source: { marginTop: 16, fontSize: 11.5, color: "var(--mute)" },
};
