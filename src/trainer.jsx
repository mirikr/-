import React, { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { retryImport } from "./chunk-reload.js";
import { BANK_SOURCE, BANK_URL } from "./fipi-index.js";
import { TRAINER_SUBJECTS, inTrainer } from "./trainer-subjects.js";
import { loadBank, withBase } from "./bank-load.js";
import { AGREE_NEEDED, consensus, isRight, myVote, normalizeAnswer, sectionErrors, streakOf, timeWord, trainerStats } from "./bank-answer.js";
import { ORDERS, newSeed, orderTasks } from "./trainer-order.js";
import { CardHead } from "./card-head.jsx";
import { loadVotes, myUserId, saveVote, votesState, votesTakeBankAnswer } from "./bank-votes.js";
import { useStopwatch } from "./stopwatch.js";
import { VOSH_INDEX } from "./vosh-index.js";

// Тесты ВсОШ — отдельный раздел со своим видом заданий. Грузится, только когда
// его открыли: набор олимпиад с текстами весит как целый предмет банка.
const VoshTrainer = lazy(retryImport(() => import("./vosh-trainer.jsx")));
const VOSH_OPEN = "vosh";
const VOSH_IDS = VOSH_INDEX.flatMap((o) => o.ids);

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

function dayWord(n) {
  const last = n % 10;
  const tens = n % 100;
  if (tens >= 11 && tens <= 14) return "дней";
  if (last === 1) return "день";
  if (last >= 2 && last <= 4) return "дня";
  return "дней";
}

// День по местному времени: «сегодня» для школьника — это его сутки, а не UTC.
const dayKey = (d) =>
  d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
const WEEK_DAYS = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];

export default function Trainer({ log, marks, state, onState, onAttempt, onMark, styles }) {
  // Что открыто: имя предмета, «Все предметы» или пусто — тогда показан выбор.
  // Этот выбор хранится вместе с остальными записями, поэтому приложение
  // открывается там же, где его закрыли, — хоть на другом устройстве.
  // Предмет, которого в тренажёре больше нет (физика, информатика), — как если
  // бы ничего не было открыто: показываем список предметов.
  const saved = (state && state.open) || "";
  const open = saved === VOSH_OPEN || inTrainer(saved) ? saved : "";
  const [section, setSection] = useState((state && state.section) || "");
  // Какие задания в наборе: "" — только нерешённые, "all" — все подряд,
  // "wrong" — те, где последний ответ был неверным. Прежние записи знали лишь
  // «again», поэтому его продолжаем понимать.
  const [mode, setMode] = useState((state && state.mode) || (state && state.again ? ALL_MODE : ""));
  // В каком порядке идут задания: "" — как в банке, "shuffle" — вперемешку,
  // "section" — по темам, "fresh" — сначала нерешённые. Зерно перемешивания
  // хранится рядом, иначе после перезагрузки набор оказался бы другим.
  const [order, setOrder] = useState((state && state.order) || "");
  const [seed, setSeed] = useState((state && state.orderSeed) || 1);
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
  const [shared, setShared] = useState("off");
  // Итоги этого подхода — полоска из отрезков над заданием: верно, неверно,
  // ответ открыт. Живут, пока не вернулись к выбору: это «как идёт сейчас»,
  // а не журнал.
  const [session, setSession] = useState([]);
  // Учебник к олимпиаде — отдельная страница (public/olymp), открывается поверх
  // приложения. Лежит в офлайн-кэше, поэтому читается и без сети.
  const [bookOpen, setBookOpen] = useState(false);
  useEffect(() => {
    if (!bookOpen) return undefined;
    const onKey = (e) => e.key === "Escape" && setBookOpen(false);
    window.addEventListener("keydown", onKey);
    const was = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = was;
    };
  }, [bookOpen]);

  // Набор грузится, когда предмет открыли, и остаётся в памяти: переключаться
  // между предметами после этого мгновенно.
  useEffect(() => {
    if (!open || open === VOSH_OPEN) { setTasks(null); setFailed(false); return undefined; }
    let alive = true;
    setFailed(false);
    const card = TRAINER_SUBJECTS.find((s) => s.name === open);
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

  // Последняя попытка по каждому заданию — для «Мой прошлый ответ».
  const lastAttempt = useMemo(() => {
    const out = new Map();
    (log || []).forEach((a) => out.set(a.taskId, a));
    return out;
  }, [log]);
  // Прошлый ответ открыт по кнопке; на новом задании он снова свёрнут.
  const [showPrev, setShowPrev] = useState(false);

  // Весь предмет в выбранном порядке. Отбор по разделу и режиму идёт уже по
  // нему, поэтому «дальше» ведёт туда, куда показывает порядок, а не туда,
  // где задание лежит в банке.
  const ordered = useMemo(
    () => orderTasks(mine, order, { seed, solved }),
    [mine, order, seed, solved],
  );
  // Место задания в этом порядке: по нему ищется следующее.
  const orderIndex = useMemo(() => {
    const out = new Map();
    ordered.forEach((t, i) => out.set(t.id, i));
    return out;
  }, [ordered]);

  const queue = useMemo(() => {
    const fits = (t) => (mode === WRONG_MODE ? wrong.has(t.id) : mode === ALL_MODE ? true : !solved.has(t.id));
    return ordered.filter((t) => (!section || t.section === section) && fits(t));
  }, [ordered, section, mode, solved, wrong]);

  const task = (currentId && mine.find((t) => t.id === currentId)) || queue[0] || null;
  const watch = useStopwatch(task ? task.id : "нет");
  useEffect(() => setShowPrev(false), [task ? task.id : ""]);
  const prev = task && !result ? lastAttempt.get(task.id) : null;

  // Всё, что показано внизу, считается по выбранному предмету: перемешивать
  // физику с обществознанием бессмысленно — ни серия, ни доля верных так ничего
  // не значат.
  const mineIds = useMemo(() => new Set(mine.map((t) => t.id)), [mine]);
  const stats = useMemo(() => trainerStats(log, mineIds), [log, mineIds]);
  // Разбор по темам: не «неверных шесть», а в каких разделах.
  const byTheme = useMemo(() => sectionErrors(log, mine), [log, mine]);
  const weak = byTheme.filter((r) => r.wrong > 0);
  const firm = byTheme.filter((r) => r.wrong === 0);
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
    setSession((list) => list.concat(ok ? "ok" : "bad"));
    // Задание закрепляем за собой прямо сейчас. Пока на него не ответили, оно
    // бралось первым из очереди, — а верный ответ убирает его из очереди, и на
    // экране молча оказывалось следующее: ни разбора прочитать, ни ответ с ФИПИ
    // вписать. Так уезжало первое же задание после «Начать тест».
    if (currentId !== task.id) {
      setCurrentId(task.id);
      onState({ open, section, taskId: task.id, again: mode === ALL_MODE, mode, order, orderSeed: seed });
    }
    onAttempt({ taskId: task.id, answer: value, ok, seconds });
    // Ответ уходит в общую копилку: по таким совпадениям и проверяются ключи.
    saveVote({ taskId: task.id, answer: value, matches: ok, fipi: myMark ? myMark.kind : "", name: myName })
      .then((sent) => sent && loadVotes(true).then(setVotes));
  }

  // Ключ без попытки: в журнал ничего не пишется, задание остаётся нерешённым.
  // Ответить на него после этого нельзя — иначе списанный ответ засчитался бы.
  function reveal() {
    if (!task || result) return;
    setShowPrev(false);
    if (currentId !== task.id) {
      setCurrentId(task.id);
      onState({ open, section, taskId: task.id, again: mode === ALL_MODE, mode, order, orderSeed: seed });
    }
    setResult({ ok: false, seconds: 0, revealed: true });
    setSession((list) => list.concat("open"));
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
    const here = task && orderIndex.has(task.id) ? orderIndex.get(task.id) : -1;
    const after = here >= 0 ? rest.find((t) => orderIndex.get(t.id) > here) : null;
    const pick = after || rest[0] || null;
    setCurrentId(pick ? pick.id : "");
    onState({ open, section, taskId: pick ? pick.id : "", again: mode === ALL_MODE, mode, order, orderSeed: seed });
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
    setSession([]);
    setCurrentId(back);
    setResult(null);
    setValue("");
    setFromBank("");
    onState({ open: name, section: "", taskId: back, again: want === ALL_MODE, mode: want, order, orderSeed: seed });
  }

  function leave() {
    setSession([]);
    setResult(null);
    setValue("");
    setFromBank("");
    setCurrentId("");
    onState({ open: "", section: "", taskId: "", again: false, mode: "", order, orderSeed: seed });
  }

  // Перейти к работе над разделом: тот же выбор раздела, но сразу в режиме
  // «перерешать неверные» — иначе с разбора ошибок пришлось бы идти вручную.
  function fixSection(name) {
    setSection(name);
    setMode(WRONG_MODE);
    setCurrentId("");
    setResult(null);
    setValue("");
    setFromBank("");
    onState({ open, section: name, taskId: "", again: false, mode: WRONG_MODE, order, orderSeed: seed });
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // «Слабая тема» с экрана выбора: открыть предмет сразу на неверно решённых
  // заданиях этого раздела.
  function startWeak(name, sectionName) {
    setSection(sectionName);
    setMode(WRONG_MODE);
    setSession([]);
    setCurrentId("");
    setResult(null);
    setValue("");
    setFromBank("");
    onState({ open: name, section: sectionName, taskId: "", again: false, mode: WRONG_MODE, order, orderSeed: seed });
  }

  // Сменить порядок заданий. Задание с экрана при этом не меняем: человек,
  // может быть, как раз его решает — новый порядок вступит в силу на «дальше».
  // Повторное нажатие на «вперемешку» тасует заново: это единственный способ
  // получить другой набор, не трогая ничего больше.
  function pickOrder(want) {
    const next = want === "shuffle" ? newSeed() : seed;
    setOrder(want);
    setSeed(next);
    onState({ open, section, taskId: currentId, again: mode === ALL_MODE, mode, order: want, orderSeed: next });
  }

  function pickSection(name) {
    setSection(name);
    onState({ open, section: name, taskId: "", again: mode === ALL_MODE, mode, order, orderSeed: seed });
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
    TRAINER_SUBJECTS.forEach((s) => (s.ids || []).forEach((id) => set.add(id)));
    return set;
  }, []);
  const allStats = useMemo(() => trainerStats(log, allIds), [log, allIds]);
  const allCount = useMemo(() => TRAINER_SUBJECTS.reduce((n, s) => n + s.count, 0), []);
  const allSeconds = useMemo(
    () => (log || []).filter((a) => allIds.has(a.taskId)).reduce((n, a) => n + (Number(a.seconds) || 0), 0),
    [log, allIds],
  );


  // Сколько заданий предмета остались неверными — тоже по описи.
  const wrongIn = (ids) => {
    const set = new Set(ids);
    let n = 0;
    wrong.forEach((id) => set.has(id) && (n += 1));
    return n;
  };

  // Для плашки на экране выбора: когда занимался. Сюда идут и олимпиады —
  // «дни подряд» про то, садился ли за тренажёр, а не про один банк.
  const perDay = useMemo(() => {
    const ids = new Set(allIds);
    VOSH_IDS.forEach((id) => ids.add(id));
    const out = new Map();
    (log || []).forEach((a) => {
      if (!ids.has(a.taskId) || !a.at) return;
      const d = new Date(a.at);
      if (Number.isNaN(d.getTime())) return;
      const k = dayKey(d);
      out.set(k, (out.get(k) || 0) + 1);
    });
    return out;
  }, [log, allIds]);
  const todayKey = dayKey(new Date());
  // Текущая неделя с понедельника: столбик на день, сегодняшний выделен.
  const week = useMemo(() => {
    const now = new Date();
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
    return WEEK_DAYS.map((name, i) => {
      const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
      const k = dayKey(d);
      return { name, key: k, count: perDay.get(k) || 0, today: k === todayKey };
    });
  }, [perDay, todayKey]);
  const weekMax = Math.max(1, ...week.map((d) => d.count));
  // Сколько дней подряд занимался. Сегодня ещё не садился — серия не рвётся,
  // пока не кончились сутки: считаем от вчера.
  const dayStreak = useMemo(() => {
    const now = new Date();
    let shift = perDay.has(dayKey(now)) ? 0 : 1;
    let n = 0;
    for (;;) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - shift);
      if (!perDay.has(dayKey(d))) break;
      n += 1;
      shift += 1;
    }
    return n;
  }, [perDay]);

  // Слабая тема — по набору первого предмета. Набор грузится, только если
  // есть неверно решённые: иначе подсказывать нечего, а грузить его ради
  // пустоты незачем.
  const firstSubject = TRAINER_SUBJECTS[0];
  const firstWrong = firstSubject ? wrongIn(firstSubject.ids || []) : 0;
  const [pickerTasks, setPickerTasks] = useState(null);
  useEffect(() => {
    if (open || !firstSubject || !firstWrong) return undefined;
    let alive = true;
    loadBank(firstSubject.file).then((list) => alive && setPickerTasks(list));
    return () => { alive = false; };
  }, [open, firstSubject, firstWrong]);
  const weakest = useMemo(() => {
    if (!pickerTasks || !firstWrong) return null;
    const rows = sectionErrors(log, pickerTasks).filter((r) => r.wrong > 0);
    rows.sort((a, b) => b.wrong / b.done - a.wrong / a.done || b.wrong - a.wrong);
    return rows[0] || null;
  }, [log, pickerTasks, firstWrong]);

  if (!TRAINER_SUBJECTS.length) return null;

  // --- ВсОШ ------------------------------------------------------------------
  if (open === VOSH_OPEN) {
    return (
      <Suspense fallback={<section className="ap-card" style={styles.card}><p style={styles.cardNote}>Задания олимпиад загружаются…</p></section>}>
        <VoshTrainer
          log={log}
          state={(state && state.vosh) || {}}
          onState={(v) => onState({ ...(state || {}), vosh: v })}
          onAttempt={onAttempt}
          onLeave={leave}
          styles={styles}
        />
      </Suspense>
    );
  }

  // --- выбор предмета ------------------------------------------------------
  if (!open) {
    const voshDone = doneIn(VOSH_IDS);
    const percent = allStats.done ? allStats.percent : 0;
    // Кольцо доли верных: длина окружности при r = 32.
    const ring = 2 * Math.PI * 32;
    return (
      <section className="ap-card" style={styles.card}>
        {/* Свои показатели — тёмной плашкой сверху: с них экран и читается. */}
        <div style={S.hero} data-trainer-hero>
          <div style={S.heroTitle}>Всего в тренажёре — твои показатели</div>
          <div style={S.heroTop}>
            <div style={S.ringBox}>
              <svg width="74" height="74" viewBox="0 0 78 78" role="img" aria-label={allStats.done ? percent + "% верных" : "Ещё ничего не решено"}>
                <circle cx="39" cy="39" r="32" fill="none" stroke="var(--railActive)" strokeWidth="9" />
                {allStats.done ? (
                  <circle
                    cx="39" cy="39" r="32" fill="none" stroke="var(--gold)" strokeWidth="9" strokeLinecap="round"
                    strokeDasharray={Math.max(1, (percent / 100) * ring) + " " + ring} transform="rotate(-90 39 39)"
                  />
                ) : null}
                <text x="39" y="45" textAnchor="middle" fontSize="18" fontWeight="700" fill="currentColor" fontFamily="var(--sans)">
                  {allStats.done ? percent + "%" : "—"}
                </text>
              </svg>
              <span style={S.heroName}>верных</span>
            </div>
            <div style={S.heroStats}>
              <div style={S.heroStat}>
                <span style={S.heroValue}>{dayStreak}</span>
                <span style={S.heroName}>{dayWord(dayStreak)} подряд</span>
              </div>
              <div style={S.heroStat}>
                <span style={S.heroValue}>{allStats.averageSeconds ? timeWord(allStats.averageSeconds) : "—"}</span>
                <span style={S.heroName}>на задание</span>
              </div>
              <div style={S.heroStat}>
                {/* «Решено» — как на плитке банка: по последней попытке верно. */}
                <span style={S.heroValue}>{doneIn(allIds)}</span>
                <span style={S.heroName}>из {allCount} решено</span>
              </div>
              <div style={S.heroStat}>
                <span style={S.heroValue}>{allSeconds ? timeWord(allSeconds) : "—"}</span>
                <span style={S.heroName}>за секундомером</span>
              </div>
            </div>
          </div>
          <div style={S.weekBars} role="img" aria-label={"Решено за неделю: " + week.map((d) => d.name + " " + d.count).join(", ")}>
            {week.map((d) => (
              <div key={d.key} style={S.weekCol} title={d.count + " " + taskWord(d.count)}>
                <div
                  style={{
                    ...S.weekBar,
                    height: d.count ? Math.max(6, Math.round((d.count / weekMax) * 50)) : 3,
                    background: d.today ? "var(--gold)" : "var(--railInk2)",
                    opacity: d.today || !d.count ? 1 : 0.55,
                    ...(d.count ? null : { background: "var(--railActive)" }),
                  }}
                />
              </div>
            ))}
          </div>
          <div style={S.weekNames} aria-hidden="true">
            {week.map((d) => (
              <span key={d.key} style={{ ...S.weekName, ...(d.today ? S.weekToday : null) }}>{d.name}</span>
            ))}
          </div>
        </div>

        <div style={S.tiles}>
          {TRAINER_SUBJECTS.map((s) => {
            const done = doneIn(s.ids);
            const missed = wrongIn(s.ids);
            return (
              <div key={s.name} style={S.tile} data-bank-card>
                <div style={S.tileName}>Банк ФИПИ</div>
                <div style={S.tileSub}>{s.name}</div>
                <div style={S.tileLine}>
                  {/* Число заданий — один раз: до начала «N заданий», потом
                      «решено столько-то из N». */}
                  {done
                    ? done + " из " + s.count + (done === s.count ? " — всё пройдено" : "") + (missed ? " · неверных " + missed : "")
                    : s.count + " " + taskWord(s.count)}
                </div>
                {/* Сколько перенесено из банка: у него там тысячи, и без этой
                    строчки набор выглядит как весь банк. */}
                {s.whole ? (
                  <div style={S.tileWhole}>
                    из {s.whole} в банке ФИПИ —{" "}
                    {Math.max(0.1, (s.count / s.whole) * 100).toFixed(1).replace(".0", "").replace(".", ",")}%
                  </div>
                ) : null}
                <div style={S.tileBar}><div style={{ ...S.tileFill, width: done ? Math.max(3, (done / s.count) * 100) + "%" : 0 }} /></div>
                <button onClick={() => start(s.name, "", false)} className="ap-btn" style={S.tileGo}>
                  {done ? "Продолжить" : "Начать тест"}
                </button>
              </div>
            );
          })}
          <div style={S.tile} data-vosh-card>
            <div style={S.tileName}>ВсОШ</div>
            <div style={S.tileSub}>Обществознание</div>
            <div style={S.tileLine}>
              {voshDone ? "верно " + voshDone + " из " + VOSH_IDS.length : VOSH_INDEX.length + " олимпиад · " + VOSH_IDS.length + " " + taskWord(VOSH_IDS.length)}
            </div>
            <div style={S.tileWhole}>школьный и муниципальный этапы 2023–2026, официальные ключи</div>
            <div style={S.tileBar}><div style={{ ...S.tileFill, width: voshDone ? Math.max(3, (voshDone / VOSH_IDS.length) * 100) + "%" : 0 }} /></div>
            <button onClick={() => start(VOSH_OPEN, "", false)} className="ap-row" style={S.tileOpen}>
              {voshDone ? "Продолжить" : "Открыть олимпиады"}
            </button>
          </div>
        </div>

        <button type="button" onClick={() => setBookOpen(true)} className="ap-row" style={S.book} data-olymp-book>
          <span style={S.bookText}>
            <span style={S.bookName}>Учебник к олимпиаде</span>
            <span style={S.bookNote}>план до 19 ноября, формат этапа и 12 разделов теории — право, экономика, политология, социология</span>
          </span>
          <span aria-hidden="true" style={S.bookGo}>›</span>
        </button>

        {/* Окно — в корне страницы: у карточки свой слой отрисовки, и внутри неё
            «fixed» привязывался бы к карточке, а не к экрану. */}
        {bookOpen && createPortal(
          <div style={S.bookLayer} role="dialog" aria-modal="true" aria-label="Учебник к олимпиаде">
            <div style={S.bookBar}>
              <button type="button" onClick={() => setBookOpen(false)} className="ap-row" style={S.bookClose}>‹ Закрыть</button>
              <span style={S.bookTitle}>Учебник к олимпиаде</span>
            </div>
            <iframe title="Учебник к олимпиаде" src={import.meta.env.BASE_URL + "olymp/index.html"} style={S.bookFrame} />
          </div>,
          document.body,
        )}

        {TRAINER_SUBJECTS.map((s) => {
          const done = doneIn(s.ids);
          const missed = wrongIn(s.ids);
          return (
            <div key={s.name} style={S.more}>
              <div style={S.moreTitle}>Ещё по банку ФИПИ</div>
              {missed ? (
                <button onClick={() => start(s.name, WRONG_MODE, true)} className="ap-row" style={{ ...S.moreRow, ...S.moreWrong }}>
                  <span>Перерешать неверные ({missed})</span>
                  <span aria-hidden="true">›</span>
                </button>
              ) : null}
              <button onClick={() => start(s.name, ALL_MODE, false)} className="ap-row" style={S.moreRow}>
                <span>Решать все задания подряд</span>
                <span style={S.moreMeta}>вместе с решёнными ›</span>
              </button>
              {done ? (
                <button onClick={() => start(s.name, ALL_MODE, true)} className="ap-row" style={S.moreRow}>
                  <span>Пройти заново</span>
                  <span style={S.moreMeta}>с первого задания ›</span>
                </button>
              ) : null}
              {weakest && s === firstSubject ? (
                <button onClick={() => startWeak(s.name, weakest.section)} className="ap-row" style={S.moreRow} data-weak-theme>
                  <span>Слабая тема: {weakest.section}</span>
                  <span style={S.moreMeta}>
                    {weakest.wrong} из {weakest.done} {weakest.wrong === 1 ? "неверно" : "неверны"} ›
                  </span>
                </button>
              ) : null}
            </div>
          );
        })}

        <div style={S.notes}>
          <CardHead
            id="trainer-alpha"
            small
            title="Ответы здесь решены нами, а не взяты у ФИПИ"
            note={
              "Банк правильный ответ не показывает, он только говорит «верно» или «неверно». Значит, ошибки " +
              "в ключах не исключение, а дело времени. Если ты проверил задание в банке — впиши под разбором тот " +
              "ответ, который банк засчитал. Такой ответ сейчас ценнее любого решённого задания: по нему ключи " +
              "и правятся."
            }
          />
          <CardHead
            id="trainer-buttons"
            small
            title="Чем отличаются кнопки"
            note={
              "«Начать тест» и «Продолжить» — только то, что ещё не решено, и можно выбрать раздел. " +
              "«Все задания подряд» — весь предмет целиком, вместе с уже решённым. " +
              "«Перерешать неверные» — те, где последний ответ был неверным."
            }
          />
        </div>

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
          <button onClick={leave} className="ap-row" style={S.back}>‹ К выбору предмета</button>
          <div style={S.headTitle}>{open}</div>
        </div>

        {/* Как идёт этот подход: отрезок на каждое задание, серый — текущее. */}
        {session.length > 0 && (
          <div style={S.segments} role="img" data-session
            aria-label={"В этом подходе: верно " + session.filter((x) => x === "ok").length +
              ", неверно " + session.filter((x) => x === "bad").length}>
            {session.slice(-11).map((x, i) => (
              <span key={i} style={{ ...S.segment, background: x === "ok" ? "var(--green)" : x === "bad" ? "var(--red)" : "var(--barDim)" }} />
            ))}
            {!result && <span style={{ ...S.segment, background: "var(--line)" }} />}
            {/* Пустые отрезки до десяти: одна полоска без них похожа на подчёркивание. */}
            {Array.from({ length: Math.max(0, 10 - Math.min(11, session.length) - (result ? 0 : 1)) }, (_, i) => (
              <span key={"e" + i} style={{ ...S.segment, background: "var(--line2)" }} />
            ))}
          </div>
        )}

        {/* Разделы, порядок и «только нерешённые» нужны редко, а занимали пол-экрана
            над заданием — теперь они свёрнуты, а в заголовке видно, что выбрано. */}
        <details style={S.setBox} data-trainer-set>
          <summary style={S.setSummary}>
            Набор: {section || "все разделы"} · {(ORDERS.find((o) => o.key === order) || ORDERS[0]).name.toLowerCase()} ·{" "}
            {mode === WRONG_MODE ? "неверно решённые" : mode === ALL_MODE ? "все задания" : "только нерешённые"}
          </summary>
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

        <div style={S.chips}>
          <span style={S.orderLabel}>Порядок</span>
          {ORDERS.map((o) => (
            <button
              key={o.key || "bank"}
              onClick={() => pickOrder(o.key)}
              className="ap-row"
              style={{ ...S.chip, ...(order === o.key ? S.chipOn : null) }}
              title={o.hint}
            >
              {order === "shuffle" && o.key === "shuffle" ? "Перемешать заново" : o.name}
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
              onState({ open, section, taskId: "", again: want === ALL_MODE, mode: want, order, orderSeed: seed });
            }}
          />
          Только нерешённые
          <span style={S.onlyCount}>
            {mode === WRONG_MODE
              ? "показаны только неверно решённые — " + queue.length + " " + taskWord(queue.length)
              : "решено " + doneIn(mine.map((t) => t.id)) + " из " + mine.length}
          </span>
        </label>
        </details>

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

            {prev && (
              <div style={S.prevLine} data-prev-attempt>
                <span>Уже решал: {prev.ok ? "верно" : "неверно"}</span>
                <button type="button" onClick={() => setShowPrev(!showPrev)} className="ap-row" style={S.prevBtn} aria-pressed={showPrev}>
                  {showPrev ? "Скрыть" : "Мой прошлый ответ"}
                </button>
                {showPrev && (
                  <div style={S.prevBody}>
                    Твой ответ: <b>{prev.answer || "—"}</b> — {prev.ok ? "верно" : "неверно"}
                    {!prev.ok ? (
                      <>
                        {" "}· правильный: <b>{task.answer}</b> {task.units}
                      </>
                    ) : null}
                  </div>
                )}
              </div>
            )}

            {!result ? (
              <>
                <div style={S.answerRow}>
                  <input
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && answer()}
                    placeholder="Ответ"
                    style={S.input}
                    aria-label="Ваш ответ"
                  />
                  {task.units && <span style={S.units}>{task.units}</span>}
                  <button onClick={answer} className="ap-btn" style={S.go}>Ответить</button>
                </div>
                <div style={S.underRow}>
                  <button onClick={reveal} className="ap-row" style={S.textBtn} data-reveal>Показать ответ</button>
                  <button onClick={next} className="ap-row" style={S.textBtn}>Пропустить</button>
                  <button
                    onClick={() => mark("broken", "", true)}
                    className="ap-row"
                    style={{ ...S.report, ...(myBroken ? S.reportOn : null) }}
                    title="Условие показано криво, непонятно или не хватает рисунка"
                  >
                    {myBroken ? "Пожаловались на задание ✓" : "Пожаловаться на задание"}
                  </button>
                </div>
              </>
            ) : (
              // Свой ответ рядом с верным — сразу видно, где разошлись.
              <div
                style={{ ...S.compare, ...(result.revealed ? S.compareOpen : result.ok ? S.compareOk : S.compareBad) }}
                data-answer-compare
              >
                {result.revealed ? (
                  <span style={S.compareName}>Ответ: <b style={S.compareValue}>{task.answer}</b> {task.units}</span>
                ) : (
                  <>
                    <span style={S.compareName}>Твой ответ</span>
                    <b style={{ ...S.compareValue, ...(result.ok ? S.valueOk : S.valueBad) }}>{value || "—"}</b>
                    {result.ok ? (
                      <span style={{ ...S.compareRight, color: "var(--green)" }}>верно ✓</span>
                    ) : (
                      <span style={S.compareRight}>
                        <span style={{ color: "var(--green)" }}>верно</span>
                        <b style={{ ...S.compareValue, color: "var(--green)" }}>{task.answer}</b>
                        {task.units && <span style={S.units}>{task.units}</span>}
                      </span>
                    )}
                  </>
                )}
              </div>
            )}

            {result && (
              <div style={S.verdict}>
                <div style={S.verdictHead}>
                  <span style={{ ...S.verdictWord, color: result.revealed ? "var(--ink)" : result.ok ? "var(--green)" : "var(--red)" }}>
                    {result.revealed ? "Ответ открыт" : result.ok ? "Верно" : "Неверно"}
                  </span>
                  <span style={S.verdictKind}>разбор</span>
                  {!result.revealed && <span style={S.verdictTime}>{timeWord(result.seconds)}</span>}
                </div>
                {result.revealed && <div style={S.revealNote}>Попытка не засчитана: ответ открыт до решения.</div>}
                <div style={S.why}>{task.why}</div>
                {task.sure && <div style={S.doubt}>Уверенность в ключе неполная — {task.sure}</div>}
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
                  // Как проверить ключ в банке — длинная инструкция; она нужна не на
                  // каждом задании, поэтому свёрнута под кнопкой.
                  <details style={S.checkBox} data-key-check>
                    <summary style={S.checkSummary}>Проверить ключ на ФИПИ ›</summary>
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
                  </details>
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
              </div>
            )}

            {result && (
              <div style={S.after}>
                <button onClick={next} className="ap-btn" style={S.nextBtn}>Следующее</button>
                <button
                  onClick={() => mark("broken", "", true)}
                  className="ap-row"
                  style={{ ...S.report, ...(myBroken ? S.reportOn : null) }}
                  title="Условие показано криво, непонятно или не хватает рисунка"
                >
                  {myBroken ? "Пожаловались на задание ✓" : "Пожаловаться на задание"}
                </button>
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

        {stats.done > 0 && (
          <div style={S.themes}>
            <div style={S.disputedTitle}>Разбор ошибок по темам</div>
            {weak.length === 0 ? (
              <p style={S.themeNote}>
                Ошибок пока нет — по всем разделам, где ты решал, ответы верные.
              </p>
            ) : (
              <>
                <p style={S.themeNote}>
                  Считается по последней попытке: разобрался и ответил верно — раздел из списка уходит.
                  Нажми на раздел, чтобы перерешать неверные в нём.
                </p>
                {weak.map((r) => (
                  <button
                    key={r.section}
                    onClick={() => fixSection(r.section)}
                    className="ap-row"
                    style={S.themeRow}
                  >
                    <span style={S.themeName}>{r.section}</span>
                    <span style={S.themeCount}>
                      {r.wrong} из {r.done} {r.wrong === 1 ? "неверно" : "неверны"}
                    </span>
                    <span style={S.themeBar}>
                      <span style={{ ...S.themeBarFill, width: Math.max(4, r.percent) + "%" }} />
                    </span>
                  </button>
                ))}
              </>
            )}
            {firm.length > 0 && (
              <p style={S.themeFirm}>
                Без ошибок: {firm.map((r) => r.section + " (" + r.done + ")").join(", ")}
              </p>
            )}
          </div>
        )}

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
  orderLabel: { fontSize: 12.5, color: "var(--mute)", alignSelf: "center", marginRight: 2 },
  only: { display: "flex", alignItems: "center", gap: 7, fontSize: 13.5, color: "var(--ink3)", marginBottom: 14 },
  subject: {
    display: "inline-flex", alignItems: "center", gap: 6, border: "1px solid var(--line)",
    background: "var(--panel)", color: "var(--ink2)", borderRadius: 10, padding: "8px 15px",
    font: "inherit", fontSize: 14.5, cursor: "pointer",
  },
  subjectOn: { background: "var(--btnBg)", color: "var(--btnInk)", borderColor: "var(--btnBg)", fontWeight: 600 },
  picture: {
    display: "block", maxWidth: "100%", height: "auto", margin: "0 0 12px",
    background: "#fff", border: "1px solid var(--line2)", borderRadius: 8, padding: 6,
  },
  doubt: { marginTop: 7, fontSize: 12.5, color: "var(--mute)", lineHeight: 1.5 },

  task: { border: "1px solid var(--line2)", borderRadius: 16, padding: "16px", background: "var(--panel2)" },
  head: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 },
  code: {
    fontFamily: "ui-monospace, monospace", fontSize: 12, fontWeight: 600, letterSpacing: "0.03em",
    background: "var(--neutralBg)", borderRadius: 7, padding: "3px 8px", color: "var(--ink2)",
  },
  headSection: {
    fontSize: 12, fontWeight: 600, borderRadius: 7, padding: "3px 8px",
    background: "var(--accentSoft)", color: "var(--accent)",
  },
  clock: { marginLeft: "auto", fontVariantNumeric: "tabular-nums", fontSize: 15, fontWeight: 600, color: "var(--ink2)" },
  kes: {
    fontSize: 12, color: "var(--mute)", marginBottom: 8, lineHeight: 1.45,
    display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
  },
  lead: { fontSize: 13, color: "var(--ink3)", marginBottom: 6 },
  text: { fontSize: 15, lineHeight: 1.6, whiteSpace: "pre-wrap", marginBottom: 14 },
  body: { marginBottom: 14 },

  answerRow: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 4 },
  input: {
    flex: "1 1 160px", minWidth: 0, height: 50, boxSizing: "border-box", border: "1.5px solid var(--line)",
    borderRadius: 13, padding: "0 14px", font: "inherit", fontSize: 17, background: "var(--panel)", color: "var(--ink)",
  },
  go: {
    height: 50, border: "none", background: "var(--btnBg)", color: "var(--btnInk)", borderRadius: 13,
    padding: "0 22px", font: "inherit", fontSize: 15, fontWeight: 600, cursor: "pointer",
  },
  textBtn: {
    border: "none", background: "none", color: "var(--ink2)", font: "inherit",
    fontSize: 13.5, cursor: "pointer", padding: "6px 0",
  },
  compare: {
    display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 4,
    padding: "11px 14px", borderRadius: 12, border: "1.5px solid",
  },
  compareOk: { borderColor: "var(--green)", background: "var(--greenSoft)" },
  compareBad: { borderColor: "var(--redLine)", background: "var(--redBg)" },
  compareOpen: { borderColor: "var(--line)", background: "var(--panel)" },
  compareName: { fontSize: 13, color: "var(--ink3)" },
  compareValue: { fontSize: 18, fontWeight: 700, color: "var(--ink)", wordBreak: "break-word" },
  valueOk: { color: "var(--green)" },
  valueBad: { color: "var(--red)", textDecoration: "line-through" },
  compareRight: { marginLeft: "auto", display: "inline-flex", alignItems: "baseline", gap: 8, fontSize: 13 },
  units: { fontSize: 14, color: "var(--ink3)" },
  primary: {
    border: "1px solid var(--ink)", background: "var(--ink)", color: "var(--bg)", borderRadius: 9,
    padding: "9px 16px", font: "inherit", fontSize: 14, fontWeight: 600, cursor: "pointer",
  },
  underRow: { display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap", marginTop: 6 },
  report: {
    marginLeft: "auto", border: "none", background: "none", color: "var(--mute)", font: "inherit",
    fontSize: 13, cursor: "pointer", padding: 0, textDecoration: "underline", textUnderlineOffset: 3,
  },
  reportOn: { color: "var(--ink2)", textDecoration: "none", fontWeight: 600 },

  verdict: { marginTop: 12, borderRadius: 16, padding: "14px 16px", border: "1px solid var(--line2)", background: "var(--panel)" },
  verdictWord: { fontFamily: "var(--serif)", fontSize: 21, fontWeight: 400 },
  verdictKind: { fontSize: 12, color: "var(--mute)", fontFamily: "var(--sans)", fontWeight: 400 },
  revealNote: { fontSize: 12.5, color: "var(--mute)", marginTop: 4 },
  after: { display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", marginTop: 12 },
  nextBtn: {
    flex: "1 1 220px", height: 52, border: "none", background: "var(--btnBg)", color: "var(--btnInk)",
    borderRadius: 14, font: "inherit", fontSize: 16, fontWeight: 600, cursor: "pointer",
  },
  segments: { display: "flex", gap: 4, margin: "0 0 12px" },
  segment: { flex: 1, height: 6, borderRadius: 999 },
  headTitle: { fontFamily: "var(--serif)", fontSize: 20, flex: "1 1 auto", minWidth: 0 },
  prevLine: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, fontSize: 13, color: "var(--ink3)", margin: "10px 0 2px" },
  prevBtn: {
    padding: "2px 10px",
    border: "1px solid var(--line)",
    borderRadius: 999,
    background: "transparent",
    color: "var(--ink2)",
    font: "inherit",
    fontSize: 12.5,
    cursor: "pointer",
  },
  prevBody: { flexBasis: "100%", color: "var(--ink2)" },
  setBox: { margin: "4px 0 12px", padding: "8px 12px", border: "1px solid var(--line2)", borderRadius: 10 },
  setSummary: { cursor: "pointer", fontSize: 13.5, color: "var(--ink2)", padding: "2px 0" },
  checkBox: { marginTop: 10 },
  checkSummary: { cursor: "pointer", fontSize: 13.5, fontWeight: 600, color: "var(--accent)", padding: "4px 0" },
  verdictHead: { display: "flex", alignItems: "baseline", gap: 8 },
  verdictTime: { marginLeft: "auto", fontSize: 13, fontWeight: 400, color: "var(--ink3)", fontVariantNumeric: "tabular-nums" },
  why: { marginTop: 7, fontSize: 13.5, lineHeight: 1.55, color: "var(--ink2)" },

  keyBox: { marginTop: 12, borderTop: "1px solid var(--line2)", paddingTop: 10 },
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
  hero: {
    background: "var(--rail)", color: "var(--railInk)", borderRadius: 18, padding: "16px 18px 14px",
    display: "flex", flexDirection: "column", gap: 14, marginBottom: 12,
  },
  heroTitle: { fontSize: 12.5, color: "var(--railInk2)" },
  heroTop: { display: "flex", alignItems: "center", gap: 14 },
  ringBox: { display: "flex", flexDirection: "column", alignItems: "center", gap: 2 },
  heroStats: { flex: "1 1 0", minWidth: 0, display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "10px 12px" },
  heroStat: { display: "flex", flexDirection: "column", minWidth: 0 },
  heroValue: { fontFamily: "var(--serif)", fontSize: 21, lineHeight: 1.15, fontVariantNumeric: "tabular-nums" },
  heroName: { fontSize: 12, color: "var(--railInk2)" },
  weekBars: { display: "flex", alignItems: "flex-end", gap: 6, height: 52 },
  weekCol: { flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", height: 52 },
  weekBar: { borderRadius: 4 },
  weekNames: { display: "flex", gap: 6, marginTop: -8 },
  weekName: { flex: 1, textAlign: "center", fontSize: 11, color: "var(--railInk2)" },
  weekToday: { color: "var(--gold)", fontWeight: 600 },
  tiles: { display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", marginBottom: 14 },
  tile: {
    border: "1px solid var(--line2)", borderRadius: 16, padding: 14, background: "var(--panel2)",
    display: "flex", flexDirection: "column", gap: 4, minWidth: 0,
  },
  tileName: { fontSize: 16, fontWeight: 600, color: "var(--ink)" },
  tileSub: { fontSize: 12.5, color: "var(--ink3)" },
  tileLine: { fontSize: 13, color: "var(--ink2)", marginTop: 4 },
  tileWhole: { fontSize: 11.5, color: "var(--mute)", lineHeight: 1.4 },
  tileBar: { height: 5, borderRadius: 999, background: "var(--line2)", overflow: "hidden", margin: "8px 0 10px" },
  tileFill: { height: "100%", borderRadius: 999, background: "var(--green)" },
  tileGo: {
    marginTop: "auto", height: 44, border: "none", borderRadius: 12, background: "var(--btnBg)", color: "var(--btnInk)",
    font: "inherit", fontSize: 14, fontWeight: 600, cursor: "pointer",
  },
  tileOpen: {
    marginTop: "auto", height: 44, border: "1px solid var(--line)", borderRadius: 12, background: "var(--panel)",
    color: "var(--ink)", font: "inherit", fontSize: 14, fontWeight: 600, cursor: "pointer",
  },
  more: { display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 },
  book: {
    display: "flex", alignItems: "center", gap: 12, width: "100%", marginBottom: 14, padding: "14px 16px",
    border: "1px solid var(--line)", borderRadius: 16, background: "var(--accentSoft)", color: "var(--ink)",
    font: "inherit", textAlign: "left", cursor: "pointer",
  },
  bookText: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 },
  bookName: { fontFamily: "var(--serif)", fontSize: 18 },
  bookNote: { fontSize: 12.5, color: "var(--ink3)", lineHeight: 1.4 },
  bookGo: { fontSize: 22, color: "var(--accent)" },
  bookLayer: {
    position: "fixed", inset: 0, zIndex: 60, display: "flex", flexDirection: "column", background: "var(--bg)",
    paddingTop: "env(safe-area-inset-top, 0px)", paddingBottom: "env(safe-area-inset-bottom, 0px)",
  },
  bookBar: {
    display: "flex", alignItems: "center", gap: 12, padding: "8px max(12px, env(safe-area-inset-right, 0px)) 8px max(12px, env(safe-area-inset-left, 0px))",
    borderBottom: "1px solid var(--line)", background: "var(--panel)",
  },
  bookClose: {
    height: 38, padding: "0 14px", border: "1px solid var(--line)", borderRadius: 10, background: "var(--panel2)",
    color: "var(--ink)", font: "inherit", fontSize: 14, fontWeight: 600, cursor: "pointer",
  },
  bookTitle: { fontSize: 14, color: "var(--ink3)" },
  bookFrame: { flex: 1, width: "100%", border: "none", background: "var(--bg)" },
  moreTitle: { fontSize: 13, fontWeight: 600, color: "var(--ink3)", marginBottom: 2 },
  moreRow: {
    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, minHeight: 48,
    padding: "8px 14px", border: "1px solid var(--line)", borderRadius: 12, background: "var(--panel)",
    color: "var(--ink)", font: "inherit", fontSize: 14, textAlign: "left", cursor: "pointer",
  },
  moreWrong: { borderColor: "var(--redLine)", background: "var(--redBg)", color: "var(--red)", fontWeight: 600 },
  moreMeta: { fontSize: 12.5, color: "var(--mute)", flex: "0 0 auto" },
  notes: { display: "flex", flexDirection: "column", gap: 4 },
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
  head0: { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 },
  back: {
    border: "1px solid var(--line)", background: "var(--panel)", color: "var(--ink2)", borderRadius: 12,
    padding: "0 12px", height: 40, font: "inherit", fontSize: 13.5, cursor: "pointer",
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

  themes: { marginTop: 16, borderTop: "1px solid var(--line2)", paddingTop: 12 },
  themeNote: { fontSize: 12.5, color: "var(--mute)", lineHeight: 1.5, margin: "0 0 10px" },
  themeRow: {
    display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", width: "100%",
    background: "none", border: "none", borderRadius: 8, padding: "6px 8px",
    textAlign: "left", cursor: "pointer", font: "inherit", color: "inherit",
  },
  themeName: { fontSize: 13.5, flex: "0 1 auto" },
  themeCount: { fontSize: 12.5, color: "var(--mute)", fontVariantNumeric: "tabular-nums" },
  themeBar: {
    flex: "1 1 80px", minWidth: 60, height: 6, borderRadius: 3,
    background: "var(--line2)", overflow: "hidden", alignSelf: "center",
  },
  themeBarFill: { display: "block", height: "100%", background: "var(--ink3)" },
  themeFirm: { fontSize: 12.5, color: "var(--mute)", lineHeight: 1.5, margin: "10px 0 0" },

  disputed: { marginTop: 16, borderTop: "1px solid var(--line2)", paddingTop: 12 },
  disputedTitle: { fontSize: 13, fontWeight: 600, marginBottom: 8 },
  disputedRow: { display: "flex", gap: 9, alignItems: "baseline", flexWrap: "wrap", fontSize: 12.5, marginBottom: 6 },
  disputedText: { color: "var(--ink3)", flex: "1 1 200px", minWidth: 0 },
  disputedAnswer: { color: "var(--mute)" },

  source: { marginTop: 16, fontSize: 11.5, color: "var(--mute)" },
};
