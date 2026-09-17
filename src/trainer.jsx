import React, { useEffect, useMemo, useRef, useState } from "react";
import { BANK_SOURCE, BANK_SUBJECTS, BANK_URL } from "./fipi-index.js";
import { loadBank, withBase } from "./bank-load.js";
import { AGREE_NEEDED, TOP_MIN, consensus, isRight, myVote, normalizeAnswer, streakOf, timeWord, topByPercent, topPeople, trainerStats } from "./bank-answer.js";
import { loadVotes, myUserId, saveVote, votesState, votesTakeBankAnswer, votesTakeName } from "./bank-votes.js";

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

export default function Trainer({ log, marks, state, onState, onAttempt, onMark, styles }) {
  // Что открыто: имя предмета, «Все предметы» или пусто — тогда показан выбор.
  // Этот выбор хранится вместе с остальными записями, поэтому приложение
  // открывается там же, где его закрыли, — хоть на другом устройстве.
  const open = (state && state.open) || "";
  const [section, setSection] = useState((state && state.section) || "");
  // Какие задания в наборе: "" — только нерешённые, "all" — все подряд,
  // "wrong" — те, где последний ответ был неверным. Прежние записи знали лишь
  // «again», поэтому его продолжаем понимать.
  const [mode, setMode] = useState((state && state.mode) || (state && state.again ? ALL_MODE : ""));
  // Задания открытого предмета. null — ещё грузятся или не загрузились.
  const [tasks, setTasks] = useState(null);
  const [failed, setFailed] = useState(false);
  // Какое задание на экране. Держим именно его, а не позицию в списке: стоит
  // ответить верно, как решённое задание уходит из набора, список сдвигается —
  // и на месте разобранного задания оказывается следующее, а разбор под ним
  // остаётся от предыдущего. По номеру такого не бывает.
  const [currentId, setCurrentId] = useState((state && state.taskId) || "");
  const [value, setValue] = useState("");
  const [result, setResult] = useState(null);
  // Что человек списал с ФИПИ: ответ, который банк там засчитал.
  const [fromBank, setFromBank] = useState("");
  const [copied, setCopied] = useState("");
  // Голоса класса: чужие ответы на те же задания. Без облака список пустой —
  // тогда виден только свой голос, и тренажёр от этого не ломается.
  const [votes, setVotes] = useState([]);
  const [me, setMe] = useState("");
  // Имя для таблицы решающих. Хранится вместе с остальными записями, поэтому
  // переезжает на другое устройство само, и едет с каждым ответом в копилку.
  const myName = (state && state.name) || "";
  const [nameDraft, setNameDraft] = useState(myName);
  const [shared, setShared] = useState("off");

  // Набор грузится, когда предмет открыли, и остаётся в памяти: переключаться
  // между предметами после этого мгновенно.
  useEffect(() => {
    if (!open) { setTasks(null); setFailed(false); return undefined; }
    let alive = true;
    setFailed(false);
    const card = BANK_SUBJECTS.find((s) => s.name === open);
    if (!card) { setFailed(true); setTasks(null); return undefined; }
    loadBank(card.file).then((list) => {
      if (!alive) return;
      if (list === null) { setFailed(true); setTasks(null); return; }
      setTasks(list);
    });
    return () => { alive = false; };
  }, [open]);

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

  const mine = useMemo(() => tasks || [], [tasks]);
  const sections = useMemo(
    () => [...new Set(mine.map((t) => t.section))].sort((a, b) => a.localeCompare(b, "ru")),
    [mine],
  );
  const subject = open;
  const card = BANK_SUBJECTS.find((s) => s.name === subject);
  // Сколько заданий по этому предмету всего в банке ФИПИ и какую часть мы уже перенесли.
  const whole = (card && card.whole) || 0;
  const percent = whole ? Math.max(0.1, (mine.length / whole) * 100).toFixed(1).replace(".0", "").replace(".", ",") : "";

  // Что человек уже одолел: по последней попытке, тренируются ведь до победы.
  const solved = useMemo(() => {
    const last = new Map();
    (log || []).forEach((a) => last.set(a.taskId, a.ok));
    const out = new Set();
    last.forEach((ok, id) => ok && out.add(id));
    return out;
  }, [log]);

  // Задания, где последний ответ был неверным. Именно последний: если потом
  // разобрался и ответил верно, перерешивать нечего.
  const wrong = useMemo(() => {
    const last = new Map();
    (log || []).forEach((a) => last.set(a.taskId, a.ok));
    const out = new Set();
    last.forEach((ok, id) => !ok && out.add(id));
    return out;
  }, [log]);

  const queue = useMemo(() => {
    const fits = (t) => (mode === WRONG_MODE ? wrong.has(t.id) : mode === ALL_MODE ? true : !solved.has(t.id));
    return mine.filter((t) => (!section || t.section === section) && fits(t));
  }, [mine, section, mode, solved, wrong]);

  const task = (currentId && mine.find((t) => t.id === currentId)) || queue[0] || null;
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
      const t = mine.find((x) => x.id === m.taskId);
      if (t && !out.some((x) => x.id === t.id)) out.push(t);
    });
    return out;
  }, [marks, mineIds, mine]);

  // Ответы, которые засчитал сам банк: и свои, и присланные классом. Это и есть
  // список правок для ключей — его переносят в набор заданий руками.
  const bankAnswers = useMemo(() => {
    const rows = new Map();
    const put = (taskId, answer) => {
      if (!mineIds.has(taskId) || !answer) return;
      const t = mine.find((x) => x.id === taskId);
      if (!t) return;
      const was = rows.get(taskId);
      if (!was) rows.set(taskId, { task: t, answer, count: 1, same: isRight(t, answer) });
      else if (normalizeAnswer(was.answer) === normalizeAnswer(answer)) was.count += 1;
    };
    (marks || []).forEach((m) => put(m.taskId, m.fipiAnswer));
    (votes || []).forEach((v) => put(v.taskId, v.fipiAnswer));
    return [...rows.values()].sort((a, b) => Number(a.same) - Number(b.same) || a.task.id.localeCompare(b.task.id));
  }, [marks, votes, mineIds, mine]);

  const disputed = useMemo(() => {
    const out = [];
    (marks || []).forEach((m) => {
      if (m.kind !== "wrong" || !mineIds.has(m.taskId)) return;
      const t = mine.find((x) => x.id === m.taskId);
      if (t && !out.some((x) => x.task.id === t.id)) out.push({ task: t, mark: m });
    });
    return out;
  }, [marks, mineIds, mine]);

  function answer() {
    if (!task || result) return;
    const ok = isRight(task, value);
    const seconds = Math.round(watch.read());
    setResult({ ok, seconds });
    // Задание закрепляем за собой прямо сейчас. Пока на него не ответили, оно
    // бралось первым из очереди, — а верный ответ убирает его из очереди, и на
    // экране молча оказывалось следующее: ни разбора прочитать, ни ответ с ФИПИ
    // вписать. Так уезжало первое же задание после «Начать тест».
    if (currentId !== task.id) {
      setCurrentId(task.id);
      onState({ open, section, taskId: task.id, again: mode === ALL_MODE, mode });
    }
    onAttempt({ taskId: task.id, answer: value, ok, seconds });
    // Ответ уходит в общую копилку: по таким совпадениям и проверяются ключи.
    saveVote({ taskId: task.id, answer: value, matches: ok, fipi: myMark ? myMark.kind : "", name: myName })
      .then((sent) => sent && loadVotes(true).then(setVotes));
  }

  // Отметка о том, что сказал банк. byButton — нажали кнопку (её же нажатием
  // можно и передумать), иначе ответ вписали руками.
  function mark(kind, bankAnswer, byButton) {
    if (!task) return;
    const entry = { taskId: task.id, kind };
    if (bankAnswer) entry.fipiAnswer = bankAnswer;
    if (byButton) entry.byButton = true;
    onMark(entry);
    // «Криво показано» — жалоба на задание, а не ответ банка, поэтому в общий
    // счёт ключей она не уходит.
    if (kind === "broken") return;
    // Повторное нажатие той же кнопки снимает отметку — значит и голос снимаем.
    const same = byButton && myMark && myMark.kind === kind;
    saveVote({
      taskId: task.id,
      answer: value,
      matches: !!(result && result.ok),
      fipi: same ? "" : kind,
      fipiAnswer: same ? "" : bankAnswer || (myMark && myMark.fipiAnswer) || "",
      name: myName,
    }).then((sent) => sent && loadVotes(true).then(setVotes));
  }

  // Ответ, списанный с ФИПИ. Сходится он с нашим ключом или нет — решаем здесь:
  // человеку об этом думать не надо, он просто переписал то, что засчитал банк.
  function sendFromBank() {
    if (!task) return;
    const typed = fromBank.trim();
    if (!typed) return;
    mark(isRight(task, typed) ? "ok" : "wrong", typed, false);
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
    onState({ open, section, taskId: pick ? pick.id : "", again: mode === ALL_MODE, mode });
  }

  // Открыть набор предмета.
  //
  // «all» — идти по всем заданиям предмета подряд, включая уже решённые, а не
  // только по новым. «reset» — начать с самого первого задания, а не с того,
  // где остановились. Сами записи о решённом при этом целы: «заново» — это про
  // порядок показа, а не про то, чтобы стереть сделанное.
  function start(name, want, reset) {
    const back = !reset && state && state.open === name ? state.taskId || "" : "";
    setSection("");
    setMode(want || "");
    setCurrentId(back);
    setResult(null);
    setValue("");
    setFromBank("");
    onState({ open: name, section: "", taskId: back, again: want === ALL_MODE, mode: want });
  }

  function leave() {
    setResult(null);
    setValue("");
    setFromBank("");
    setCurrentId("");
    onState({ open: "", section: "", taskId: "", again: false, mode: "" });
  }

  function pickSection(name) {
    setSection(name);
    onState({ open, section: name, taskId: "", again: mode === ALL_MODE, mode });
    setCurrentId("");
    setResult(null);
    setValue("");
    setFromBank("");
  }

  // Сколько заданий предмета уже решено — считается по описи, без загрузки
  // самого набора: выбор предмета должен открываться мгновенно.
  const doneIn = (ids) => {
    const set = new Set(ids);
    let n = 0;
    solved.forEach((id) => set.has(id) && (n += 1));
    return n;
  };

  // Итог по всем предметам сразу: на экране выбора он и нужен — пока предмет
  // не открыт, набор ещё не загружен, и считать можно только по описи.
  const allIds = useMemo(() => {
    const set = new Set();
    BANK_SUBJECTS.forEach((s) => (s.ids || []).forEach((id) => set.add(id)));
    return set;
  }, []);
  const allStats = useMemo(() => trainerStats(log, allIds), [log, allIds]);
  const allCount = useMemo(() => BANK_SUBJECTS.reduce((n, s) => n + s.count, 0), []);
  const allSeconds = useMemo(
    () => (log || []).filter((a) => allIds.has(a.taskId)).reduce((n, a) => n + (Number(a.seconds) || 0), 0),
    [log, allIds],
  );

  // Таблица решающих — по той же общей копилке, что и согласие класса.
  const people = useMemo(() => topPeople(votes, me), [votes, me]);
  const byPercent = useMemo(() => topByPercent(people), [people]);
  const myRow = people.find((r) => r.mine) || null;

  // Сколько заданий предмета остались неверными — тоже по описи.
  const wrongIn = (ids) => {
    const set = new Set(ids);
    let n = 0;
    wrong.forEach((id) => set.has(id) && (n += 1));
    return n;
  };

  if (!BANK_SUBJECTS.length) return null;

  // --- выбор предмета ------------------------------------------------------
  if (!open) {
    return (
      <section className="ap-card" style={styles.card}>
        <div style={S.alpha}>
          <b>Это альфа-версия, и ответы здесь решены нами, а не взяты у ФИПИ</b> — банк правильный ответ не
          показывает, он только говорит «верно» или «неверно». Значит, ошибки в ключах не исключение, а дело
          времени. Если ты проверил задание в банке — впиши под разбором тот ответ, который банк засчитал.
          Такой ответ сейчас ценнее любого решённого задания: по нему ключи и правятся.
        </div>

        <div style={S.picker}>
          {BANK_SUBJECTS.map((s) => {
            const done = doneIn(s.ids);
            const missed = wrongIn(s.ids);
            return (
              <div key={s.name} style={S.pick}>
                <div style={S.pickTop}>
                  <span style={S.pickName}>{s.name}</span>
                  <span style={S.pickCount}>{s.count} {taskWord(s.count)}</span>
                </div>
                {/* Сколько заданий предмета уже перенесено из банка: у него там
                    тысячи, и без этой строчки «68 заданий» выглядит как весь банк. */}
                {s.whole ? (
                  <div style={S.pickWhole}>
                    Перенесено из банка ФИПИ: {s.count} из {s.whole} —{" "}
                    {Math.max(0.1, (s.count / s.whole) * 100).toFixed(1).replace(".0", "").replace(".", ",")}%
                  </div>
                ) : null}
                <div style={S.pickLine}>
                  {done
                    ? "Решено " + done + " из " + s.count + (done === s.count ? " — весь набор пройден" : "") +
                      (missed ? " · неверных " + missed : "")
                    : missed
                      ? "Неверных " + missed + " " + taskWord(missed)
                      : "Ещё не начинали"}
                </div>
                {done ? (
                  <div style={S.bar}><div style={{ ...S.barFill, width: Math.max(2, (done / s.count) * 100) + "%" }} /></div>
                ) : null}
                <div style={S.pickButtons}>
                  <button onClick={() => start(s.name, "", false)} className="ap-btn" style={S.primary}>
                    {done ? "Продолжить" : "Начать тест"}
                  </button>
                  <button onClick={() => start(s.name, ALL_MODE, false)} className="ap-row" style={S.keyBtn}>
                    Решать все задания подряд
                  </button>
                  {missed ? (
                    <button onClick={() => start(s.name, WRONG_MODE, true)} className="ap-row" style={S.keyBtn}>
                      Перерешать неверные ({missed})
                    </button>
                  ) : null}
                  {done ? (
                    <button onClick={() => start(s.name, ALL_MODE, true)} className="ap-row" style={S.keyBtn}>Пройти заново</button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>

        <div style={S.pickHint}>
          «Начать тест» — только то, что ещё не решено, и можно выбрать раздел.
          «Все задания подряд» — весь предмет целиком, вместе с уже решённым.
          «Перерешать неверные» — те, где последний ответ был неверным.
        </div>

        {/* Итог по всем предметам сразу: по отдельным карточкам его не собрать. */}
        {allStats.done ? (
          <div style={S.allStats}>
            <div style={S.allTitle}>Всего в тренажёре</div>
            <div style={S.stats}>
              <div style={S.stat}><span style={S.statValue}>{allStats.done}</span><span style={S.statName}>из {allCount} решено</span></div>
              <div style={S.stat}><span style={S.statValue}>{allStats.percent}%</span><span style={S.statName}>верных</span></div>
              <div style={S.stat}><span style={S.statValue}>{timeWord(allSeconds)}</span><span style={S.statName}>за секундомером</span></div>
              <div style={S.stat}>
                <span style={S.statValue}>{allStats.averageSeconds ? timeWord(allStats.averageSeconds) : "—"}</span>
                <span style={S.statName}>на задание</span>
              </div>
            </div>
          </div>
        ) : null}

        {/* Таблица решающих. Её видно только тем, кто вошёл в облако: считается
            она по общей копилке ответов, а без входа копилки нет. */}
        {people.length > 1 ? (
          <div style={S.allStats}>
            <div style={S.allTitle}>Кто сколько решил</div>
            <div style={S.topNote}>
              Считается по общей копилке ответов: у каждого своя строка на задание.
              {votesTakeName()
                ? " Имя можно поменять — оно поедет со следующим ответом."
                : " Имена появятся, когда в базу добавят столбец name — пока все под короткими кодами."}
            </div>
            {votesTakeName() ? (
              <div style={S.nameRow}>
                <input
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  placeholder="Как тебя показывать"
                  maxLength={40}
                  style={S.nameInput}
                  aria-label="Имя в таблице решающих"
                />
                <button
                  onClick={() => onState({ ...(state || {}), name: nameDraft.trim() })}
                  className="ap-row"
                  style={S.keyBtn}
                  disabled={nameDraft.trim() === myName}
                >
                  Сохранить имя
                </button>
              </div>
            ) : null}
            <ol style={S.top}>
              {people.slice(0, 10).map((r) => (
                <li key={r.userId} style={{ ...S.topRow, ...(r.mine ? S.topMine : null) }}>
                  <span style={S.topPlace}>{r.place}</span>
                  <span style={S.topName}>{r.label}{r.mine ? " — это ты" : ""}</span>
                  <span style={S.topDone}>{r.done} {taskWord(r.done)}</span>
                  <span style={S.topPercent}>{r.percent}% верных</span>
                </li>
              ))}
            </ol>
            {myRow && myRow.place > 10 ? (
              <div style={S.topNote}>Ты на {myRow.place}-м месте: {myRow.done} {taskWord(myRow.done)}, {myRow.percent}% верных.</div>
            ) : null}
            {byPercent.length > 1 ? (
              <div style={S.topNote}>
                По доле верных впереди <b>{byPercent[0].label}</b> — {byPercent[0].percent}% на {byPercent[0].done}{" "}
                {taskWord(byPercent[0].done)}. В этот счёт берём тех, кто решил хотя бы {TOP_MIN}: сто процентов
                с двух заданий — не результат.
              </div>
            ) : null}
          </div>
        ) : null}

        <p style={S.source}>{BANK_SOURCE}</p>
      </section>
    );
  }

  // --- набор ещё грузится или не пришёл ------------------------------------
  if (failed) {
    return (
      <section className="ap-card" style={styles.card}>
        <div style={styles.cardTitle}>{open}</div>
        <p style={styles.cardNote}>
          Задания не загрузились. Если сети нет, набор откроется только после того, как его
          хоть раз открывали с интернетом.
        </p>
        <button onClick={leave} className="ap-row" style={S.keyBtn}>К выбору предмета</button>
      </section>
    );
  }
  if (!tasks) {
    return (
      <section className="ap-card" style={styles.card}>
        <div style={styles.cardTitle}>{open}</div>
        <p style={styles.cardNote}>Задания загружаются…</p>
      </section>
    );
  }

  return (
    <>
      <section className="ap-card" style={styles.card}>
        <div style={S.head0}>
          <div style={styles.cardTitle}>{open}</div>
          <button onClick={leave} className="ap-row" style={S.back}>К выбору предмета</button>
        </div>

        {(
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
        )}

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
          <input
            type="checkbox"
            checked={mode === ""}
            onChange={(e) => {
              const want = e.target.checked ? "" : ALL_MODE;
              setMode(want);
              setCurrentId("");
              setResult(null);
              setValue("");
              onState({ open, section, taskId: "", again: want === ALL_MODE, mode: want });
            }}
          />
          Только нерешённые
          <span style={S.onlyCount}>
            {mode === WRONG_MODE
              ? "показаны только неверно решённые — " + queue.length + " " + taskWord(queue.length)
              : "решено " + doneIn(mine.map((t) => t.id)) + " из " + mine.length}
          </span>
        </label>

        {!task ? (
          <p style={styles.muted}>
            {mode === WRONG_MODE
              ? "Неверно решённых заданий здесь не осталось — всё разобрано."
              : mode === ""
                ? "В этом разделе решено всё. Снимите галочку, чтобы решать заново."
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
              <div className="ap-fipi" style={S.body} dangerouslySetInnerHTML={{ __html: withBase(task.body) }} />
            ) : (
              <div style={S.text}>{task.text}</div>
            )}
            {/* Картинки лежат отдельно только тогда, когда в разметке их не оказалось:
                иначе рисунок был бы показан дважды. */}
            {(task.pictures || []).map((p, i) => (
              <img key={i} src={withBase('src="' + p.src + '"').slice(5, -1)} alt="" style={S.picture} />
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
                onClick={() => mark("broken", "", true)}
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

                {sentFromBank && !isRight(task, sentFromBank) ? (
                  <div style={S.sent}>
                    <div>
                      Ответ с ФИПИ записан: <b>{sentFromBank}</b>.{" "}
                      {isRight(task, sentFromBank)
                        ? "Он сошёлся с нашим ключом — значит, ключ верный."
                        : "Он расходится с нашим ключом — ключ поправим по твоему ответу."}
                    </div>
                    <button onClick={() => mark(myMark.kind, "", true)} className="ap-row" style={S.again}>
                      Отменить и вписать заново
                    </button>
                  </div>
                ) : (
                  <>
                    <p style={S.keyNote}>
                      Банк правильный ответ не показывает: он только говорит «верно» или «неверно».
                      Поэтому ответ здесь решён нами — и точнее всего его проверяет тот, кто сходил в банк.
                    </p>
                    {sentFromBank && (
                      <div style={S.sentLine}>
                        Ответ с ФИПИ записан: <b>{sentFromBank}</b> — он сошёлся с нашим ключом,
                        значит ключ верный. Передумал? Нажми ту же кнопку ещё раз.
                      </div>
                    )}
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
                      <span style={S.orText}>
                        Если банк засчитал наш ответ, вписывать ничего не надо — нажми кнопку, и ответ
                        уйдёт в копилку сам:
                      </span>
                      <button
                        // Раз банк засчитал наш ответ, то ответ с ФИПИ — он и есть.
                        // Вписывать его второй раз руками незачем.
                        onClick={() => mark("ok", task.answer, true)}
                        className="ap-row"
                        style={{ ...S.keyBtn, ...(myMark && myMark.kind === "ok" ? S.keyBtnOn : null) }}
                      >
                        Банк засчитал наш ответ
                      </button>
                      <button
                        onClick={() => mark("wrong", "", true)}
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
          <div style={S.stat}><span style={S.statValue}>{stats.done}</span><span style={S.statName}>решено</span></div>
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

// Ключ режима «все предметы сразу»: в этом случае грузятся все наборы.

const ALL_MODE = "all";
const WRONG_MODE = "wrong";

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
  sentLine: {
    fontSize: 12.5, lineHeight: 1.5, color: "var(--ink)", background: "var(--panel)",
    border: "1px solid var(--line)", borderRadius: 10, padding: "8px 10px", margin: "0 0 10px",
  },
  sent: {
    display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap",
    fontSize: 13.5, lineHeight: 1.55, color: "var(--ink2)", margin: "9px 0 0",
  },
  again: {
    border: "none", background: "none", color: "var(--ink3)", font: "inherit", fontSize: 12.5,
    textDecoration: "underline", cursor: "pointer", padding: 0,
  },
  fromClass: { fontSize: 12.5, color: "var(--mute)", lineHeight: 1.5, margin: "9px 0 0" },
  picker: { display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", marginBottom: 14 },
  pick: { border: "1px solid var(--line2)", borderRadius: 12, padding: "12px 14px", background: "var(--panel2)" },
  pickTop: { display: "flex", alignItems: "baseline", gap: 8, justifyContent: "space-between" },
  pickName: { fontSize: 16, fontWeight: 600, color: "var(--ink)" },
  pickCount: { fontSize: 12.5, color: "var(--mute)", flex: "0 0 auto" },
  pickLine: { fontSize: 13, color: "var(--ink3)", margin: "6px 0 0" },
  pickButtons: { display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 },
  pickHint: { fontSize: 12.5, color: "var(--mute)", lineHeight: 1.5, marginTop: 12 },
  pickWhole: { fontSize: 12, color: "var(--mute)", marginTop: 2 },
  allStats: { marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--line)" },
  allTitle: { fontFamily: "'PT Serif', Georgia, serif", fontSize: 16, marginBottom: 8 },
  topNote: { fontSize: 12.5, color: "var(--mute)", lineHeight: 1.5, marginTop: 8 },
  nameRow: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", margin: "10px 0" },
  nameInput: {
    flex: "1 1 200px", minWidth: 0, padding: "7px 10px", fontSize: 13.5, fontFamily: "inherit",
    color: "var(--ink)", background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 8,
  },
  top: { listStyle: "none", margin: "10px 0 0", padding: 0, display: "flex", flexDirection: "column", gap: 4 },
  topRow: {
    display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap",
    padding: "6px 10px", borderRadius: 8, fontSize: 13.5,
  },
  topMine: { background: "var(--panel)", border: "1px solid var(--line)" },
  topPlace: { minWidth: 18, color: "var(--mute)", fontVariantNumeric: "tabular-nums" },
  topName: { flex: "1 1 120px" },
  topDone: { color: "var(--mute)", fontVariantNumeric: "tabular-nums" },
  topPercent: { color: "var(--mute)", fontVariantNumeric: "tabular-nums", minWidth: 86, textAlign: "right" },
  head0: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", justifyContent: "space-between", marginBottom: 10 },
  back: {
    border: "1px solid var(--line2)", background: "var(--panel)", color: "var(--ink2)", borderRadius: 8,
    padding: "6px 11px", font: "inherit", fontSize: 13, cursor: "pointer",
  },
  onlyCount: { fontSize: 12.5, color: "var(--mute)", marginLeft: "auto" },
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
