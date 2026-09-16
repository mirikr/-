import React, { useEffect, useMemo, useRef, useState } from "react";
import { BANK_SECTIONS, BANK_SOURCE, BANK_SUBJECTS, BANK_TASKS, BANK_TOTALS, BANK_URL } from "./fipi-bank.js";
import { AGREE_NEEDED, consensus, isRight, myVote, normalizeAnswer, streakOf, timeWord, trainerStats } from "./bank-answer.js";
import { loadVotes, myUserId, saveVote, votesState, votesTakeBankAnswer } from "./bank-votes.js";

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

function peopleWord(n) {
  const last = n % 10;
  const tens = n % 100;
  if (tens >= 11 && tens <= 14) return "человек";
  if (last === 1) return "человека";
  if (last >= 2 && last <= 4) return "человек";
  return "человек";
}

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
  const [subject, setSubject] = useState(BANK_SUBJECTS[0] || "");
  const [section, setSection] = useState("");
  const [onlyNew, setOnlyNew] = useState(true);
  // Какое задание на экране. Держим именно его, а не позицию в списке: стоит
  // ответить верно, как решённое задание уходит из набора, список сдвигается —
  // и на месте разобранного задания оказывается следующее, а разбор под ним
  // остаётся от предыдущего. По номеру такого не бывает.
  const [currentId, setCurrentId] = useState("");
  const [value, setValue] = useState("");
  const [result, setResult] = useState(null);
  // Что человек списал с ФИПИ: ответ, который банк там засчитал.
  const [fromBank, setFromBank] = useState("");
  const [copied, setCopied] = useState("");
  // Голоса класса: чужие ответы на те же задания. Без облака список пустой —
  // тогда виден только свой голос, и тренажёр от этого не ломается.
  const [votes, setVotes] = useState([]);
  const [me, setMe] = useState("");
  const [shared, setShared] = useState("off");

  useEffect(() => {
    let alive = true;
    loadVotes().then((rows) => {
      if (!alive) return;
      setVotes(rows);
      setShared(votesState());
    });
    myUserId().then((id) => alive && setMe(id));
    return () => {
      alive = false;
    };
  }, []);

  const sections = (BANK_SECTIONS[subject] || []).slice().sort((a, b) => a.localeCompare(b, "ru"));
  const mine = useMemo(() => BANK_TASKS.filter((t) => t.subject === subject), [subject]);
  // Сколько заданий по этому предмету всего в банке ФИПИ и какую часть мы уже перенесли.
  const whole = BANK_TOTALS[subject] || 0;
  const percent = whole ? Math.max(0.1, (mine.length / whole) * 100).toFixed(1).replace(".0", "").replace(".", ",") : "";

  // Что человек уже одолел: по последней попытке, тренируются ведь до победы.
  const solved = useMemo(() => {
    const last = new Map();
    (log || []).forEach((a) => last.set(a.taskId, a.ok));
    const out = new Set();
    last.forEach((ok, id) => ok && out.add(id));
    return out;
  }, [log]);

  const queue = useMemo(() => {
    return mine.filter((t) => (!section || t.section === section) && (!onlyNew || !solved.has(t.id)));
  }, [mine, section, onlyNew, solved]);

  const task = (currentId && BANK_TASKS.find((t) => t.id === currentId)) || queue[0] || null;
  const watch = useStopwatch(task ? task.id : "нет");

  // Всё, что показано внизу, считается по выбранному предмету: перемешивать
  // физику с обществознанием бессмысленно — ни серия, ни доля верных так ничего
  // не значат.
  const mineIds = useMemo(() => new Set(mine.map((t) => t.id)), [mine]);
  const stats = useMemo(() => trainerStats(log, mineIds), [log, mineIds]);
  const streak = useMemo(() => streakOf((log || []).filter((a) => mineIds.has(a.taskId))), [log, mineIds]);
  const myMark = task ? (marks || []).find((m) => m.taskId === task.id && (m.kind === "ok" || m.kind === "wrong")) : null;
  // Что человек уже прислал с ФИПИ по этому заданию.
  const sentFromBank = (myMark && myMark.fipiAnswer) || "";
  const takesBankAnswer = shared !== "ready" || votesTakeBankAnswer();
  const myBroken = task ? (marks || []).find((m) => m.taskId === task.id && m.kind === "broken") : null;

  // Свой голос считаем из своих же записей: так он виден сразу, даже если
  // облако недоступно и в общую копилку он ещё не уехал.
  const allVotes = useMemo(() => {
    const strangers = (votes || []).filter((v) => !me || v.userId !== me);
    return task ? strangers.concat(myVote(log, marks, task.id)) : strangers;
  }, [votes, me, log, marks, task]);
  const key = task ? consensus(allVotes, task.id) : null;

  const broken = useMemo(() => {
    const out = [];
    (marks || []).forEach((m) => {
      if (m.kind !== "broken" || !mineIds.has(m.taskId)) return;
      const t = BANK_TASKS.find((x) => x.id === m.taskId);
      if (t && !out.some((x) => x.id === t.id)) out.push(t);
    });
    return out;
  }, [marks, mineIds]);

  // Ответы, которые засчитал сам банк: и свои, и присланные классом. Это и есть
  // список правок для ключей — его переносят в набор заданий руками.
  const bankAnswers = useMemo(() => {
    const rows = new Map();
    const put = (taskId, answer) => {
      if (!mineIds.has(taskId) || !answer) return;
      const t = BANK_TASKS.find((x) => x.id === taskId);
      if (!t) return;
      const was = rows.get(taskId);
      if (!was) rows.set(taskId, { task: t, answer, count: 1, same: isRight(t, answer) });
      else if (normalizeAnswer(was.answer) === normalizeAnswer(answer)) was.count += 1;
    };
    (marks || []).forEach((m) => put(m.taskId, m.fipiAnswer));
    (votes || []).forEach((v) => put(v.taskId, v.fipiAnswer));
    return [...rows.values()].sort((a, b) => Number(a.same) - Number(b.same) || a.task.id.localeCompare(b.task.id));
  }, [marks, votes, mineIds]);

  const disputed = useMemo(() => {
    const out = [];
    (marks || []).forEach((m) => {
      if (m.kind !== "wrong" || !mineIds.has(m.taskId)) return;
      const t = BANK_TASKS.find((x) => x.id === m.taskId);
      if (t && !out.some((x) => x.task.id === t.id)) out.push({ task: t, mark: m });
    });
    return out;
  }, [marks, mineIds]);

  function answer() {
    if (!task || result) return;
    const ok = isRight(task, value);
    const seconds = Math.round(watch.read());
    setResult({ ok, seconds });
    onAttempt({ taskId: task.id, answer: value, ok, seconds });
    // Ответ уходит в общую копилку: по таким совпадениям и проверяются ключи.
    saveVote({ taskId: task.id, answer: value, matches: ok, fipi: myMark ? myMark.kind : "" })
      .then((sent) => sent && loadVotes(true).then(setVotes));
  }

  function mark(kind, bankAnswer) {
    if (!task) return;
    const entry = { taskId: task.id, kind };
    if (bankAnswer) entry.fipiAnswer = bankAnswer;
    onMark(entry);
    // «Криво показано» — жалоба на задание, а не ответ банка, поэтому в общий
    // счёт ключей она не уходит.
    if (kind === "broken") return;
    // Ответ с ФИПИ отменять нечего: его прислали, а не просто нажали кнопку.
    const same = !bankAnswer && myMark && myMark.kind === kind;
    saveVote({
      taskId: task.id,
      answer: value,
      matches: !!(result && result.ok),
      fipi: same ? "" : kind,
      fipiAnswer: same ? "" : bankAnswer || (myMark && myMark.fipiAnswer) || "",
    }).then((sent) => sent && loadVotes(true).then(setVotes));
  }

  // Ответ, списанный с ФИПИ. Сходится он с нашим ключом или нет — решаем здесь:
  // человеку об этом думать не надо, он просто переписал то, что засчитал банк.
  function sendFromBank() {
    if (!task) return;
    const typed = fromBank.trim();
    if (!typed) return;
    mark(isRight(task, typed) ? "ok" : "wrong", typed);
    setFromBank("");
  }

  // Ключи правятся у нас в наборе, поэтому собранные ответы нужно вынести
  // наружу — одной строчкой, которую остаётся переслать.
  function copyBankAnswers() {
    const text = bankAnswers.map((r) => r.task.id + " " + r.answer + (r.same ? "" : "  (у нас " + r.task.answer + ")")).join("\n");
    if (!navigator.clipboard) {
      setCopied("Скопировать не вышло — выдели список руками.");
      return;
    }
    navigator.clipboard.writeText(text).then(
      () => setCopied("Скопировано — перешли этот список, и ключи поправят."),
      () => setCopied("Скопировать не вышло — выдели список руками."),
    );
  }

  function next() {
    setResult(null);
    setValue("");
    setFromBank("");
    const rest = queue.filter((t) => !task || t.id !== task.id);
    const after = task ? rest.find((t) => t.id > task.id) : null;
    const pick = after || rest[0] || null;
    setCurrentId(pick ? pick.id : "");
  }

  function pickSubject(name) {
    setSubject(name);
    setSection("");
    setCurrentId("");
    setResult(null);
    setValue("");
    setFromBank("");
  }

  function pickSection(name) {
    setSection(name);
    setCurrentId("");
    setResult(null);
    setValue("");
    setFromBank("");
  }

  if (!BANK_TASKS.length) return null;

  return (
    <>
      <section className="ap-card" style={styles.card}>
        <div style={styles.cardTitle}>Тренажёр по банку ФИПИ</div>
        <p style={styles.cardNote}>
          Условия взяты из открытого банка заданий ЕГЭ. У каждого задания подписан его номер —
          по нему задание находится в самом банке. Время засекается настоящим секундомером, а не прикидкой.
        </p>

        <div style={S.alpha}>
          <b>Это альфа-версия, и ответы здесь решены нами, а не взяты у ФИПИ</b> — банк правильный ответ не
          показывает, он только говорит «верно» или «неверно». Значит, ошибки в ключах не исключение, а дело
          времени. Если ты проверил задание в банке — впиши под разбором тот ответ, который банк засчитал.
          Такой ответ сейчас ценнее любого решённого задания: по нему ключи и правятся.
        </div>

        <div style={S.chips}>
          {BANK_SUBJECTS.map((name) => (
            <button
              key={name}
              onClick={() => pickSubject(name)}
              className="ap-row"
              style={{ ...S.subject, ...(subject === name ? S.subjectOn : null) }}
            >
              {name}
              <span style={S.chipCount}>{BANK_TASKS.filter((t) => t.subject === name).length}</span>
            </button>
          ))}
        </div>

        <div style={S.moved}>
          <div style={S.movedTop}>
            <span>
              Перенесено из банка ФИПИ: <b>{mine.length}</b> {taskWord(mine.length)} из{" "}
              <b>{whole || "?"}</b> по предмету «{subject}»
            </span>
            {whole ? <span style={S.movedPart}>{percent}%</span> : null}
          </div>
          {whole ? (
            <div style={S.bar}><div style={{ ...S.barFill, width: Math.max(1.5, Math.min(100, (mine.length / whole) * 100)) + "%" }} /></div>
          ) : null}
          <div style={S.movedNote}>
            Задания переносим и решаем вручную, поэтому набор растёт постепенно. Задания второй части
            с развёрнутым ответом сюда не попадают: их проверяет эксперт, а не строчка с ответом.
          </div>
        </div>

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
              <span style={S.chipCount}>{mine.filter((t) => t.section === name).length}</span>
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
            {task.body ? (
              // Разметка условия приходит из нашего же набора, собранного из банка,
              // и чистится при сборке: ни скриптов, ни чужих ссылок в ней не остаётся.
              <div className="ap-fipi" style={S.body} dangerouslySetInnerHTML={{ __html: task.body }} />
            ) : (
              <div style={S.text}>{task.text}</div>
            )}
            {/* Картинки лежат отдельно только тогда, когда в разметке их не оказалось:
                иначе рисунок был бы показан дважды. */}
            {(task.pictures || []).map((p, i) => (
              <img key={i} src={p.data} alt="" style={S.picture} />
            ))}

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

            <div style={S.underRow}>
              {!result && <button onClick={next} className="ap-row" style={S.skip}>Пропустить</button>}
              <button
                onClick={() => mark("broken")}
                className="ap-row"
                style={{ ...S.report, ...(myBroken ? S.reportOn : null) }}
                title="Условие показано криво, непонятно или не хватает рисунка"
              >
                {myBroken ? "Пожаловались на задание ✓" : "Пожаловаться на задание"}
              </button>
            </div>

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
                {task.sure && <div style={S.doubt}>Уверенность в ключе неполная — {task.sure}</div>}
              </div>
            )}

            {result && (
              <div style={S.keyBox}>
                <div style={{ ...S.keyState, ...(key.state === "disputed" ? S.keyBad : key.state === "confirmed" || key.state === "agreed" ? S.keyOk : S.keyWarn) }}>
                  {key.state === "confirmed"
                    ? "Сверен с банком" + (key.fipiOk > 1 ? ", подтвердили " + key.fipiOk : "")
                    : key.state === "agreed"
                      ? "Ответ сошёлся у " + key.agree + " " + peopleWord(key.agree) + " — похоже, ключ верный"
                      : key.state === "disputed"
                        ? key.fipiAnswer
                          ? "Спорный: на ФИПИ засчитан ответ «" + key.fipiAnswer.answer + "»"
                          : key.fipiBad
                            ? "Спорный: банк ответил иначе"
                            : "Спорный: чаще отвечают «" + (key.rival ? key.rival.answer : "") + "»"
                        : "Решён нами, не сверен" +
                          (key.agree > 1 ? " · сошёлся у " + key.agree : "") +
                          " · нужно ещё " + key.need}
                </div>

                {sentFromBank ? (
                  <div style={S.sent}>
                    <div>
                      Ответ с ФИПИ записан: <b>{sentFromBank}</b>.{" "}
                      {isRight(task, sentFromBank)
                        ? "Он сошёлся с нашим ключом — значит, ключ верный."
                        : "Он расходится с нашим ключом — ключ поправим по твоему ответу."}
                    </div>
                    <button onClick={() => mark(myMark.kind)} className="ap-row" style={S.again}>
                      Отменить и вписать заново
                    </button>
                  </div>
                ) : (
                  <>
                    <p style={S.keyNote}>
                      Банк правильный ответ не показывает: он только говорит «верно» или «неверно».
                      Поэтому ответ здесь решён нами — и точнее всего его проверяет тот, кто сходил в банк.
                    </p>
                    <ol style={S.steps}>
                      <li>
                        Открой банк и найди задание <b>№ {task.id}</b> — номер там тот же.
                      </li>
                      <li>Впиши свой ответ и нажми «Ответить»: банк скажет «ВЕРНО» или «НЕВЕРНО».</li>
                      <li>Тот ответ, который банк засчитал, впиши сюда — по нему мы и поправим ключ.</li>
                    </ol>
                    <div style={S.bankRow}>
                      <input
                        value={fromBank}
                        onChange={(e) => setFromBank(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && sendFromBank()}
                        placeholder="Ответ, который засчитал банк"
                        style={S.bankInput}
                        aria-label="Ответ, который засчитал банк ФИПИ"
                      />
                      <button
                        onClick={sendFromBank}
                        className="ap-btn"
                        style={{ ...S.primary, ...(fromBank.trim() ? null : S.primaryOff) }}
                        disabled={!fromBank.trim()}
                      >
                        Отправить
                      </button>
                      <a href={BANK_URL} target="_blank" rel="noreferrer" style={S.bankLink}>Открыть банк</a>
                    </div>
                    <div style={S.orRow}>
                      <span style={S.orText}>Не хочешь вписывать ответ — отметь хотя бы, что сказал банк:</span>
                      <button
                        onClick={() => mark("ok")}
                        className="ap-row"
                        style={{ ...S.keyBtn, ...(myMark && myMark.kind === "ok" ? S.keyBtnOn : null) }}
                      >
                        Банк засчитал наш ответ
                      </button>
                      <button
                        onClick={() => mark("wrong")}
                        className="ap-row"
                        style={{ ...S.keyBtn, ...(myMark && myMark.kind === "wrong" ? S.keyBtnOn : null) }}
                      >
                        В банке ответ другой
                      </button>
                    </div>
                  </>
                )}

                {key.fipiAnswer && (!sentFromBank || normalizeAnswer(key.fipiAnswer.answer) !== normalizeAnswer(sentFromBank)) && (
                  <p style={S.fromClass}>
                    Из банка уже присылали ответ <b>{key.fipiAnswer.answer}</b>
                    {key.fipiAnswer.count > 1 ? " — " + key.fipiAnswer.count + " раза" : ""}.
                  </p>
                )}
                {!takesBankAnswer && (
                  <p style={S.fromClass}>
                    Общая копилка ещё не знает про ответы с ФИПИ — отметка сохранится на этом устройстве.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </section>

      <section className="ap-card" style={styles.card}>
        <div style={styles.cardTitle}>Как идут дела · {subject.toLowerCase()}</div>
        <div style={S.shared}>
          {shared === "ready"
            ? "Общий счёт ответов подключён: ключи проверяются всем классом" +
              (votes.length ? " · записей в копилке: " + votes.length : " · пока пусто")
            : shared === "missing"
              ? "Общей копилки ответов в базе нет — счёт идёт только по твоим ответам"
              : shared === "error"
                ? "Общая копилка ответов не отвечает — счёт идёт только по твоим ответам"
                : "Вход не выполнен — счёт идёт только по твоим ответам"}
        </div>

        <div style={S.stats}>
          <div style={S.stat}><span style={S.statValue}>{stats.done}</span><span style={S.statName}>прорешано</span></div>
          <div style={S.stat}><span style={S.statValue}>{stats.percent}%</span><span style={S.statName}>верных</span></div>
          <div style={S.stat}><span style={S.statValue}>{stats.averageSeconds ? timeWord(stats.averageSeconds) : "—"}</span><span style={S.statName}>в среднем</span></div>
          <div style={S.stat}><span style={S.statValue}>{streak}</span><span style={S.statName}>подряд верно</span></div>
          <div style={S.stat}><span style={S.statValue}>{queue.length}</span><span style={S.statName}>осталось в наборе</span></div>
        </div>

        {bankAnswers.length > 0 && (
          <div style={S.collected}>
            <div style={S.collectedTop}>
              <div style={S.disputedTitle}>Ответы с ФИПИ — собрано {bankAnswers.length}</div>
              <button onClick={copyBankAnswers} className="ap-row" style={S.keyBtn}>Скопировать список</button>
            </div>
            <p style={S.collectedNote}>
              Это ответы, которые засчитал сам банк. Те, что разошлись с нашими, — прямая подсказка,
              какие ключи править. Перешли список — и они поправятся для всех.
            </p>
            {bankAnswers.map((r) => (
              <div key={r.task.id} style={S.disputedRow}>
                <span style={S.code}>№ {r.task.id}</span>
                <span style={S.disputedText}>{r.task.text.slice(0, 70)}…</span>
                <span style={{ ...S.disputedAnswer, ...(r.same ? null : S.differs) }}>
                  {r.same ? "совпал: " + r.answer : "ФИПИ: " + r.answer + " · у нас: " + r.task.answer}
                </span>
              </div>
            ))}
            {copied && <div style={S.copied}>{copied}</div>}
          </div>
        )}

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

        {broken.length > 0 && (
          <div style={S.disputed}>
            <div style={S.disputedTitle}>Задания, на которые пожаловались — их надо переснять или переписать</div>
            {broken.map((t) => (
              <div key={t.id} style={S.disputedRow}>
                <span style={S.code}>№ {t.id}</span>
                <span style={S.disputedText}>{t.text.slice(0, 80)}…</span>
              </div>
            ))}
          </div>
        )}

        <p style={S.source}>{BANK_SOURCE}</p>
      </section>
    </>
  );
}

function taskWord(n) {
  const last = n % 10;
  const two = n % 100;
  if (two >= 11 && two <= 14) return "заданий";
  if (last === 1) return "задание";
  if (last >= 2 && last <= 4) return "задания";
  return "заданий";
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
  subject: {
    display: "inline-flex", alignItems: "center", gap: 6, border: "1px solid var(--line)",
    background: "var(--panel)", color: "var(--ink2)", borderRadius: 10, padding: "8px 15px",
    font: "inherit", fontSize: 14.5, cursor: "pointer",
  },
  subjectOn: { background: "var(--btnBg)", color: "var(--btnInk)", borderColor: "var(--btnBg)", fontWeight: 600 },
  moved: {
    border: "1px solid var(--line2)", background: "var(--panel2)", borderRadius: 10,
    padding: "10px 13px", marginBottom: 12,
  },
  movedTop: {
    display: "flex", alignItems: "baseline", gap: 10, justifyContent: "space-between",
    fontSize: 13.5, color: "var(--ink2)", lineHeight: 1.5,
  },
  movedPart: { fontVariantNumeric: "tabular-nums", fontWeight: 600, color: "var(--ink3)", flex: "0 0 auto" },
  bar: { height: 6, borderRadius: 999, background: "var(--line2)", overflow: "hidden", margin: "8px 0 0" },
  barFill: { height: "100%", borderRadius: 999, background: "var(--btnBg)" },
  movedNote: { fontSize: 12, color: "var(--mute)", lineHeight: 1.5, marginTop: 7 },
  alpha: {
    border: "1px solid var(--warmLine)", background: "var(--warmBg)", color: "var(--warmInk)",
    borderRadius: 10, padding: "11px 14px", fontSize: 13.5, lineHeight: 1.55, marginBottom: 14,
  },
  picture: {
    display: "block", maxWidth: "100%", height: "auto", margin: "0 0 12px",
    background: "#fff", border: "1px solid var(--line2)", borderRadius: 8, padding: 6,
  },
  doubt: { marginTop: 7, fontSize: 12.5, color: "var(--mute)", lineHeight: 1.5 },

  task: { border: "1px solid var(--line2)", borderRadius: 12, padding: "14px 15px", background: "var(--panel2)" },
  head: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 4 },
  code: {
    fontFamily: "ui-monospace, monospace", fontSize: 12.5, fontWeight: 600, letterSpacing: "0.03em",
    border: "1px solid var(--line2)", borderRadius: 6, padding: "2px 7px", color: "var(--ink2)",
  },
  headSection: { fontSize: 12.5, color: "var(--ink3)" },
  clock: { marginLeft: "auto", fontVariantNumeric: "tabular-nums", fontSize: 15, fontWeight: 600, color: "var(--ink2)" },
  kes: {
    fontSize: 12, color: "var(--mute)", marginBottom: 8, lineHeight: 1.45,
    display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
  },
  lead: { fontSize: 13, color: "var(--ink3)", marginBottom: 6 },
  text: { fontSize: 15, lineHeight: 1.6, whiteSpace: "pre-wrap", marginBottom: 14 },
  body: { marginBottom: 14 },

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
  underRow: { display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", marginTop: 9 },
  skip: {
    border: "none", background: "none", color: "var(--mute)", font: "inherit",
    fontSize: 13, cursor: "pointer", padding: 0,
  },
  report: {
    marginLeft: "auto", border: "none", background: "none", color: "var(--mute)", font: "inherit",
    fontSize: 13, cursor: "pointer", padding: 0, textDecoration: "underline", textUnderlineOffset: 3,
  },
  reportOn: { color: "var(--ink2)", textDecoration: "none", fontWeight: 600 },

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
  ask: {
    fontSize: 13, lineHeight: 1.55, color: "var(--ink2)", margin: "0 0 10px",
    borderLeft: "3px solid var(--warmLine)", paddingLeft: 10,
  },
  steps: { fontSize: 13, lineHeight: 1.6, color: "var(--ink2)", margin: "0 0 10px", paddingLeft: 20 },
  bankRow: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 },
  // Поле пошире самого ответа: на телефоне оно должно уходить на свою строку,
  // а не сжиматься до «Ответ, который за…».
  bankInput: {
    flex: "1 1 240px", minWidth: 0, border: "1px solid var(--line)", borderRadius: 9, padding: "9px 12px",
    font: "inherit", fontSize: 15, background: "var(--panel)", color: "var(--ink)",
  },
  primaryOff: { opacity: 0.45, cursor: "default" },
  orRow: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
  orText: { fontSize: 12.5, color: "var(--mute)", flex: "1 1 100%" },
  sent: {
    display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap",
    fontSize: 13.5, lineHeight: 1.55, color: "var(--ink2)", margin: "9px 0 0",
  },
  again: {
    border: "none", background: "none", color: "var(--ink3)", font: "inherit", fontSize: 12.5,
    textDecoration: "underline", cursor: "pointer", padding: 0,
  },
  fromClass: { fontSize: 12.5, color: "var(--mute)", lineHeight: 1.5, margin: "9px 0 0" },
  collected: {
    marginTop: 16, border: "1px solid var(--line2)", borderRadius: 10, padding: "11px 13px",
    background: "var(--panel2)",
  },
  collectedTop: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", justifyContent: "space-between" },
  collectedNote: { fontSize: 12.5, color: "var(--mute)", lineHeight: 1.5, margin: "7px 0 10px" },
  differs: { color: "var(--ink)", fontWeight: 600 },
  copied: { fontSize: 12.5, color: "var(--ink3)", marginTop: 9 },
  keyButtons: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" },
  keyBtn: {
    border: "1px solid var(--line2)", background: "var(--panel)", color: "var(--ink2)", borderRadius: 8,
    padding: "7px 12px", font: "inherit", fontSize: 13, cursor: "pointer",
  },
  keyBtnOn: { borderColor: "var(--ink)", color: "var(--ink)", fontWeight: 600 },
  bankLink: { fontSize: 13, color: "var(--ink3)" },

  shared: {
    fontSize: 12.5, color: "var(--mute)", lineHeight: 1.5, marginBottom: 12,
    borderLeft: "3px solid var(--line)", paddingLeft: 9,
  },
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
