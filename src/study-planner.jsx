import React, { useState, useEffect, useRef, useMemo } from "react";

// Duration is stored in minutes for each lesson.
const D = 60;
const BASE_URL = "https://veber.zenclass.ru/student/courses/1412a450-ed64-4ed4-afd8-0029750d888d/lessons/";
const L = (name, id) => ({ name, url: BASE_URL + id });

const WEEKDAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const LYCEUM_DAYS = WEEKDAY_KEYS.filter((k) => k !== "sun");
const WEEKDAY_LABELS = { mon: "Пн", tue: "Вт", wed: "Ср", thu: "Чт", fri: "Пт", sat: "Сб", sun: "Вс" };
const DOW_TO_KEY = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"]; // Date.getDay(): 0 = Sunday
const SUBJECT_COLOR_PALETTE = ["#4A6B6B", "#7A5233", "#5C4A80", "#8C7326", "#2F4E70", "#8B4A4A", "#3F6E52", "#6B4A6B"];

const SUBJECT_DEFS = [
  {
    id: "law",
    name: "Право",
    color: "#8B4A4A",
    topics: [
      L("Право: теория государства и права", "4cd7aac1-677e-4709-a56f-932dd967c64f"),
      L("Право: ТГП 2 часть + Конституция", "0b2136b2-2260-40ab-b61a-3b765dd3d443"),
      L("Право: Семейное право", "9f64543f-6c43-4b71-97c7-481f9ea66a7b"),
      L("Право: Трудовое право", "0d01c2ad-1a9c-4641-8813-a3415641573a"),
      L("Право: Уголовное право", "b1d9f406-36bf-4271-982c-e42f24276948"),
      L("Право: Уголовное право, часть 2", "1658f891-01ba-4d9a-bafa-63dc1a70a4c6"),
      L("Право: Административное право + уголовное", "ba826a62-f88a-49c9-a36b-3417cc089df5"),
      L("Право: Гражданское право, часть 1", "b5df1df5-97cb-4842-96e0-d253722e64b6"),
      L("Право: Гражданское право, часть 2", "eaf5ad17-67a1-450e-9d54-0dcdabce115e"),
      L("Право: Гражданское право, часть 3", "f28b441c-7264-4f94-b331-d92769bbd1d5"),
      L("Практика: правовые задачи", "11939a88-042f-4c86-b4f2-690231ac87b2"),
    ],
  },
  {
    id: "econ",
    name: "Экономика",
    color: "#3F6E52",
    topics: [
      L("Экономика: альтернативные издержки, КПВ, международная торговля", "962f40a8-e853-47e8-bd47-7c31a9da9506"),
      L("Экономика: спрос и предложение, рыночное равновесие", "db3288e2-4bdf-46cb-ad95-98bf33c592d9"),
      L("Экономика: общественные блага и внешние эффекты, эффекты замены и дохода", "b7fcd3e0-9a07-40c5-8372-60f58b044263"),
      L("Экономика: эластичность", "254013b6-137f-4d2b-bf80-e9dcc3a7fabb"),
      L("Экономика: теория фирм: издержки фирмы", "f844e671-ba90-4ca5-8b00-435c0869313d"),
      L("Экономика: теория фирм: маржинальный анализ", "1f9bcf17-abab-4efb-9b94-3884e48ca9c9"),
      L("Экономика: рыночные структуры + теория игр", "41a5776b-a1e4-48c4-99ea-5fd5fa54014b"),
      L("Экономика: введение в макроэкономику и модель кругооборота", "0638e2cb-bd0a-4ce1-b1da-747722aac7dd"),
      L("Экономика: ВВП и ВНП", "7efe4a0e-63ca-47c0-8cb1-f5bb7f7797f3"),
      L("Экономика: инфляция, безработица", "5f8aa384-4781-4e5c-9f22-bcaa60e5dd60"),
      L("Экономика: монетарная и фискальная политика", "6e452d01-c249-438e-8ea7-6f0cef4008af"),
      L("Экономика: экономический рост и экономические пузыри", "ad049364-3ebd-46b0-ad76-3d72602ef023"),
      L("Экономика: история экономической мысли", "eebca325-40ae-47d7-a9d3-807a226b0214"),
      L("Практика: экономические задачи", "d24b3a6d-0f71-438d-88c1-06cb69279d8f"),
    ],
  },
  {
    id: "polit",
    name: "Политология",
    color: "#2F4E70",
    topics: [
      L("Политология: понятие власти, часть 1", "e7b22612-39f6-440d-b735-3004f7be07e1"),
      L("Политология: понятие власти, часть 2", "9bdb588c-1b78-4e03-b785-eafba6d11552"),
      L("Политология: субъекты политики", "47bee958-56be-4b59-8127-2d1062e6ed24"),
      L("Политология: теории происхождения государства", "6c105a8a-2231-444c-ab08-d596f67a9721"),
      L("Политология: теории общественного договора", "3590efe4-93f4-4e2b-9e95-c7619ed2726e"),
      L("Политология: государство и его характеристика", "e7d35343-23b7-459f-80bf-7eed28a47b3e"),
      L("Политология: политическая система", "b8f5ca03-a13e-4113-87ef-ab7f742aefeb"),
      L("Политология: политический режим и политические процессы", "4337c2d2-ad2d-4cf0-b33e-877a25207428"),
      L("Политология: политические интересы", "64e808a2-663a-4ffa-a7c4-1e658b704867"),
      L("Политология: политический лидер", "1caa70f1-aec9-4013-b499-b62cfc7808a2"),
      L("Политология: сущность демократии и её модели", "f2d9c36c-58f6-46ec-abf6-101fa3f61644"),
      L("Политология: теория элит", "b27ad438-1856-4cb9-ab88-ffa315007166"),
      L("Политология: демократический транзит", "68f1959d-1a84-40ef-8149-6d706a6fd521"),
      L("Политология: парламентаризм и избирательное право", "4ea72f1f-f811-4e1c-8771-19793aba9e31"),
      L("Политология: избирательные системы", "07a64cd5-82ac-4f4e-bd27-d785228cf55e"),
      L("Политология: гражданское общество", "f9dad215-72d7-42fe-a953-dfdcad195e48"),
      L("Политология: политическая идеология", "05f4a3b9-88d6-4f50-85a0-d95bbdeca4f5"),
      L("Политология: политические партии", "b2478493-a84b-4406-891a-c31c2b84e330"),
      L("Политология: политическая культура, мифы и менталитет", "631c10f8-21ed-4ac2-80b6-f1e6c428fce4"),
      L("Политология: национальный фактор", "cac1ef42-8348-4760-a164-ac0f90d6d307"),
      L("Политология: религия и политика, геополитика", "2ac7149f-21b3-44b6-9f27-ccede5b8b398"),
      L("Политология: итоги курса", "cfcf9d5e-5d12-4482-ab7b-42132d4538bc"),
    ],
  },
  {
    id: "soc",
    name: "Социология",
    color: "#8C7326",
    topics: [
      L("Социология как наука", "750ed92b-9ed1-4e2b-b1bf-f1a7c9a9a503"),
      L("Социология правил", "2064c31d-7144-482d-a506-6c8ca2504a8a"),
      L("Социология группы", "ea9920a5-4058-4b29-ac91-0d52be726a90"),
      L("Социология структуры общества", "08fc1666-e060-4e1c-84ed-7466ae1818a7"),
      L("Социология институтов", "990ff7a7-97b3-46d0-8258-a9618e79e749"),
      L("Социология общественных процессов", "ba73e3bc-be63-4306-a1f9-52f222a80d25"),
      L("Становление социологии как науки", "01c108a7-b773-46d4-9e10-322b95fc7f60"),
      L("Социологический метод Э. Дюркгейма", "0f54f113-002d-476c-a132-d3957e0dda09"),
      L("Социология солидарности", "071dbaa4-40fa-4d34-b10c-5649f5cabdc7"),
      L("Понимающая социология М. Вебера", "376f0cb0-0929-4532-874f-3ada63a42a78"),
      L("Структурный функционализм", "379f5005-f8f3-4fbb-a081-430effb1ccd1"),
      L("Социология конфликта", "c8c9f1b3-298b-4665-a137-071738d40fdc"),
      L("Социология неравенства", "f6aa75b3-44c9-4a37-87fd-961053379a79"),
      L("Социология социализации и взаимодействия", "e22e602d-3f85-49f6-86b6-1f880a25e7c8"),
      L("Социология девиантного поведения", "5365491e-e083-4412-9281-2b3342bfc80b"),
      L("Социология потребления и моды", "42e3bef7-cab3-47b8-94a7-e2de5065e242"),
      L("Социология массы и толпы", "45979966-4329-4970-980a-6cb7e53713e2"),
      L("Социология города", "0093781a-19cb-4f16-8d82-dbb9ae374936"),
      L("Сетевой анализ в социологии", "4c1c822d-de16-4fcf-bcb4-b7b703e7fdc4"),
      L("Франкфуртская школа социологии", "fa71e1b3-f948-45a4-8c51-7bfdc2bfc6f9"),
    ],
  },
  {
    id: "phil",
    name: "Философия",
    color: "#5C4A80",
    topics: [
      L("Досократическая философия", "d7eae7d4-f3e7-4b19-bb28-3ea4d44fba2b"),
      L("Философия Сократа, Платона и Аристотеля", "23aac4fe-7409-4561-92e4-f43eab0e4b2c"),
      L("Эллинистическая философия", "3fee0b8d-aff1-49ff-a971-af832db02ad9"),
      L("Философия Средневековья", "6138ca3b-e1fd-44b0-8115-35c84c4a9f81"),
      L("Философия Нового времени", "823e38b9-d534-4288-b236-2789146e4b26"),
      L("Философия Просвещения", "86ddf8c2-aa2e-48ed-9d30-4acc5485995b"),
      L("Немецкая философия XIX века", "2c8ab913-d1d2-4c9f-a47a-705d92d609f8"),
      L("Философия XX века", "850cfb3d-56bc-4cbc-8a32-f5d26f144416"),
    ],
  },
  {
    id: "hist",
    name: "История",
    color: "#7A5233",
    topics: [],
  },
];

// IMPORTANT: never change this key in future edits — doing so orphans everything the person
// already saved. New fields are added defensively in the load effect below instead.
const STORAGE_KEY = "planner-state-v5";

function defaultDeadline() {
  const d = new Date();
  d.setMonth(d.getMonth() + 4);
  return d.toISOString().slice(0, 10);
}

function buildDefaultData() {
  const data = {};
  SUBJECT_DEFS.forEach((s) => {
    data[s.id] = {
      topics: s.topics.map((t, i) => ({
        id: s.id + "-" + i,
        name: t.name,
        url: t.url || null,
        done: false,
        duration: D,
        notes: [],
      })),
      custom: [],
    };
  });
  return data;
}

function defaultBudget() {
  const alloc = {};
  SUBJECT_DEFS.forEach((s) => (alloc[s.id] = 4));
  const daily = { mon: 150, tue: 150, wed: 150, thu: 150, fri: 150, sat: 240, sun: 240 };
  return { daily, alloc };
}

function weeklyBudgetHours(budget) {
  return WEEKDAY_KEYS.reduce((sum, k) => sum + (Number(budget.daily[k]) || 0), 0) / 60;
}

function goalHoursForDate(budget, date) {
  const key = DOW_TO_KEY[date.getDay()];
  return (Number(budget.daily[key]) || 0) / 60;
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function ymd(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Interpolates from red (missed/under target) to green (target reached) as ratio goes 0 -> 1.
function ratioColor(ratio) {
  const c1 = [0x8b, 0x4a, 0x4a];
  const c2 = [0x3f, 0x6e, 0x52];
  const r = Math.round(c1[0] + (c2[0] - c1[0]) * ratio);
  const g = Math.round(c1[1] + (c2[1] - c1[1]) * ratio);
  const b = Math.round(c1[2] + (c2[2] - c1[2]) * ratio);
  return `rgb(${r}, ${g}, ${b})`;
}

// Deterministic color for a lyceum subject name, so the same subject looks the same across days.
function subjectColor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return SUBJECT_COLOR_PALETTE[Math.abs(hash) % SUBJECT_COLOR_PALETTE.length];
}

// hw.reminderDays: undefined/1 -> remind starting 1 day before (default);
// "always" -> remind every day regardless of how far off the deadline is;
// a number N -> remind starting N days before the deadline.
function reminderThreshold(hw) {
  if (hw.reminderDays === "always") return Infinity;
  const n = Number(hw.reminderDays);
  return Number.isFinite(n) && n >= 0 ? n : 1;
}

function relativeDayLabel(daysUntil) {
  if (daysUntil < 0) return "просрочено";
  if (daysUntil === 0) return "сегодня";
  if (daysUntil === 1) return "завтра";
  return `через ${daysUntil} дн.`;
}

export default function StudyPlanner() {
  const [loaded, setLoaded] = useState(false);
  const [data, setData] = useState(buildDefaultData());
  const [journal, setJournal] = useState([]);
  const [budget, setBudget] = useState(defaultBudget());
  const [deadline, setDeadline] = useState(defaultDeadline());
  const [openSubject, setOpenSubject] = useState(null);
  const [openNotes, setOpenNotes] = useState({});
  const [openLinks, setOpenLinks] = useState({});
  const [pair, setPair] = useState(["law", "econ"]);
  const [jForm, setJForm] = useState({ date: todayStr(), subjectId: "law", hours: "1", note: "" });
  const [saveErr, setSaveErr] = useState(false);
  const [calMonth, setCalMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [openSections, setOpenSections] = useState({ kpv: false, subjects: false, lyceum: false, journal: false, backup: false });
  const [importText, setImportText] = useState("");
  const [importMsg, setImportMsg] = useState("");
  const [copyMsg, setCopyMsg] = useState("");
  const [customSubjects, setCustomSubjects] = useState([]);
  const [lyceumSchedule, setLyceumSchedule] = useState([]);
  const [homework, setHomework] = useState([]);
  const firstLoad = useRef(true);
  const loadingRef = useRef(false);

  const ALL_SUBJECTS = useMemo(() => [...SUBJECT_DEFS, ...customSubjects], [customSubjects]);
  const saveTimer = useRef(null);
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [syncDebug, setSyncDebug] = useState("");

  async function loadFromStorage() {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setSyncing(true);
    let lastError = null;
    let found = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await window.storage.get(STORAGE_KEY, false);
        if (res && res.value) {
          found = true;
          const parsed = JSON.parse(res.value);
          if (parsed.data) setData(parsed.data);
          if (parsed.journal) setJournal(parsed.journal);
          if (parsed.budget) setBudget(parsed.budget);
          if (parsed.deadline) setDeadline(parsed.deadline);
          if (parsed.customSubjects) setCustomSubjects(parsed.customSubjects);
          if (parsed.lyceumSchedule) setLyceumSchedule(parsed.lyceumSchedule);
          if (parsed.openSections) setOpenSections(parsed.openSections);
          if (parsed.homework) setHomework(parsed.homework);
        }
        setLastSyncedAt(new Date());
        setSyncDebug(found ? "" : "хранилище пока пустое — записей не найдено");
        lastError = null;
        break;
      } catch (e) {
        lastError = (e && (e.message || String(e))) || "неизвестная ошибка";
        if (attempt < 2) await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
      }
    }
    if (lastError) setSyncDebug("ошибка чтения: " + lastError);
    loadingRef.current = false;
    setSyncing(false);
  }

  useEffect(() => {
    (async () => {
      await loadFromStorage();
      setLoaded(true);
    })();
  }, []);

  // Cross-device sync: an already-open tab only reads storage once on mount, so if you
  // change something on another device while this one stays open, it would never notice.
  // Re-pull the latest saved state whenever the person comes back to this tab/app.
  useEffect(() => {
    if (!loaded) return;
    function handleWake() {
      if (document.visibilityState === "visible") loadFromStorage();
    }
    document.addEventListener("visibilitychange", handleWake);
    window.addEventListener("focus", handleWake);
    return () => {
      document.removeEventListener("visibilitychange", handleWake);
      window.removeEventListener("focus", handleWake);
    };
  }, [loaded]);

  useEffect(() => {
    if (!loaded) return;
    if (firstLoad.current) {
      firstLoad.current = false;
      return;
    }
    // Many fields (room/teacher/duration/etc.) write to state on every keystroke. Saving on
    // every single change hammers the storage API and is the most likely reason writes were
    // failing — debounce so a burst of edits becomes one write shortly after typing pauses.
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      (async () => {
        const payload = JSON.stringify({
          data,
          journal,
          budget,
          deadline,
          customSubjects,
          lyceumSchedule,
          openSections,
          homework,
        });
        let res = null;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            res = await window.storage.set(STORAGE_KEY, payload, false);
            if (res) break;
          } catch (e) {
            res = null;
          }
          if (attempt < 2) await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
        }
        setSaveErr(!res);
        if (res) setLastSyncedAt(new Date());
      })();
    }, 700);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [data, journal, budget, deadline, customSubjects, lyceumSchedule, openSections, homework, loaded]);

  const stats = useMemo(() => {
    let doneAll = 0;
    let totalAll = 0;
    const perSubject = {};
    ALL_SUBJECTS.forEach((s) => {
      const list = [...data[s.id].topics, ...data[s.id].custom];
      const done = list.filter((t) => t.done).length;
      perSubject[s.id] = { done, total: list.length, pct: list.length ? Math.round((done / list.length) * 100) : 0 };
      doneAll += done;
      totalAll += list.length;
    });
    return { perSubject, doneAll, totalAll, overallPct: totalAll ? Math.round((doneAll / totalAll) * 100) : 0 };
  }, [data]);

  const daysLeft = useMemo(() => {
    const now = new Date();
    const end = new Date(deadline + "T23:59:59");
    return Math.max(0, Math.ceil((end - now) / (1000 * 60 * 60 * 24)));
  }, [deadline]);

  const capacity = useMemo(() => {
    const weeklyTotal = ALL_SUBJECTS.reduce((sum, s) => sum + (Number(budget.alloc[s.id]) || 0), 0);
    const weeklyBudget = weeklyBudgetHours(budget);

    let totalCapacityHours = 0;
    const cursor = new Date();
    cursor.setHours(0, 0, 0, 0);
    const end = new Date(deadline + "T00:00:00");
    let guard = 0;
    while (cursor <= end && guard < 3650) {
      totalCapacityHours += goalHoursForDate(budget, cursor);
      cursor.setDate(cursor.getDate() + 1);
      guard += 1;
    }

    let remainingMinutes = 0;
    let remainingTopics = 0;
    ALL_SUBJECTS.forEach((s) => {
      const list = [...data[s.id].topics, ...data[s.id].custom];
      list.forEach((t) => {
        if (!t.done) {
          remainingMinutes += Number(t.duration) || D;
          remainingTopics += 1;
        }
      });
    });
    const neededHours = remainingMinutes / 60;

    const activeAllocs = ALL_SUBJECTS.map((s) => ({ name: s.name, hours: Number(budget.alloc[s.id]) || 0 })).filter(
      (a) => a.hours > 0
    );
    let skew = null;
    if (weeklyTotal > 0 && activeAllocs.length > 1) {
      const top = activeAllocs.reduce((a, b) => (b.hours > a.hours ? b : a));
      const share = top.hours / weeklyTotal;
      if (share > 0.4) {
        skew = { name: top.name, sharePct: Math.round(share * 100) };
      }
    }

    return {
      weeklyTotal,
      weeklyBudget: Math.round(weeklyBudget * 10) / 10,
      totalCapacityHours: Math.round(totalCapacityHours * 10) / 10,
      neededHours: Math.round(neededHours * 10) / 10,
      remainingTopics,
      overBudget: weeklyTotal > weeklyBudget,
      feasible: totalCapacityHours >= neededHours,
      skew,
    };
  }, [budget, deadline, data, ALL_SUBJECTS]);

  function getTopic(subjectId, topicId, custom) {
    const key = custom ? "custom" : "topics";
    return data[subjectId][key].find((t) => t.id === topicId);
  }

  function updateTopic(subjectId, topicId, custom, updater) {
    const key = custom ? "custom" : "topics";
    setData((prev) => {
      const list = prev[subjectId][key].map((t) => (t.id === topicId ? updater(t) : t));
      return { ...prev, [subjectId]: { ...prev[subjectId], [key]: list } };
    });
  }

  function toggleTopic(subjectId, topicId, custom) {
    const topic = getTopic(subjectId, topicId, custom);
    if (!topic) return;
    const willBeDone = !topic.done;
    updateTopic(subjectId, topicId, custom, (t) => ({ ...t, done: willBeDone }));

    if (willBeDone) {
      const hours = Math.round(((Number(topic.duration) || D) / 60) * 100) / 100;
      setJournal((prev) => [
        { id: Date.now(), date: todayStr(), subjectId, hours, note: topic.name, auto: true, lessonId: topicId },
        ...prev,
      ]);
    } else {
      setJournal((prev) => prev.filter((e) => !(e.auto && e.lessonId === topicId && !e.noteId)));
    }
  }

  function setTopicDuration(subjectId, topicId, custom, minutes) {
    updateTopic(subjectId, topicId, custom, (t) => ({ ...t, duration: Math.max(5, Number(minutes) || D) }));
  }

  function setTopicUrl(subjectId, topicId, custom, url) {
    const trimmed = (url || "").trim();
    updateTopic(subjectId, topicId, custom, (t) => ({ ...t, url: trimmed || null }));
  }

  function addCustomTopic(subjectId, name, url) {
    if (!name.trim()) return;
    setData((prev) => {
      const id = subjectId + "-c-" + Date.now();
      return {
        ...prev,
        [subjectId]: {
          ...prev[subjectId],
          custom: [
            ...prev[subjectId].custom,
            { id, name: name.trim(), url: url && url.trim() ? url.trim() : null, done: false, duration: D, notes: [] },
          ],
        },
      };
    });
  }

  function removeCustomTopic(subjectId, topicId) {
    setData((prev) => ({
      ...prev,
      [subjectId]: { ...prev[subjectId], custom: prev[subjectId].custom.filter((t) => t.id !== topicId) },
    }));
    setJournal((prev) => prev.filter((e) => e.lessonId !== topicId));
  }

  function addNote(subjectId, topicId, custom, text, minutes) {
    if (!text.trim()) return;
    const noteId = topicId + "-n-" + Date.now();
    const mins = Math.max(0, Number(minutes) || 0);
    updateTopic(subjectId, topicId, custom, (t) => ({
      ...t,
      notes: [...(t.notes || []), { id: noteId, text: text.trim(), minutes: mins, date: todayStr() }],
    }));
    if (mins > 0) {
      const topic = getTopic(subjectId, topicId, custom);
      setJournal((prev) => [
        {
          id: Date.now() + 1,
          date: todayStr(),
          subjectId,
          hours: Math.round((mins / 60) * 100) / 100,
          note: `${topic ? topic.name : ""} — ${text.trim()}`,
          auto: true,
          lessonId: topicId,
          noteId,
        },
        ...prev,
      ]);
    }
  }

  function removeNote(subjectId, topicId, custom, noteId) {
    updateTopic(subjectId, topicId, custom, (t) => ({
      ...t,
      notes: (t.notes || []).filter((n) => n.id !== noteId),
    }));
    setJournal((prev) => prev.filter((e) => e.noteId !== noteId));
  }

  function addJournalEntry() {
    if (!jForm.note.trim() && Number(jForm.hours) <= 0) return;
    const entry = { id: Date.now(), ...jForm, hours: Number(jForm.hours) || 0 };
    setJournal((prev) => [entry, ...prev]);
    setJForm({ ...jForm, note: "", hours: "1" });
  }

  function removeJournalEntry(id) {
    setJournal((prev) => prev.filter((e) => e.id !== id));
  }

  function setAlloc(id, val) {
    setBudget((prev) => ({ ...prev, alloc: { ...prev.alloc, [id]: Math.max(0, Number(val) || 0) } }));
  }

  function setDailyGoal(key, minutes) {
    setBudget((prev) => ({ ...prev, daily: { ...prev.daily, [key]: Math.max(0, Number(minutes) || 0) } }));
  }

  function toggleNotesPanel(topicId) {
    setOpenNotes((prev) => ({ ...prev, [topicId]: !prev[topicId] }));
  }

  function toggleLinkPanel(topicId) {
    setOpenLinks((prev) => ({ ...prev, [topicId]: !prev[topicId] }));
  }

  function toggleSection(key) {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function buildExportPayload() {
    return JSON.stringify(
      { data, journal, budget, deadline, customSubjects, lyceumSchedule, openSections, homework },
      null,
      2
    );
  }

  async function copyExport() {
    const text = buildExportPayload();
    try {
      await navigator.clipboard.writeText(text);
      setCopyMsg("Скопировано! Вставьте этот текст в поле импорта на другом устройстве.");
    } catch (e) {
      setCopyMsg("Не удалось скопировать автоматически — выделите текст в поле выше и скопируйте вручную.");
    }
  }

  function handleImport() {
    try {
      const parsed = JSON.parse(importText);
      if (parsed.data) setData(parsed.data);
      if (parsed.journal) setJournal(parsed.journal);
      if (parsed.budget) setBudget(parsed.budget);
      if (parsed.deadline) setDeadline(parsed.deadline);
      if (parsed.customSubjects) setCustomSubjects(parsed.customSubjects);
      if (parsed.lyceumSchedule) setLyceumSchedule(parsed.lyceumSchedule);
      if (parsed.openSections) setOpenSections(parsed.openSections);
      if (parsed.homework) setHomework(parsed.homework);
      setImportMsg("Данные импортированы и сохранены на этом устройстве.");
      setImportText("");
    } catch (e) {
      setImportMsg("Не удалось прочитать текст — проверьте, что скопировали его полностью, и попробуйте снова.");
    }
  }

  function addSubject(name) {
    if (!name.trim()) return;
    const id = "custom-" + Date.now();
    const color = SUBJECT_COLOR_PALETTE[customSubjects.length % SUBJECT_COLOR_PALETTE.length];
    setCustomSubjects((prev) => [...prev, { id, name: name.trim(), color }]);
    setData((prev) => ({ ...prev, [id]: { topics: [], custom: [] } }));
    setBudget((prev) => ({ ...prev, alloc: { ...prev.alloc, [id]: 2 } }));
  }

  function removeSubject(id) {
    setCustomSubjects((prev) => prev.filter((s) => s.id !== id));
    setData((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setBudget((prev) => {
      const alloc = { ...prev.alloc };
      delete alloc[id];
      return { ...prev, alloc };
    });
    setJournal((prev) => prev.filter((e) => e.subjectId !== id));
    if (pair[0] === id || pair[1] === id) setPair(["law", "econ"]);
    if (openSubject === id) setOpenSubject(null);
  }

  function addScheduleEntry(day, entry) {
    if (!entry.subjectName || !entry.subjectName.trim()) return;
    const id = "sch-" + Date.now() + "-" + Math.round(Math.random() * 1000);
    setLyceumSchedule((prev) => [
      ...prev,
      {
        id,
        day,
        subjectName: entry.subjectName.trim(),
        start: entry.start || "08:30",
        end: entry.end || "09:15",
        room: entry.room || "",
        teacher: entry.teacher || "",
      },
    ]);
  }

  function updateScheduleEntry(id, patch) {
    setLyceumSchedule((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }

  function removeScheduleEntry(id) {
    setLyceumSchedule((prev) => prev.filter((e) => e.id !== id));
  }

  function addHomework(date, subjectName, text, minutes) {
    if (!text.trim()) return;
    const id = "hw-" + Date.now() + "-" + Math.round(Math.random() * 1000);
    setHomework((prev) => [
      ...prev,
      { id, date, subjectName, text: text.trim(), minutes: Math.max(0, Number(minutes) || 0), done: false, attachments: [] },
    ]);
  }

  function removeHomework(id) {
    const hw = homework.find((h) => h.id === id);
    (hw?.attachments || []).forEach((a) => {
      window.storage.delete(a.key, false).catch(() => {});
    });
    setHomework((prev) => prev.filter((h) => h.id !== id));
  }

  function updateHomework(id, patch) {
    setHomework((prev) => prev.map((h) => (h.id === id ? { ...h, ...patch } : h)));
  }

  async function attachFileToHomework(id, file) {
    if (!file) return;
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error("read failed"));
        reader.readAsDataURL(file);
      });
      const key = "hwfile-" + id + "-" + Date.now();
      const res = await window.storage.set(key, dataUrl, false);
      if (!res) {
        alert("Не удалось прикрепить файл — возможно, он слишком большой.");
        return;
      }
      setHomework((prev) =>
        prev.map((h) => (h.id === id ? { ...h, attachments: [...(h.attachments || []), { name: file.name, key }] } : h))
      );
    } catch (e) {
      alert("Не удалось прикрепить файл.");
    }
  }

  async function openAttachment(att) {
    try {
      const res = await window.storage.get(att.key, false);
      if (!res || !res.value) {
        alert("Файл не найден.");
        return;
      }
      const a = document.createElement("a");
      a.href = res.value;
      a.download = att.name;
      a.target = "_blank";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (e) {
      alert("Не удалось открыть файл.");
    }
  }

  function removeAttachment(hwId, key) {
    window.storage.delete(key, false).catch(() => {});
    setHomework((prev) =>
      prev.map((h) => (h.id === hwId ? { ...h, attachments: (h.attachments || []).filter((a) => a.key !== key) } : h))
    );
  }

  const subjA = ALL_SUBJECTS.find((s) => s.id === pair[0]);
  const subjB = ALL_SUBJECTS.find((s) => s.id === pair[1]);

  const actualHoursBySubject = useMemo(() => {
    const map = {};
    journal.forEach((e) => {
      map[e.subjectId] = (map[e.subjectId] || 0) + e.hours;
    });
    return map;
  }, [journal]);

  const actualA = Math.round((actualHoursBySubject[pair[0]] || 0) * 10) / 10;
  const actualB = Math.round((actualHoursBySubject[pair[1]] || 0) * 10) / 10;
  const plannedA = Number(budget.alloc[pair[0]]) || 0;
  const plannedB = Number(budget.alloc[pair[1]]) || 0;

  const axisMax = Math.max(actualA, actualB, plannedA, plannedB, 1) * 1.15;

  // Planned-ratio reference line from the origin, extended to the edge of the chart.
  const planLine = useMemo(() => {
    if (plannedA <= 0 && plannedB <= 0) {
      return { x: axisMax, y: axisMax }; // no allocation set — fall back to a 45° reference
    }
    const scale = axisMax / Math.max(plannedA, plannedB, 1e-9);
    return { x: plannedA * scale, y: plannedB * scale };
  }, [plannedA, plannedB, axisMax]);

  const toChart = (x, y, max) => [30 + (x / max) * 220, 260 - (y / max) * 220];
  const pathD = `M ${toChart(0, 0, axisMax).join(",")} L ${toChart(planLine.x, planLine.y, axisMax).join(",")}`;
  const [pxA, pyA] = toChart(actualA, actualB, axisMax);

  const plannedTotal = plannedA + plannedB;
  const actualTotal = actualA + actualB;
  const plannedShareA = plannedTotal > 0 ? plannedA / plannedTotal : 0.5;
  const actualShareA = actualTotal > 0 ? actualA / actualTotal : plannedShareA;
  const pairDeviationPct = Math.round((actualShareA - plannedShareA) * 100);
  const pairSkewed = actualTotal > 0 && Math.abs(pairDeviationPct) >= 15;

  const weeklyJournalHours = useMemo(() => {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 86400000);
    return Math.round(journal.filter((e) => new Date(e.date) >= weekAgo).reduce((sum, e) => sum + e.hours, 0) * 10) / 10;
  }, [journal]);

  const dailyTotals = useMemo(() => {
    const map = {};
    journal.forEach((e) => {
      map[e.date] = (map[e.date] || 0) + e.hours;
    });
    return map;
  }, [journal]);

  const todayDateOnly = useMemo(() => {
    const t = new Date();
    return new Date(t.getFullYear(), t.getMonth(), t.getDate());
  }, []);

  const calendarDays = useMemo(() => {
    const first = new Date(calMonth.getFullYear(), calMonth.getMonth(), 1);
    const dow = (first.getDay() + 6) % 7; // Monday = 0
    const start = new Date(first);
    start.setDate(first.getDate() - dow);
    const cells = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      cells.push(d);
    }
    return cells;
  }, [calMonth]);

  const selectedDayEntries = useMemo(() => journal.filter((e) => e.date === selectedDate), [journal, selectedDate]);

  const hwDates = useMemo(() => new Set(homework.map((h) => h.date)), [homework]);

  const selectedDaySubjects = useMemo(() => {
    const dow = DOW_TO_KEY[new Date(selectedDate + "T00:00:00").getDay()];
    const names = [];
    lyceumSchedule
      .filter((e) => e.day === dow)
      .sort((a, b) => a.start.localeCompare(b.start))
      .forEach((e) => {
        if (e.subjectName && !names.includes(e.subjectName)) names.push(e.subjectName);
      });
    return names;
  }, [lyceumSchedule, selectedDate]);

  const homeworkForSelectedDate = useMemo(() => homework.filter((h) => h.date === selectedDate), [homework, selectedDate]);

  const homeworkReminders = useMemo(() => {
    return homework
      .filter((h) => !h.done)
      .map((h) => {
        const dueDate = new Date(h.date + "T00:00:00");
        const daysUntil = Math.round((dueDate - todayDateOnly) / 86400000);
        return { ...h, daysUntil };
      })
      .filter((h) => h.daysUntil <= reminderThreshold(h))
      .sort((a, b) => a.daysUntil - b.daysUntil);
  }, [homework, todayDateOnly]);

  return (
    <div style={styles.page}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=PT+Serif:wght@400;700&family=Inter:wght@400;500;600&display=swap');
        * { box-sizing: border-box; }
        .topic-row:hover { background: #EFEAE0; }
        .subj-card:hover { transform: translateY(-2px); }
        button { cursor: pointer; font-family: inherit; }
        input, select, textarea { font-family: inherit; }
        a.lesson-link { color: inherit; text-decoration: underline; text-decoration-color: #C9C1AC; text-underline-offset: 2px; }
        a.lesson-link:hover { text-decoration-color: currentColor; }
      `}</style>

      {homeworkReminders.length > 0 && (
        <div style={styles.hwBanner}>
          <div style={styles.hwBannerTitle}>Напоминания о домашних заданиях</div>
          {homeworkReminders.map((h) => (
            <div key={h.id} style={styles.hwBannerRow}>
              <span style={{ ...styles.hwBannerSubject, color: subjectColor(h.subjectName) }}>{h.subjectName}:</span>{" "}
              <span>{h.text}</span>
              {h.minutes > 0 && <span style={styles.hwBannerMinutes}> · {h.minutes} мин</span>}
              <span style={styles.hwBannerMinutes}> · {relativeDayLabel(h.daysUntil)}</span>
            </div>
          ))}
        </div>
      )}

      <header style={styles.header}>
        <div>
          <div style={styles.eyebrow}>Ежедневник обществоведа</div>
          <h1 style={styles.h1}>План подготовки к экзамену и олимпиаде</h1>
        </div>
        <div style={styles.countdownBox}>
          <div style={styles.countdownNum}>{daysLeft}</div>
          <div style={styles.countdownLabel}>дней осталось</div>
          <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} style={styles.dateInput} />
        </div>
      </header>

      <section style={styles.overallBar}>
        <div style={styles.overallTrack}>
          <div style={{ ...styles.overallFill, width: stats.overallPct + "%" }} />
        </div>
        <div style={styles.overallText}>
          Пройдено {stats.doneAll} из {stats.totalAll} уроков · {stats.overallPct}%
        </div>
      </section>

      {/* КПВ block */}
      <section style={styles.card}>
        <button onClick={() => toggleSection("kpv")} style={styles.sectionHeaderBtn}>
          <span style={styles.sectionChevron}>{openSections.kpv ? "▾" : "▸"}</span>
          <h2 style={styles.h2Inline}>Распределение времени (КПВ)</h2>
        </button>
        {openSections.kpv && (
          <>
        <p style={styles.muted}>
          Время — ограниченный ресурс, и его количество разное в разные дни недели. Укажите, сколько минут в день вы
          реально можете заниматься; ниже — сколько часов в неделю вы распределяете по предметам и проверка, хватит
          ли этого ресурса на оставшиеся уроки до выбранной даты.
        </p>

        <div style={styles.dailyGoalsBlock}>
          <label style={styles.label}>Сколько минут в день вы можете заниматься</label>
          <div style={styles.dailyGoalsRow}>
            {WEEKDAY_KEYS.map((k) => (
              <div key={k} style={styles.dailyGoalCell}>
                <div style={styles.dailyGoalLabel}>{WEEKDAY_LABELS[k]}</div>
                <input
                  type="number"
                  min="0"
                  step="5"
                  value={budget.daily[k]}
                  onChange={(e) => setDailyGoal(k, e.target.value)}
                  style={styles.dailyGoalInput}
                />
                <div style={styles.dailyGoalHours}>{Math.round((Number(budget.daily[k]) / 60) * 10) / 10} ч</div>
              </div>
            ))}
          </div>
          <p style={styles.muted}>Итого за неделю: {capacity.weeklyBudget} ч.</p>
        </div>

        <div style={styles.allocGrid}>
          {ALL_SUBJECTS.map((s) => (
            <div key={s.id} style={styles.allocRow}>
              <span style={{ ...styles.dot, background: s.color }} />
              <span style={styles.allocName}>{s.name}</span>
              <input
                type="range"
                min="0"
                max="20"
                value={budget.alloc[s.id]}
                onChange={(e) => setAlloc(s.id, e.target.value)}
                style={{ accentColor: s.color, flex: 1 }}
              />
              <input
                type="number"
                min="0"
                value={budget.alloc[s.id]}
                onChange={(e) => setAlloc(s.id, e.target.value)}
                style={styles.smallNumInput}
              />
              <span style={styles.hUnit}>ч/нед</span>
            </div>
          ))}
        </div>

        <div style={{ ...styles.capacityBox, borderColor: capacity.overBudget ? "#8B4A4A" : "#3F6E52" }}>
          <div>
            Распределено по предметам: <b>{capacity.weeklyTotal}</b> ч/нед из доступных {capacity.weeklyBudget} ч/нед
            {capacity.overBudget && <span style={styles.warn}> — превышен бюджет</span>}
          </div>
          <div>
            Осталось непройденных уроков: <b>{capacity.remainingTopics}</b> · суммарно по их длительности:{" "}
            <b>{capacity.neededHours} ч</b>
          </div>
          <div>
            Доступно времени до {new Date(deadline).toLocaleDateString("ru-RU")} с учётом расписания по дням недели:{" "}
            <b>{capacity.totalCapacityHours} ч</b>
          </div>
          <div style={{ fontWeight: 600, color: capacity.feasible ? "#3F6E52" : "#8B4A4A" }}>
            {capacity.feasible
              ? "При таком темпе времени должно хватить."
              : "При текущем темпе времени может не хватить — стоит увеличить часы или пересмотреть приоритеты."}
          </div>

        </div>

        {capacity.skew && (
          <div style={styles.skewWarning}>
            Слишком сильный уклон в «{capacity.skew.name}» ({capacity.skew.sharePct}% времени) — не забывайте и про
            остальные сферы.
          </div>
        )}

        <div style={styles.ppfSection}>
          <div style={styles.ppfControls}>
            <label style={styles.label}>Сравнить два предмета</label>
            <div style={{ display: "flex", gap: 8 }}>
              <select value={pair[0]} onChange={(e) => setPair([e.target.value, pair[1]])} style={styles.select}>
                {ALL_SUBJECTS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <select value={pair[1]} onChange={(e) => setPair([pair[0], e.target.value])} style={styles.select}>
                {ALL_SUBJECTS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <p style={styles.muted}>
              Пунктирная линия — распределение, заданное выше в часах на неделю ({subjA?.name}: {plannedA} ч,{" "}
              {subjB?.name}: {plannedB} ч). Точка — сколько времени вы фактически уже потратили по дневнику:{" "}
              {subjA?.name} {actualA} ч, {subjB?.name} {actualB} ч. Чем дальше точка от линии, тем сильнее реальный
              темп отклоняется от плана — график сам пересчитывается по мере новых записей в дневнике.
            </p>
            {pairSkewed && (
              <p style={styles.skewWarningInline}>
                Фактически вы тратите {pairDeviationPct > 0 ? "больше" : "меньше"} времени на «{subjA?.name}», чем
                запланировано (на {Math.abs(pairDeviationPct)} п.п.) — стоит скорректировать темп по этой паре.
              </p>
            )}
          </div>
          <svg viewBox="0 0 300 290" style={styles.svg}>
            <line x1="30" y1="260" x2="290" y2="260" stroke="#B9B2A0" strokeWidth="1" />
            <line x1="30" y1="260" x2="30" y2="10" stroke="#B9B2A0" strokeWidth="1" />
            <path d={pathD} fill="none" stroke="#9B8B6A" strokeWidth="2" strokeDasharray="4 3" />
            <circle cx={pxA} cy={pyA} r="6" fill={subjA?.color || "#333"} stroke="#fff" strokeWidth="1.5" />
            <text x="30" y="278" fontSize="10" fill="#5A5347">0</text>
            <text x="270" y="278" fontSize="10" fill="#5A5347">
              {subjA?.name} {Math.round(axisMax)} ч
            </text>
            <text x="2" y="14" fontSize="10" fill="#5A5347">{subjB?.name}</text>
            <text x="2" y="24" fontSize="10" fill="#5A5347">{Math.round(axisMax)} ч</text>
          </svg>
        </div>
          </>
        )}
      </section>

      {/* Subjects */}
      <section style={styles.card}>
        <button onClick={() => toggleSection("subjects")} style={styles.sectionHeaderBtn}>
          <span style={styles.sectionChevron}>{openSections.subjects ? "▾" : "▸"}</span>
          <h2 style={styles.h2Inline}>Самостоятельное изучение</h2>
        </button>
        {openSections.subjects && (
          <>
        <div style={styles.subjGrid}>
          {ALL_SUBJECTS.map((s) => {
            const st = stats.perSubject[s.id];
            const open = openSubject === s.id;
            const isCustomSubject = customSubjects.some((cs) => cs.id === s.id);
            const allTopics = [
              ...data[s.id].topics.map((t) => ({ ...t, custom: false })),
              ...data[s.id].custom.map((t) => ({ ...t, custom: true })),
            ];
            return (
              <div key={s.id} className="subj-card" style={{ ...styles.subjCard, borderColor: s.color }}>
                <div style={styles.subjHeaderRow}>
                  <button onClick={() => setOpenSubject(open ? null : s.id)} style={styles.subjHeader}>
                    <span style={{ ...styles.dot, background: s.color }} />
                    <span style={styles.subjName}>{s.name}</span>
                    <span style={styles.subjPct}>
                      {st.done}/{st.total} · {st.pct}%
                    </span>
                  </button>
                  {isCustomSubject && (
                    <button
                      onClick={() => {
                        if (window.confirm(`Удалить предмет «${s.name}» вместе со всеми его уроками и записями?`)) {
                          removeSubject(s.id);
                        }
                      }}
                      style={styles.removeBtn}
                      title="Удалить предмет"
                    >
                      ×
                    </button>
                  )}
                </div>
                <div style={styles.miniTrack}>
                  <div style={{ ...styles.miniFill, width: st.pct + "%", background: s.color }} />
                </div>
                {open && (
                  <div style={styles.topicList}>
                    {allTopics.length === 0 && <div style={styles.muted}>Уроков пока нет — добавьте первый ниже.</div>}
                    {allTopics.map((t) => (
                      <TopicItem
                        key={t.id}
                        subjectId={s.id}
                        topic={t}
                        notesOpen={!!openNotes[t.id]}
                        onToggleNotes={() => toggleNotesPanel(t.id)}
                        linkOpen={!!openLinks[t.id]}
                        onToggleLink={() => toggleLinkPanel(t.id)}
                        onSetUrl={(url) => setTopicUrl(s.id, t.id, t.custom, url)}
                        onToggleDone={() => toggleTopic(s.id, t.id, t.custom)}
                        onDurationChange={(v) => setTopicDuration(s.id, t.id, t.custom, v)}
                        onAddNote={(text, mins) => addNote(s.id, t.id, t.custom, text, mins)}
                        onRemoveNote={(noteId) => removeNote(s.id, t.id, t.custom, noteId)}
                        onRemoveTopic={t.custom ? () => removeCustomTopic(s.id, t.id) : null}
                      />
                    ))}
                    <AddTopicForm onAdd={(name, url) => addCustomTopic(s.id, name, url)} color={s.color} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <AddSubjectForm onAdd={addSubject} placeholder="Добавить свой предмет (например, «Математика для олимпиад»)" />
          </>
        )}
      </section>

      {/* Lyceum schedule */}
      <section style={styles.card}>
        <button onClick={() => toggleSection("lyceum")} style={styles.sectionHeaderBtn}>
          <span style={styles.sectionChevron}>{openSections.lyceum ? "▾" : "▸"}</span>
          <h2 style={styles.h2Inline}>Лицей КЭО — расписание</h2>
        </button>
        {openSections.lyceum && (
          <>
        <p style={styles.muted}>
          Отдельно от самостоятельного изучения — уроки в лицее с реальными звонками: время начала и конца, кабинет
          и преподаватель. Впишите предмет прямо в нужный день недели.
        </p>

        <div style={styles.scheduleGrid}>
          {LYCEUM_DAYS.map((day) => (
            <ScheduleDay
              key={day}
              day={day}
              label={WEEKDAY_LABELS[day]}
              entries={lyceumSchedule.filter((e) => e.day === day).sort((a, b) => a.start.localeCompare(b.start))}
              onAdd={(entry) => addScheduleEntry(day, entry)}
              onUpdate={updateScheduleEntry}
              onRemove={removeScheduleEntry}
            />
          ))}
        </div>
          </>
        )}
      </section>

      {/* Journal */}
      <section style={styles.card}>
        <button onClick={() => toggleSection("journal")} style={styles.sectionHeaderBtn}>
          <span style={styles.sectionChevron}>{openSections.journal ? "▾" : "▸"}</span>
          <h2 style={styles.h2Inline}>Дневник занятий</h2>
        </button>
        {openSections.journal && (
          <>
        <p style={styles.muted}>
          За последние 7 дней записано {weeklyJournalHours} ч. Записи с уроками и заметками к ним добавляются сюда
          автоматически — можно также добавить запись вручную.
        </p>

        <div style={styles.calendarWrap}>
          <div style={styles.calHeader}>
            <button
              onClick={() => setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1))}
              style={styles.calNavBtn}
            >
              ‹
            </button>
            <div style={styles.calMonthLabel}>
              {calMonth.toLocaleDateString("ru-RU", { month: "long", year: "numeric" })}
            </div>
            <button
              onClick={() => setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1))}
              style={styles.calNavBtn}
            >
              ›
            </button>
          </div>
          <div style={styles.calWeekdays}>
            {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((d) => (
              <div key={d} style={styles.calWeekday}>
                {d}
              </div>
            ))}
          </div>
          <div style={styles.calGrid}>
            {calendarDays.map((cellDate) => {
              const key = ymd(cellDate);
              const hours = dailyTotals[key] || 0;
              const goal = goalHoursForDate(budget, cellDate);
              const inMonth = cellDate.getMonth() === calMonth.getMonth();
              const isFuture = cellDate > todayDateOnly;
              const ratio = goal > 0 ? Math.min(hours / goal, 1) : hours > 0 ? 1 : 0;
              const selected = key === selectedDate;
              const hasHw = hwDates.has(key);
              return (
                <button
                  key={key}
                  onClick={() => setSelectedDate(key)}
                  title={`${Math.round(hours * 10) / 10} ч из ${Math.round(goal * 10) / 10} ч цели`}
                  style={{
                    ...styles.calCell,
                    background: isFuture ? "#F7F4EC" : ratioColor(ratio),
                    color: isFuture ? "#8A8370" : "#fff",
                    opacity: inMonth ? 1 : 0.4,
                    outline: selected ? "2px solid #2B2822" : "none",
                    outlineOffset: "-2px",
                  }}
                >
                  {cellDate.getDate()}
                  {hasHw && <span style={styles.hwDot} />}
                </button>
              );
            })}
          </div>
          <p style={styles.muted}>
            Цвет клетки — от красного (день пропущен) к зелёному (дневная цель на этот день недели выполнена или
            перевыполнена), пропорционально потраченному времени. Цель для каждого дня недели задаётся выше, в
            минутах в день.
          </p>
        </div>

        <div style={styles.dayDetail}>
          <div style={styles.dayDetailTitle}>
            {new Date(selectedDate + "T00:00:00").toLocaleDateString("ru-RU", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}{" "}
            — {Math.round((dailyTotals[selectedDate] || 0) * 10) / 10} ч из{" "}
            {Math.round(goalHoursForDate(budget, new Date(selectedDate + "T00:00:00")) * 10) / 10} ч цели
          </div>
          {selectedDayEntries.length === 0 && <div style={styles.muted}>В этот день записей нет.</div>}
          {selectedDayEntries.map((e) => {
            const s = ALL_SUBJECTS.find((s) => s.id === e.subjectId);
            return (
              <div key={e.id} style={styles.journalRow}>
                <span style={{ ...styles.dot, background: s?.color }} />
                <span style={styles.jSubj}>{s?.name}</span>
                <span style={styles.jHours}>{e.hours} ч</span>
                <span style={styles.jNote}>{e.note}</span>
                <button onClick={() => removeJournalEntry(e.id)} style={styles.removeBtn}>
                  ×
                </button>
              </div>
            );
          })}

          <div style={styles.homeworkBlock}>
            <div style={styles.homeworkTitle}>Домашнее задание</div>
            {selectedDaySubjects.length === 0 ? (
              <div style={styles.mutedSmall}>На этот день по расписанию лицея уроков нет.</div>
            ) : (
              selectedDaySubjects.map((name) => {
                const items = homeworkForSelectedDate.filter((h) => h.subjectName === name);
                return (
                  <div key={name} style={styles.homeworkSubjectBlock}>
                    <div style={{ ...styles.homeworkSubjectName, color: subjectColor(name) }}>{name}</div>
                    {items.map((h) => (
                      <HomeworkItem
                        key={h.id}
                        hw={h}
                        onToggleDone={() => updateHomework(h.id, { done: !h.done })}
                        onRemove={() => removeHomework(h.id)}
                        onAttach={(file) => attachFileToHomework(h.id, file)}
                        onOpenAttachment={openAttachment}
                        onRemoveAttachment={(key) => removeAttachment(h.id, key)}
                        onUpdateReminder={(reminderDays) => updateHomework(h.id, { reminderDays })}
                      />
                    ))}
                    <HomeworkAddForm onAdd={(text, minutes) => addHomework(selectedDate, name, text, minutes)} />
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div style={styles.journalForm}>
          <input type="date" value={jForm.date} onChange={(e) => setJForm({ ...jForm, date: e.target.value })} style={styles.dateInput} />
          <select value={jForm.subjectId} onChange={(e) => setJForm({ ...jForm, subjectId: e.target.value })} style={styles.select}>
            {ALL_SUBJECTS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <input
            type="number"
            min="0"
            step="0.5"
            value={jForm.hours}
            onChange={(e) => setJForm({ ...jForm, hours: e.target.value })}
            style={styles.smallNumInput}
          />
          <input
            type="text"
            placeholder="Что прошли сегодня?"
            value={jForm.note}
            onChange={(e) => setJForm({ ...jForm, note: e.target.value })}
            style={styles.textInput}
          />
          <button onClick={addJournalEntry} style={styles.addBtn}>
            Записать
          </button>
        </div>

        <div style={styles.journalList}>
          {journal.length === 0 && <div style={styles.muted}>Записей пока нет — начните с первой.</div>}
          {journal.map((e) => {
            const s = ALL_SUBJECTS.find((s) => s.id === e.subjectId);
            return (
              <div key={e.id} style={styles.journalRow}>
                <span style={{ ...styles.dot, background: s?.color }} />
                <span style={styles.jDate}>{new Date(e.date).toLocaleDateString("ru-RU")}</span>
                <span style={styles.jSubj}>{s?.name}</span>
                <span style={styles.jHours}>{e.hours} ч</span>
                <span style={styles.jNote}>{e.note}</span>
                <button onClick={() => removeJournalEntry(e.id)} style={styles.removeBtn}>
                  ×
                </button>
              </div>
            );
          })}
        </div>
          </>
        )}
      </section>

      {/* Manual backup / cross-device transfer */}
      <section style={styles.card}>
        <button onClick={() => toggleSection("backup")} style={styles.sectionHeaderBtn}>
          <span style={styles.sectionChevron}>{openSections.backup ? "▾" : "▸"}</span>
          <h2 style={styles.h2Inline}>Перенос данных между устройствами</h2>
        </button>
        {openSections.backup && (
          <>
            <p style={styles.muted}>
              Если автоматическая синхронизация между устройствами не работает, данные можно перенести вручную:
              скопируйте текст на одном устройстве и вставьте его в поле импорта на другом.
            </p>
            <label style={styles.label}>Экспорт (скопируйте этот текст)</label>
            <textarea readOnly value={buildExportPayload()} style={styles.backupTextarea} onFocus={(e) => e.target.select()} />
            <div style={styles.backupRow}>
              <button onClick={copyExport} style={styles.addBtnSmall}>
                Скопировать
              </button>
              {copyMsg && <span style={styles.mutedSmall}>{copyMsg}</span>}
            </div>

            <label style={{ ...styles.label, marginTop: 16 }}>Импорт (вставьте текст с другого устройства)</label>
            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder="Вставьте сюда текст, скопированный на другом устройстве"
              style={styles.backupTextarea}
            />
            <div style={styles.backupRow}>
              <button onClick={handleImport} style={styles.addBtnSmall} disabled={!importText.trim()}>
                Импортировать
              </button>
              {importMsg && <span style={styles.mutedSmall}>{importMsg}</span>}
            </div>
            <p style={styles.muted}>
              Импорт полностью заменит текущие данные на этом устройстве данными из вставленного текста —
              используйте его на «пустом» или менее актуальном устройстве.
            </p>
          </>
        )}
      </section>

      <div style={styles.syncRow}>
        <button onClick={() => loadFromStorage()} style={styles.syncBtn} disabled={syncing}>
          {syncing ? "Обновление…" : "Обновить сейчас"}
        </button>
        <span style={styles.mutedSmall}>
          {lastSyncedAt
            ? `Синхронизировано в ${lastSyncedAt.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`
            : "Ещё не синхронизировано"}
          {syncDebug ? ` — ${syncDebug}` : ""}
        </span>
      </div>
      {saveErr && (
        <div style={styles.saveErr}>
          Не удалось сохранить последние изменения — повторяю попытку автоматически. Если ошибка не проходит,
          нажмите «Обновить сейчас» и проверьте соединение с интернетом.
        </div>
      )}
    </div>
  );
}

function TopicItem({
  subjectId,
  topic,
  notesOpen,
  onToggleNotes,
  linkOpen,
  onToggleLink,
  onSetUrl,
  onToggleDone,
  onDurationChange,
  onAddNote,
  onRemoveNote,
  onRemoveTopic,
}) {
  const [noteText, setNoteText] = useState("");
  const [noteMins, setNoteMins] = useState("15");
  const [urlDraft, setUrlDraft] = useState(topic.url || "");
  const notes = topic.notes || [];

  return (
    <div style={styles.topicBlock}>
      <div className="topic-row" style={styles.topicRow}>
        <label style={styles.topicLabel}>
          <input type="checkbox" checked={topic.done} onChange={onToggleDone} />
          {topic.url ? (
            <a
              className="lesson-link"
              href={topic.url}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              style={topic.done ? styles.topicDone : undefined}
            >
              {topic.name}
            </a>
          ) : (
            <span style={topic.done ? styles.topicDone : undefined}>{topic.name}</span>
          )}
        </label>
        <input
          type="number"
          min="5"
          value={topic.duration}
          onChange={(e) => onDurationChange(e.target.value)}
          style={styles.durationInput}
          title="Длительность урока, минут"
        />
        <span style={styles.hUnit}>мин</span>
        <button onClick={onToggleLink} style={styles.notesToggle} title="Добавить или изменить ссылку">
          {topic.url ? "ссылка ✓" : "+ ссылка"}
        </button>
        <button onClick={onToggleNotes} style={styles.notesToggle}>
          заметки{notes.length ? ` (${notes.length})` : ""}
        </button>
        {onRemoveTopic && (
          <button onClick={onRemoveTopic} style={styles.removeBtn}>
            ×
          </button>
        )}
      </div>

      {linkOpen && (
        <div style={styles.notesPanel}>
          <div style={styles.noteForm}>
            <input
              type="url"
              placeholder="https://..."
              value={urlDraft}
              onChange={(e) => setUrlDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onSetUrl(urlDraft)}
              style={styles.noteInput}
            />
            <button onClick={() => onSetUrl(urlDraft)} style={styles.addBtnSmall}>
              Сохранить
            </button>
            {topic.url && (
              <button
                onClick={() => {
                  setUrlDraft("");
                  onSetUrl("");
                }}
                style={styles.removeBtn}
                title="Убрать ссылку"
              >
                ×
              </button>
            )}
          </div>
        </div>
      )}

      {notesOpen && (
        <div style={styles.notesPanel}>
          {notes.map((n) => (
            <div key={n.id} style={styles.noteRow}>
              <span style={styles.noteDate}>{new Date(n.date).toLocaleDateString("ru-RU")}</span>
              <span style={styles.noteText}>{n.text}</span>
              <span style={styles.noteMins}>{n.minutes} мин</span>
              <button onClick={() => onRemoveNote(n.id)} style={styles.removeBtn}>
                ×
              </button>
            </div>
          ))}
          <div style={styles.noteForm}>
            <input
              type="text"
              placeholder="Например: законспектировал, осталось выучить конспект"
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              style={styles.noteInput}
            />
            <input
              type="number"
              min="0"
              step="5"
              value={noteMins}
              onChange={(e) => setNoteMins(e.target.value)}
              style={styles.smallNumInput}
              title="Затраченное время, минут"
            />
            <span style={styles.hUnit}>мин</span>
            <button
              onClick={() => {
                onAddNote(noteText, noteMins);
                setNoteText("");
              }}
              style={styles.addBtnSmall}
            >
              Добавить
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function AddTopicForm({ onAdd, color }) {
  const [val, setVal] = useState("");
  const [url, setUrl] = useState("");

  function submit() {
    if (!val.trim()) return;
    onAdd(val, url);
    setVal("");
    setUrl("");
  }

  return (
    <div style={styles.addTopicRow}>
      <input
        type="text"
        placeholder="Добавить свой урок"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        style={styles.addTopicInput}
      />
      <input
        type="url"
        placeholder="Ссылка (необязательно)"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        style={styles.addTopicUrlInput}
      />
      <button onClick={submit} style={{ ...styles.addBtn, background: color }}>
        +
      </button>
    </div>
  );
}

function AddSubjectForm({ onAdd, placeholder }) {
  const [val, setVal] = useState("");
  return (
    <div style={styles.addSubjectRow}>
      <input
        type="text"
        placeholder={placeholder || "Добавить свой предмет"}
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            onAdd(val);
            setVal("");
          }
        }}
        style={styles.addSubjectInput}
      />
      <button
        onClick={() => {
          onAdd(val);
          setVal("");
        }}
        style={styles.addBtn}
      >
        + Добавить предмет
      </button>
    </div>
  );
}

function ScheduleDay({ day, label, entries, onAdd, onUpdate, onRemove }) {
  return (
    <div style={styles.scheduleDayBlock}>
      <div style={styles.scheduleDayHeader}>{label}</div>
      {entries.length === 0 && <div style={styles.mutedSmall}>Уроков нет</div>}
      {entries.map((e) => (
        <ScheduleEntryRow key={e.id} entry={e} onUpdate={onUpdate} onRemove={() => onRemove(e.id)} />
      ))}
      <AddScheduleForm onAdd={onAdd} />
    </div>
  );
}

function ScheduleEntryRow({ entry, onUpdate, onRemove }) {
  return (
    <div style={{ ...styles.scheduleEntry, borderLeftColor: subjectColor(entry.subjectName || "") }}>
      <input
        type="text"
        placeholder="Предмет"
        value={entry.subjectName}
        onChange={(e) => onUpdate(entry.id, { subjectName: e.target.value })}
        style={styles.scheduleSubjectInput}
      />
      <div style={styles.scheduleTimeRow}>
        <input type="time" value={entry.start} onChange={(e) => onUpdate(entry.id, { start: e.target.value })} style={styles.scheduleTimeInput} />
        <span style={styles.mutedSmall}>–</span>
        <input type="time" value={entry.end} onChange={(e) => onUpdate(entry.id, { end: e.target.value })} style={styles.scheduleTimeInput} />
      </div>
      <input
        type="text"
        placeholder="Кабинет"
        value={entry.room}
        onChange={(e) => onUpdate(entry.id, { room: e.target.value })}
        style={styles.scheduleRoomInput}
      />
      <input
        type="text"
        placeholder="Преподаватель"
        value={entry.teacher}
        onChange={(e) => onUpdate(entry.id, { teacher: e.target.value })}
        style={styles.scheduleTeacherInput}
      />
      <button onClick={onRemove} style={styles.removeBtn}>
        ×
      </button>
    </div>
  );
}

function AddScheduleForm({ onAdd }) {
  const [subjectName, setSubjectName] = useState("");
  const [start, setStart] = useState("08:30");
  const [end, setEnd] = useState("09:15");
  const [room, setRoom] = useState("");
  const [teacher, setTeacher] = useState("");

  function submit() {
    if (!subjectName.trim()) return;
    onAdd({ subjectName, start, end, room, teacher });
    setSubjectName("");
    setRoom("");
    setTeacher("");
  }

  return (
    <div style={styles.addScheduleRow}>
      <input
        type="text"
        placeholder="Предмет"
        value={subjectName}
        onChange={(e) => setSubjectName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        style={styles.scheduleSubjectInput}
      />
      <div style={styles.scheduleTimeRow}>
        <input type="time" value={start} onChange={(e) => setStart(e.target.value)} style={styles.scheduleTimeInput} />
        <span style={styles.mutedSmall}>–</span>
        <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} style={styles.scheduleTimeInput} />
      </div>
      <input type="text" placeholder="Кабинет" value={room} onChange={(e) => setRoom(e.target.value)} style={styles.scheduleRoomInput} />
      <input
        type="text"
        placeholder="Преподаватель"
        value={teacher}
        onChange={(e) => setTeacher(e.target.value)}
        style={styles.scheduleTeacherInput}
      />
      <button onClick={submit} style={styles.addBtnSmall}>
        + Урок
      </button>
    </div>
  );
}

function HomeworkAddForm({ onAdd }) {
  const [val, setVal] = useState("");
  const [minutes, setMinutes] = useState("20");
  function submit() {
    if (!val.trim()) return;
    onAdd(val, minutes);
    setVal("");
  }
  return (
    <div style={styles.homeworkAddRow}>
      <input
        type="text"
        placeholder="Например: параграф 12, упр. 5–8"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        style={styles.homeworkInput}
      />
      <input
        type="number"
        min="0"
        step="5"
        value={minutes}
        onChange={(e) => setMinutes(e.target.value)}
        style={styles.homeworkMinutesInput}
        title="Сколько времени нужно, минут"
      />
      <span style={styles.mutedSmall}>мин</span>
      <button onClick={submit} style={styles.addBtnSmall}>
        +
      </button>
    </div>
  );
}

function HomeworkItem({ hw, onToggleDone, onRemove, onAttach, onOpenAttachment, onRemoveAttachment, onUpdateReminder }) {
  const fileInputRef = useRef(null);
  const reminderMode = hw.reminderDays === "always" ? "always" : !hw.reminderDays || hw.reminderDays === 1 ? "1" : "custom";
  const customDays = typeof hw.reminderDays === "number" && hw.reminderDays !== 1 ? hw.reminderDays : 3;

  return (
    <div style={styles.homeworkItemBlock}>
      <div style={styles.homeworkItemRow}>
        <input type="checkbox" checked={!!hw.done} onChange={onToggleDone} />
        <span style={hw.done ? { ...styles.homeworkText, ...styles.topicDone } : styles.homeworkText}>{hw.text}</span>
        {hw.minutes > 0 && <span style={styles.mutedSmall}>{hw.minutes} мин</span>}
        <button onClick={() => fileInputRef.current?.click()} style={styles.attachBtn} title="Прикрепить файл">
          📎
        </button>
        <input
          ref={fileInputRef}
          type="file"
          style={{ display: "none" }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onAttach(file);
            e.target.value = "";
          }}
        />
        <button onClick={onRemove} style={styles.removeBtn}>
          ×
        </button>
      </div>
      {(hw.attachments || []).length > 0 && (
        <div style={styles.attachmentsRow}>
          {hw.attachments.map((a) => (
            <span key={a.key} style={styles.attachmentChip}>
              <button onClick={() => onOpenAttachment(a)} style={styles.attachmentLink}>
                {a.name}
              </button>
              <button onClick={() => onRemoveAttachment(a.key)} style={styles.removeBtn}>
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <div style={styles.reminderRow}>
        <span style={styles.mutedSmall}>Напоминать:</span>
        <select
          value={reminderMode}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "1") onUpdateReminder(1);
            else if (v === "always") onUpdateReminder("always");
            else onUpdateReminder(customDays);
          }}
          style={styles.reminderSelect}
        >
          <option value="1">за день до срока</option>
          <option value="always">всегда</option>
          <option value="custom">за N дней</option>
        </select>
        {reminderMode === "custom" && (
          <>
            <input
              type="number"
              min="0"
              value={customDays}
              onChange={(e) => onUpdateReminder(Math.max(0, Number(e.target.value) || 0))}
              style={styles.reminderDaysInput}
            />
            <span style={styles.mutedSmall}>дн.</span>
          </>
        )}
      </div>
    </div>
  );
}

const styles = {
  page: {
    fontFamily: "Inter, system-ui, sans-serif",
    background: "#EFEBE1",
    color: "#2B2822",
    minHeight: "100vh",
    padding: "28px 20px 60px",
    maxWidth: 880,
    margin: "0 auto",
  },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 20, flexWrap: "wrap", marginBottom: 20 },
  eyebrow: { fontSize: 13, color: "#8C7326", fontWeight: 600, marginBottom: 4 },
  h1: { fontFamily: "'PT Serif', Georgia, serif", fontSize: 28, margin: 0, lineHeight: 1.25, maxWidth: 480 },
  h2: { fontFamily: "'PT Serif', Georgia, serif", fontSize: 20, margin: "0 0 10px" },
  h2Inline: { fontFamily: "'PT Serif', Georgia, serif", fontSize: 20, margin: 0 },
  sectionHeaderBtn: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    width: "100%",
    background: "none",
    border: "none",
    padding: 0,
    marginBottom: 10,
    textAlign: "left",
  },
  sectionChevron: { fontSize: 13, color: "#8A8370", width: 12, flexShrink: 0 },
  countdownBox: { background: "#2B2822", color: "#EFEBE1", borderRadius: 4, padding: "14px 20px", textAlign: "center", minWidth: 150 },
  countdownNum: { fontFamily: "'PT Serif', Georgia, serif", fontSize: 34, lineHeight: 1 },
  countdownLabel: { fontSize: 12, opacity: 0.75, marginTop: 2, marginBottom: 8 },
  dateInput: { border: "1px solid #4A4638", background: "transparent", color: "inherit", borderRadius: 3, padding: "4px 6px", fontSize: 12, width: "100%" },
  overallBar: { marginBottom: 24 },
  overallTrack: { height: 8, background: "#DCD5C4", borderRadius: 4, overflow: "hidden" },
  overallFill: { height: "100%", background: "#2B2822" },
  overallText: { fontSize: 13, color: "#5A5347", marginTop: 6 },
  card: { background: "#F7F4EC", border: "1px solid #DCD5C4", borderRadius: 6, padding: 22, marginBottom: 26 },
  muted: { fontSize: 13.5, color: "#6B6656", lineHeight: 1.55, marginTop: 0 },
  label: { fontSize: 13, fontWeight: 600, color: "#4A4638", display: "block", marginBottom: 6 },
  dailyGoalsBlock: { marginBottom: 18 },
  dailyGoalsRow: { display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8, marginTop: 4 },
  dailyGoalCell: { display: "flex", flexDirection: "column", alignItems: "center", gap: 3 },
  dailyGoalLabel: { fontSize: 11.5, color: "#8A8370" },
  dailyGoalInput: { width: 52, padding: "4px 5px", border: "1px solid #C9C1AC", borderRadius: 4, fontSize: 13, textAlign: "center", background: "#fff" },
  dailyGoalHours: { fontSize: 11, color: "#6B6656" },
  allocGrid: { display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 },
  allocRow: { display: "flex", alignItems: "center", gap: 10 },
  dot: { width: 10, height: 10, borderRadius: "50%", flexShrink: 0, display: "inline-block" },
  allocName: { fontSize: 13.5, width: 120, flexShrink: 0 },
  smallNumInput: { width: 52, padding: "4px 6px", border: "1px solid #C9C1AC", borderRadius: 4, fontSize: 13, background: "#fff" },
  hUnit: { fontSize: 11.5, color: "#8A8370", width: 34 },
  capacityBox: { border: "1px solid", borderRadius: 5, padding: "12px 14px", fontSize: 13.5, lineHeight: 1.9, background: "#fff" },
  skewWarning: {
    marginTop: 10,
    padding: "10px 14px",
    background: "#F3E7E7",
    border: "1px solid #C99A9A",
    borderRadius: 5,
    fontSize: 13.5,
    color: "#7A3A3A",
    fontWeight: 600,
  },
  skewWarningInline: {
    marginTop: 8,
    fontSize: 13,
    color: "#7A3A3A",
    fontWeight: 600,
  },
  warn: { color: "#8B4A4A", fontWeight: 600 },
  ppfSection: { marginTop: 20, display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-start" },
  ppfControls: { flex: "1 1 220px", minWidth: 220 },
  select: { padding: "6px 8px", border: "1px solid #C9C1AC", borderRadius: 4, fontSize: 13, background: "#fff" },
  svg: { flex: "1 1 280px", maxWidth: 320, background: "#fff", border: "1px solid #DCD5C4", borderRadius: 5 },
  subjGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14 },
  subjCard: { background: "#F7F4EC", border: "1px solid", borderRadius: 6, padding: "14px 16px", transition: "transform 0.15s ease" },
  subjHeader: { display: "flex", alignItems: "center", gap: 8, flex: 1, background: "none", border: "none", padding: 0, textAlign: "left" },
  subjHeaderRow: { display: "flex", alignItems: "center", gap: 4 },
  addSubjectRow: { display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" },
  addSubjectInput: { flex: "1 1 240px", padding: "7px 10px", border: "1px solid #C9C1AC", borderRadius: 4, fontSize: 13.5, background: "#fff" },
  scheduleGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12, marginTop: 16 },
  scheduleDayBlock: { background: "#fff", border: "1px solid #DCD5C4", borderRadius: 6, padding: "10px 12px" },
  scheduleDayHeader: { fontSize: 13.5, fontWeight: 700, marginBottom: 8 },
  mutedSmall: { fontSize: 12, color: "#8A8370" },
  scheduleEntry: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    borderLeft: "3px solid",
    paddingLeft: 8,
    marginBottom: 8,
    paddingBottom: 6,
    borderBottom: "1px solid #E7E1D2",
  },
  scheduleSelect: { padding: "4px 6px", border: "1px solid #C9C1AC", borderRadius: 4, fontSize: 12.5, background: "#fff", width: "100%" },
  scheduleSubjectInput: { padding: "4px 6px", border: "1px solid #C9C1AC", borderRadius: 4, fontSize: 12.5, background: "#fff", fontWeight: 600 },
  scheduleTimeRow: { display: "flex", alignItems: "center", gap: 4 },
  scheduleTimeInput: { padding: "3px 4px", border: "1px solid #C9C1AC", borderRadius: 4, fontSize: 12, background: "#fff", width: 82 },
  scheduleRoomInput: { padding: "4px 6px", border: "1px solid #C9C1AC", borderRadius: 4, fontSize: 12.5, background: "#fff" },
  scheduleTeacherInput: { padding: "4px 6px", border: "1px solid #C9C1AC", borderRadius: 4, fontSize: 12.5, background: "#fff" },
  addScheduleRow: { display: "flex", flexDirection: "column", gap: 4, marginTop: 6, paddingTop: 6, borderTop: "1px dashed #DCD5C4" },
  subjName: { fontSize: 15.5, fontWeight: 600, flex: 1, color: "#2B2822" },
  subjPct: { fontSize: 12.5, color: "#6B6656" },
  miniTrack: { height: 5, background: "#DCD5C4", borderRadius: 3, marginTop: 10, overflow: "hidden" },
  miniFill: { height: "100%" },
  topicList: { marginTop: 12, display: "flex", flexDirection: "column", gap: 4, maxHeight: 380, overflowY: "auto" },
  topicBlock: { borderBottom: "1px solid #E7E1D2", paddingBottom: 4 },
  topicRow: { display: "flex", alignItems: "center", gap: 6, fontSize: 13, padding: "5px 4px", borderRadius: 3 },
  topicLabel: { display: "flex", alignItems: "center", gap: 8, flex: 1, cursor: "pointer" },
  topicDone: { textDecoration: "line-through", color: "#9A927D" },
  durationInput: { width: 44, padding: "3px 5px", border: "1px solid #C9C1AC", borderRadius: 4, fontSize: 12, background: "#fff" },
  notesToggle: { background: "none", border: "1px solid #C9C1AC", borderRadius: 4, fontSize: 11.5, padding: "3px 7px", color: "#5A5347" },
  removeBtn: { marginLeft: 2, background: "none", border: "none", color: "#B08A8A", fontSize: 16, lineHeight: 1, padding: "0 4px" },
  notesPanel: { margin: "4px 0 8px 26px", padding: "8px 10px", background: "#fff", border: "1px solid #E7E1D2", borderRadius: 5 },
  noteRow: { display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, padding: "3px 0" },
  noteDate: { color: "#8A8370", width: 68, flexShrink: 0 },
  noteText: { flex: 1, color: "#4A4638" },
  noteMins: { color: "#6B6656", width: 46, flexShrink: 0, textAlign: "right" },
  noteForm: { display: "flex", alignItems: "center", gap: 6, marginTop: 6, flexWrap: "wrap" },
  noteInput: { flex: "1 1 180px", padding: "5px 8px", border: "1px solid #C9C1AC", borderRadius: 4, fontSize: 12.5, background: "#fff" },
  addBtnSmall: { border: "none", color: "#fff", background: "#2B2822", borderRadius: 4, padding: "5px 10px", fontSize: 12, fontWeight: 600 },
  addTopicRow: { display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" },
  addTopicInput: { flex: 1, padding: "5px 8px", border: "1px solid #C9C1AC", borderRadius: 4, fontSize: 13, background: "#fff" },
  addTopicUrlInput: { flex: "1 1 160px", padding: "5px 8px", border: "1px solid #C9C1AC", borderRadius: 4, fontSize: 13, background: "#fff" },
  addBtn: { border: "none", color: "#fff", background: "#2B2822", borderRadius: 4, padding: "6px 12px", fontSize: 13, fontWeight: 600 },
  calendarWrap: { marginBottom: 18 },
  calHeader: { display: "flex", alignItems: "center", justifyContent: "center", gap: 16, marginBottom: 8 },
  calNavBtn: { background: "none", border: "1px solid #C9C1AC", borderRadius: 4, width: 28, height: 28, fontSize: 15, color: "#2B2822" },
  calMonthLabel: { fontSize: 14.5, fontWeight: 600, textTransform: "capitalize", minWidth: 150, textAlign: "center" },
  calWeekdays: { display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 4 },
  calWeekday: { fontSize: 11, color: "#8A8370", textAlign: "center" },
  calGrid: { display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 },
  calCell: { position: "relative", aspectRatio: "1", border: "none", borderRadius: 4, fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center" },
  hwDot: { position: "absolute", bottom: 3, width: 4, height: 4, borderRadius: "50%", background: "#8C7326" },
  dayDetail: { background: "#fff", border: "1px solid #DCD5C4", borderRadius: 5, padding: "12px 14px", marginBottom: 16 },
  homeworkBlock: { marginTop: 12, paddingTop: 10, borderTop: "1px dashed #DCD5C4" },
  homeworkTitle: { fontSize: 13, fontWeight: 700, marginBottom: 6 },
  homeworkSubjectBlock: { marginBottom: 10 },
  homeworkSubjectName: { fontSize: 12.5, fontWeight: 700, marginBottom: 3 },
  homeworkItemBlock: { marginBottom: 4 },
  homeworkItemRow: { display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, padding: "3px 0" },
  homeworkText: { flex: 1, color: "#4A4638" },
  homeworkAddRow: { display: "flex", alignItems: "center", gap: 6, marginTop: 4, flexWrap: "wrap" },
  homeworkInput: { flex: "1 1 160px", padding: "5px 8px", border: "1px solid #C9C1AC", borderRadius: 4, fontSize: 12.5, background: "#fff" },
  homeworkMinutesInput: { width: 46, padding: "4px 5px", border: "1px solid #C9C1AC", borderRadius: 4, fontSize: 12, background: "#fff" },
  attachBtn: { background: "none", border: "none", fontSize: 13, padding: "0 2px" },
  attachmentsRow: { display: "flex", flexWrap: "wrap", gap: 6, marginLeft: 24, marginBottom: 4 },
  attachmentChip: {
    display: "inline-flex",
    alignItems: "center",
    gap: 2,
    background: "#F0ECE1",
    borderRadius: 10,
    padding: "2px 4px 2px 8px",
    fontSize: 11.5,
  },
  attachmentLink: { background: "none", border: "none", color: "#2F4E70", textDecoration: "underline", fontSize: 11.5, padding: 0 },
  reminderRow: { display: "flex", alignItems: "center", gap: 6, marginLeft: 24, marginBottom: 6 },
  reminderSelect: { padding: "2px 4px", border: "1px solid #C9C1AC", borderRadius: 4, fontSize: 11.5, background: "#fff" },
  reminderDaysInput: { width: 40, padding: "2px 4px", border: "1px solid #C9C1AC", borderRadius: 4, fontSize: 11.5, background: "#fff" },
  hwBanner: {
    background: "#EFE7D0",
    border: "1px solid #C9B87A",
    borderRadius: 6,
    padding: "12px 16px",
    marginBottom: 16,
  },
  hwBannerTitle: { fontSize: 13.5, fontWeight: 700, marginBottom: 6, color: "#6B5A1E" },
  hwBannerRow: { fontSize: 13, color: "#4A4638", marginBottom: 2 },
  hwBannerSubject: { fontWeight: 700 },
  hwBannerMinutes: { color: "#8A8370" },
  dayDetailTitle: { fontSize: 13.5, fontWeight: 600, marginBottom: 8, textTransform: "capitalize" },
  journalForm: { display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16, alignItems: "center" },
  textInput: { flex: "1 1 200px", padding: "6px 8px", border: "1px solid #C9C1AC", borderRadius: 4, fontSize: 13.5, background: "#fff" },
  journalList: { display: "flex", flexDirection: "column", gap: 4, maxHeight: 320, overflowY: "auto" },
  journalRow: { display: "flex", alignItems: "center", gap: 10, fontSize: 13.5, padding: "7px 8px", borderBottom: "1px solid #E7E1D2" },
  jDate: { color: "#8A8370", width: 78, flexShrink: 0 },
  jSubj: { width: 100, flexShrink: 0, fontWeight: 600 },
  jHours: { width: 44, flexShrink: 0, color: "#6B6656" },
  jNote: { flex: 1, color: "#4A4638" },
  saveErr: { fontSize: 12, color: "#8B4A4A", marginTop: 10, lineHeight: 1.6 },
  syncRow: { display: "flex", alignItems: "center", gap: 10, marginTop: 20, paddingTop: 12, borderTop: "1px solid #DCD5C4" },
  syncBtn: {
    border: "1px solid #C9C1AC",
    background: "#fff",
    borderRadius: 4,
    padding: "5px 10px",
    fontSize: 12.5,
    color: "#2B2822",
  },
  backupTextarea: {
    width: "100%",
    minHeight: 90,
    padding: "8px 10px",
    border: "1px solid #C9C1AC",
    borderRadius: 5,
    fontSize: 11.5,
    fontFamily: "monospace",
    background: "#fff",
    resize: "vertical",
    boxSizing: "border-box",
  },
  backupRow: { display: "flex", alignItems: "center", gap: 10, marginTop: 6, marginBottom: 4, flexWrap: "wrap" },
};
