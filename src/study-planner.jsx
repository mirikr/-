import React, { useState, useEffect, useRef, useMemo, useCallback, lazy, Suspense } from "react";
import { get as storageGet, set as storageSet, onAuthChange, cloudAvailable } from "./storage.js";
import { stampState, mergeStates, mergeSerialized } from "./sync-state.js";
import Notebook, { Attachments, FileGrid, sameFile } from "./notebook.jsx";
import NotebookSubjects from "./notebook-subjects.jsx";
import { orderOwners, togglePin, moveOwner } from "./notebook-order.js";
import RichText from "./rich-text.jsx";
import Collapsible from "./collapsible.jsx";
import HoursChart from "./hours-chart.jsx";
import { buildIcs } from "./calendar.js";
import { sequenceItems } from "./calendar-seq.js";
import { newFeedToken, publishFeed, feedUrls, removeFeed } from "./calendar-feed.js";
import AutoGrow from "./auto-grow.jsx";
import EventDetails from "./event-details.jsx";
import { eventDescription, eventTime } from "./event-details.js";
import CalendarHowTo, { CalendarSyncNote } from "./calendar-howto.jsx";
import { Rail, ScreenHead, TabBar, Countdowns, Icon } from "./shell.jsx";
import DesignIntroDialog, { DESIGN_INTRO_KEY, DESIGN_INTRO_VERSION } from "./design-intro.jsx";
import { CardHead } from "./card-head.jsx";
import MoreMenu from "./more-menu.jsx";
import NotebookWorkspace from "./notebook-workspace.jsx";
import BalanceChart from "./balance-chart.jsx";
import InstallHint from "./install-hint.jsx";
import CloudPanel from "./cloud-panel.jsx";
import { currentUser, signOut, authReady, cloudConfigured } from "./supabase.js";
import { THEME_CSS, useThemeMode } from "./theme.js";
import ReleaseNotesDialog from "./release-notes.jsx";
import IntroDialog from "./intro-dialog.jsx";
import Background from "./background.jsx";
import { EASTER_EGGS } from "./constellations.js";
import { platform as detectPlatform } from "./device.js";
import { attachFile, attachmentUrl, removeAttachment as deleteAttachment } from "./files.js";
import NowCard from "./now-card.jsx";
// Набор заданий весит мегабайты — он грузится отдельным куском, когда открывают
// тренажёр, а не вместе со всем приложением.
const Trainer = lazy(() => import("./trainer.jsx"));
import { BANK_SUBJECTS } from "./fipi-index.js";
import { cheapestGoal, dayCounts, offerFor, subjectsByTask, trainerDays, trainerEntries } from "./trainer-time.js";
import { loadFind } from "./bank-load.js";
import OlympiadPreset from "./lyceum-olympiads-panel.jsx";
import { dueTopics, reviewHours, agoWord } from "./repetition.js";
import { search as searchAll, markParts } from "./search.js";
import SchedulePreset from "./lyceum-preset.jsx";
import { KT_PRESET_ID, DEFAULT_KT, buildExams } from "./lyceum-exams-10.js";
import { VOSH_PRESET_ID, DEFAULT_VOSH, buildOlympiads } from "./lyceum-olympiads.js";
import { LYCEUM_REVISION, PRESET_ID, buildSchedule } from "./lyceum-schedule-10.js";

// Duration is stored in minutes for each lesson.
const D = 60;
const BASE_URL = "https://veber.zenclass.ru/student/courses/1412a450-ed64-4ed4-afd8-0029750d888d/lessons/";
const L = (name, id) => ({ name, url: BASE_URL + id });

const WEEKDAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const LYCEUM_DAYS = WEEKDAY_KEYS.filter((k) => k !== "sun");
const WEEKDAY_LABELS = { mon: "Пн", tue: "Вт", wed: "Ср", thu: "Чт", fri: "Пт", sat: "Сб", sun: "Вс" };
const DOW_TO_KEY = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"]; // Date.getDay(): 0 = Sunday
// Priority of an exam or olympiad stage. The mark is what the person actually sees;
// the number is what the schedule maths sorts by.
const EVENT_PRIORITIES = [
  // strong и tint — для карточек расписания: тонкая полоска сбоку читалась плохо.
  { value: 1, mark: "!", label: "не особо важно", color: "var(--mute)", strong: "var(--ink3)", tint: "var(--neutralBg)" },
  { value: 2, mark: "⚡", label: "важно", color: "var(--accent)", strong: "var(--gold)", tint: "var(--warmBg)" },
  { value: 3, mark: "⚡⚡⚡", label: "очень важно", color: "var(--red)", strong: "var(--redStrong)", tint: "var(--redBg)" },
];

// Weight of a lyceum lesson. Order matters: later entries outrank earlier ones when the same
// subject appears twice in a day.
// Тип урока — это про программу, а не про важность: важность ученик ставит сам,
// значками рядом с названием предмета.
const LESSON_LEVELS = [
  { value: "base", short: "база", label: "база", color: "var(--mute)" },
  { value: "prof", short: "проф", label: "проф", color: "var(--blue)" },
  { value: "olymp", short: "спецкурс", label: "олимпиадный спецкурс", color: "var(--red)" },
  { value: "outside", short: "вне лицея", label: "урок вне лицея", color: "var(--purple)" },
];

const SUBJECT_COLOR_PALETTE = ["#4A6B6B", "#7A5233", "#5C4A80", "#8C7326", "#2F4E70", "#8B4A4A", "#3F6E52", "#6B4A6B"];

const SUBJECT_DEFS = [
  {
    id: "law",
    name: "Право",
    color: "var(--red)",
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
    color: "var(--green)",
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
    color: "var(--blue)",
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
    color: "var(--accent)",
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
    color: "var(--purple)",
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
// Открытый экран и тема живут на устройстве, а не в данных, поэтому у них свои ключи.
const SCREEN_KEY = "planner-screen";
// Разовое окно об обновлении: помним последнюю версию, о которой рассказали.
// Ключ свой на каждом устройстве — апдейт и приходит на каждое отдельно.
// Номера версий событий календаря — память устройства (src/calendar-seq.js).
const CALENDAR_SEQ_KEY = "planner-calendar-seq";
function readCalendarSeq() {
  try {
    return JSON.parse(localStorage.getItem(CALENDAR_SEQ_KEY) || "{}") || {};
  } catch (e) {
    return {};
  }
}
function writeCalendarSeq(memory) {
  try {
    localStorage.setItem(CALENDAR_SEQ_KEY, JSON.stringify(memory));
  } catch (e) {
    /* приватное окно — номера начнутся заново, календарь это переживёт */
  }
}

const TASK_FOLDS_KEY = "planner-task-folds";
function readTaskFolds() {
  try {
    const raw = localStorage.getItem(TASK_FOLDS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (e) {
    return {};
  }
}
const INTRO_KEY = "planner-intro-version";
// Про что именно рассказываем. Привязка к номеру приложения всплывала бы с
// каждым обновлением, а рассказ один и тот же.
const INTRO_VERSION = "0.6.0-schedule";
// Живой фон — настройка устройства, а не данных: на слабом телефоне его можно
// выключить, не трогая второй.
const BG_KEY = "planner-background";

function readBackgroundOn() {
  try {
    return localStorage.getItem(BG_KEY) !== "off";
  } catch (e) {
    return true;
  }
}

// Номер недели по ISO: неделя начинается с понедельника, а у года их 52-53.
function weekKey(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const start = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - start) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}
const HOURS = Array.from({ length: 24 }, (_, i) => i);

// Встроенные предметы (право, экономика, политология, социология, философия,
// история) — это подготовка одного человека с его уроками и ссылками на курс.
// Всем остальным они ни к чему: пустой ежедневник честнее чужого плана.
const OWNER_EMAIL = "reuttmir@gmail.com";

function isOwnerEmail(email) {
  return String(email || "").trim().toLowerCase() === OWNER_EMAIL;
}

function levelInfo(value) {
  return LESSON_LEVELS.find((l) => l.value === value) || LESSON_LEVELS[0];
}

const UNDO_SECONDS = 20;

// Запись откладывается на SAVE_DEBOUNCE_MS после последней правки, но не дольше
// SAVE_MAX_WAIT_MS с момента первой несохранённой: иначе длинный конспект, который
// печатают без пауз, не сохранялся бы вовсе — каждая буква сдвигала бы таймер.
const SAVE_DEBOUNCE_MS = 700;
const SAVE_MAX_WAIT_MS = 15000;

const EVENT_ALARM_DAYS = { 1: 1, 2: 3, 3: 7 };

// Экзамен и олимпиада живут в расписании по-разному от урока: у них есть дата,
// и по ней всё и считается — в какой день недели они попадают и пора ли их
// показывать. Событие наверху и запись в расписании — одно и то же: событие
// строится из записи, отдельной копии нет, поэтому расходиться нечему.
const EXAM_KINDS = [
  { value: "exam", label: "Экзамен" },
  { value: "olympiad", label: "Олимпиада" },
];

function examKindLabel(value) {
  return value === "olympiad" ? "олимпиада" : "экзамен";
}

// За сколько дней до даты запись возвращается в недельную сетку. Ровно неделя
// впереди — ещё рано: сетка про «эту неделю», а не про следующую.
const EXAM_SCHEDULE_DAYS = 7;
const EXAM_TOAST = { hint: "Нажмите крестик — вернётесь к правке.", cancelTitle: "Вернуться к правке", confirmTitle: "Хорошо" };

const SCHEDULE_EVENT_PREFIX = "sch-ev:";

const JOURNAL_PAGE = 50;

// Значок напоминания. Рисунок должен читаться рядом с заголовком в 19 пикселей
// и двумя строками текста под ним — мелкий на этом фоне выглядел случайным.
const MARK_SIZE = 46;

// Урок в сетке повторяется каждую неделю, а у задания дата одна. Ближайший
// такой день недели — сегодня, если он ещё не прошёл, иначе следующая неделя.
function nextDateForDay(dayKey) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let step = 0; step < 7; step += 1) {
    const d = new Date(today);
    d.setDate(today.getDate() + step);
    if (DOW_TO_KEY[d.getDay()] === dayKey) return ymd(d);
  }
  return ymd(today);
}

function weekdayKeyFromDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr + "T00:00:00");
  if (Number.isNaN(d.getTime())) return null;
  return DOW_TO_KEY[d.getDay()];
}

// Без даты запись видно всегда — иначе её негде было бы дозаполнить.
function examVisibleInSchedule(entry) {
  if (!entry.date) return true;
  const left = daysUntilDate(entry.date);
  return left >= 0 && left < EXAM_SCHEDULE_DAYS;
}

// Где экзамен стоит в неделе расписания. «near» — до даты меньше недели: запись
// наверху своего дня, как урок. «far» — дальше: полупрозрачно внизу дня, её
// можно свернуть. «past» — прошла, в неделе не видна. «nodate» — дата не задана.
function examPlace(entry) {
  if (!entry.date) return "nodate";
  const left = daysUntilDate(entry.date);
  if (left < 0) return "past";
  return left < EXAM_SCHEDULE_DAYS ? "near" : "far";
}

// «на четверг», «на среду»: день недели в винительном падеже.
const WEEKDAY_ON = { mon: "понедельник", tue: "вторник", wed: "среду", thu: "четверг", fri: "пятницу", sat: "субботу", sun: "воскресенье" };

// Экзамен встаёт на день недели по своей дате — не туда, где его заводили или
// правили. Без объяснения это выглядит как потерянная запись, поэтому о
// переезде говорит уведомление.
function examMovedNote(entry, added) {
  const olympiad = entry.examKind === "olympiad";
  const what = olympiad ? "Олимпиада" : "Экзамен";
  const verb = added ? (olympiad ? "добавлена" : "добавлен") : olympiad ? "перенесена" : "перенесён";
  const name = entry.subjectName && entry.subjectName.trim() ? ` «${entry.subjectName.trim()}»` : "";
  if (!entry.date) return `${what}${name} ${verb} без даты — впишите дату, и запись встанет на свой день недели`;
  const day = weekdayKeyFromDate(entry.date);
  const when = `${WEEKDAY_ON[day] || ""}, ${formatEventDate(entry.date)}`;
  const place = examPlace(entry);
  if (place === "past") return `${what}${name} ${verb} на ${when}: эта дата уже прошла, в расписании запись не видна`;
  if (place === "far") {
    return `${what}${name} ${verb} на ${when}: пока полупрозрачно внизу дня, наверх встанет за неделю до даты`;
  }
  return `${what}${name} ${verb} на ${when}`;
}

// Порядок в дне расписания: ближние экзамены наверху, уроки по времени, дальние
// экзамены — в самом низу, по дате.
function byWeekOrder(a, b) {
  const rank = (e) => (e.kind !== "exam" ? 1 : examPlace(e) === "far" ? 2 : 0);
  const ra = rank(a);
  const rb = rank(b);
  if (ra !== rb) return ra - rb;
  if (ra === 2) return String(a.date).localeCompare(String(b.date));
  return String(a.start).localeCompare(String(b.start));
}

// Сколько минут между «10:00» и «13:00»; без конца — час.
function spanMinutes(start, end) {
  const toMin = (t) => {
    const m = String(t || "").match(/^(\d{1,2}):(\d{2})$/);
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  };
  const a = toMin(start);
  const b = toMin(end);
  return a !== null && b !== null && b > a ? b - a : 60;
}

function eventIcsItem(event) {
  const info = priorityInfo(event.priority);
  return {
    uid: event.id,
    title: `${info.mark} ${event.name}`,
    date: event.date,
    // Событие со временем встаёт в календаре на свой час, а не на весь день.
    time: event.start || "",
    minutes: spanMinutes(event.start, event.end),
    description: event.description || "",
    alarmDaysBefore: EVENT_ALARM_DAYS[Number(event.priority)] || 1,
  };
}

function homeworkIcsItem(hw) {
  const days = hw.reminderDays === "always" ? 3 : Number(hw.reminderDays) || 1;
  return {
    uid: hw.id,
    title: (hw.subjectName ? hw.subjectName + ": " : "") + hw.text,
    date: hw.date,
    description: hw.minutes ? `Примерно ${hw.minutes} мин` : "",
    alarmDaysBefore: days,
  };
}

// Встроенные предметы окрашены токенами палитры, чтобы в ночной теме читаться
// так же, как днём. Поле выбора цвета токенов не понимает — ему нужен обычный
// hex, поэтому для него токен разворачивается в дневной цвет.
const TOKEN_HEX = {
  "var(--red)": "#8B4A4A",
  "var(--green)": "#3F6E52",
  "var(--blue)": "#2F4E70",
  "var(--accent)": "#8C7326",
  "var(--purple)": "#5C4A80",
  "var(--gold)": "#C9A227",
  "var(--mute)": "#8A8370",
  "var(--ink)": "#2B2822",
};

function hexOf(color) {
  const value = String(color || "");
  if (TOKEN_HEX[value]) return TOKEN_HEX[value];
  return /^#[0-9A-Fa-f]{3,8}$/.test(value) ? value : "#8C7326";
}

function priorityInfo(value) {
  return EVENT_PRIORITIES.find((p) => p.value === Number(value)) || EVENT_PRIORITIES[1];
}

// Whole days from today to the given date: 0 today, negative once it has passed.
function daysUntilDate(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + "T00:00:00");
  return Math.round((target - today) / 86400000);
}

function formatEventDate(dateStr) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function capitalizeFirst(text) {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

// Голая цифра рядом с разделом ничего не говорит: «Сегодня 9» — девять чего?
function plural(n, one, few, many) {
  const last = n % 10;
  const two = n % 100;
  if (two >= 11 && two <= 14) return many;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return few;
  return many;
}

function lessonsWord(n) {
  return plural(n, "урок", "урока", "уроков");
}

function eventsWord(n) {
  return plural(n, "событие", "события", "событий");
}

function tasksWord(n) {
  return plural(n, "задание", "задания", "заданий");
}

function daysWord(n) {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return "дней";
  if (last === 1) return "день";
  if (last >= 2 && last <= 4) return "дня";
  return "дней";
}

// Предмет без своей записи в data — не выдумка: свои предметы и их содержимое
// лежат в состоянии по отдельности, и при слиянии с другого устройства первое
// доезжало раньше второго. Приложение на этом падало белым экраном, а вместе с
// ним пропадал доступ ко всем записям, поэтому пустая заготовка отдаётся всегда.
const EMPTY_SUBJECT = { topics: [], custom: [] };

function subjectData(data, id) {
  return data[id] || EMPTY_SUBJECT;
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

// Часы в строке дневника. Полчаса — это «0,5 ч», а четыре минуты тренажёра
// округлились бы в «0 ч», поэтому такое время показываем минутами.
function hoursLabel(hours) {
  const h = Number(hours) || 0;
  const rounded = Math.round(h * 10) / 10;
  if (rounded >= 0.1) return String(rounded).replace(".", ",") + " ч";
  return Math.max(1, Math.round(h * 60)) + " мин";
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
// Клетка календаря: высота заливки — доля выполненной цели, и цвет идёт следом,
// плавно от красноватого к зелёному. Ступеньки «пусто — средне — цель» врали на
// границах: 39 % и 41 % выглядели как разные миры.
const CELL_SCALE = {
  light: { low: [226, 185, 180], mid: [230, 215, 154], full: [182, 207, 188] },
  night: { low: [110, 58, 52], mid: [122, 101, 40], full: [58, 92, 68] },
};

function mixRgb(a, b, t) {
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * t));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

function cellColor(ratio, theme) {
  const scale = CELL_SCALE[theme === "night" ? "night" : "light"];
  const clamped = Math.max(0, Math.min(1, ratio));
  return clamped <= 0.5
    ? mixRgb(scale.low, scale.mid, clamped / 0.5)
    : mixRgb(scale.mid, scale.full, (clamped - 0.5) / 0.5);
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
  const [events, setEvents] = useState([]);
  // Тетради: ключ владельца ("subj:<id>" или "lyceum:<название>") → массив блоков.
  const [notebooks, setNotebooks] = useState({});
  // Закреплённые предметы и порядок списка в «Тетрадях»: см. src/notebook-order.js.
  const [notebookOrder, setNotebookOrder] = useState({});
  // На телефоне: открыт ли список предметов для закрепления и перестановки.
  const [notesOrderOpen, setNotesOrderOpen] = useState(false);
  const [subjectTab, setSubjectTab] = useState({});
  const [openLyceumNotebook, setOpenLyceumNotebook] = useState(null);
  const [openSubject, setOpenSubject] = useState(null);
  // «Подготовка» на телефоне — два шага: список предметов, потом предмет.
  const [studyView, setStudyView] = useState("list");
  // Скрыть пройденные уроки — удобство этого устройства, в облако не едет.
  const [hideDone, setHideDone] = useState(() => {
    try {
      return localStorage.getItem("planner-hide-done") === "1";
    } catch (e) {
      return false;
    }
  });
  const [openNotes, setOpenNotes] = useState({});
  const [openLinks, setOpenLinks] = useState({});
  const [jForm, setJForm] = useState({ date: todayStr(), subjectId: "law", hours: "1", note: "" });
  const [saveErr, setSaveErr] = useState(false);
  const [calMonth, setCalMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [openSections, setOpenSections] = useState({ events: false, chart: false, kpv: false, subjects: false, lyceum: false, journal: false, backup: false });
  const [importText, setImportText] = useState("");
  const [importMsg, setImportMsg] = useState("");
  const [copyMsg, setCopyMsg] = useState("");
  const [customSubjects, setCustomSubjects] = useState([]);
  // Встроенный предмет нельзя вычеркнуть из кода, поэтому удалённые помним по id.
  const [hiddenSubjects, setHiddenSubjects] = useState([]);
  // Свой цвет предмета: ключ — id предмета или "lyceum:<название>". Пусто = цвет по умолчанию.
  const [subjectColors, setSubjectColors] = useState({});
  // Воскресенье прячется, но его уроки остаются в расписании — вдруг понадобится вернуть.
  const [showSunday, setShowSunday] = useState(false);
  const [lyceumSchedule, setLyceumSchedule] = useState([]);
  // Какую школу и группы выбрал ученик: по ним собирается готовое расписание лицея.
  const [presetChoices, setPresetChoices] = useState({ school: "", groups: {}, specs: [] });
  // Какие контрольные тесты человек сдаёт: даты общие, предметы у каждого свои.
  const [examPicks, setExamPicks] = useState(DEFAULT_KT);
  const [voshPicks, setVoshPicks] = useState(DEFAULT_VOSH);
  // Какой выпуск встроенных данных лицея уже разложен в расписании.
  const [lyceumRevision, setLyceumRevision] = useState(LYCEUM_REVISION);
  const [query, setQuery] = useState("");
  // Сколько записей дневника показано. Разом рисовать весь год — это
  // полсекунды на телефоне при переходе на экран, а дальше первого десятка
  // всё равно почти никто не смотрит.
  const [journalShown, setJournalShown] = useState(JOURNAL_PAGE);
  // Событие, по которому считается план. Пусто — берётся самое приоритетное:
  // так было всегда, и для большинства этого достаточно.
  const [mainEventId, setMainEventId] = useState("");
  // Неделя, на которую время уже распределено. Пока она не совпадает с текущей,
  // на «Сегодня» висит напоминание: без него новая неделя начиналась с прошлых
  // цифр, и план тихо расходился с жизнью.
  const [weekPlanned, setWeekPlanned] = useState("");
  const [backgroundOn, setBackgroundOn] = useState(readBackgroundOn);
  // Чем вызвана пасхалка: id фигуры и счётчик, чтобы одну и ту же можно было
  // позвать дважды подряд.
  const [showcase, setShowcase] = useState(null);
  const [homework, setHomework] = useState([]);
  // Тренажёр: журнал попыток и отметки о сверке ключей с банком. И то и другое —
  // список записей со своими id: так правки с телефона и ноутбука сливаются, а не
  // затирают друг друга.
  const [trainerLog, setTrainerLog] = useState([]);
  // Где человек остановился в тренажёре: открытый предмет, раздел и задание.
  // Это настройка, а не запись со своим номером: последняя всегда верна.
  const [trainerState, setTrainerState] = useState({ open: "", section: "", taskId: "", again: false });
  const [bankMarks, setBankMarks] = useState([]);
  // Удаления копятся столбиком: каждое со своим таймером на 20 секунд.
  const [undoQueue, setUndoQueue] = useState([]);
  const undoTimers = useRef({});
  const firstLoad = useRef(true);
  const loadingRef = useRef(false);

  // Эти три состояния объявлены до ALL_SUBJECTS намеренно: список предметов
  // зависит от того, кто вошёл. Когда объявление стояло ниже, сборка с облаком
  // падала белым экраном — без облака проверка обрывалась на первом условии и
  // до чтения переменных дело не доходило.
  const [notebookOwner, setNotebookOwner] = useState("");
  const [accountEmail, setAccountEmail] = useState("");
  const [accountReady, setAccountReady] = useState(false);

  // Готовый курс по обществознанию — личная подготовка автора приложения, а не
  // его содержимое: чужому человеку он достался бы как чей-то чужой конспект.
  // Поэтому встроенные предметы видит только владелец, остальные заводят свои.
  const builtinsVisible = !cloudConfigured || !accountReady || isOwnerEmail(accountEmail);

  // Готовое расписание лицея — для тех, кто вошёл: оно привязано к человеку, а
  // не к устройству, и без входа сотрётся вместе с памятью браузера. В сборке
  // без облака входа не существует вовсе, поэтому там оно доступно всем.
  const presetLocked = cloudConfigured && accountReady && !accountEmail;

  // Если предмет, выбранный в форме дневника, пропал из списка — переключаемся на
  // первый доступный, иначе запись ушла бы в невидимый предмет.

  const ALL_SUBJECTS = useMemo(
    () => {
      const builtin = builtinsVisible ? SUBJECT_DEFS.filter((s) => !hiddenSubjects.includes(s.id)) : [];
      return [...builtin, ...customSubjects].map((s) => ({
        ...s,
        color: subjectColors[s.id] || s.color,
      }));
    },
    [customSubjects, hiddenSubjects, subjectColors, builtinsVisible]
  );

  // Поиск предмета по id на каждую строку дневника — это перебор всего списка
  // на каждую из сотен записей; карта считается один раз.
  const subjectById = useMemo(() => new Map(ALL_SUBJECTS.map((s) => [s.id, s])), [ALL_SUBJECTS]);

  // Предметы вместе с их темами: одна и та же выжимка нужна и повторениям, и
  // поиску, а собирать её на каждый рендер по два раза незачем.
  const subjectsWithTopics = useMemo(
    () =>
      ALL_SUBJECTS.map((s) => ({
        id: s.id,
        name: s.name,
        color: s.color,
        topics: [
          ...subjectData(data, s.id).topics.map((t) => ({ ...t, custom: false })),
          ...subjectData(data, s.id).custom.map((t) => ({ ...t, custom: true })),
        ],
      })),
    [ALL_SUBJECTS, data]
  );

  useEffect(() => {
    if (!ALL_SUBJECTS.length) return;
    if (ALL_SUBJECTS.some((s) => s.id === jForm.subjectId)) return;
    setJForm((prev) => ({ ...prev, subjectId: ALL_SUBJECTS[0].id }));
  }, [ALL_SUBJECTS, jForm.subjectId]);

  // Предметы лицея живут не списком, а названиями в расписании, поэтому цвет ищем по имени.
  const lyceumColorOf = useCallback(
    (name) => subjectColors["lyceum:" + name] || subjectColor(name),
    [subjectColors]
  );

  function setSubjectColor(key, color) {
    setSubjectColors((prev) => ({ ...prev, [key]: color }));
  }
  const saveTimer = useRef(null);
  const pendingSince = useRef(null);
  // Последнее сохранённое состояние с метками времени: с ним сравнивается текущее,
  // чтобы пометить как изменённые только те элементы, которые вправду поменялись.
  const syncSnapshot = useRef(null);
  // Всё, что сейчас на экране, — в том числе правки, которые ещё ждут сохранения.
  const liveState = useRef(null);
  const [cloudPending, setCloudPending] = useState(false);
  const [cloudOn, setCloudOn] = useState(false);
  const [showBackup, setShowBackup] = useState(false);
  // Токен подписки хранится вместе с остальными данными: он один на все устройства.
  const { mode, setMode, theme, nightWindow, setNightWindow } = useThemeMode();
  const [designIntroOpen, setDesignIntroOpen] = useState(false);
  // Какой экран открыт — настройка устройства, как и тема: на телефоне человек
  // сидит в расписании, на ноутбуке в конспектах.
  const [screen, setScreen] = useState(() => {
    try {
      return localStorage.getItem(SCREEN_KEY) || "today";
    } catch (e) {
      return "today";
    }
  });
  const [notesOpen, setNotesOpen] = useState(false);
  const [introOpen, setIntroOpen] = useState(false);
  const [calendarToken, setCalendarToken] = useState("");
  // Инструкция к подписке зависит от системы: см. src/calendar-howto.jsx.
  const [devicePlatform] = useState(detectPlatform);
  const [calendarPanel, setCalendarPanel] = useState(false);
  const [calendarLinks, setCalendarLinks] = useState(null);
  const [calendarMsg, setCalendarMsg] = useState("");
  const [calendarBusy, setCalendarBusy] = useState(false);
  const publishedIcs = useRef("");
  // Когда файл подписки обновился в последний раз и не было ли ошибки.
  const [calendarSync, setCalendarSync] = useState({ at: null, error: "", count: 0 });
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
        const res = await storageGet(STORAGE_KEY, mergeSerialized);
        if (res && res.value) {
          found = true;
          let parsed = JSON.parse(res.value);
          // Сохранение идёт с задержкой, а перечитывание срабатывает при каждом
          // возвращении в окно — в том числе после выбора файла в системном диалоге.
          // Раньше прочитанное просто ставилось поверх экрана, и только что
          // созданная ветка или прикреплённый файл пропадали. Несохранённое
          // сливается с прочитанным так же, как правки с двух устройств.
          if (pendingSince.current !== null && liveState.current && syncSnapshot.current) {
            parsed = mergeStates(stampState(syncSnapshot.current, liveState.current), parsed);
          }
          syncSnapshot.current = parsed;
          if (parsed.data) setData(parsed.data);
          if (parsed.journal) setJournal(parsed.journal);
          if (parsed.budget) setBudget(parsed.budget);
          if (parsed.events) setEvents(parsed.events);
          if (parsed.notebooks) setNotebooks(parsed.notebooks);
          if (parsed.notebookOrder) setNotebookOrder(parsed.notebookOrder);
          if (parsed.customSubjects) setCustomSubjects(parsed.customSubjects);
          if (parsed.hiddenSubjects) setHiddenSubjects(parsed.hiddenSubjects);
          if (parsed.subjectColors) setSubjectColors(parsed.subjectColors);
          if (parsed.showSunday) setShowSunday(parsed.showSunday);
          if (parsed.calendarToken) setCalendarToken(parsed.calendarToken);
          if (parsed.lyceumSchedule) setLyceumSchedule(parsed.lyceumSchedule);
          if (parsed.presetChoices) setPresetChoices(parsed.presetChoices);
          if (parsed.examPicks) setExamPicks(parsed.examPicks);
          if (parsed.voshPicks) setVoshPicks(parsed.voshPicks);
          setLyceumRevision(Number(parsed.lyceumRevision) || 0);
          if (parsed.mainEventId !== undefined) setMainEventId(parsed.mainEventId);
          if (parsed.weekPlanned) setWeekPlanned(parsed.weekPlanned);
          if (parsed.openSections) setOpenSections(parsed.openSections);
          if (parsed.homework) setHomework(parsed.homework);
          if (parsed.trainerLog) setTrainerLog(parsed.trainerLog);
          if (parsed.trainerState) setTrainerState(parsed.trainerState);
          if (parsed.bankMarks) setBankMarks(parsed.bankMarks);
        }
        setLastSyncedAt(new Date());
        setSyncDebug((res && res.warning) || (found ? "" : "пока нет сохранённых записей"));
        lastError = null;
        break;
      } catch (e) {
        lastError = (e && (e.message || String(e))) || "неизвестная ошибка";
        if (attempt < 2) await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
      }
    }
    if (lastError) setSyncDebug("не удалось прочитать записи: " + lastError);
    loadingRef.current = false;
    setSyncing(false);
    // Неудачное чтение — не то же самое, что «записей нет». Пока оно не
    // удалось, сохранять нельзя: пустое состояние затёрло бы целые данные
    // на устройстве. Ровно так они и пропадали при запуске без сети.
    return !lastError;
  }

  const tryLoad = useCallback(async () => {
    if (await loadFromStorage()) setLoaded(true);
  }, []);

  useEffect(() => {
    tryLoad();
  }, [tryLoad]);

  // Окно «Новый дизайн» — один раз на устройстве. Отметка ставится, когда окно
  // закрыли, а не когда показали: перезагрузили страницу, не дочитав, — оно
  // появится снова.
  useEffect(() => {
    if (!loaded) return;
    let seen = null;
    try {
      seen = localStorage.getItem(DESIGN_INTRO_KEY);
    } catch (e) {
      seen = null;
    }
    if (seen !== DESIGN_INTRO_VERSION) setDesignIntroOpen(true);
  }, [loaded]);

  function closeDesignIntro() {
    setDesignIntroOpen(false);
    try {
      localStorage.setItem(DESIGN_INTRO_KEY, DESIGN_INTRO_VERSION);
    } catch (e) {
      /* приватный режим — окно покажется ещё раз, не страшно */
    }
  }

  useEffect(() => {
    if (!loaded) return;
    let seen = null;
    try {
      seen = localStorage.getItem(INTRO_KEY);
    } catch (e) {
      seen = null;
    }
    if (seen === INTRO_VERSION) return;
    // Тому, кто расписание уже собрал, рассказывать нечего — просто
    // запоминаем версию, чтобы окно не всплыло позже.
    const already = lyceumSchedule.some((e) => e.preset === PRESET_ID);
    if (!already) setIntroOpen(true);
    try {
      localStorage.setItem(INTRO_KEY, INTRO_VERSION);
    } catch (e) {
      /* приватный режим — покажем ещё раз, не страшно */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  // Cross-device sync: an already-open tab only reads storage once on mount, so if you
  // change something on another device while this one stays open, it would never notice.
  // Re-pull the latest saved state whenever the person comes back to this tab/app.
  useEffect(() => onAuthChange(tryLoad), [tryLoad]);

  // Раньше правки, сделанные без сети, уходили в облако только при следующем
  // сохранении или возврате в приложение. Теперь — сразу, как связь появилась.
  useEffect(() => {
    window.addEventListener("online", tryLoad);
    return () => window.removeEventListener("online", tryLoad);
  }, [tryLoad]);

  useEffect(() => {
    let alive = true;
    // Облако может быть недоступно — это состояние интерфейса, а не сбой.
    const check = () => cloudAvailable().then((on) => alive && setCloudOn(on)).catch(() => alive && setCloudOn(false));
    check();
    return onAuthChange(check);
  }, []);

  useEffect(() => {
    function handleWake() {
      if (document.visibilityState === "visible") tryLoad();
    }
    document.addEventListener("visibilitychange", handleWake);
    window.addEventListener("focus", handleWake);
    return () => {
      document.removeEventListener("visibilitychange", handleWake);
      window.removeEventListener("focus", handleWake);
    };
  }, [tryLoad]);

  liveState.current = {
    data,
    journal,
    budget,
    events,
    notebooks,
    notebookOrder,
    customSubjects,
    hiddenSubjects,
    subjectColors,
    showSunday,
    calendarToken,
    lyceumSchedule,
    presetChoices,
    examPicks,
    voshPicks,
    lyceumRevision,
    mainEventId,
    weekPlanned,
    openSections,
    homework,
    trainerLog,
    trainerState,
    bankMarks,
  };

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
    if (pendingSince.current === null) pendingSince.current = Date.now();
    const waited = Date.now() - pendingSince.current;
    const delay = Math.max(0, Math.min(SAVE_DEBOUNCE_MS, SAVE_MAX_WAIT_MS - waited));
    saveTimer.current = setTimeout(() => {
      pendingSince.current = null;
      (async () => {
        const stamped = stampState(syncSnapshot.current, liveState.current);
        syncSnapshot.current = stamped;
        const payload = JSON.stringify(stamped);
        let saved = null;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            saved = await storageSet(STORAGE_KEY, payload);
            // cloud === null means this build has no cloud at all, so one attempt is final.
            if (saved.ok && saved.cloud !== false) break;
          } catch (e) {
            saved = null;
          }
          if (attempt < 2) await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
        }
        setSaveErr(!(saved && saved.ok));
        setCloudPending(!!saved && saved.cloud === false);
        if (saved && saved.ok) {
          setLastSyncedAt(new Date());
          setSyncDebug(saved.cloud === false ? saved.error : "");
        }
      })();
    }, delay);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [data, journal, budget, events, notebooks, notebookOrder, customSubjects, hiddenSubjects, subjectColors, showSunday, calendarToken, lyceumSchedule, presetChoices, examPicks, voshPicks, lyceumRevision, mainEventId, weekPlanned, openSections, homework, trainerLog, trainerState, bankMarks, loaded]);

  // Считать цель дня приходится на каждый столбец графика, поэтому функция должна
  // меняться только вместе с бюджетом, иначе график пересчитывается на каждый рендер.
  const goalForDate = useCallback((date) => goalHoursForDate(budget, date), [budget]);

  const stats = useMemo(() => {
    let doneAll = 0;
    let totalAll = 0;
    const perSubject = {};
    ALL_SUBJECTS.forEach((s) => {
      const list = [...subjectData(data, s.id).topics, ...subjectData(data, s.id).custom];
      const done = list.filter((t) => t.done).length;
      perSubject[s.id] = { done, total: list.length, pct: list.length ? Math.round((done / list.length) * 100) : 0 };
      doneAll += done;
      totalAll += list.length;
    });
    return { perSubject, doneAll, totalAll, overallPct: totalAll ? Math.round((doneAll / totalAll) * 100) : 0 };
  }, [data]);

  // Экзамены и олимпиады из расписания — те же события, только описанные в
  // другом месте. Они не копируются в список событий, а строятся из записи на
  // лету: правка в любом из двух мест меняет одну и ту же запись.
  const scheduleEvents = useMemo(
    () =>
      lyceumSchedule
        .filter((e) => e.kind === "exam" && e.date)
        .map((e) => ({
          id: SCHEDULE_EVENT_PREFIX + e.id,
          name: e.subjectName || (e.examKind === "olympiad" ? "Олимпиада" : "Экзамен"),
          date: e.date,
          priority: Number(e.priority) || 3,
          fromSchedule: true,
          examKind: e.examKind === "olympiad" ? "olympiad" : "exam",
          // Время, место и ссылка — те же поля записи расписания.
          start: e.start || "",
          end: e.end || "",
          place: e.place || "",
          url: e.url || "",
          note: e.note || "",
        })),
    [lyceumSchedule]
  );

  // Подробности одной строкой — для календаря телефона и карточки «Сегодня».
  const allEvents = useMemo(
    () => [...events, ...scheduleEvents].map((e) => ({ ...e, description: eventDescription(e) })),
    [events, scheduleEvents]
  );

  // Событие сегодня — не строчка в списке «ближайших»: сегодня оно и есть день.
  const todayEvents = useMemo(() => allEvents.filter((e) => e.date === todayStr()), [allEvents]);

  const upcomingEvents = useMemo(
    () => allEvents.filter((e) => e.date && daysUntilDate(e.date) >= 0).sort((a, b) => a.date.localeCompare(b.date)),
    [allEvents]
  );

  // Сегодняшнее событие показано отдельной карточкой наверху, поэтому в списке
  // «ближайших» на том же экране его быть не должно — это одно и то же.
  const laterEvents = useMemo(() => upcomingEvents.filter((e) => e.date !== todayStr()), [upcomingEvents]);

  const pastEvents = useMemo(
    () => allEvents.filter((e) => e.date && daysUntilDate(e.date) < 0).sort((a, b) => b.date.localeCompare(a.date)),
    [allEvents]
  );

  const nextEvent = upcomingEvents[0] || null;

  // Planning is measured against the event that matters most, not the closest one: a minor
  // olympiad next week must not redefine how much time is left for the exam that counts.
  // Equal priorities fall back to the nearest date, since the list is already sorted by it.
  const mainEvent = useMemo(() => {
    if (!upcomingEvents.length) return null;
    // Выбранное вручную важнее приоритета, но только пока событие впереди:
    // прошедший экзамен считать не по чему.
    const picked = mainEventId && upcomingEvents.find((e) => e.id === mainEventId);
    if (picked) return picked;
    return upcomingEvents.reduce((best, e) => (Number(e.priority) > Number(best.priority) ? e : best));
  }, [upcomingEvents, mainEventId]);

  const capacity = useMemo(() => {
    const weeklyTotal = ALL_SUBJECTS.reduce((sum, s) => sum + (Number(budget.alloc[s.id]) || 0), 0);
    const weeklyBudget = weeklyBudgetHours(budget);

    let totalCapacityHours = 0;
    const end = mainEvent ? new Date(mainEvent.date + "T00:00:00") : null;
    if (end) {
      const cursor = new Date();
      cursor.setHours(0, 0, 0, 0);
      let guard = 0;
      while (cursor <= end && guard < 3650) {
        totalCapacityHours += goalHoursForDate(budget, cursor);
        cursor.setDate(cursor.getDate() + 1);
        guard += 1;
      }
    }

    let remainingMinutes = 0;
    let remainingTopics = 0;
    ALL_SUBJECTS.forEach((s) => {
      const list = [...subjectData(data, s.id).topics, ...subjectData(data, s.id).custom];
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
      // null means there is nothing to measure against yet — no event has been added.
      feasible: mainEvent ? totalCapacityHours >= neededHours : null,
      skew,
    };
  }, [budget, mainEvent, data, ALL_SUBJECTS]);

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

  // opts — для уведомлений не об удалении: своя подсказка под текстом и подписи
  // кнопок. Крестик всегда «вернуть как было», галочка — «хорошо».
  const showUndo = useCallback((message, restore, finalize, opts) => {
    const id = "undo-" + Date.now() + "-" + Math.round(Math.random() * 10000);
    setUndoQueue((prev) => [...prev, { id, message, restore, finalize, opts: opts || null }]);
    undoTimers.current[id] = setTimeout(() => {
      setUndoQueue((prev) => {
        const item = prev.find((u) => u.id === id);
        if (item && item.finalize) item.finalize();
        return prev.filter((u) => u.id !== id);
      });
      delete undoTimers.current[id];
    }, UNDO_SECONDS * 1000);
  }, []);

  function closeUndo(id, apply) {
    if (undoTimers.current[id]) {
      clearTimeout(undoTimers.current[id]);
      delete undoTimers.current[id];
    }
    setUndoQueue((prev) => {
      const item = prev.find((u) => u.id === id);
      if (item) apply(item);
      return prev.filter((u) => u.id !== id);
    });
  }

  const confirmUndo = (id) => closeUndo(id, (item) => item.finalize && item.finalize());
  const cancelUndo = (id) => closeUndo(id, (item) => item.restore && item.restore());

  // Вкладку могут закрыть с висящими уведомлениями — таймеры за собой убираем.
  useEffect(() => () => Object.values(undoTimers.current).forEach(clearTimeout), []);

  function removeTopic(subjectId, topicId, custom) {
    const key = custom ? "custom" : "topics";
    const list = data[subjectId][key];
    const index = list.findIndex((t) => t.id === topicId);
    if (index === -1) return;
    const topic = list[index];
    const relatedEntries = journal.filter((e) => e.lessonId === topicId);

    setData((prev) => ({
      ...prev,
      [subjectId]: { ...prev[subjectId], [key]: prev[subjectId][key].filter((t) => t.id !== topicId) },
    }));
    setJournal((prev) => prev.filter((e) => e.lessonId !== topicId));

    showUndo(
      `Вы удалили урок «${topic.name}»`,
      () => {
        // Урок возвращается на своё место в списке, вместе с записями в дневнике.
        setData((prev) => {
          const next = [...prev[subjectId][key]];
          next.splice(Math.min(index, next.length), 0, topic);
          return { ...prev, [subjectId]: { ...prev[subjectId], [key]: next } };
        });
        setJournal((prev) => [...relatedEntries, ...prev]);
      },
      () => {
        // Подтверждено — только теперь можно убрать файлы из заметок урока.
        (topic.notes || []).forEach((n) => (n.files || []).forEach((f) => deleteAttachment(f).catch(() => {})));
      }
    );
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

  function updateNote(subjectId, topicId, custom, noteId, patch) {
    updateTopic(subjectId, topicId, custom, (t) => ({
      ...t,
      notes: (t.notes || []).map((n) =>
        n.id === noteId ? { ...n, ...(typeof patch === "function" ? patch(n) : patch) } : n
      ),
    }));
  }

  function removeNote(subjectId, topicId, custom, noteId) {
    const topic = getTopic(subjectId, topicId, custom);
    const notes = (topic && topic.notes) || [];
    const index = notes.findIndex((n) => n.id === noteId);
    const note = index === -1 ? null : notes[index];
    const relatedEntries = journal.filter((e) => e.noteId === noteId);

    updateTopic(subjectId, topicId, custom, (t) => ({
      ...t,
      notes: (t.notes || []).filter((n) => n.id !== noteId),
    }));
    setJournal((prev) => prev.filter((e) => e.noteId !== noteId));

    if (!note) return;
    showUndo(
      `Вы удалили заметку «${note.text}»`,
      () => {
        updateTopic(subjectId, topicId, custom, (t) => {
          const next = [...(t.notes || [])];
          next.splice(Math.min(index, next.length), 0, note);
          return { ...t, notes: next };
        });
        setJournal((prev) => [...relatedEntries, ...prev]);
      },
      () => (note.files || []).forEach((f) => deleteAttachment(f).catch(() => {}))
    );
  }

  function addJournalEntry(dateOverride) {
    if (!jForm.note.trim() && Number(jForm.hours) <= 0) return;
    // Дата приходит аргументом: на экране «Сегодня» запись всегда за сегодня,
    // даже если в дневнике открыт другой день.
    // Кнопка в дневнике зовёт функцию напрямую, и первым аргументом прилетает
    // событие клика — дату принимаем только строкой.
    const date = typeof dateOverride === "string" ? dateOverride : jForm.date;
    const entry = { id: Date.now(), ...jForm, date, hours: Number(jForm.hours) || 0 };
    setJournal((prev) => [entry, ...prev]);
    setJForm({ ...jForm, note: "", hours: "1" });
  }

  function removeJournalEntry(id) {
    const index = journal.findIndex((e) => e.id === id);
    if (index === -1) return;
    const entry = journal[index];

    // Запись о пройденном уроке и галочка в списке — один и тот же факт: удалили
    // запись из дневника, значит урок снова не пройден.
    const unchecks =
      entry.auto && entry.lessonId && !entry.noteId && entry.subjectId && data[entry.subjectId]
        ? ["topics", "custom"].some((key) =>
            (data[entry.subjectId][key] || []).some((t) => t.id === entry.lessonId && t.done)
          )
        : false;

    setJournal((prev) => prev.filter((e) => e.id !== id));
    if (unchecks) setTopicDone(entry.subjectId, entry.lessonId, false);

    showUndo(`Вы удалили запись «${entry.note || "без описания"}»`, () => {
      setJournal((prev) => {
        const next = [...prev];
        next.splice(Math.min(index, next.length), 0, entry);
        return next;
      });
      if (unchecks) setTopicDone(entry.subjectId, entry.lessonId, true);
    });
  }

  // Ставит или снимает отметку «пройдено», не трогая дневник: им управляет вызывающий.
  function setTopicDone(subjectId, topicId, done) {
    setData((prev) => {
      const subject = prev[subjectId];
      if (!subject) return prev;
      const next = { ...subject };
      ["topics", "custom"].forEach((key) => {
        next[key] = (subject[key] || []).map((t) => (t.id === topicId ? { ...t, done } : t));
      });
      return { ...prev, [subjectId]: next };
    });
  }

  // Тронули распределение — значит неделю распланировали; отдельная кнопка
  // «я всё сделал» нужна только тем, кого прошлые цифры устраивают как есть.
  function markWeekPlanned() {
    setWeekPlanned(weekKey(new Date()));
  }

  function setAlloc(id, val) {
    setBudget((prev) => ({ ...prev, alloc: { ...prev.alloc, [id]: Math.max(0, Number(val) || 0) } }));
    markWeekPlanned();
  }

  function setDailyGoal(key, minutes) {
    setBudget((prev) => ({ ...prev, daily: { ...prev.daily, [key]: Math.max(0, Number(minutes) || 0) } }));
    markWeekPlanned();
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
      { data, journal, budget, events, notebooks, customSubjects, hiddenSubjects, subjectColors, showSunday, calendarToken, lyceumSchedule, presetChoices, examPicks, voshPicks, lyceumRevision, mainEventId, weekPlanned, openSections, homework },
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
      if (parsed.events) setEvents(parsed.events);
      if (parsed.notebooks) setNotebooks(parsed.notebooks);
      if (parsed.customSubjects) setCustomSubjects(parsed.customSubjects);
      if (parsed.hiddenSubjects) setHiddenSubjects(parsed.hiddenSubjects);
      if (parsed.subjectColors) setSubjectColors(parsed.subjectColors);
      if (parsed.showSunday) setShowSunday(parsed.showSunday);
      if (parsed.calendarToken) setCalendarToken(parsed.calendarToken);
      if (parsed.lyceumSchedule) setLyceumSchedule(parsed.lyceumSchedule);
      if (parsed.presetChoices) setPresetChoices(parsed.presetChoices);
      if (parsed.examPicks) setExamPicks(parsed.examPicks);
      if (parsed.voshPicks) setVoshPicks(parsed.voshPicks);
      setLyceumRevision(Number(parsed.lyceumRevision) || 0);
      if (parsed.mainEventId !== undefined) setMainEventId(parsed.mainEventId);
      if (parsed.weekPlanned) setWeekPlanned(parsed.weekPlanned);
      if (parsed.openSections) setOpenSections(parsed.openSections);
      if (parsed.homework) setHomework(parsed.homework);
      // Импорт — сознательная замена всего: снимок сбрасываем, чтобы вставленные
      // данные ушли в облако как свежие и победили то, что там лежит.
      syncSnapshot.current = null;
      setImportMsg("Данные импортированы и сохранены на этом устройстве.");
      setImportText("");
    } catch (e) {
      setImportMsg("Не удалось прочитать текст — проверьте, что скопировали его полностью, и попробуйте снова.");
    }
  }

  // Тренажёр — тоже занятие. Время его секундомера идёт в часы, а решённые
  // задания продлевают серию; и то и другое выводится из журнала попыток, а не
  // хранится отдельно — иначе эти две записи о том же самом разъезжались бы.
  const taskSubject = useMemo(() => subjectsByTask(BANK_SUBJECTS), []);
  const trainerByDay = useMemo(() => trainerDays(trainerLog, taskSubject), [trainerLog, taskSubject]);
  const subjectIdByName = useCallback(
    (name) => (ALL_SUBJECTS.find((x) => x.name === name) || {}).id || "",
    [ALL_SUBJECTS]
  );
  // Дневник, каким его видят цель, календарь и диаграмма: свои записи плюс
  // выведенные из тренажёра.
  const journalWithTrainer = useMemo(
    () => journal.concat(trainerEntries(trainerByDay, subjectIdByName)),
    [journal, trainerByDay, subjectIdByName]
  );

  // Физики и информатики среди предметов приложения может не быть: там своя
  // подготовка по частям обществознания. Чтобы время из тренажёра не оказалось
  // безымянным «Другое» на диаграмме и пустой строкой в дневнике, к списку
  // предметов приписываются недостающие — только те, по которым правда решали.
  const subjectsWithTrainer = useMemo(() => {
    const known = new Set(ALL_SUBJECTS.map((x) => x.id));
    const extra = [];
    trainerByDay.forEach((d) => {
      if (known.has(d.subject) || subjectIdByName(d.subject) || extra.some((x) => x.id === d.subject)) return;
      extra.push({ id: d.subject, name: d.subject, color: "var(--mute)", fromTrainer: true });
    });
    return ALL_SUBJECTS.concat(extra);
  }, [ALL_SUBJECTS, trainerByDay, subjectIdByName]);
  const anySubjectById = useMemo(() => new Map(subjectsWithTrainer.map((x) => [x.id, x])), [subjectsWithTrainer]);

  // Пульс занятий: сколько записано сегодня, сколько дней подряд идут занятия и
  // сколько прошло с последней записи. Нужен для короткого напоминания на
  // «Сегодня» — без укоров, просто «вернитесь, это недолго».
  const studyPulse = useMemo(() => {
    const byDate = {};
    journalWithTrainer.forEach((e) => {
      byDate[e.date] = (byDate[e.date] || 0) + (Number(e.hours) || 0);
    });
    // Серию засчитывает не всякая минута: пара заданий по дороге домой — это
    // пять минут, занятием это не назовёшь. Поэтому день в серию идёт либо по
    // обычной записи, либо когда в тренажёре взят порог по какому-то предмету.
    const counts = (date) =>
      journal.some((e) => e.date === date && (Number(e.hours) || 0) > 0) || dayCounts(trainerByDay, date);
    const dates = Object.keys(byDate).filter((d) => counts(d)).sort();
    const todayHours = Math.round((byDate[todayStr()] || 0) * 10) / 10;
    if (!dates.length) return { todayHours, daysSince: null, streak: 0 };

    const last = dates[dates.length - 1];
    const daysSince = Math.max(0, -daysUntilDate(last));

    // Серия считается назад от последнего дня с записями: пропуск её обрывает.
    let streak = 0;
    const cursor = new Date(last + "T00:00:00");
    while (counts(ymd(cursor))) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
    return { todayHours, daysSince, streak };
  }, [journal, journalWithTrainer, trainerByDay]);

  // Напоминание о занятиях: одно и то же и в приложении, и в календаре телефона —
  // чтобы оно доходило и тогда, когда ежедневник не открывали.
  const STUDY_REMINDER_HOUR = "19:00";
  const studyReminder = useMemo(() => {
    const { todayHours, daysSince, streak } = studyPulse;
    if (todayHours > 0) {
      return {
        tone: "ok",
        title: `Сегодня записано ${String(todayHours).replace(".", ",")} ч`,
        text: streak > 1 ? `Серия идёт ${streak} ${daysWord(streak)} подряд — не прерывайте её.` : "Так держать.",
      };
    }
    if (daysSince === null) {
      return {
        tone: "soft",
        title: "Начните с первого занятия",
        text: "Отметьте урок пройденным или запишите полчаса — дальше пойдёт само.",
      };
    }
    if (daysSince === 0) {
      return { tone: "soft", title: "Сегодня ещё ничего не записано", text: "Полчаса тоже считается." };
    }
    if (daysSince === 1) {
      return {
        tone: "warn",
        title: "Вчера был последний раз",
        text: "Запишите сегодня хотя бы полчаса — серия не оборвётся, а завтра будет легче начать.",
      };
    }
    return {
      tone: "warn",
      title: `Занятий не было ${daysSince} ${daysWord(daysSince)}`,
      text: "Начните с одного урока: вернуться проще, чем кажется, и день сразу перестанет быть пустым.",
    };
  }, [studyPulse]);

  // Серия идёт, только пока в ней нет пропуска: после него «4 дня подряд» рядом
  // с «занятий не было два дня» звучало бы издевательски.
  const studyStreakOn = studyPulse.streak > 1 && studyPulse.daysSince === 0;

  // Предложение продлить серию тренажёром. Показываем его, пока день не
  // засчитан, — и не молча: сколько заданий осталось, видно числом. Молчаливый
  // порог, о котором надо догадываться, серию бы не спасал, а раздражал.
  const trainerOffer = useMemo(() => {
    const today = todayStr();
    const counted = journal.some((e) => e.date === today && (Number(e.hours) || 0) > 0) || dayCounts(trainerByDay, today);
    if (counted) return null;
    const offer = offerFor(trainerByDay, today, (trainerState && trainerState.open) || "", BANK_SUBJECTS);
    if (!offer || offer.left <= 0) return null;
    // Пятнадцать заданий по обществознанию выглядят неподъёмно, когда времени
    // нет совсем. Поэтому рядом называем предмет, где хватит пяти.
    return { ...offer, cheaper: offer.solved ? null : cheapestGoal(BANK_SUBJECTS, offer.subject) };
  }, [journal, trainerByDay, trainerState]);

  // В календарь уходит всё, у чего есть дата: события, экзамены из расписания и
  // домашние задания. Расписание уроков — нет: недельная сетка живёт в приложении.
  const calendarItems = useMemo(() => {
    const items = allEvents.map(eventIcsItem);
    homework.filter((h) => h.date).forEach((h) => items.push(homeworkIcsItem(h)));
    // Пропущенный день превращается в напоминание на сегодняшний вечер: телефон
    // скажет о нём сам, даже если ежедневник сегодня не открывали.
    if (studyReminder.tone === "warn") {
      items.push({
        uid: "study-" + todayStr(),
        title: "Позаниматься · " + studyReminder.title,
        date: todayStr(),
        time: STUDY_REMINDER_HOUR,
        minutes: 60,
        description: studyReminder.text,
      });
    }
    return items;
  }, [allEvents, homework, studyReminder]);
  // По этому ключу видно, изменилось ли содержимое подписки.
  const calendarKey = useMemo(() => JSON.stringify(calendarItems), [calendarItems]);

  // Файл подписки собирается перед отправкой: номер версии события растёт,
  // только когда событие поменялось (src/calendar-seq.js).
  async function publishCalendar(token) {
    const { items, memory } = sequenceItems(calendarItems, readCalendarSeq());
    const res = await publishFeed(token, buildIcs(items, { name: "Ежедневник лицеиста", refreshHours: 1 }));
    if (res.ok) {
      writeCalendarSeq(memory);
      publishedIcs.current = calendarKey;
      setCalendarSync({ at: new Date(), error: "", count: items.length });
    } else {
      setCalendarSync((prev) => ({ ...prev, error: res.error }));
    }
    return res;
  }

  async function enableCalendarFeed() {
    setCalendarBusy(true);
    setCalendarMsg("");
    const token = calendarToken || newFeedToken();
    const res = await publishCalendar(token);
    setCalendarBusy(false);
    if (!res.ok) {
      setCalendarMsg(res.error);
      return;
    }
    setCalendarToken(token);
    setCalendarLinks(await feedUrls(token));
    setCalendarMsg("Подписка готова.");
  }

  async function refreshCalendarFeed() {
    if (!calendarToken) return;
    setCalendarBusy(true);
    const res = await publishCalendar(calendarToken);
    setCalendarBusy(false);
    setCalendarMsg(res.ok ? "Обновлено." : res.error);
  }

  // Файл подписки обновляется сам, когда меняется то, что в нём лежит: иначе
  // календарь в телефоне показывал бы вчерашние даты. Не вышло — раньше это
  // проходило молча, и в телефоне навсегда оставалась первая версия. Теперь
  // ошибка видна в «Календаре телефона», а попытка повторяется через минуту.
  const [calendarRetry, setCalendarRetry] = useState(0);
  useEffect(() => {
    if (!loaded || !calendarToken || !cloudOn) return;
    if (publishedIcs.current === calendarKey) return;
    let retry = null;
    const timer = setTimeout(async () => {
      const res = await publishCalendar(calendarToken);
      if (!res.ok) retry = setTimeout(() => setCalendarRetry((n) => n + 1), 60000);
    }, 5000);
    return () => {
      clearTimeout(timer);
      if (retry) clearTimeout(retry);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calendarKey, calendarToken, cloudOn, loaded, calendarRetry]);

  useEffect(() => {
    if (!calendarToken) return;
    feedUrls(calendarToken).then((links) => setCalendarLinks(links));
  }, [calendarToken, cloudOn]);

  async function disableCalendarFeed() {
    await removeFeed(calendarToken);
    setCalendarToken("");
    setCalendarLinks(null);
    publishedIcs.current = "";
    setCalendarMsg("Подписка отключена. В телефоне календарь придётся удалить вручную.");
  }

  // Принимает и готовый список, и функцию от текущего: файл загружается несколько
  // секунд, и за это время тетрадь могла измениться — дописывать надо к свежей.
  function setNotebook(ownerKey, blocks) {
    setNotebooks((prev) => ({
      ...prev,
      [ownerKey]: typeof blocks === "function" ? blocks(prev[ownerKey] || []) : blocks,
    }));
  }

  // Пока воскресенье скрыто, его уроки не участвуют в дневнике и домашних заданиях,
  // но остаются в данных: вернули день — вернулись и уроки.
  const activeSchedule = useMemo(
    () => (showSunday ? lyceumSchedule : lyceumSchedule.filter((e) => e.day !== "sun")),
    [lyceumSchedule, showSunday]
  );

  const scheduleDays = useMemo(() => (showSunday ? [...LYCEUM_DAYS, "sun"] : LYCEUM_DAYS), [showSunday]);

  const homeworkOnDate = useCallback((iso) => homework.filter((h) => h.date === iso), [homework]);

  // Всё, что карточке дня нужно знать про задания: чьи они, как добавить и как
  // отметить сделанным. Одним объектом, чтобы не тянуть четыре пропса через
  // каждый день недели.
  // Какие списки заданий под уроками свёрнуты. Это удобство одного устройства,
  // как раскрытые подсказки, поэтому живёт в localStorage, а не в записях.
  // Ключ — урок и дата, к которой задано: на следующей неделе у урока новые
  // задания, и они снова видны.
  const [taskFolds, setTaskFolds] = useState(readTaskFolds);
  function setTaskFold(key, folded) {
    setTaskFolds((prev) => {
      const today = todayStr();
      const next = {};
      Object.keys(prev).forEach((k) => {
        if (k.slice(-10) >= today) next[k] = prev[k];
      });
      if (folded) next[key] = true;
      else delete next[key];
      try {
        localStorage.setItem(TASK_FOLDS_KEY, JSON.stringify(next));
      } catch (e) {
        /* приватное окно — свёрнутость просто не запомнится */
      }
      return next;
    });
  }

  const lessonTasks = useMemo(() => {
    // Задание из «Дневника» знает предмет и дату, но не урок: его заводят на
    // день, а не на карточку урока. Раньше в неделе оно поэтому не показывалось
    // вовсе. Теперь оно встаёт под первый урок этого предмета в день своего
    // срока — на паре подряд одно, а не дважды. Задания с прошедшим сроком
    // сюда не тянем: неделя смотрит вперёд.
    const ids = new Set(lyceumSchedule.map((e) => e.id));
    const today = todayStr();
    const loose = new Map();
    homework.forEach((h) => {
      if (h.lessonId && ids.has(h.lessonId)) return;
      if (!h.subjectName || !h.date || h.date < today) return;
      const day = weekdayKeyFromDate(h.date);
      const lesson = lyceumSchedule
        .filter((e) => e.kind !== "exam" && e.day === day && e.subjectName === h.subjectName)
        .sort((a, b) => String(a.start).localeCompare(String(b.start)))[0];
      if (!lesson) return;
      if (!loose.has(lesson.id)) loose.set(lesson.id, []);
      loose.get(lesson.id).push(h);
    });
    return {
      dueDate: (dayKey) => nextDateForDay(dayKey),
      // Принимает урок целиком (или его id — для привязанных заданий этого хватает).
      forLesson: (lesson) => {
        const id = typeof lesson === "string" ? lesson : lesson && lesson.id;
        return homework.filter((h) => h.lessonId === id).concat(loose.get(id) || []);
      },
      add: (entry, text, minutes) =>
        addHomework(nextDateForDay(entry.day), entry.subjectName || "", text, minutes, entry.id),
      toggle: (id) => updateHomework(id, { done: !(homework.find((h) => h.id === id) || {}).done }),
      folded: (lessonId, due) => !!taskFolds[lessonId + "|" + due],
      setFolded: (lessonId, due, folded) => setTaskFold(lessonId + "|" + due, folded),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [homework, lyceumSchedule, taskFolds]);

  const dayEntries = useCallback(
    (day) =>
      lyceumSchedule
        .filter((e) => e.day === day && (e.kind !== "exam" || examVisibleInSchedule(e)))
        .sort(byExamFirst),
    [lyceumSchedule]
  );
  // Неделя в «Лицее» показывает и дальние экзамены — полупрозрачно, внизу дня.
  // «Сегодня» и «сейчас идут» по-прежнему берут dayEntries: экзамен через месяц
  // по четвергам — не сегодняшний.
  const weekEntries = useCallback(
    (day) => lyceumSchedule.filter((e) => e.day === day && (e.kind !== "exam" || examPlace(e) !== "past")).sort(byWeekOrder),
    [lyceumSchedule]
  );
  // После крестика в уведомлении о переносе: какую форму добавления открыть
  // снова (с тем, что было введено) и какую запись вернуть к правке.
  const [examReopen, setExamReopen] = useState(null);
  const [examEdit, setExamEdit] = useState(null);

  const sundayLessons = useMemo(() => lyceumSchedule.filter((e) => e.day === "sun").length, [lyceumSchedule]);

  // Экзамен — не предмет: тетрадь и цвет ему ни к чему, он живёт только в расписании.
  const lyceumSubjectNames = useMemo(() => {
    const names = [];
    lyceumSchedule.forEach((e) => {
      if (e.kind === "exam") return;
      if (e.subjectName && !names.includes(e.subjectName)) names.push(e.subjectName);
    });
    return names.sort((a, b) => a.localeCompare(b, "ru"));
  }, [lyceumSchedule]);

  function addEvent(name, date, priority) {
    if (!name.trim() || !date) return;
    setEvents((prev) => [
      ...prev,
      { id: "ev-" + Date.now() + "-" + Math.round(Math.random() * 1000), name: name.trim(), date, priority: Number(priority) || 2 },
    ]);
  }

  // Событие из расписания правится там же, где живёт: в записи расписания.
  // Название события — это название экзамена, дата — его дата.
  function updateEvent(id, patch) {
    if (id.startsWith(SCHEDULE_EVENT_PREFIX)) {
      const entryId = id.slice(SCHEDULE_EVENT_PREFIX.length);
      const mapped = {};
      if (patch.name !== undefined) mapped.subjectName = patch.name;
      if (patch.date !== undefined) mapped.date = patch.date;
      if (patch.priority !== undefined) mapped.priority = patch.priority;
      ["start", "end", "place", "url", "note"].forEach((field) => {
        if (patch[field] !== undefined) mapped[field] = patch[field];
      });
      updateScheduleEntry(entryId, mapped);
      return;
    }
    setEvents((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }

  function removeEvent(id) {
    if (id.startsWith(SCHEDULE_EVENT_PREFIX)) {
      removeScheduleEntry(id.slice(SCHEDULE_EVENT_PREFIX.length));
      return;
    }
    const index = events.findIndex((e) => e.id === id);
    if (index === -1) return;
    const event = events[index];
    setEvents((prev) => prev.filter((e) => e.id !== id));
    showUndo(`Вы удалили событие «${event.name || "без названия"}»`, () => {
      setEvents((prev) => {
        const next = [...prev];
        next.splice(Math.min(index, next.length), 0, event);
        return next;
      });
    });
  }

  // Прошедшие события копятся и мешают: их не удалишь по одному, когда их
  // два десятка. Чистятся разом, с одной отменой на всю пачку — событие из
  // расписания при этом уезжает вместе со своей записью, это одна и та же вещь.
  function clearPastEvents() {
    const goneOwn = events.filter((e) => e.date && daysUntilDate(e.date) < 0);
    const goneSchedule = lyceumSchedule.filter((e) => e.kind === "exam" && e.date && daysUntilDate(e.date) < 0);
    if (!goneOwn.length && !goneSchedule.length) return;
    setEvents((prev) => prev.filter((e) => !goneOwn.includes(e)));
    setLyceumSchedule((prev) => prev.filter((e) => !goneSchedule.includes(e)));
    const total = goneOwn.length + goneSchedule.length;
    showUndo(`Вы убрали ${total} ${eventsWord(total)}`, () => {
      setEvents((prev) => [...prev, ...goneOwn]);
      setLyceumSchedule((prev) => [...prev, ...goneSchedule]);
    });
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
    const subject = ALL_SUBJECTS.find((s) => s.id === id);
    if (!subject) return;
    const customIndex = customSubjects.findIndex((s) => s.id === id);
    const isCustom = customIndex !== -1;
    const entry = data[id] || EMPTY_SUBJECT;
    const savedAlloc = budget.alloc[id];
    const savedEntries = journal.filter((e) => e.subjectId === id);
    const notebookKey = "subj:" + id;
    const savedNotebook = notebooks[notebookKey];

    if (isCustom) {
      setCustomSubjects((prev) => prev.filter((s) => s.id !== id));
      setData((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    } else {
      // Уроки встроенного предмета остаются в данных: так отмена возвращает всё разом.
      setHiddenSubjects((prev) => (prev.includes(id) ? prev : [...prev, id]));
    }
    setBudget((prev) => {
      const alloc = { ...prev.alloc };
      delete alloc[id];
      return { ...prev, alloc };
    });
    setJournal((prev) => prev.filter((e) => e.subjectId !== id));
    setNotebooks((prev) => {
      const next = { ...prev };
      delete next[notebookKey];
      return next;
    });
    if (openSubject === id) setOpenSubject(null);
    if (jForm.subjectId === id) {
      const rest = ALL_SUBJECTS.filter((x) => x.id !== id);
      setJForm((prev) => ({ ...prev, subjectId: rest[0] ? rest[0].id : "" }));
    }

    showUndo(
      `Вы удалили предмет «${subject.name}»`,
      () => {
        if (isCustom) {
          setCustomSubjects((prev) => {
            const next = [...prev];
            next.splice(Math.min(customIndex, next.length), 0, subject);
            return next;
          });
          setData((prev) => ({ ...prev, [id]: entry }));
        } else {
          setHiddenSubjects((prev) => prev.filter((x) => x !== id));
        }
        setBudget((prev) => ({ ...prev, alloc: { ...prev.alloc, [id]: savedAlloc } }));
        setJournal((prev) => [...savedEntries, ...prev]);
        if (savedNotebook) setNotebooks((prev) => ({ ...prev, [notebookKey]: savedNotebook }));
      },
      () => {
        // Подтверждено — сносим файлы: и из заметок к урокам, и из тетради предмета.
        const lessonFiles = [
          ...(entry.topics || []),
          ...(entry.custom || []),
        ].flatMap((t) => (t.notes || []).flatMap((n) => n.files || []));
        const notebookFiles = (savedNotebook || []).flatMap((b) =>
          (b.branches || []).flatMap((r) => r.files || [])
        );
        [...lessonFiles, ...notebookFiles].forEach((f) => deleteAttachment(f).catch(() => {}));
      }
    );
  }

  // День недели у экзамена не выбирают — его задаёт дата. Ошиблись днём при
  // добавлении, вписали верную дату — запись переедет сама.
  // Уроки из готового расписания помечены набором, поэтому «Применить» заменяет
  // только их: экзамены и уроки, заведённые руками, остаются на месте.
  const presetLessons = useMemo(() => lyceumSchedule.filter((e) => e.preset === PRESET_ID).length, [lyceumSchedule]);

  function applyPreset(entries) {
    if (!entries.length) return;
    setLyceumSchedule((prev) => [...prev.filter((e) => e.preset !== PRESET_ID), ...entries]);
    if (entries.some((e) => e.day === "sun")) setShowSunday(true);
  }

  function clearPreset() {
    setLyceumSchedule((prev) => prev.filter((e) => e.preset !== PRESET_ID));
  }

  const presetOlympiads = useMemo(
    () => lyceumSchedule.filter((e) => e.preset === VOSH_PRESET_ID).length,
    [lyceumSchedule]
  );

  // Олимпиады заменяются целиком, как и тесты: отмеченный список — источник
  // правды, иначе снятая галочка оставила бы запись в расписании навсегда.
  function applyOlympiads(entries) {
    setLyceumSchedule((prev) => [...prev.filter((e) => e.preset !== VOSH_PRESET_ID), ...entries]);
  }

  function clearOlympiads() {
    setLyceumSchedule((prev) => prev.filter((e) => e.preset !== VOSH_PRESET_ID));
  }

  // Встроенные данные лицея поправили — расписание подтягивается само.
  // Раньше новый урок появлялся, только если вспомнить про «Обновить
  // расписание», а без этого его в расписании просто не было.
  useEffect(() => {
    if (!loaded || lyceumRevision === LYCEUM_REVISION) return;
    const mine = lyceumSchedule.filter((e) => e.preset);
    if (!mine.length) {
      setLyceumRevision(LYCEUM_REVISION);
      return;
    }
    const has = (preset) => mine.some((e) => e.preset === preset);
    const fresh = [
      ...(has(PRESET_ID) && presetChoices.school ? buildSchedule(presetChoices) : []),
      ...(has(KT_PRESET_ID) ? buildExams(examPicks) : []),
      ...(has(VOSH_PRESET_ID) ? buildOlympiads(voshPicks) : []),
    ];
    if (!fresh.length) {
      setLyceumRevision(LYCEUM_REVISION);
      return;
    }

    // Важность и роль урока человек мог поменять под себя — переносим их на
    // новые записи, а не сбрасываем на умолчание.
    const key = (e) => e.day + "|" + e.start + "|" + e.subjectName;
    const was = new Map(mine.map((e) => [key(e), e]));
    const next = fresh.map((e) => {
      const old = was.get(key(e));
      return old
        ? { ...e, priority: old.priority, level: old.level, ...(old.folded ? { folded: true } : null), ...(old.note ? { note: old.note } : null) }
        : e;
    });
    // Задание привязано к уроку по идентификатору: если урок пересобрался под
    // новым, привязку надо перенести, иначе задание повиснет в пустоте.
    const moved = new Map();
    next.forEach((e) => {
      const old = was.get(key(e));
      if (old && old.id !== e.id) moved.set(old.id, e.id);
    });

    const before = lyceumSchedule;
    setLyceumSchedule((prev) => [...prev.filter((e) => !e.preset), ...next]);
    if (moved.size) {
      setHomework((prev) => prev.map((h) => (moved.has(h.lessonId) ? { ...h, lessonId: moved.get(h.lessonId) } : h)));
    }
    setLyceumRevision(LYCEUM_REVISION);

    const added = next.filter((e) => !was.has(key(e))).length;
    const gone = mine.filter((e) => !next.some((n) => key(n) === key(e))).length;
    if (added || gone) {
      const parts = [added ? "добавилось " + added : "", gone ? "убралось " + gone : ""].filter(Boolean);
      showUndo("Расписание лицея обновлено: " + parts.join(", "), () => {
        setLyceumSchedule(before);
        setLyceumRevision(LYCEUM_REVISION);
      });
    }
  }, [loaded, lyceumRevision, lyceumSchedule, presetChoices, examPicks, voshPicks, showUndo]);

  function addScheduleEntry(day, entry) {
    if (!entry.subjectName || !entry.subjectName.trim()) return;
    const id = "sch-" + Date.now() + "-" + Math.round(Math.random() * 1000);
    const isExam = entry.kind === "exam";
    const dayByDate = isExam ? weekdayKeyFromDate(entry.date) : null;
    const finalDay = dayByDate || day;
    if (finalDay === "sun") setShowSunday(true);
    setLyceumSchedule((prev) => [
      ...prev,
      {
        id,
        day: finalDay,
        kind: isExam ? "exam" : "lesson",
        examKind: isExam ? (entry.examKind === "olympiad" ? "olympiad" : "exam") : undefined,
        subjectName: entry.subjectName.trim(),
        level: entry.level || "base",
        // Экзамен по умолчанию важнее урока: его и заводят ради даты.
        priority: Number(entry.priority) || (entry.kind === "exam" ? 3 : 1),
        start: entry.start || "08:30",
        end: entry.end || "09:15",
        room: entry.room || "",
        teacher: entry.teacher || "",
        place: entry.place || "",
        url: entry.url || "",
        date: entry.date || "",
      },
    ]);
    if (isExam) {
      const placed = { ...entry, day: finalDay, date: entry.date || "" };
      // Встал ровно туда, где добавляли, и наверх дня — рассказывать не о чем.
      if (finalDay !== day || examPlace(placed) !== "near") {
        showUndo(
          examMovedNote(placed, true),
          () => {
            setLyceumSchedule((prev) => prev.filter((e) => e.id !== id));
            setExamReopen({ day, values: entry, at: Date.now() });
          },
          null,
          EXAM_TOAST
        );
      }
    }
  }

  // Новая дата экзамена из его карточки в расписании. Экзамен сам переезжает на
  // день недели по дате — и уезжает из-под глаз, поэтому о переезде говорит
  // уведомление, а крестик в нём возвращает прежнюю дату и открывает правку.
  function moveExamDate(entry, date) {
    const before = { date: entry.date || "", day: entry.day };
    updateScheduleEntry(entry.id, { date });
    const moved = { ...entry, date, day: weekdayKeyFromDate(date) || entry.day };
    if (moved.day === entry.day && examPlace(moved) === examPlace(entry)) return;
    showUndo(
      examMovedNote(moved, false),
      () => {
        updateScheduleEntry(entry.id, before);
        setExamEdit({ id: entry.id, at: Date.now() });
      },
      null,
      EXAM_TOAST
    );
  }

  function updateScheduleEntry(id, patch) {
    setLyceumSchedule((prev) => {
      // Роль и важность — свойства предмета, а не одного урока: алгебра
      // профильная и важная и в среду, и в пятницу, и на обеих парах подряд.
      // Проставлять их в каждой карточке отдельно значило бы шесть раз
      // повторить одно и то же, а забытый урок потом врал бы в подсчётах и
      // светился бы на «Сегодня» не тем цветом. Экзамены живут сами по себе.
      const source = prev.find((e) => e.id === id);
      const shared = {};
      if (patch.level !== undefined) shared.level = patch.level;
      if (patch.priority !== undefined) shared.priority = patch.priority;
      const spread =
        Object.keys(shared).length && source && source.kind !== "exam" ? String(source.subjectName || "").trim() : null;
      return prev.map((e) => {
        if (e.id !== id) {
          if (spread && e.kind !== "exam" && String(e.subjectName || "").trim() === spread) {
            return { ...e, ...shared };
          }
          return e;
        }
        const next = { ...e, ...patch };
        if (next.kind === "exam" && patch.date !== undefined) {
          // Дата — единственный источник правды о дне недели для экзамена.
          const day = weekdayKeyFromDate(patch.date);
          if (day) next.day = day;
        }
        return next;
      });
    });
    // Экзамен, переехавший на воскресенье, не должен пропасть вместе со скрытым днём.
    if (patch.date !== undefined && weekdayKeyFromDate(patch.date) === "sun") setShowSunday(true);
  }

  function removeScheduleEntry(id) {
    const index = lyceumSchedule.findIndex((e) => e.id === id);
    if (index === -1) return;
    const entry = lyceumSchedule[index];
    setLyceumSchedule((prev) => prev.filter((e) => e.id !== id));
    const what = entry.kind === "exam" ? examKindLabel(entry.examKind) : "урок";
    showUndo(`Вы удалили ${what} «${entry.subjectName || "без названия"}» из расписания`, () => {
      setLyceumSchedule((prev) => {
        const next = [...prev];
        next.splice(Math.min(index, next.length), 0, entry);
        return next;
      });
    });
  }

  // lessonId связывает задание с уроком расписания. Раньше связь была только
  // по названию предмета строкой, и «к какому именно уроку» приложение не знало —
  // а спрашивают обычно именно это.
  function addHomework(date, subjectName, text, minutes, lessonId) {
    if (!text.trim()) return;
    const id = "hw-" + Date.now() + "-" + Math.round(Math.random() * 1000);
    setHomework((prev) => [
      ...prev,
      {
        id,
        date,
        subjectName,
        text: text.trim(),
        minutes: Math.max(0, Number(minutes) || 0),
        done: false,
        attachments: [],
        ...(lessonId ? { lessonId } : null),
      },
    ]);
  }

  function removeHomework(id) {
    const index = homework.findIndex((h) => h.id === id);
    if (index === -1) return;
    const hw = homework[index];
    setHomework((prev) => prev.filter((h) => h.id !== id));
    showUndo(
      `Вы удалили «${hw.text}»`,
      () => {
        setHomework((prev) => {
          const next = [...prev];
          next.splice(Math.min(index, next.length), 0, hw);
          return next;
        });
      },
      () => (hw.attachments || []).forEach((a) => deleteAttachment(a).catch(() => {}))
    );
  }

  function updateHomework(id, patch) {
    setHomework((prev) => prev.map((h) => (h.id === id ? { ...h, ...patch } : h)));
  }

  async function attachFileToHomework(id, file) {
    const res = await attachFile(file, "hw-" + id);
    if (!res.ok) {
      alert("Не удалось прикрепить файл: " + res.error);
      return;
    }
    setHomework((prev) =>
      prev.map((h) => (h.id === id ? { ...h, attachments: [...(h.attachments || []), res.attachment] } : h))
    );
  }

  async function openAttachment(att) {
    const res = await attachmentUrl(att);
    if (!res.ok) {
      alert("Не удалось открыть файл: " + res.error);
      return;
    }
    const a = document.createElement("a");
    a.href = res.url;
    a.download = att.name;
    a.target = "_blank";
    a.rel = "noreferrer";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  // Файл у задания убирается с возможностью вернуть: из хранилища он
  // стирается, только когда уведомление закрылось без отмены.
  function removeAttachment(hwId, att) {
    const hw = homework.find((h) => h.id === hwId);
    const index = hw ? (hw.attachments || []).findIndex((a) => sameFile(a, att)) : -1;
    setHomework((prev) =>
      prev.map((h) => (h.id === hwId ? { ...h, attachments: (h.attachments || []).filter((a) => !sameFile(a, att)) } : h))
    );
    showUndo(
      `Вы убрали файл «${att.name || "без названия"}»`,
      () =>
        setHomework((prev) =>
          prev.map((h) => {
            if (h.id !== hwId) return h;
            const next = (h.attachments || []).filter((a) => !sameFile(a, att));
            next.splice(Math.max(0, Math.min(index, next.length)), 0, att);
            return { ...h, attachments: next };
          })
        ),
      () => deleteAttachment(att).catch(() => {})
    );
  }



  // Рекомендация: недельный ресурс делится между предметами по тому, сколько на
  // каждом осталось работы. Это не «правильный» план, а точка отсчёта — от неё
  // видно, где вы сознательно отошли от равномерного темпа.
  const recommendedHours = useMemo(() => {
    const remaining = {};
    let total = 0;
    ALL_SUBJECTS.forEach((s) => {
      const list = [...subjectData(data, s.id).topics, ...subjectData(data, s.id).custom];
      const hours = list.filter((t) => !t.done).reduce((sum, t) => sum + (Number(t.duration) || D) / 60, 0);
      remaining[s.id] = hours;
      total += hours;
    });
    const budgetHours = weeklyBudgetHours(budget);
    const map = {};
    ALL_SUBJECTS.forEach((s) => {
      // Округление до получаса: «3,7 ч в неделю» — не та точность, которой стоит верить.
      map[s.id] = total > 0 ? Math.round(((remaining[s.id] / total) * budgetHours) * 2) / 2 : 0;
    });
    return map;
  }, [data, budget, ALL_SUBJECTS]);

  // Факт для баланса — часы за последние семь дней: план задан на неделю, значит
  // и сравнивать надо с неделей, иначе к маю любой предмет «перевыполнен».
  const balanceItems = useMemo(() => {
    const since = ymd(new Date(Date.now() - 7 * 86400000));
    const factBySubject = {};
    journalWithTrainer.forEach((e) => {
      if (e.date >= since) factBySubject[e.subjectId] = (factBySubject[e.subjectId] || 0) + (Number(e.hours) || 0);
    });
    return ALL_SUBJECTS.map((s) => ({
      id: s.id,
      name: s.name,
      color: s.color,
      plan: Number(budget.alloc[s.id]) || 0,
      fact: Math.round((factBySubject[s.id] || 0) * 10) / 10,
      recommended: recommendedHours[s.id] || 0,
      done: (stats.perSubject[s.id] || { done: 0 }).done,
    }));
  }, [journalWithTrainer, budget, ALL_SUBJECTS, stats, recommendedHours]);

  const weeklyJournalHours = useMemo(() => {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 86400000);
    return Math.round(journalWithTrainer.filter((e) => new Date(e.date) >= weekAgo).reduce((sum, e) => sum + e.hours, 0) * 10) / 10;
  }, [journalWithTrainer]);

  const dailyTotals = useMemo(() => {
    const map = {};
    journalWithTrainer.forEach((e) => {
      map[e.date] = (map[e.date] || 0) + e.hours;
    });
    return map;
  }, [journalWithTrainer]);

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

  const selectedDayEntries = useMemo(
    () => journalWithTrainer.filter((e) => e.date === selectedDate),
    [journalWithTrainer, selectedDate]
  );

  // Общий список записей: свои и выведенные из тренажёра, сверху свежие.
  const journalListed = useMemo(
    () => journalWithTrainer.slice().sort((a, b) => String(b.date).localeCompare(String(a.date))),
    [journalWithTrainer]
  );

  const hwDates = useMemo(() => new Set(homework.map((h) => h.date)), [homework]);

  // Дни с экзаменом или олимпиадой видно в календаре сразу: это те даты, ради
  // которых весь план и считается.
  const examDates = useMemo(
    () => new Set(lyceumSchedule.filter((e) => e.kind === "exam" && e.date).map((e) => e.date)),
    [lyceumSchedule]
  );

  // Точки над числом — пройденные в этот день уроки, каждая в цвете своего предмета.
  // Берём только записи об отметке урока: заметки со временем сюда не считаются.
  const lessonDotsByDate = useMemo(() => {
    const map = {};
    journal.forEach((e) => {
      if (!e.auto || !e.lessonId || e.noteId) return;
      const subject = ALL_SUBJECTS.find((x) => x.id === e.subjectId);
      if (!subject) return;
      if (!map[e.date]) map[e.date] = [];
      if (!map[e.date].includes(subject.color)) map[e.date].push(subject.color);
    });
    return map;
  }, [journal, ALL_SUBJECTS]);

  const selectedDaySubjects = useMemo(() => {
    const dow = DOW_TO_KEY[new Date(selectedDate + "T00:00:00").getDay()];
    const names = [];
    activeSchedule
      .filter((e) => e.day === dow && e.kind !== "exam")
      .sort((a, b) => a.start.localeCompare(b.start))
      .forEach((e) => {
        if (e.subjectName && !names.includes(e.subjectName)) names.push(e.subjectName);
      });
    // Homework outlives the timetable: moving a lesson to another day must not hide what was
    // already set on it, so subjects that still carry homework for this date stay listed.
    homework.forEach((h) => {
      if (h.date === selectedDate && h.subjectName && !names.includes(h.subjectName)) names.push(h.subjectName);
    });
    return names;
  }, [activeSchedule, selectedDate, homework]);

  // Highest level among that weekday's lessons, per subject.
  const selectedDayLevels = useMemo(() => {
    const dow = DOW_TO_KEY[new Date(selectedDate + "T00:00:00").getDay()];
    const map = {};
    activeSchedule
      .filter((e) => e.day === dow && e.subjectName && e.kind !== "exam")
      .forEach((e) => {
        const current = map[e.subjectName];
        const priority = Number(e.priority) || 1;
        if (!current || priority > current.priority) {
          map[e.subjectName] = { level: e.level || "base", priority };
        }
      });
    return map;
  }, [activeSchedule, selectedDate]);

  const homeworkForSelectedDate = useMemo(() => homework.filter((h) => h.date === selectedDate), [homework, selectedDate]);

  const freeHomework = useMemo(
    () => homeworkForSelectedDate.filter((h) => !h.subjectName),
    [homeworkForSelectedDate]
  );

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

  // Пора повторить: считается из дневника, поэтому темы, пройденные ещё до
  // появления повторений, попадают сюда сами.
  const dueForReview = useMemo(
    () => dueTopics(subjectsWithTopics, journal, todayStr()),
    [subjectsWithTopics, journal]
  );

  function reviewTopic(row) {
    setJournal((prev) => [
      {
        id: Date.now(),
        date: todayStr(),
        subjectId: row.subjectId,
        hours: reviewHours(row.duration),
        note: "Повторение: " + row.name,
        auto: true,
        lessonId: row.topicId,
        review: true,
      },
      ...prev,
    ]);
  }

  const subjectNameById = useCallback(
    (id) => (ALL_SUBJECTS.find((s) => s.id === id) || {}).name || id,
    [ALL_SUBJECTS]
  );

  function goScreen(key) {
    setScreen(key);
    try {
      localStorage.setItem(SCREEN_KEY, key);
    } catch (e) {
      /* приватный режим — экран просто не запомнится */
    }
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Уроки на сегодня: те же правила, что и в расписании, включая экзамены,
  // которые показываются только за неделю до даты.
  const todayKey = DOW_TO_KEY[new Date().getDay()];
  const currentWeek = weekKey(new Date());
  const todayLessons = useMemo(
    () =>
      activeSchedule
        .filter((e) => e.day === todayKey && (e.kind !== "exam" || examVisibleInSchedule(e)))
        .sort((a, b) => String(a.start).localeCompare(String(b.start))),
    [activeSchedule, todayKey]
  );

  // Дела на виду: несделанные, с ближайшим сроком сверху.
  const upcomingHomework = useMemo(
    () =>
      homework
        .filter((h) => h.text)
        .map((h) => ({ ...h, daysUntil: Math.round((new Date(h.date + "T00:00:00") - todayDateOnly) / 86400000) }))
        .filter((h) => !h.done || h.daysUntil >= 0)
        .sort((a, b) => Number(a.done) - Number(b.done) || a.daysUntil - b.daysUntil)
        .slice(0, 6),
    [homework, todayDateOnly]
  );

  // Тетради всех предметов в одном месте: свои предметы и предметы лицея.
  const notebookOwners = useMemo(() => {
    const own = ALL_SUBJECTS.map((s) => ({ key: "subj:" + s.id, name: s.name, color: s.color, from: "own" }));
    const lyceum = lyceumSubjectNames.map((name) => ({
      key: "lyceum:" + name,
      name,
      color: lyceumColorOf(name),
      from: "lyceum",
    }));
    return own.concat(lyceum);
  }, [ALL_SUBJECTS, lyceumSubjectNames, subjectColors]);

  const orderedOwners = useMemo(() => orderOwners(notebookOwners, notebookOrder), [notebookOwners, notebookOrder]);
  const currentNotebook = orderedOwners.find((o) => o.key === notebookOwner) || orderedOwners[0] || null;

  // Опись заданий банка для поиска: номер, предмет и начало условия. Она
  // приходит отдельным куском и только когда открыли поиск, — тянуть её вместе
  // с приложением ради экрана, куда заходят не каждый день, незачем.
  const [bankFind, setBankFind] = useState(null);
  const [findFailed, setFindFailed] = useState(false);
  useEffect(() => {
    if (screen !== "search" || bankFind) return undefined;
    let alive = true;
    loadFind().then((list) => {
      if (!alive) return;
      setFindFailed(list === null);
      setBankFind(list || []);
    });
    return () => { alive = false; };
  }, [screen, bankFind]);

  const found = useMemo(
    () =>
      searchAll(query, {
        bankTasks: bankFind || [],
        subjects: subjectsWithTopics,
        journal,
        subjectName: subjectNameById,
        homework,
        events: allEvents,
        schedule: lyceumSchedule,
        notebookOwners,
        notebooks,
      }),
    [query, bankFind, subjectsWithTopics, journal, subjectNameById, homework, allEvents, lyceumSchedule, notebookOwners, notebooks]
  );

  // Находка ведёт туда, где она живёт: экран, а при надобности — предмет или
  // тетрадь, которые надо там раскрыть.
  // К чему прокрутить после перехода и что подсветить (data-focus-id).
  const [focusTarget, setFocusTarget] = useState(null);
  // Какой блок и ветку тетради раскрыть.
  const [notebookFocus, setNotebookFocus] = useState(null);

  function openFound(item) {
    if (item.subjectId) {
      setOpenSubject(item.subjectId);
      // На телефоне сразу страница предмета, а не список: урок ищут в нём.
      setStudyView("subject");
      setSubjectTab((prev) => ({ ...prev, [item.subjectId]: "lessons" }));
    }
    if (item.notebook) setNotebookOwner(item.notebook);
    if (item.notebookFocus) setNotebookFocus({ ...item.notebookFocus, at: Date.now() });
    // Задание открывается на своей дате: раньше дневник открывался на сегодня,
    // и найденное задание приходилось искать ещё раз по календарю.
    if (item.date && item.screen === "journal") {
      setSelectedDate(item.date);
      const d = new Date(item.date + "T00:00:00");
      setCalMonth(new Date(d.getFullYear(), d.getMonth(), 1));
    }
    // Урок может стоять только в свёрнутой «Всей неделе» — раскрываем её.
    if (item.screen === "school") setOpenSections((prev) => ({ ...prev, scheduleWeek: true }));
    const focus = item.focus === undefined ? item.id : item.focus;
    setFocusTarget(focus ? { id: focus, at: Date.now() } : null);
    // Найденное задание открывается само, а не «где-то там в тренажёре».
    // Раздел не выставляем, а решённые не прячем: иначе задание, которое искали,
    // на экране не покажется — именно потому, что его уже решали.
    if (item.task) setTrainerState({ open: item.task.subject, section: "", taskId: item.task.id, again: true });
    goScreen(item.screen);
  }

  // Найденное прокручивается в середину экрана и коротко подсвечивается.
  // Экран и свёрнутые блоки открываются не мгновенно, поэтому ждём элемент
  // до полутора секунд.
  useEffect(() => {
    if (!focusTarget) return undefined;
    let tries = 0;
    let flash = null;
    const selector = '[data-focus-id="' + String(focusTarget.id).replace(/["\\]/g, "\\$&") + '"]';
    const timer = setInterval(() => {
      tries += 1;
      const el = [...document.querySelectorAll(selector)].find((n) => n.offsetParent);
      if (el || tries > 30) clearInterval(timer);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.remove("ap-flash");
      void el.offsetWidth;
      el.classList.add("ap-flash");
      flash = setTimeout(() => el.classList.remove("ap-flash"), 2200);
    }, 50);
    return () => {
      clearInterval(timer);
      if (flash) clearTimeout(flash);
    };
  }, [focusTarget]);

  // Попытка — отдельная запись: по журналу потом видно и серию, и время.
  function addAttempt(entry) {
    setTrainerLog((list) => list.concat({ id: "try-" + entry.taskId + "-" + Date.now(), at: new Date().toISOString(), ...entry }));
  }

  // Отметка о сверке ключа одна на задание: повторное нажатие меняет прежнюю,
  // поэтому id у неё постоянный.
  function addMark(entry) {
    setBankMarks((list) => {
      // Жалоба на само задание живёт отдельно от отметки о ключе: одно другому
      // не мешает — задание может быть и кривым, и с верным ответом.
      const id = (entry.kind === "broken" ? "broken-" : "mark-") + entry.taskId;
      const rest = list.filter((m) => m.id !== id);
      const was = list.find((m) => m.id === id);
      // Повторное нажатие той же кнопки снимает отметку: передумать можно.
      // А вот вписанный руками ответ с ФИПИ так не снимается — его прислали,
      // а не просто нажали кнопку. Само «откуда пришло» не храним: это про
      // нажатие, а не про запись.
      const { byButton, ...saved } = entry;
      if (was && was.kind === entry.kind && byButton) return rest;
      return rest.concat({ id, at: new Date().toISOString(), ...saved });
    });
  }


  const weeklyBudget = weeklyBudgetHours(budget);
  const trainerToday = (() => {
    const today = todayStr();
    if (dayCounts(trainerByDay, today)) return "✓ сегодня";
    const offer = offerFor(trainerByDay, today, (trainerState && trainerState.open) || "", BANK_SUBJECTS);
    return offer && offer.solved > 0 ? offer.solved + " из " + offer.need : "";
  })();
  // Какие карточки внизу «Сегодня» пусты. События не пусты, пока есть главное:
  // под ним стоит вердикт «хватит ли времени», а он нужен и без списка.
  const eventsEmpty = laterEvents.length === 0 && !mainEvent;
  const reminderKind = studyStreakOn
    ? "streak"
    : studyReminder.tone === "ok"
      ? "ok"
      : studyReminder.tone === "warn"
        ? "warn"
        : "idle";
  const homeworkEmpty = upcomingHomework.length === 0;
  const studyEmpty = !ALL_SUBJECTS.some((s) => stats.perSubject[s.id] && stats.perSubject[s.id].total);
  const navItems = [
    {
      key: "today",
      label: "Сегодня",
      hint: todayLessons.length ? todayLessons.length + " " + lessonsWord(todayLessons.length) : "",
    },
    {
      key: "events",
      label: "События",
      hint: upcomingEvents.length ? upcomingEvents.length + " " + eventsWord(upcomingEvents.length) : "",
    },
    { key: "budget", label: "Распределение", hint: Math.round(weeklyBudget) + " ч" },
    { key: "study", label: "Подготовка", hint: stats.totalAll ? stats.overallPct + "%" : "" },
    {
      key: "trainer",
      label: "Тренажёр",
      // Размер банка («768 заданий») не меняется и ничего не говорит. Полезно
      // другое: сколько решено сегодня и сколько нужно, чтобы день зачёлся.
      hint: trainerToday,
    },
    { key: "school", label: "Лицей КЭО", short: "Лицей", hint: "" },
    { key: "journal", label: "Дневник", hint: weeklyJournalHours ? weeklyJournalHours + " ч" : "" },
    { key: "notes", label: "Тетради", hint: "" },
    { key: "search", label: "Поиск", hint: "" },
    { key: "settings", label: "Синхронизация", short: "Облако", hint: saveErr ? "!" : "" },
    // Настройки отделены от облака: тема и установка на устройство — это не
    // синхронизация, и искать их под этим словом было неочевидно.
    { key: "prefs", label: "Настройки", hint: "" },
  ];

  const SCREEN_TEXT = {
    today: ["Сегодня", "Что сегодня в лицее, сколько времени уже записано и что горит по срокам"],
    events: ["События", "Приоритет решает, до какого события считается план"],
    budget: ["Распределение времени (КПВ)", "Сначала бюджет дня, потом предметы"],
    study: ["Самостоятельная подготовка", "Уроки, заметки и тетради по своим предметам"],
    trainer: ["Тренажёр по банку ФИПИ", "Обществознание, физика и информатика из открытого банка"],
    school: ["Лицей КЭО", "Предметы лицея и расписание недели с ролями уроков"],
    journal: ["Дневник занятий", "Календарь занятий, записи за день и домашние задания"],
    notes: ["Тетради", "Блоки и ветки: конспект с форматированием и вложениями"],
    search: ["Поиск", "По темам, дневнику, домашке, событиям, расписанию, тетрадям и заданиям банка — в том числе по номеру задания"],
    settings: ["Синхронизация", "Облако и резервная копия записей"],
    prefs: ["Настройки", "Оформление, установка на устройство и версия приложения"],
  };
  const screenInfo = { title: (SCREEN_TEXT[screen] || SCREEN_TEXT.today)[0], note: (SCREEN_TEXT[screen] || SCREEN_TEXT.today)[1] };

  const todayLabel = new Date().toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" });
  // Над заголовком экрана — строка «Среда, 23 сентября»: день недели первым,
  // потому что по нему решают, какие сегодня уроки.
  const todayHeadLabel = (() => {
    const now = new Date();
    const day = now.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
    const weekday = now.toLocaleDateString("ru-RU", { weekday: "long" });
    return `${capitalizeFirst(weekday)}, ${day}`;
  })();

  // Плитки над «Сегодня»: сколько записано к дневной цели, идёт ли серия и
  // сколько набралось за неделю к недельному плану. Всё это уже считалось для
  // напоминания и колонки — здесь только собрано в одно место.
  const todayGoalHours = goalForDate(new Date());
  const streakAtRisk = studyPulse.daysSince === 1 && studyPulse.streak > 0;
  const streakShown = studyPulse.daysSince === 0 || streakAtRisk ? studyPulse.streak : 0;
  const last7 = (() => {
    const days = [];
    const counted = new Set(journalWithTrainer.filter((e) => (Number(e.hours) || 0) > 0).map((e) => e.date));
    for (let i = 6; i >= 0; i -= 1) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push(counted.has(ymd(d)) || counted.has(d.toISOString().slice(0, 10)));
    }
    return days;
  })();

  // Кнопка «Записать занятие» в шапке ведёт к форме и сразу ставит курсор в
  // поле: на телефоне форма ниже первого экрана, и искать её прокруткой долго.
  function focusQuickLog() {
    const el = document.getElementById("quick-log");
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    const field = el.querySelector("select, input, textarea");
    if (field) field.focus({ preventScroll: true });
  }
  const pad2 = (n) => String(n).padStart(2, "0") + ":00";
  const modeLabel =
    mode === "auto"
      ? `Авто · ночная с ${pad2(nightWindow.from)} до ${pad2(nightWindow.to)} · сейчас ${theme === "night" ? "ночная" : "светлая"}`
      : theme === "night"
      ? "Ночная тема вручную"
      : "Светлая тема вручную";

  // Почта вошедшего нужна только для подписи в листе «Ещё» на телефоне.
  useEffect(() => {
    if (!cloudConfigured) return;
    let alive = true;
    authReady().then(() => {
      if (!alive) return;
      const user = currentUser();
      setAccountEmail(user ? user.email || "" : "");
      setAccountReady(true);
    });
    const off = onAuthChange((session) => {
      setAccountEmail(session && session.user ? session.user.email || "" : "");
    });
    return () => {
      alive = false;
      off();
    };
  }, []);

  const account = {
    signedIn: cloudOn,
    email: accountEmail,
    onSignOut: () => signOut(),
    onOpen: () => goScreen("settings"),
  };

  // Отсчёты для колонки и шапки: ближайшее событие и то, по которому считается план.
  const countdownOf = (event) => {
    if (!event) return null;
    const days = daysUntilDate(event.date);
    return { id: event.id, days, word: daysWord(days), name: event.name };
  };
  const nextCountdown = countdownOf(nextEvent);
  const mainCountdown = countdownOf(mainEvent);

  const syncLine = lastSyncedAt
    ? `Синхронизировано ${lastSyncedAt.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`
    : "Ещё не синхронизировано";
  const syncNote = saveErr
    ? { ok: false, text: "облако не отвечает" }
    : cloudPending
    ? { ok: false, text: "правки ждут связи" }
    : cloudOn
    ? { ok: true, text: "облако на связи" }
    : { ok: false, text: "только на этом устройстве" };

  return (
    <div data-theme={theme} className={"ap-shell" + (backgroundOn ? " ap-live-bg" : "")} style={styles.shell}>
      <Background theme={theme} enabled={backgroundOn} showcase={showcase} />
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=PT+Serif:wght@400;700&family=Golos+Text:wght@400;500;600;700&family=Inter:wght@400;500;600&display=swap');
        ${THEME_CSS}
        * { box-sizing: border-box; }
        .topic-row:hover { background: var(--neutralBg); }
        .subj-card:hover { transform: translateY(-2px); }
        button, input, select, textarea { color: inherit; font-family: inherit; }
        button { cursor: pointer; background-color: transparent; }
        h1, h2, h3 { color: inherit; }
        a.lesson-link { color: inherit; text-decoration: underline; text-decoration-color: var(--line); text-underline-offset: 2px; }
        a.lesson-link:hover { text-decoration-color: currentColor; }
        /* Chrome reserves room for spinner arrows inside number inputs, which clipped "150" to "15"
           in the narrow per-weekday fields on a phone. The values are typed, not stepped. */
        input[type="number"] { -moz-appearance: textfield; }
        input[type="number"]::-webkit-outer-spin-button,
        input[type="number"]::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        .undo-bar { animation: undo-countdown ${UNDO_SECONDS}s linear forwards; }
        .undo-toast { animation: undo-in 220ms cubic-bezier(0.2, 0.8, 0.3, 1); }
        @keyframes undo-in { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
        @media (prefers-reduced-motion: reduce) { .undo-toast { animation: none; } }
        @keyframes undo-countdown { from { width: 100%; } to { width: 0%; } }
        @media (prefers-reduced-motion: reduce) { .undo-bar { animation: none; width: 100%; } }
        /* Карточка приподнимается под курсором — так видно, что с ней можно работать,
           и мягко появляется при переходе на экран: иначе смена раздела выглядит рывком. */
        .ap-screen { animation: ap-screen-in .24s cubic-bezier(.2,.8,.3,1) both; }
        @keyframes ap-screen-in { from { opacity: .4; transform: translateY(8px); } to { opacity: 1; transform: none; } }
        .ap-card { min-width: 0; transition: box-shadow .22s ease, border-color .22s ease; animation: ap-rise .26s ease both; }
        /* Карточки входят по очереди — так переход читается как движение, а не как вспышка. */
        .ap-screen > .ap-card:nth-child(2), .ap-screen > * > .ap-card:nth-child(2) { animation-delay: .04s; }
        .ap-screen > .ap-card:nth-child(3), .ap-screen > * > .ap-card:nth-child(3) { animation-delay: .08s; }
        .ap-screen > .ap-card:nth-child(4), .ap-screen > * > .ap-card:nth-child(4) { animation-delay: .12s; }
        ${NEW_CSS}
        .ap-pill { background: transparent; color: var(--railInk2); transition: background .22s ease, color .22s ease; }
        .ap-pill:hover { background: var(--railActive); color: var(--railInk); }
        .ap-pill.is-on { background: var(--accent); color: var(--accentInk); }
        .ap-version { transition: color .2s ease; }
        .ap-version:hover { color: var(--accent); }
        .ap-row { transition: background .16s ease, border-color .16s ease, box-shadow .16s ease; }
        .ap-row:hover { box-shadow: var(--shadow); }
        /* Полоса прогресса выезжает от левого края, столбик графика вырастает снизу. */
        .ap-fill { transform-origin: left; animation: ap-sweep .8s cubic-bezier(.2,.8,.3,1) both; }
        .ap-bar { transform-origin: bottom; animation: ap-grow .7s cubic-bezier(.2,.8,.3,1) both; }
        /* В SVG точка отсчёта трансформации задаётся отдельно, иначе столбец растёт из угла холста. */
        .ap-bar-svg { transform-box: fill-box; transform-origin: bottom; animation: ap-grow .7s cubic-bezier(.2,.8,.3,1) both; }
        .ap-flash { animation: ap-flash 2.2s ease-out; border-radius: 12px; }
        @keyframes ap-flash { 0%, 35% { box-shadow: 0 0 0 3px var(--accent); } 100% { box-shadow: 0 0 0 3px transparent; } }
        @media (prefers-reduced-motion: reduce) { .ap-flash { animation: none; box-shadow: 0 0 0 3px var(--accent); } }
        @keyframes ap-rise { from { opacity: .35; transform: translateY(6px); } to { opacity: 1; transform: none; } }
        @keyframes ap-sweep { from { transform: scaleX(0); } to { transform: scaleX(1); } }
        @keyframes ap-grow { from { transform: scaleY(.02); } to { transform: scaleY(1); } }
        @media (prefers-reduced-motion: reduce) {
          .ap-card, .ap-nav, .ap-row, .ap-tab, .ap-pill, .ap-tab-mark, .ap-screen { transition: none; animation: none; }
          .ap-fill, .ap-bar, .ap-bar-svg { animation: none; }
        }
        /* Ширину названия урока задаёт таблица стилей, а не инлайновый стиль: иначе
           min-width: 0 применяется, а flex — нет, и название вылезает поверх полей. */
        .topic-row > label { flex: 1 1 160px; min-width: 0; }
        /* Карточка предмета бывает узкой и на широком экране — сетка кладёт их по
           три в ряд, — поэтому название переносится на свою строку по ширине
           самой строки, а не экрана. */
        @container (max-width: 380px) { .topic-row > label { flex-basis: 100%; } }
        @media (max-width: 560px) { .topic-row > label { flex-basis: 100%; } }
        /* На телефоне навигация уходит вниз, как в обычных приложениях: до полосы
           внизу большой палец дотягивается, до колонки слева — нет. */
        .ap-tabbar, .ap-only-mobile { display: none; }
        /* «Подготовка» и «Тетради», вариант A. */
        .ap-mobile-only { display: none !important; }
        .topic-row:hover { background: none; }
        /* Название урока со ссылкой — не подчёркнуто в покое: одиннадцать подчёркнутых
           строк подряд читались как сплошная рябь. Подчёркивание — под курсором. */
        .topic-row a.lesson-link { text-decoration: none; }
        .topic-row a.lesson-link:hover { text-decoration: underline; text-decoration-color: currentColor; }
        .ap-study-row { background: transparent; transition: background .15s ease; }
        .ap-study-row:hover, .ap-study-row.is-on { background: var(--neutralBg); }
        .ap-menu-item:hover { background: var(--neutralBg) !important; }
        .ap-nbw-branch:hover:not([aria-current]) { background: var(--line2) !important; }
        .ap-notes-subject:hover { background: var(--line2); }
        .ap-nbw.is-compact { grid-template-columns: 264px minmax(0, 1fr) !important; }
        .ap-notes-chips { display: none; }
        .ap-notes-order { display: none; }
        .ap-notes .ap-nbw { flex: 1; }
        .ap-main .ap-nbw-title:focus {
          box-shadow: none !important; border-color: transparent !important; border-bottom-color: var(--accent) !important;
        }
        .ap-main .ap-nbw label input:focus { box-shadow: none !important; border-color: transparent !important; }
        .ap-rt-toolbar::-webkit-scrollbar, .ap-notes-chips::-webkit-scrollbar { display: none; }
        .ap-rt-editor h3 { font-family: var(--serif); font-size: 1.25em; font-weight: 700; margin: .8em 0 .3em; }
        .ap-rt-editor ul, .ap-rt-editor ol { padding-left: 1.4em; }
        @media (max-width: 900px) {
          .ap-shell { flex-direction: column; }
          .ap-rail { display: none !important; }
          .ap-tabbar, .ap-only-mobile { display: block; }
          ${NEW_MOBILE_CSS}
          /* Телефон: и «Подготовка», и тетрадь — два шага вместо двух колонок.
             Список → предмет, оглавление → ветка; назад — кнопкой сверху. */
          .ap-mobile-only { display: inline-flex !important; }
          .ap-study { grid-template-columns: minmax(0, 1fr) !important; }
          .ap-study[data-view="list"] .ap-study-detail { display: none !important; }
          .ap-study[data-view="subject"] .ap-study-list { display: none !important; }
          .ap-study-list { position: static !important; }
          .ap-study-row { min-height: 60px; }
          .ap-main section.ap-card.ap-study-detail { padding: 14px 16px 18px !important; }
          .ap-study-detail .ap-note-panel { margin-left: 0 !important; }
          .ap-study-detail .ap-study-nb { margin: 0 -16px -18px !important; }
          .ap-nbw { grid-template-columns: minmax(0, 1fr) !important; min-height: 0 !important; }
          .ap-nbw[data-view="outline"] .ap-nbw-editor { display: none !important; }
          .ap-nbw[data-view="editor"] .ap-nbw-outline { display: none !important; }
          .ap-nbw-outline { border-right: none !important; background: transparent !important; padding: 14px 14px 18px !important; }
          .ap-nbw-preview { display: block !important; }
          .ap-nbw-branch { min-height: 54px !important; border-radius: 10px !important; }
          .ap-nbw-editor > div { padding: 12px 16px 22px !important; }
          .ap-nbw-title { font-size: 26px !important; }
          .ap-nbw-crumbs { display: none; }
          .ap-notes { grid-template-columns: minmax(0, 1fr) !important; min-height: 0 !important; }
          .ap-notes-side { display: none; }
          .ap-notes-chips { display: flex !important; }
          .ap-notes-order { display: block; }
          .ap-rt-toolbar { flex-wrap: nowrap !important; }
          /* minmax(0, 1fr), а не 1fr: иначе колонка тянется под самый широкий
             элемент внутри карточки и уезжает за край экрана. */
          .ap-grid2 { grid-template-columns: minmax(0, 1fr) !important; }
          /* Подзаголовок экрана на телефоне пересказывает название вкладки,
             которое и так подсвечено внизу, и занимает две строки. */
          .ap-head-note { display: none; }
        }
        /* Отдельным блоком после телефонного: в 1.2.0 он встал внутрь, закрыл
           телефонный раньше времени, и правила «одна колонка» и «без
           подзаголовка» заработали на любом экране — «Дневник» и «События»
           вытянулись в одну колонку и на компьютере. */
        @media (max-width: 560px) {
          .ap-topic-mins { display: none; }
        }
      `}</style>

      <Rail
        items={navItems}
        screen={screen}
        onGo={goScreen}
        mode={mode}
        setMode={setMode}
        modeLabel={modeLabel}
        todayLabel={todayLabel}
        syncLine={syncLine}
        syncNote={syncNote}
        next={nextCountdown}
        main={mainCountdown}
        version={__APP_VERSION__}
        onOpenNotes={() => setNotesOpen(true)}
      />

      <TabBar
        items={navItems}
        screen={screen}
        onGo={goScreen}
        mode={mode}
        setMode={setMode}
        modeLabel={modeLabel}
        account={account}
        version={__APP_VERSION__}
        onOpenNotes={() => setNotesOpen(true)}
      />

      <main className="ap-main" style={styles.main}>
        {homeworkReminders.length > 0 && (
          <div style={styles.hwBanner}>
            <div style={styles.hwBannerBody}>
            <div style={styles.hwBannerTitle}>Скоро сдавать</div>
            {homeworkReminders.map((h) => (
              <div key={h.id} style={styles.hwBannerRow}>
                {h.subjectName && (
                  <>
                    <span style={{ ...styles.hwBannerSubject, color: lyceumColorOf(h.subjectName) }}>{h.subjectName}:</span>{" "}
                  </>
                )}
                <span>{h.text}</span>
                {h.minutes > 0 && <span style={styles.hwBannerMinutes}> · {h.minutes} мин</span>}
                <span style={styles.hwBannerDue}> · {relativeDayLabel(h.daysUntil)}</span>
              </div>
            ))}
            </div>
            <div style={styles.hwBannerMark} aria-hidden="true">
              !
            </div>
          </div>
        )}

        <ScreenHead
          title={screenInfo.title}
          // На «Сегодня» подзаголовок пересказывал карточки под ним — дата над
          // названием говорит о том же короче.
          note={screen === "today" ? null : screenInfo.note}
          badge={screen === "trainer" ? "ALPHA" : null}
          date={screen === "today" ? todayHeadLabel : null}
        >
          {/* На телефоне отсчёт до события — только на «Сегодня»: на каждой
              вкладке он вставал над её названием и сдвигал весь экран вниз. */}
          {screen === "today" && (
            <div className="ap-only-mobile">
              <Countdowns next={nextCountdown} main={mainCountdown} />
            </div>
          )}
          {/* Самое частое действие дня — на виду, а не в середине экрана. */}
          {screen === "today" && (
            <button type="button" onClick={focusQuickLog} className="ap-desktop-only" style={styles.headAction}>
              <Icon name="plus" size={17} strokeWidth={2} />
              Записать занятие
            </button>
          )}
        </ScreenHead>

        {/* key={screen} заставляет React пересобрать содержимое при переходе — иначе
            анимация входа проигрывалась бы один раз за всё время работы. */}
        <div key={screen} className="ap-screen">

        {screen === "today" && (
          <>
            {todayEvents.length > 0 && (
              <section
                className="ap-card"
                style={{
                  ...styles.card,
                  borderColor: priorityInfo(todayEvents[0].priority).strong,
                  background: priorityInfo(todayEvents[0].priority).tint,
                }}
              >
                <div style={styles.todayEventHead}>Сегодня</div>
                {todayEvents.map((e) => (
                  <div key={e.id} style={styles.todayEventRow}>
                    <PriorityMark value={e.priority} height={13} />
                    <span style={styles.todayEventName}>{e.name}</span>
                    {e.description && <span style={styles.todayEventNote}>{e.description}</span>}
                  </div>
                ))}
                <button onClick={() => goScreen("events")} style={styles.goLink}>
                  Все события →
                </button>
              </section>
            )}

            {weekPlanned !== currentWeek && (
              <section className="ap-card" style={{ ...styles.weekStrip }}>
                <span style={styles.weekStripText}>
                  Новая неделя: цифры распределения могли устареть
                </span>
                <span style={styles.weekActions}>
                  <button onClick={() => goScreen("budget")} style={styles.weekGo}>
                    Распределить
                  </button>
                  <button onClick={markWeekPlanned} style={styles.weekSkip}>
                    Оставить как есть
                  </button>
                </span>
              </section>
            )}

            {/* Три числа дня — плитками в ряд. Раньше «сколько записано» и
                «серия» жили в карточке напоминания, а недельный план — только в
                разделе «Распределение», и сверить день с неделей было негде. */}
            <div className="ap-tiles" style={styles.tiles}>
              <div className="ap-card" style={styles.tile}>
                <div style={styles.tileLabel}>Записано сегодня</div>
                <div style={styles.tileValueRow}>
                  <span style={styles.tileValue}>{studyPulse.todayHours > 0 ? hoursLabel(studyPulse.todayHours) : "0 ч"}</span>
                  {todayGoalHours > 0 && <span style={styles.tileOf}>из {hoursLabel(todayGoalHours)}</span>}
                </div>
                <div style={styles.tileTrack}>
                  <div
                    className="ap-fill"
                    style={{
                      ...styles.tileFill,
                      width: (todayGoalHours > 0 ? Math.min(100, (studyPulse.todayHours / todayGoalHours) * 100) : 0) + "%",
                      background: todayGoalHours > 0 && studyPulse.todayHours >= todayGoalHours ? "var(--green)" : "var(--accent)",
                    }}
                  />
                </div>
              </div>
              <div className="ap-card" style={styles.tile}>
                <div style={styles.tileLabel}>Серия</div>
                {/* Серия, которая шла до вчера, ещё жива: сегодня её можно
                    продлить, и сказать об этом полезнее, чем показать ноль. */}
                <div style={styles.tileValueRow}>
                  <span style={styles.tileValue}>{streakShown}</span>
                  <span style={{ ...styles.tileOf, color: streakAtRisk ? "var(--warmInk)" : "var(--ink3)" }}>
                    {streakAtRisk ? "продлите сегодня" : daysWord(streakShown) + " подряд"}
                  </span>
                </div>
                {/* Последние семь дней: закрашен день, в который занимались. */}
                <div style={styles.streakDots} aria-label="Занятия за последние семь дней">
                  {last7.map((on, i) => (
                    <span key={i} style={{ ...styles.streakDot, background: on ? "var(--accent)" : "var(--line)" }} />
                  ))}
                </div>
              </div>
              <div className="ap-card" style={styles.tile}>
                <div style={styles.tileLabel}>За неделю</div>
                <div style={styles.tileValueRow}>
                  <span style={styles.tileValue}>{weeklyJournalHours > 0 ? hoursLabel(weeklyJournalHours) : "0 ч"}</span>
                  {weeklyBudget > 0 && <span style={styles.tileOf}>из {hoursLabel(weeklyBudget)} по плану</span>}
                </div>
                <div style={styles.tileTrack}>
                  <div
                    className="ap-fill"
                    style={{
                      ...styles.tileFill,
                      width: (weeklyBudget > 0 ? Math.min(100, (weeklyJournalHours / weeklyBudget) * 100) : 0) + "%",
                      background: "var(--green)",
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Напоминание крупным планом: строчкой внизу карточки его не замечали.
                Когда день уже засчитан и подсказывать нечего, плитки выше говорят
                всё сами — карточка появляется, только если есть что добавить. */}
            {(studyReminder.tone !== "ok" || trainerOffer) && (
            <section
              className="ap-card"
              style={{
                ...styles.card,
                ...(studyReminder.tone === "warn" ? styles.reminderWarn : null),
                ...(studyReminder.tone === "ok" ? styles.reminderOk : null),
              }}
            >
              <div style={styles.reminderRow}>
                {/* Значок — только когда ему есть что сказать: огонёк серии, галочка,
                    восклицательный знак. В спокойном состоянии там стояла точка
                    посреди пустого квадрата — место без смысла. */}
                {reminderKind !== "idle" && (
                  <div style={styles.reminderMark} aria-hidden="true">
                    <ReminderMark kind={reminderKind} />
                  </div>
                )}
                <div style={styles.reminderBody}>
                  <div style={styles.reminderTitle}>{studyReminder.title}</div>
                  <div style={styles.reminderText}>{studyReminder.text}</div>
                  {trainerOffer && (
                    <button onClick={() => goScreen("trainer")} className="ap-row" style={styles.offerBtn}>
                      <span style={styles.offerText}>
                        {trainerOffer.solved > 0
                          ? "Решено " + trainerOffer.solved + " из " + trainerOffer.need + " — осталось " +
                            trainerOffer.left + " " + tasksWord(trainerOffer.left) + " по предмету «" + trainerOffer.subject + "»"
                          : "Реши " + trainerOffer.need + " " + tasksWord(trainerOffer.need) +
                            " по предмету «" + trainerOffer.subject + "» — день зачтётся и серия не оборвётся" +
                            (trainerOffer.cheaper
                              ? ". По предмету «" + trainerOffer.cheaper.subjects.join("» или «") + "» хватит " +
                                trainerOffer.cheaper.need
                              : "")}
                      </span>
                      <span style={styles.offerGo}>В тренажёр →</span>
                    </button>
                  )}
                </div>
                {/* Серия теперь в плитке над карточкой — здесь её второй раз не пишем. */}
              </div>
            </section>
            )}

            {/* Что идёт прямо сейчас — и у тебя, и у всей параллели. */}
            <NowCard
              entriesFor={dayEntries}
              tasksFor={lessonTasks.forLesson}
              homeworkOn={homeworkOnDate}
              colorOf={lyceumColorOf}
              markOf={priorityInfo}
              styles={styles}
            />

            {dueForReview.length > 0 && (
              <section className="ap-card" style={styles.card}>
                <CardHead
                  id="today-review"
                  title="Пора повторить"
                  note="Тема забывается не сразу: чем дольше к ней не возвращались, тем выше она в списке"
                />
                <div style={styles.reviewList}>
                  {dueForReview.slice(0, 3).map((row) => (
                    <div key={row.topicId} style={styles.reviewRow}>
                      <span style={{ ...styles.dot, background: row.color }} />
                      <span style={styles.reviewText}>
                        <span style={styles.reviewName}>{row.name}</span>
                        <span style={styles.reviewNote}>
                          {row.subjectName} · {agoWord(row.days)}
                          {row.reviews > 0 ? " · повторений: " + row.reviews : ""}
                        </span>
                      </span>
                      <button onClick={() => reviewTopic(row)} style={styles.reviewBtn}>
                        Повторил
                      </button>
                    </div>
                  ))}
                </div>
                {dueForReview.length > 3 && (
                  <button onClick={() => goScreen("study")} style={styles.goLink}>
                    Ещё {dueForReview.length - 3} — в «Подготовке» →
                  </button>
                )}
              </section>
            )}

          {/* Уроки дня и запись занятия — рядом: записывают обычно как раз то,
              что было сегодня в лицее. Раньше форма пряталась в конце карточки
              с расписанием, под списком уроков. */}
          <div className="ap-grid2" style={styles.gridToday}>
            <section className="ap-card" style={styles.card}>
              <CardHead
                id="today-school"
                title="Сегодня в лицее"
                empty={todayLessons.length === 0}
                note="Важность — полосой слева, роль урока — подписью"
              >
                {todayLessons.length > 0 && (
                  <span style={styles.cardMeta}>
                    {todayLessons.length} {lessonsWord(todayLessons.length)}
                    {todayLessons[0].start ? " · с " + todayLessons[0].start : ""}
                  </span>
                )}
              </CardHead>
              {todayLessons.length === 0 ? (
                <p style={styles.muted}>На сегодня уроков в расписании нет.</p>
              ) : (
                <div style={styles.todayList}>
                  {todayLessons.map((e) => (
                    <div
                      key={e.id}
                      style={{
                        ...styles.todayRow,
                        borderLeftColor: priorityInfo(e.priority).strong,
                        background: priorityInfo(e.priority).tint,
                      }}
                    >
                      <span style={styles.todayTime}>{e.start}</span>
                      <span style={styles.todayName}>{e.subjectName}</span>
                      <span style={styles.todayMeta}>
                        {e.kind === "exam"
                          ? examKindLabel(e.examKind) + (e.place ? " · " + e.place : "")
                          : levelInfo(e.level).label + (e.room ? " · " + e.room : "") + (e.teacher ? " · " + e.teacher : "")}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {!homeworkEmpty && (
            <section className="ap-card" style={styles.card}>
              <CardHead
                id="today-homework"
                title="Дела и сроки"
                empty={upcomingHomework.length === 0}
                note="По сроку, а не по предмету"
              />
              {upcomingHomework.length === 0 ? (
                <p style={styles.muted}>Ничего не горит: заданий со сроком нет.</p>
              ) : (
                <div style={styles.todayList}>
                  {upcomingHomework.map((h) => (
                    <label key={h.id} style={styles.taskRow}>
                      <input
                        type="checkbox"
                        checked={!!h.done}
                        onChange={() => updateHomework(h.id, { done: !h.done })}
                      />
                      <span style={{ ...styles.taskText, textDecoration: h.done ? "line-through" : "none" }}>
                        {h.text || "без описания"}
                      </span>
                      <span style={{ ...styles.taskMeta, color: h.daysUntil < 0 ? "var(--red)" : "var(--ink3)" }}>
                        {relativeDayLabel(h.daysUntil)}
                        {h.subjectName ? " · " + h.subjectName : ""}
                      </span>
                    </label>
                  ))}
                </div>
              )}
              <button onClick={() => goScreen("journal")} style={styles.goLink}>
                Дневник и задания →
              </button>
            </section>
            )}
          </div>

          <section className="ap-card" style={styles.card}>
            <CardHead
              id="hours"
              title="Часы занятий"
              empty={!stats.totalAll}
              note="Столбец — факт за день, полоса под ним — коридор дневной цели. Зелёный столбец значит, что цель взята."
            >
              {stats.totalAll > 0 && (
                <span style={styles.cardMeta}>
                  пройдено {stats.doneAll} из {stats.totalAll} уроков · {stats.overallPct}%
                </span>
              )}
            </CardHead>
            {/* График не сворачивается: ради него карточка и существует. */}
            <HoursChart journal={journalWithTrainer} homework={homework} subjects={subjectsWithTrainer} goalForDate={goalForDate} />
          </section>

          {/* Карточка, которой нечего показать, — не карточка: три «ничего нет»
              подряд занимали пол-экрана в обычный день. Пустые сворачиваются
              в одну строку ниже и возвращаются, как только в них что-то есть. */}
          <div className="ap-grid2" style={styles.grid2}>
            {!eventsEmpty && (
            <section className="ap-card" style={styles.card}>
              <div style={styles.cardTitle}>Ближайшие события</div>
              {/* Сегодняшнее событие показано отдельной карточкой наверху —
                  здесь оно было бы вторым упоминанием об одном и том же. */}
              {laterEvents.length === 0 ? (
                <p style={styles.muted}>
                  {todayEvents.length ? "Дальше пока ничего не назначено." : "Событий пока нет — добавьте экзамен или олимпиаду в разделе «События»."}
                </p>
              ) : (
                <div style={styles.todayList}>
                  {laterEvents.slice(0, 4).map((e) => {
                    const left = daysUntilDate(e.date);
                    const info = priorityInfo(e.priority);
                    return (
                      <div key={e.id} style={{ ...styles.todayRow, borderLeftColor: info.strong, background: info.tint }}>
                        <span style={styles.eventMarkCol}>
                          <PriorityMark value={e.priority} height={11} />
                        </span>
                        <span style={styles.todayName}>{e.name}</span>
                        <span style={styles.todayMeta}>
                          {left} {daysWord(left)}
                          {mainEvent && mainEvent.id === e.id ? " · план" : ""}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
              {/* Тот же вердикт, что и в «Распределении»: ради этого ответа и считаются часы. */}
              {mainEvent && (
                <div
                  style={{
                    ...styles.verdictLine,
                    color: capacity.feasible === null ? "var(--ink3)" : capacity.feasible ? "var(--green)" : "var(--red)",
                  }}
                >
                  {capacity.feasible === null
                    ? "Часы на неделю не заданы — темп считать не от чего."
                    : capacity.feasible
                    ? `При таком темпе времени хватит: нужно ${capacity.neededHours} ч, до «${mainEvent.name}» доступно ${capacity.totalCapacityHours} ч.`
                    : `При таком темпе может не хватить: нужно ${capacity.neededHours} ч, а до «${mainEvent.name}» доступно ${capacity.totalCapacityHours} ч.`}
                </div>
              )}
              <button onClick={() => goScreen("events")} style={styles.goLink}>
                Все события →
              </button>
            </section>
            )}

            <section id="quick-log" className="ap-card" style={styles.card}>
              <CardHead id="quick-entry" title="Записать занятие" note="Запись попадёт в дневник за сегодня" />
              <div style={styles.quickGrid}>
                <label style={styles.quickField}>
                  <span style={styles.quickLabel}>Предмет</span>
                  <select
                    value={jForm.subjectId}
                    onChange={(e) => setJForm({ ...jForm, subjectId: e.target.value })}
                    style={styles.quickControl}
                  >
                    {ALL_SUBJECTS.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label style={{ ...styles.quickField, flex: "0 0 96px" }}>
                  <span style={styles.quickLabel}>Часы</span>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    inputMode="decimal"
                    value={jForm.hours}
                    onChange={(e) => setJForm({ ...jForm, hours: e.target.value })}
                    style={styles.quickControl}
                  />
                </label>
              </div>
              <label style={{ ...styles.quickField, marginTop: 12 }}>
                <span style={styles.quickLabel}>Что прошли</span>
                <AutoGrow
                  placeholder="Например: конституционные права, § 4"
                  value={jForm.note}
                  onChange={(e) => setJForm({ ...jForm, note: e.target.value })}
                  onEnter={() => {
                    addJournalEntry(todayStr());
                  }}
                  style={styles.quickControl}
                />
              </label>
              <button
                onClick={() => {
                  addJournalEntry(todayStr());
                }}
                style={styles.quickSubmit}
              >
                Записать
              </button>
            </section>

            {!studyEmpty && (
            <section className="ap-card" style={styles.card}>
              <div style={styles.cardTitle}>Подготовка</div>
              <div style={styles.todayList}>
                {ALL_SUBJECTS.map((s) => {
                  const st = stats.perSubject[s.id];
                  if (!st || !st.total) return null;
                  return (
                    <div key={s.id}>
                      <div style={styles.progressRow}>
                        <span>{s.name}</span>
                        <span style={styles.mutedSmall}>
                          {st.done}/{st.total}
                        </span>
                      </div>
                      <div style={styles.miniTrack}>
                        <div className="ap-fill" style={{ ...styles.miniFill, width: st.pct + "%", background: s.color }} />
                      </div>
                    </div>
                  );
                })}
              </div>
              <button onClick={() => goScreen("study")} style={styles.goLink}>
                Открыть подготовку →
              </button>
            </section>
            )}
          </div>

          {(eventsEmpty || homeworkEmpty || studyEmpty) && (
            <div style={styles.emptyStrip}>
              {eventsEmpty && (
                <button onClick={() => goScreen("events")} style={styles.goLink}>
                  Событий нет — добавить →
                </button>
              )}
              {homeworkEmpty && <span style={styles.emptyStripNote}>Ничего не горит по срокам</span>}
              {studyEmpty && (
                <button onClick={() => goScreen("study")} style={styles.goLink}>
                  Своих предметов нет — добавить →
                </button>
              )}
            </div>
          )}
          </>
        )}

        {/* Прежний дизайн: «Сегодня» ровно как в 0.14.0. */}

        {screen === "events" && (
          <>
          <div className="ap-grid2" style={styles.grid2}>
            <section className="ap-card" style={styles.card}>
              <div style={styles.cardTitle}>Отсчёт</div>
              {nextEvent ? (
                <>
                  <div
                    style={{
                      ...styles.countdownLead,
                      borderLeftColor: priorityInfo(nextEvent.priority).strong,
                      background: priorityInfo(nextEvent.priority).tint,
                    }}
                  >
                    <div style={styles.countdownNum}>{daysUntilDate(nextEvent.date)}</div>
                    <div style={styles.countdownLeadText}>
                      <div style={styles.countdownLabel}>{daysWord(daysUntilDate(nextEvent.date))} до события</div>
                      <div style={styles.countdownEvent}>
                        <PriorityMark value={nextEvent.priority} height={13} />
                        <span>{nextEvent.name}</span>
                      </div>
                      <div style={styles.countdownDate}>
                        {formatEventDate(nextEvent.date)}
                        {eventTime(nextEvent) && <b style={styles.countdownTime}> · {eventTime(nextEvent)}</b>}
                        {nextEvent.place && <span> · {nextEvent.place}</span>}
                        {mainEvent && mainEvent.id === nextEvent.id && <span style={styles.countdownPlan}>план</span>}
                      </div>
                    </div>
                  </div>
                  {upcomingEvents.length > 1 && (
                    <div style={styles.countdownRest}>
                      {upcomingEvents.slice(1).map((e) => {
                        const left = daysUntilDate(e.date);
                        return (
                          <div key={e.id} style={styles.countdownRestRow}>
                            <PriorityMark value={e.priority} height={11} />
                            <span style={styles.countdownRestName}>{e.name}</span>
                            {mainEvent && mainEvent.id === e.id && <span style={styles.countdownPlan}>план</span>}
                            <span style={styles.countdownRestLeft}>
                              {left} {daysWord(left)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              ) : (
                <div style={styles.countdownEmpty}>Событий пока нет — добавьте экзамен или олимпиаду рядом.</div>
              )}

              <button onClick={() => setCalendarPanel(!calendarPanel)} style={styles.eventsToggle}>
                {calendarPanel ? "Скрыть календарь" : "Календарь телефона"}
              </button>
              <Collapsible open={calendarPanel}>
                <div style={styles.calendarPanel}>
                  <div style={styles.calendarTitle}>Календарь телефона</div>
                  {!cloudOn ? (
                    <p style={styles.muted}>
                      Подписка живёт в облаке — войдите в аккаунт по ссылке в самом верху страницы, и она появится здесь.
                    </p>
                  ) : !calendarToken ? (
                    <>
                      <p style={styles.muted}>
                        В телефоне появится отдельный календарь «Ежедневник лицеиста»: события, экзамены из расписания и
                        домашние задания со сроками. Он обновляется сам — поменяли дату здесь, она поменяется и там.
                      </p>
                      <button onClick={enableCalendarFeed} style={styles.addBtnSmall} disabled={calendarBusy}>
                        {calendarBusy ? "Включаю…" : "Включить подписку"}
                      </button>
                    </>
                  ) : (
                    <>
                      <CalendarHowTo platform={devicePlatform} styles={styles} />
                      <p style={styles.mutedSmall}>
                        Ссылку никому не давайте: по ней видно всё, что вы внесли в события и задания.
                      </p>
                      <div style={styles.calendarRow}>
                        <button
                          onClick={() => {
                            navigator.clipboard
                              .writeText(calendarLinks ? calendarLinks.https : "")
                              .then(() => setCalendarMsg("Ссылка скопирована."))
                              .catch(() => setCalendarMsg("Скопируйте ссылку из поля ниже вручную."));
                          }}
                          style={devicePlatform === "android" ? styles.addBtnSmall : styles.secondaryBtnSmall}
                        >
                          Скопировать ссылку
                        </button>
                        <a
                          href={calendarLinks ? calendarLinks.webcal : "#"}
                          style={devicePlatform === "android" ? styles.subscribeLinkSecondary : styles.subscribeLink}
                        >
                          Подписаться
                        </a>
                        <button onClick={refreshCalendarFeed} style={styles.secondaryBtnSmall} disabled={calendarBusy}>
                          {calendarBusy ? "…" : "Обновить"}
                        </button>
                        <button onClick={disableCalendarFeed} style={styles.linkBtnSmall}>
                          Отключить
                        </button>
                      </div>
                      <input
                        readOnly
                        value={calendarLinks ? calendarLinks.https : ""}
                        onFocus={(e) => e.target.select()}
                        style={styles.calendarLinkInput}
                      />
                    </>
                  )}
                  {calendarMsg && <div style={styles.calendarMsg}>{calendarMsg}</div>}
                  {calendarToken && cloudOn && (
                    <CalendarSyncNote sync={calendarSync} platform={devicePlatform} styles={styles} />
                  )}
                </div>
              </Collapsible>
            </section>

            <section className="ap-card" style={styles.card}>
              <CardHead
                id="events"
                title="События"
                note={
                  <>
                    Экзамены, этапы олимпиад, пробники — всё, до чего нужен отсчёт. Приоритет решает, до какого события
                    считается план: <PriorityMark value={3} height={10} /> важнее <PriorityMark value={2} height={10} /> и{" "}
                    <PriorityMark value={1} height={10} />. Если приоритет одинаковый, берётся ближайшее. Можно выбрать и
                    вручную — «считать план по нему» у любого события. Экзамены и олимпиады, заведённые в расписании,
                    появляются здесь сами — это одна и та же запись, и править её можно с любой стороны.
                  </>
                }
              />
              <EventsEditor
                upcoming={upcomingEvents}
                past={pastEvents}
                mainEventId={mainEvent ? mainEvent.id : null}
                pickedMainId={mainEventId}
                onPickMain={setMainEventId}
                onAdd={addEvent}
                onUpdate={updateEvent}
                onRemove={removeEvent}
                onClearPast={clearPastEvents}
              />
            </section>
          </div>
          </>
        )}

        {screen === "budget" && (
          <section className="ap-card" style={styles.card}>
            <CardHead
              id="budget"
              title="Бюджет времени"
              note={
                "Время — ограниченный ресурс, и его количество разное в разные дни недели. Укажите, сколько минут " +
                "в день вы реально можете заниматься; ниже — сколько часов в неделю вы распределяете по предметам " +
                "и проверка, хватит ли этого ресурса на оставшиеся уроки." +
                (mainEvent ? ` Отсчёт идёт до самого приоритетного события — «${mainEvent.name}».` : "")
              }
            />

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
              {ALL_SUBJECTS.map((s) => {
                const plan = Number(budget.alloc[s.id]) || 0;
                const rec = recommendedHours[s.id] || 0;
                const scale = (v) => Math.min(100, (v / 20) * 100);
                return (
                  <div key={s.id} style={styles.allocBlock}>
                    <div style={styles.allocRow}>
                      <span style={{ ...styles.dot, background: s.color }} />
                      <span style={styles.allocName}>{s.name}</span>
                      <input
                        type="range"
                        min="0"
                        max="20"
                        value={budget.alloc[s.id]}
                        onChange={(e) => setAlloc(s.id, e.target.value)}
                        className="ap-range ap-range-fill"
                        aria-label={"Часов в неделю: " + s.name}
                        style={{
                          "--fill": s.color,
                          "--pct": Math.min(100, (Number(budget.alloc[s.id]) || 0) / 20 * 100) + "%",
                          flex: 1,
                          minWidth: 0,
                        }}
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
                    {/* Вторая полоска — рекомендация: сколько вышло бы, раздели мы
                        недельный ресурс по остатку работы на каждом предмете. */}
                    <div style={styles.recTrack}>
                      <div className="ap-fill" style={{ ...styles.recPlan, width: scale(plan) + "%", background: s.color }} />
                      <div style={{ ...styles.recMark, left: scale(rec) + "%" }} />
                    </div>
                    <div style={styles.recLabels}>
                      <span>план {plan} ч</span>
                      <span style={{ color: Math.abs(plan - rec) >= 1 ? "var(--gold)" : "var(--ink3)" }}>
                        рекомендую {String(rec).replace(".", ",")} ч
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ ...styles.capacityBox, borderColor: capacity.overBudget ? "var(--red)" : "var(--green)" }}>
              <div>
                Распределено по предметам: <b>{capacity.weeklyTotal}</b> ч/нед из доступных {capacity.weeklyBudget} ч/нед
                {capacity.overBudget && <span style={styles.warn}> — превышен бюджет</span>}
              </div>
              <div>
                Осталось непройденных уроков: <b>{capacity.remainingTopics}</b> · суммарно по их длительности:{" "}
                <b>{capacity.neededHours} ч</b>
              </div>
              {mainEvent ? (
                <div>
                  Доступно времени до «{mainEvent.name}» ({formatEventDate(mainEvent.date)}) с учётом расписания по дням
                  недели: <b>{capacity.totalCapacityHours} ч</b>
                </div>
              ) : (
                <div>Событие не выбрано — считать не от чего.</div>
              )}
              <div
                style={{
                  fontWeight: 600,
                  color: capacity.feasible === null ? "var(--ink3)" : capacity.feasible ? "var(--green)" : "var(--red)",
                }}
              >
                {capacity.feasible === null
                  ? "Добавьте событие наверху страницы — тогда посчитаю, хватит ли времени."
                  : capacity.feasible
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
              <div style={styles.balanceHead}>
                <CardHead
                  id="balance"
                  title="Баланс предметов"
                  empty={balanceItems.length === 0}
                  note={
                    "По горизонтали — план на неделю, по вертикали — записанное в дневнике за последние семь дней. " +
                    "Диагональ — линия баланса: точка на ней значит, что план и факт сошлись. Выше — предмет забирает " +
                    "больше времени, чем ему отведено, ниже — недобирает. Размер точки — сколько тем по нему пройдено."
                  }
                />
              </div>
              <BalanceChart items={balanceItems} />
            </div>
          </section>
        )}

        {screen === "study" && (
          <section style={styles.plainBlock}>
            {ALL_SUBJECTS.length === 0 && (
              <section className="ap-card" style={styles.card}>
                <CardHead
                  id="study-intro"
                  title="Здесь живёт подготовка вне лицея"
                  note={
                      <ul style={styles.emptyList}>
                        <li>
                          <b>Уроки.</b> Свой список тем: у каждой длительность и ссылка — с ней название урока становится
                          кликабельным, и занятие открывается в один тап.
                        </li>
                        <li>
                          <b>Отметка «пройдено».</b> Галочка сама пишет занятие в дневник на его длительность — руками
                          дублировать не нужно.
                        </li>
                        <li>
                          <b>Заметки к уроку.</b> Короткая подпись и потраченное время; время тоже уходит в дневник и в
                          график часов.
                        </li>
                        <li>
                          <b>Тетрадь.</b> Блоки и ветки с конспектом, форматированием и файлами — то же, что на экране
                          «Тетради».
                        </li>
                        <li>
                          <b>Учёт времени.</b> Часы по предмету попадают в «Распределение»: там видно, укладываетесь ли вы в
                          неделю и хватит ли времени до ближайшего экзамена.
                        </li>
                      </ul>
                  }
                />
                <p style={styles.muted}>
                  Курсы, олимпиады, любой предмет, который учите сами. Начните с одного — цвет выбирается рядом
                  с названием, его же предмет носит в дневнике и на графиках.
                </p>
                <AddSubjectForm onAdd={addSubject} placeholder="Например, «Математика для олимпиад»" />
              </section>
            )}

            {/* Вариант A: слева все предметы с прогрессом, справа выбранный — на всю
                ширину. Раньше открытый предмет раскрывался внутри узкой карточки сетки
                в три колонки, каждый урок занимал две строки, а рядом было пусто. */}
            {ALL_SUBJECTS.length > 0 && (() => {
              const s = ALL_SUBJECTS.find((x) => x.id === openSubject) || ALL_SUBJECTS[0];
              const st = stats.perSubject[s.id] || { done: 0, total: 0, pct: 0 };
              const allTopics = [
                ...subjectData(data, s.id).topics.map((t) => ({ ...t, custom: false })),
                ...subjectData(data, s.id).custom.map((t) => ({ ...t, custom: true })),
              ];
              const tab = subjectTab[s.id] || "lessons";
              const next = allTopics.find((t) => !t.done);
              const nextIndex = next ? allTopics.indexOf(next) : -1;
              const shownTopics = allTopics.filter((t) => !hideDone || !t.done || (next && t.id === next.id));
              const notesAll = allTopics
                .flatMap((t) => (t.notes || []).map((n) => ({ ...n, topic: t })))
                .sort((a, b) => String(b.date).localeCompare(String(a.date)));
              const subjectHours =
                Math.round(journalWithTrainer.filter((e) => e.subjectId === s.id).reduce((sum, e) => sum + (Number(e.hours) || 0), 0) * 10) / 10;
              const blocksCount = (notebooks["subj:" + s.id] || []).length;
              // «Право: Семейное право» внутри предмета «Право» — просто «Семейное право».
              const shortName = (name) => {
                if (!name.startsWith(s.name + ": ")) return name;
                const rest = name.slice(s.name.length + 2);
                return rest.charAt(0).toUpperCase() + rest.slice(1);
              };
              const pickSubject = (id) => {
                setOpenSubject(id);
                setStudyView("subject");
              };
              const setTab = (key) => setSubjectTab((prev) => ({ ...prev, [s.id]: key }));
              return (
                <div className="ap-study" data-view={studyView} style={styles.studyGrid}>
                  <div className="ap-study-list" style={styles.studyLeft}>
                    <nav aria-label="Предметы" className="ap-card" style={styles.studyList}>
                      {ALL_SUBJECTS.map((x) => {
                        const xs = stats.perSubject[x.id] || { done: 0, total: 0, pct: 0 };
                        const on = x.id === s.id;
                        return (
                          <button
                            key={x.id}
                            type="button"
                            onClick={() => pickSubject(x.id)}
                            aria-current={on ? "true" : undefined}
                            className={"ap-study-row" + (on ? " is-on" : "")}
                            style={styles.studyRow}
                          >
                            <span style={styles.studyRowTop}>
                              <span style={{ ...styles.dot, width: 9, height: 9, background: x.color }} />
                              <span style={styles.studyRowName}>{x.name}</span>
                              <span style={styles.studyRowCount}>{xs.total ? xs.done + "/" + xs.total : "нет уроков"}</span>
                              <svg className="ap-mobile-only" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--mute)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
                            </span>
                            <span style={styles.studyRowTrack}>
                              <span className="ap-fill" style={{ ...styles.studyRowFill, width: xs.pct + "%", background: x.color }} />
                            </span>
                          </button>
                        );
                      })}
                    </nav>
                    <AddSubjectForm onAdd={addSubject} placeholder="Свой предмет — например, «Математика»" />
                    {dueForReview.length > 0 && (
                      <section style={styles.studyReview}>
                        <div style={styles.studyReviewHead}>Пора повторить · {dueForReview.length}</div>
                        {dueForReview.slice(0, 3).map((row) => (
                          <div key={row.topicId} style={styles.studyReviewRow}>
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div style={styles.reviewName}>{row.name}</div>
                              <div style={styles.reviewNote}>
                                {row.subjectName} · {agoWord(row.days)}
                              </div>
                            </div>
                            <button onClick={() => reviewTopic(row)} style={styles.studyReviewBtn}>
                              Повторил
                            </button>
                          </div>
                        ))}
                      </section>
                    )}
                  </div>

                  <section className="ap-study-detail ap-card" aria-label={"Предмет: " + s.name} style={styles.studyDetail}>
                    <button type="button" onClick={() => setStudyView("list")} className="ap-mobile-only" style={styles.studyBack}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
                      Предметы
                    </button>
                    <div style={styles.studyHead}>
                      <span style={{ ...styles.dot, width: 12, height: 12, background: s.color }} />
                      <h2 style={styles.studyTitle}>{s.name}</h2>
                      <span className="ap-study-meta" style={styles.studyMeta}>
                        {st.total ? `${st.done} из ${st.total} · ${st.pct}%` : "уроков пока нет"}
                        {subjectHours ? ` · ${hoursLabel(subjectHours)}` : ""}
                      </span>
                      <MoreMenu
                        label={"Предмет «" + s.name + "»: цвет, удаление"}
                        size={40}
                        items={[
                          {
                            render: () => (
                              <label style={styles.menuColor}>
                                <input type="color" value={hexOf(s.color)} onChange={(e) => setSubjectColor(s.id, e.target.value)} style={styles.colorPick} />
                                Цвет предмета
                              </label>
                            ),
                          },
                          { label: "Удалить предмет", danger: true, onSelect: () => removeSubject(s.id) },
                        ]}
                      />
                    </div>
                    <div style={styles.studyTrack}>
                      <div className="ap-fill" style={{ ...styles.studyFill, width: st.pct + "%", background: s.color }} />
                    </div>

                    <div style={styles.studyTabsRow}>
                      <div role="tablist" aria-label="Разделы предмета" style={styles.studyTabs}>
                        {[
                          ["lessons", "Уроки", allTopics.length],
                          ["notebook", "Тетрадь", blocksCount],
                          ["notes", "Заметки", notesAll.length],
                        ].map(([key, label, n]) => (
                          <button
                            key={key}
                            type="button"
                            role="tab"
                            aria-selected={tab === key}
                            onClick={() => setTab(key)}
                            style={{ ...styles.studyTab, ...(tab === key ? styles.studyTabOn : null) }}
                          >
                            {label} {n ? <span style={styles.studyTabN}>{n}</span> : null}
                          </button>
                        ))}
                      </div>
                      {tab === "lessons" && st.done > 0 && (
                        <label style={styles.studyHide}>
                          <input
                            type="checkbox"
                            checked={hideDone}
                            onChange={(e) => {
                              setHideDone(e.target.checked);
                              try {
                                localStorage.setItem("planner-hide-done", e.target.checked ? "1" : "0");
                              } catch (err) {
                                /* приватный режим — выбор доживёт до перезагрузки */
                              }
                            }}
                          />
                          Скрыть пройденные
                        </label>
                      )}
                    </div>

                    {tab === "lessons" && (
                      <>
                        {next && (
                          <div style={styles.nextCard}>
                            <div style={{ flex: "1 1 240px", minWidth: 0 }}>
                              <div style={styles.nextLabel}>
                                СЛЕДУЮЩИЙ УРОК · {nextIndex + 1} ИЗ {allTopics.length}
                              </div>
                              <div style={styles.nextName}>{shortName(next.name)}</div>
                              <div style={styles.nextMeta}>{next.duration || D} минут</div>
                            </div>
                            <div style={styles.nextActions}>
                              {next.url ? (
                                <a href={next.url} target="_blank" rel="noreferrer" style={styles.nextOpen}>
                                  Открыть урок ↗
                                </a>
                              ) : (
                                <button type="button" onClick={() => toggleLinkPanel(next.id)} style={styles.nextGhost}>
                                  + ссылка на урок
                                </button>
                              )}
                              <button type="button" onClick={() => toggleTopic(s.id, next.id, next.custom)} style={styles.nextGhost}>
                                Пройден
                              </button>
                            </div>
                          </div>
                        )}
                        {!next && allTopics.length > 0 && (
                          <div style={styles.doneCard}>Все уроки пройдены — осталось повторять.</div>
                        )}
                        <div style={styles.lessonList}>
                          {allTopics.length === 0 && <div style={styles.muted}>Уроков пока нет — добавьте первый ниже.</div>}
                          {shownTopics.map((t) => (
                            <TopicItem
                              key={t.id}
                              subjectId={s.id}
                              topic={t}
                              index={allTopics.indexOf(t) + 1}
                              displayName={shortName(t.name)}
                              isNext={next && next.id === t.id}
                              notesOpen={!!openNotes[t.id]}
                              onToggleNotes={() => toggleNotesPanel(t.id)}
                              linkOpen={!!openLinks[t.id]}
                              onToggleLink={() => toggleLinkPanel(t.id)}
                              onSetUrl={(url) => setTopicUrl(s.id, t.id, t.custom, url)}
                              onToggleDone={() => toggleTopic(s.id, t.id, t.custom)}
                              onDurationChange={(v) => setTopicDuration(s.id, t.id, t.custom, v)}
                              onAddNote={(text, mins) => addNote(s.id, t.id, t.custom, text, mins)}
                              onUpdateNote={(noteId, patch) => updateNote(s.id, t.id, t.custom, noteId, patch)}
                              onRemoveNote={(noteId) => removeNote(s.id, t.id, t.custom, noteId)}
                              onRemoveTopic={() => removeTopic(s.id, t.id, t.custom)}
                              onUndo={showUndo}
                            />
                          ))}
                          {hideDone && st.done > 0 && (
                            <button type="button" onClick={() => setHideDone(false)} style={styles.showDone}>
                              Показать пройденные · {st.done}
                            </button>
                          )}
                        </div>
                        <AddTopicForm onAdd={(name, url) => addCustomTopic(s.id, name, url)} color={s.color} />
                      </>
                    )}

                    {tab === "notebook" && (
                      <div className="ap-study-nb" style={styles.studyNotebook}>
                        <NotebookWorkspace
                          compact
                          owner={{ name: s.name, color: s.color }}
                          blocks={notebooks["subj:" + s.id] || []}
                          onChange={(blocks) => setNotebook("subj:" + s.id, blocks)}
                          onUndo={showUndo}
                          prefix={"subj-" + s.id}
                        />
                      </div>
                    )}

                    {tab === "notes" && (
                      <div style={styles.notesAll}>
                        {notesAll.length === 0 && (
                          <p style={styles.muted}>
                            Заметок пока нет. Их пишут к уроку: «⋯» у урока → «Заметки» — короткая подпись и потраченное
                            время, оно уходит в дневник.
                          </p>
                        )}
                        {notesAll.map((n) => (
                          <div key={n.id} style={styles.notesAllRow}>
                            <span style={styles.notesAllDate}>{new Date(n.date).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}</span>
                            <span style={{ flex: 1, minWidth: 0 }}>
                              <span style={{ display: "block" }}>{n.text}</span>
                              <span style={styles.notesAllTopic}>{shortName(n.topic.name)}</span>
                            </span>
                            <span style={styles.notesAllMins}>{n.minutes} мин</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                </div>
              );
            })()}
          </section>
        )}

        {screen === "trainer" && (
          <Suspense fallback={<section style={styles.plainBlock}><p style={styles.muted}>Задания загружаются…</p></section>}>
            <Trainer
              log={trainerLog}
              marks={bankMarks}
              state={trainerState}
              onState={setTrainerState}
              onAttempt={addAttempt}
              onMark={addMark}
              styles={styles}
            />
          </Suspense>
        )}

        {screen === "school" && (
          <section style={styles.plainBlock}>
            <p style={styles.muted}>
              Отдельно от самостоятельного изучения. Сверху — предметы лицея с тетрадями и цветом, ниже — расписание
              с реальными звонками: время, кабинет, преподаватель и роль урока.
            </p>

            {/* Предметов набирается полтора десятка, и списком они занимали
                пол-экрана над расписанием — ради которого сюда и заходят. */}
            <div style={styles.foldCard}>
              <button onClick={() => toggleSection("lyceumSubjects")} style={styles.foldCardHead}>
                <span style={styles.sectionChevron}>{openSections.lyceumSubjects ? "▾" : "▸"}</span>
                <span style={styles.foldCardTitle}>Предметы</span>
                <span style={styles.mutedSmall}>
                  {lyceumSubjectNames.length > 0
                    ? lyceumSubjectNames.length + " — тетради и цвет"
                    : "появятся из расписания"}
                </span>
              </button>
              <Collapsible open={!!openSections.lyceumSubjects}>
                {lyceumSubjectNames.length === 0 ? (
                  <p style={styles.foldCardEmpty}>Предметы появятся здесь, как только вы впишете их в расписание ниже.</p>
                ) : (
              <div style={styles.lyceumNotebooks}>
                {lyceumSubjectNames.map((name) => {
                  const key = "lyceum:" + name;
                  const isOpen = openLyceumNotebook === name;
                  const blocks = notebooks[key] || [];
                  return (
                    <div key={name} style={styles.lyceumNotebookBlock}>
                      <div style={styles.lyceumSubjectRow}>
                        <button
                          onClick={() => setOpenLyceumNotebook(isOpen ? null : name)}
                          style={{ ...styles.lyceumNotebookHead, color: lyceumColorOf(name) }}
                        >
                          <span style={styles.sectionChevron}>{isOpen ? "▾" : "▸"}</span>
                          {name}
                          <span style={styles.mutedSmall}>
                            {blocks.length ? blocks.length + " блок." : "тетрадь пуста"}
                          </span>
                        </button>
                        <input
                          type="color"
                          value={hexOf(lyceumColorOf(name))}
                          onChange={(e) => setSubjectColor("lyceum:" + name, e.target.value)}
                          style={styles.colorPick}
                          title="Цвет предмета"
                        />
                      </div>
                      <Collapsible open={isOpen}>
                        <div style={styles.lyceumNotebookBody}>
                          <Notebook blocks={blocks} onChange={(b) => setNotebook(key, b)} onUndo={showUndo} prefix={"lyceum-" + name} />
                        </div>
                      </Collapsible>
                    </div>
                  );
                })}
              </div>
                )}
              </Collapsible>
            </div>

            <h3 style={styles.subHead}>Расписание</h3>
            <SchedulePreset
              choices={presetChoices}
              onChoices={setPresetChoices}
              onApply={applyPreset}
              onClear={clearPreset}
              appliedCount={presetLessons}
              locked={presetLocked}
              onSignIn={() => goScreen("settings")}
            />
            {/* Блок «Контрольные тесты КТ1» убран: тесты прошли 17–23 сентября.
                Уже добавленные КТ1 остаются в записях как прошедшие экзамены — из
                недели они скрыты сами, а в «Событиях» их убирает очистка
                прошедших. Пересборка готовых данных ниже по-прежнему их узнаёт
                (KT_PRESET_ID), чтобы не потерять важность, выставленную руками. */}
            <OlympiadPreset
              picked={voshPicks}
              onPicked={setVoshPicks}
              onApply={applyOlympiads}
              onClear={clearOlympiads}
              appliedCount={presetOlympiads}
              locked={presetLocked}
              onSignIn={() => goScreen("settings")}
            />
            <div style={styles.sundayRow}>
              <button onClick={() => setShowSunday(!showSunday)} style={styles.sundayBtn}>
                {showSunday ? "Убрать воскресенье" : "Добавить воскресенье"}
              </button>
              {!showSunday && sundayLessons > 0 && (
                <span style={styles.mutedSmall}>уроки воскресенья сохранены ({sundayLessons})</span>
              )}
            </div>

            <div style={styles.priorityLegend}>
              Важность урока — значками рядом с предметом:{" "}
              {EVENT_PRIORITIES.map((p, i) => (
                <span key={p.value}>
                  {i > 0 && " · "}
                  <PriorityMark value={p.value} height={10} /> {p.label}
                </span>
              ))}
              <br />
              Важность и роль — свойства предмета: меняете в одной карточке — меняются во всех его уроках.
            </div>

            {/* Чаще всего от расписания нужен один день — сегодняшний. Он и
                стоит первым, отдельной карточкой; неделя целиком разворачивается
                по кнопке, когда нужно что-то переставить или посмотреть вперёд. */}
            {scheduleDays.includes(todayKey) ? (
              <div style={styles.todayDayWrap}>
                <ScheduleDay
                  day={todayKey}
                  label={WEEKDAY_LABELS[todayKey]}
                  today
                  wide
                  entries={weekEntries(todayKey)}
                  onAdd={(entry) => addScheduleEntry(todayKey, entry)}
                  onUpdate={updateScheduleEntry}
                  onRemove={removeScheduleEntry}
                  tasks={lessonTasks}
                  onMoveDate={moveExamDate}
                  reopen={examReopen && examReopen.day === todayKey ? examReopen : null}
                  onReopenDone={() => setExamReopen(null)}
                  onEditDone={() => setExamEdit(null)}
                  editRequest={examEdit}
                />
              </div>
            ) : (
              <p style={styles.mutedSmall}>
                Сегодня воскресенье — день скрыт. Включите его кнопкой выше, если занятия есть и в воскресенье.
              </p>
            )}

            <div style={styles.foldCard}>
              <button onClick={() => toggleSection("scheduleWeek")} style={styles.foldCardHead}>
                <span style={styles.sectionChevron}>{openSections.scheduleWeek ? "▾" : "▸"}</span>
                <span style={styles.foldCardTitle}>Вся неделя</span>
                <span style={styles.mutedSmall}>{scheduleDays.length} дней</span>
              </button>
              <Collapsible open={!!openSections.scheduleWeek}>
              <div style={styles.scheduleGrid}>
                {scheduleDays.map((day) => (
                  <ScheduleDay
                    key={day}
                    day={day}
                    label={WEEKDAY_LABELS[day]}
                    today={day === todayKey}
                    entries={weekEntries(day)}
                    onAdd={(entry) => addScheduleEntry(day, entry)}
                    onUpdate={updateScheduleEntry}
                    onRemove={removeScheduleEntry}
                    tasks={lessonTasks}
                    onMoveDate={moveExamDate}
                    reopen={examReopen && examReopen.day === day ? examReopen : null}
                    onReopenDone={() => setExamReopen(null)}
                    onEditDone={() => setExamEdit(null)}
                    editRequest={examEdit}
                  />
                ))}
              </div>
              </Collapsible>
            </div>
          </section>
        )}

        {screen === "journal" && (
          <div className="ap-grid2" style={styles.grid2}>
            <section className="ap-card" style={styles.card}>
            <CardHead
              id="journal-calendar"
              title={"За 7 дней — " + String(weeklyJournalHours).replace(".", ",") + " ч"}
              note={
                "Записи с уроками и заметками к ним добавляются сюда автоматически — можно также добавить запись " +
                "вручную. Высота заливки дня — доля дневной цели, а цель на каждый день недели задаётся " +
                "в «Распределении». Точки сверху — пройденные уроки, точка снизу — домашнее задание на этот день. " +
                "Красная рамка — день экзамена или олимпиады."
              }
            />

            <div style={styles.calendarWrap}>
              <div style={styles.calHeader}>
                <button
                  onClick={() => setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1))}
                  style={styles.calNavBtn}
                >
                  ‹
                </button>
                <div style={styles.calMonthLabel}>
                  {capitalizeFirst(calMonth.toLocaleDateString("ru-RU", { month: "long", year: "numeric" }))}
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
                  const hasExam = examDates.has(key);
                  const lessonDots = lessonDotsByDate[key] || [];
                  return (
                    <button
                      key={key}
                      onClick={() => setSelectedDate(key)}
                      title={`${Math.round(hours * 10) / 10} ч из ${Math.round(goal * 10) / 10} ч цели`}
                      className="ap-day"
                      style={{
                        ...styles.calCell,
                        opacity: inMonth ? 1 : 0.4,
                      }}
                    >
                      {/* Клетка заливается снизу вверх на долю выполненной цели: так видно
                          не только «сделал или нет», но и насколько. */}
                      {!isFuture && ratio > 0 && (
                        <span
                          className="ap-fill-up"
                          style={{ ...styles.calFill, height: Math.round(ratio * 100) + "%", background: cellColor(ratio, theme) }}
                        />
                      )}
                      {lessonDots.length > 0 && (
                        <span style={styles.lessonDots}>
                          {lessonDots.slice(0, 3).map((color) => (
                            <span key={color} style={{ ...styles.lessonDot, background: color }} />
                          ))}
                        </span>
                      )}
                      <span style={styles.calDayNum}>{cellDate.getDate()}</span>
                      {hasHw && <span style={styles.hwDot} />}
                      {/* Рамка выбранного дня — отдельным слоем поверх заливки: и тень,
                          и обводка рисуются под детьми элемента, поэтому заливка их
                          перекрывала и выступала из-под рамки полоской. Обводка
                          экзамена живёт по тому же правилу, только слоем ниже:
                          выбранный день должен быть виден и на дне экзамена. */}
                      {hasExam && <span style={styles.calExamRing} />}
                      {selected && <span style={styles.calRing} />}
                    </button>
                  );
                })}
              </div>
              <div style={styles.calLegend}>
                <span style={styles.calLegendItem}>0</span>
                <span
                  style={{
                    ...styles.calLegendScale,
                    backgroundImage: `linear-gradient(to right, ${cellColor(0, theme)}, ${cellColor(0.5, theme)}, ${cellColor(1, theme)})`,
                  }}
                />
                <span style={styles.calLegendItem}>цель</span>
              </div>
            </div>
            </section>
            <section className="ap-card" style={styles.card}>
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
                const s = anySubjectById.get(e.subjectId);
                return (
                  <div key={e.id} style={styles.journalRow} data-focus-id={"journal:" + e.id}>
                    <span style={{ ...styles.dot, background: s?.color }} />
                    <span style={styles.jSubj}>{s?.name}</span>
                    <span style={styles.jHours}>{hoursLabel(e.hours)}</span>
                    <span style={styles.jNote}>{e.note}</span>
                    {e.fromTrainer ? (
                      // Эта строка — не отдельная запись, а тот же журнал попыток
                      // в другом виде. Удалять её нечем: удалять надо попытки.
                      <span style={styles.jAuto} title="Время из тренажёра">секундомер</span>
                    ) : (
                      <button onClick={() => removeJournalEntry(e.id)} style={styles.removeBtn}>
                        ×
                      </button>
                    )}
                  </div>
                );
              })}

              <div style={styles.homeworkBlock}>
                <div style={styles.homeworkTitle}>Домашнее задание и дела</div>
                {selectedDaySubjects.length === 0 ? (
                  <div style={styles.mutedSmall}>На этот день по расписанию лицея уроков нет.</div>
                ) : (
                  selectedDaySubjects.map((name) => {
                    const items = homeworkForSelectedDate.filter((h) => h.subjectName === name);
                    const dayInfo = selectedDayLevels[name];
                    return (
                      <div key={name} style={styles.homeworkSubjectBlock}>
                        <div style={{ ...styles.homeworkSubjectName, color: lyceumColorOf(name) }}>
                          {name}
                          {dayInfo && (
                            <>
                              <span style={styles.dayPriority}>
                                <PriorityMark value={dayInfo.priority} height={10} />
                              </span>
                              <span
                                style={{
                                  ...styles.levelChip,
                                  color: levelInfo(dayInfo.level).color,
                                  borderColor: levelInfo(dayInfo.level).color,
                                }}
                              >
                                {levelInfo(dayInfo.level).short}
                              </span>
                            </>
                          )}
                        </div>
                        {items.map((h) => (
                          <HomeworkItem
                            key={h.id}
                            hw={h}
                            onToggleDone={() => updateHomework(h.id, { done: !h.done })}
                            onRemove={() => removeHomework(h.id)}
                            onAttach={(file) => attachFileToHomework(h.id, file)}
                            onOpenAttachment={openAttachment}
                            onRemoveAttachment={(att) => removeAttachment(h.id, att)}
                            onUpdateReminder={(reminderDays) => updateHomework(h.id, { reminderDays })}
                                />
                        ))}
                        <HomeworkAddForm onAdd={(text, minutes) => addHomework(selectedDate, name, text, minutes)} />
                      </div>
                    );
                  })
                )}

                <div style={styles.homeworkSubjectBlock}>
                  <div style={{ ...styles.homeworkSubjectName, color: "var(--ink3)" }}>Без привязки к уроку</div>
                  {freeHomework.map((h) => (
                    <HomeworkItem
                      key={h.id}
                      hw={h}
                      onToggleDone={() => updateHomework(h.id, { done: !h.done })}
                      onRemove={() => removeHomework(h.id)}
                      onAttach={(file) => attachFileToHomework(h.id, file)}
                      onOpenAttachment={openAttachment}
                      onRemoveAttachment={(att) => removeAttachment(h.id, att)}
                      onUpdateReminder={(reminderDays) => updateHomework(h.id, { reminderDays })}
                    />
                  ))}
                  <HomeworkAddForm
                    placeholder="Например: подать заявку на олимпиаду"
                    onAdd={(text, minutes) => addHomework(selectedDate, "", text, minutes)}
                  />
                </div>
              </div>
            </div>

            {/* Без заголовка эта форма читалась продолжением «Домашнего задания»
                выше — две одинаковые строки полей подряд, и какая для чего, не
                понять. Теперь у неё своё имя и черта сверху, как на «Сегодня». */}
            <div style={styles.journalEntryHead}>
              <CardHead
                id="journal-entry"
                title="Записать занятие"
                note="Занятие попадёт в дневник на выбранную дату и в часы занятий."
              />
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
              {journalListed.length > 0 && <div style={styles.journalListHead}>Все записи</div>}
              {journalListed.length === 0 && <div style={styles.muted}>Записей пока нет — начните с первой.</div>}
              {journalListed.slice(0, journalShown).map((e) => {
                const s = anySubjectById.get(e.subjectId);
                return (
                  <div key={e.id} style={styles.journalRow}>
                    <span style={{ ...styles.dot, background: s?.color }} />
                    <span style={styles.jDate}>{new Date(e.date).toLocaleDateString("ru-RU")}</span>
                    <span style={styles.jSubj}>{s?.name}</span>
                    <span style={styles.jHours}>{hoursLabel(e.hours)}</span>
                    <span style={styles.jNote}>{e.note}</span>
                    {e.fromTrainer ? (
                      // Эта строка — не отдельная запись, а тот же журнал попыток
                      // в другом виде. Удалять её нечем: удалять надо попытки.
                      <span style={styles.jAuto} title="Время из тренажёра">секундомер</span>
                    ) : (
                      <button onClick={() => removeJournalEntry(e.id)} style={styles.removeBtn}>
                        ×
                      </button>
                    )}
                  </div>
                );
              })}
              {journalListed.length > journalShown && (
                <button onClick={() => setJournalShown(journalShown + JOURNAL_PAGE)} style={styles.eventsToggle}>
                  Показать ещё {Math.min(JOURNAL_PAGE, journalListed.length - journalShown)} из {journalListed.length - journalShown}
                </button>
              )}
            </div>
            </section>
          </div>
        )}

        {screen === "notes" && (
          // Вариант A: предметы · оглавление тетради · открытая ветка. Раньше
          // список предметов занимал половину ширины, выбор предмета был ещё и
          // выпадающим списком, а конспект читался в коробке внутри коробки.
          <div className="ap-notes ap-card" style={styles.notesShell}>
            <aside className="ap-notes-side" aria-label="Предметы" style={styles.notesSide}>
              <NotebookSubjects
                owners={orderedOwners}
                current={currentNotebook ? currentNotebook.key : ""}
                countOf={(key) => (notebooks[key] || []).length}
                onPick={setNotebookOwner}
                onPin={(key) => setNotebookOrder((prev) => togglePin(prev, notebookOwners, key))}
                onMove={(from, to) => setNotebookOrder((prev) => moveOwner(prev, notebookOwners, from, to))}
              />
            </aside>
            <div style={styles.notesMain}>
              {/* На телефоне колонки предметов нет — те же предметы чипами сверху. */}
              <div className="ap-notes-chips" role="tablist" aria-label="Предмет" style={styles.notesChips}>
                {orderedOwners.map((o) => {
                  const on = currentNotebook && o.key === currentNotebook.key;
                  return (
                    <button
                      key={o.key}
                      type="button"
                      role="tab"
                      aria-selected={!!on}
                      onClick={() => setNotebookOwner(o.key)}
                      style={{ ...styles.notesChip, ...(on ? styles.notesChipOn : null) }}
                    >
                      <span style={{ ...styles.dot, width: 8, height: 8, background: o.color }} />
                      {o.name}
                    </button>
                  );
                })}
                {/* Закрепить и расставить предметы можно и на телефоне: карандаш в
                    конце чипов открывает тот же список, что в колонке на компьютере. */}
                <button
                  type="button"
                  onClick={() => setNotesOrderOpen(!notesOrderOpen)}
                  aria-pressed={notesOrderOpen}
                  aria-label="Изменить порядок предметов"
                  title="Закрепить и расставить предметы"
                  style={{ ...styles.notesChip, ...(notesOrderOpen ? styles.notesChipOn : null), padding: "0 12px" }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4z" />
                    <path d="M13.5 6.5l4 4" />
                  </svg>
                </button>
              </div>
              {notesOrderOpen && (
                <div className="ap-notes-order" style={styles.notesOrder}>
                  <NotebookSubjects
                    startEditing
                    onDone={() => setNotesOrderOpen(false)}
                    owners={orderedOwners}
                    current={currentNotebook ? currentNotebook.key : ""}
                    countOf={(key) => (notebooks[key] || []).length}
                    onPick={setNotebookOwner}
                    onPin={(key) => setNotebookOrder((prev) => togglePin(prev, notebookOwners, key))}
                    onMove={(from, to) => setNotebookOrder((prev) => moveOwner(prev, notebookOwners, from, to))}
                  />
                </div>
              )}
              {currentNotebook ? (
                <NotebookWorkspace
                  owner={currentNotebook}
                  blocks={notebooks[currentNotebook.key] || []}
                  focus={notebookFocus}
                  onChange={(blocks) => setNotebook(currentNotebook.key, blocks)}
                  onUndo={showUndo}
                  prefix={"nb-" + currentNotebook.key}
                />
              ) : (
                <p style={{ ...styles.muted, padding: 24 }}>Предметы появятся, как только вы добавите их в подготовку или в расписание.</p>
              )}
            </div>
          </div>
        )}
        {screen === "search" && (
          <section className="ap-card" style={styles.card}>
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Что ищем? Можно номер задания — 0810F0"
              style={styles.searchInput}
              aria-label="Поиск по записям"
            />
            {findFailed && (
              <div style={styles.searchWarn}>
                Опись заданий банка не загрузилась — без сети её сначала нужно хоть раз открыть.
                Свои записи ищутся как обычно.
              </div>
            )}
            {query.trim().length < 2 ? (
              <p style={styles.muted}>
                Наберите хотя бы две буквы. Ищется везде сразу: домашка, уроки расписания, события, тетради (и
                названия файлов), темы и заметки подготовки, записи дневника и задания банка ФИПИ. Можно несколько
                слов или их начал — «сужде брак» найдёт записи, где есть каждое, в любом порядке. Задание находится по своему номеру —
                тому самому, что подписан у него в тренажёре, — целиком или по началу; найденное открывается
                сразу в тренажёре. По условию ищется его начало: опись нарочно лёгкая.
              </p>
            ) : found.total === 0 ? (
              <p style={styles.muted}>Ничего не нашлось. Попробуйте короче — ищется по части слова.</p>
            ) : (
              <>
                <div style={styles.searchCount}>Нашлось: {found.total}</div>
                {found.groups.map((group) => (
                  <div key={group.id} style={styles.searchGroup} data-search-group={group.id}>
                    {/* Раздел — заметным заголовком со значком: мелкая серая
                        подпись терялась между карточками находок. */}
                    <div style={styles.searchGroupTitle}>
                      <span style={styles.searchGroupIcon} aria-hidden="true">
                        <Icon name={group.icon} size={16} strokeWidth={1.9} />
                      </span>
                      <span>{group.title}</span>
                      <span style={styles.searchGroupCount}>{group.total}</span>
                      <span style={styles.searchGroupLine} aria-hidden="true" />
                    </div>
                    {group.shown.map((item) => {
                      // Урок и событие подсвечены своей важностью — как на «Сегодня».
                      const info = item.priority ? priorityInfo(item.priority) : null;
                      return (
                        <button
                          key={item.id}
                          onClick={() => openFound(item)}
                          className="ap-row"
                          style={{ ...styles.searchRow, ...(info ? { ...styles.searchRowMarked, borderLeftColor: info.strong, background: info.tint } : null) }}
                        >
                          {item.color && <span style={{ ...styles.dot, background: item.color }} />}
                          {info && <PriorityMark value={item.priority} height={12} />}
                          <span style={styles.searchRowText}>
                            <span style={styles.searchRowTitle}><Marked text={item.title} query={query} /></span>
                            {item.note && <span style={styles.searchRowNote}><Marked text={item.note} query={query} /></span>}
                            {item.body && <span style={styles.searchRowBody}><Marked text={item.body} query={query} /></span>}
                          </span>
                        </button>
                      );
                    })}
                    {group.total > group.shown.length && (
                      <div style={styles.searchMore}>и ещё {group.total - group.shown.length} — уточните запрос</div>
                    )}
                  </div>
                ))}
              </>
            )}
          </section>
        )}

        {screen === "settings" && (
          <div className="ap-grid2" style={styles.grid2}>
            <section className="ap-card" style={styles.card}>
              <CardHead
                id="cloud"
                title="Облако"
                note="Один аккаунт на все устройства: правки с телефона и ноутбука сливаются, а не затирают друг друга."
              />
              <CloudPanel />
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
              {cloudPending && (
                <div style={styles.pendingBadge}>правки ещё не ушли в облако — отправлю, как появится связь</div>
              )}
            </section>

            <section className="ap-card" style={styles.card}>
              <CardHead
                id="backup"
                title="Резервная копия"
                note={
                  "Если автоматическая синхронизация не работает, данные переносятся вручную: скопируйте текст на " +
                  "одном устройстве и вставьте его в поле импорта на другом."
                }
              />
              {/* Перенос вручную нужен как запасной выход: пока облако на связи, он только
                  занимает место, поэтому сворачивается в строку. */}
              {cloudOn && !saveErr && !cloudPending && !showBackup ? (
                <>
                  <div style={styles.cardNote}>Синхронизация работает — переносить вручную не нужно.</div>
                  <button onClick={() => setShowBackup(true)} style={styles.eventsToggle}>
                    Всё равно показать перенос
                  </button>
                </>
              ) : (
                <>
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
                    Импорт полностью заменит данные на этом устройстве — используйте его на «пустом» или менее
                    актуальном устройстве.
                  </p>
                </>
              )}
            </section>
          </div>
        )}

        {screen === "prefs" && (
          <div className="ap-grid2" style={styles.grid2}>
            <section className="ap-card" style={styles.card}>
              <CardHead
                id="looks"
                title="Оформление"
                note={
                  "Тема и границы ночи — настройка устройства: телефон вечером может быть в ночной, а ноутбук днём " +
                  "в светлой. В облако это не уходит."
                }
              />
              <div style={styles.themeRow}>
                {[
                  ["light", "Светлая"],
                  ["night", "Ночная"],
                  ["auto", "Авто"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    onClick={() => setMode(value)}
                    style={{
                      ...styles.themeBtn,
                      background: mode === value ? "var(--accent)" : "var(--panel2)",
                      color: mode === value ? "var(--accentInk)" : "var(--ink2)",
                      borderColor: mode === value ? "var(--accent)" : "var(--line)",
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {/* Часы ночи нужны только режиму «Авто» — в остальных они ни на что не влияют. */}
              <div style={{ ...styles.themeHours, opacity: mode === "auto" ? 1 : 0.5 }}>
                <span>Ночная тема с</span>
                <select
                  value={nightWindow.from}
                  onChange={(e) => setNightWindow({ ...nightWindow, from: e.target.value })}
                  style={styles.select}
                  disabled={mode !== "auto"}
                >
                  {HOURS.map((h) => (
                    <option key={h} value={h}>
                      {pad2(h)}
                    </option>
                  ))}
                </select>
                <span>до</span>
                <select
                  value={nightWindow.to}
                  onChange={(e) => setNightWindow({ ...nightWindow, to: e.target.value })}
                  style={styles.select}
                  disabled={mode !== "auto"}
                >
                  {HOURS.map((h) => (
                    <option key={h} value={h}>
                      {pad2(h)}
                    </option>
                  ))}
                </select>
              </div>
              <div style={styles.mutedSmall}>{modeLabel}</div>

              {/* Живой фон — украшение, а украшение должно выключаться: на слабом
                  телефоне оно тратит батарею, а кому-то просто мешает. */}
              <div style={styles.bgRow}>
                <button
                  onClick={() => {
                    const next = !backgroundOn;
                    setBackgroundOn(next);
                    try {
                      localStorage.setItem(BG_KEY, next ? "on" : "off");
                    } catch (e) {
                      /* приватный режим — переживёт до перезагрузки */
                    }
                  }}
                  style={{
                    ...styles.themeBtn,
                    background: backgroundOn ? "var(--accent)" : "var(--panel2)",
                    color: backgroundOn ? "var(--accentInk)" : "var(--ink2)",
                    borderColor: backgroundOn ? "var(--accent)" : "var(--line)",
                  }}
                >
                  Живой фон
                </button>
                <span style={styles.mutedSmall}>
                  {backgroundOn
                    ? "Кривые возможностей дышат за интерфейсом; на компьютере ведутся за курсором"
                    : "Фон ровный, без анимации"}
                </span>
              </div>
            </section>

            {__EASTER_TEST__ && (
              <section className="ap-card" style={styles.card}>
                <div style={styles.cardTitle}>Тест</div>
                <div style={styles.cardNote}>
                  Созвездия на фоне выпадают сами и редко — примерно раз в сотню проверок. Здесь их можно позвать
                  руками. Этого раздела нет в том, что залито на сайт.
                </div>
                <div style={styles.eggRow}>
                  {EASTER_EGGS.map((egg) => (
                    <button
                      key={egg.id}
                      onClick={() => setShowcase({ id: egg.id, nonce: Date.now() })}
                      style={styles.eggBtn}
                      disabled={!backgroundOn}
                    >
                      {egg.label}
                    </button>
                  ))}
                </div>
                {!backgroundOn && <div style={styles.mutedSmall}>Сначала включите живой фон выше.</div>}
              </section>
            )}

            <section className="ap-card" style={styles.card}>
              <CardHead
                id="install"
                title="Приложение"
                note={
                  "С иконки ежедневник открывается без адресной строки и работает без сети — правки уйдут в облако, " +
                  "когда связь появится."
                }
              />
              <InstallHint />
              <div style={styles.versionRow}>
                Ежедневник лицеиста · версия {__APP_VERSION__} · сборка от{" "}
                {new Date(__BUILD_DATE__).toLocaleDateString("ru-RU", { day: "numeric", month: "long" })},{" "}
                {new Date(__BUILD_DATE__).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
              </div>
              <button onClick={() => setNotesOpen(true)} style={styles.eventsToggle}>
                История изменений
              </button>
            </section>
          </div>
        )}
        </div>
      </main>

      <IntroDialog
        open={introOpen}
        onClose={() => setIntroOpen(false)}
        onGo={() => {
          setIntroOpen(false);
          goScreen("school");
        }}
      />
      <ReleaseNotesDialog open={notesOpen} onClose={() => setNotesOpen(false)} />
      {/* После окна о расписании, если оно тоже открыто: два окна разом друг друга перекрывали бы. */}
      <DesignIntroDialog
        open={designIntroOpen && !introOpen && !notesOpen}
        onKeep={closeDesignIntro}
        onNotes={() => {
          closeDesignIntro();
          setNotesOpen(true);
        }}
      />

      {undoQueue.length > 0 && (
        <div style={styles.undoStack}>
          {undoQueue.map((item) => (
            <div key={item.id} className="undo-toast" style={styles.undoToast}>
              <div style={styles.undoBarTrack}>
                <div className="undo-bar" style={styles.undoBar} />
              </div>
              <div style={styles.undoRow}>
                <span style={styles.undoText}>
                  {item.message}. {(item.opts && item.opts.hint) || "Если это по ошибке — нажмите крестик, всё вернётся."}
                </span>
                <button
                  onClick={() => cancelUndo(item.id)}
                  style={styles.undoCancel}
                  title={(item.opts && item.opts.cancelTitle) || "Вернуть"}
                  aria-label={(item.opts && item.opts.cancelTitle) || "Вернуть"}
                >
                  ✕
                </button>
                <button
                  onClick={() => confirmUndo(item.id)}
                  style={styles.undoConfirm}
                  title={(item.opts && item.opts.confirmTitle) || "Да, удалить"}
                  aria-label={(item.opts && item.opts.confirmTitle) || "Да, удалить"}
                >
                  ✓
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {saveErr && (
        <div style={styles.saveErr}>
          Не удалось сохранить последние изменения — повторяю попытку автоматически. Если ошибка не проходит,
          нажмите «Обновить сейчас» и проверьте соединение с интернетом.
        </div>
      )}
    </div>
  );
}

// Важность — три столбика, как шкала: сколько закрашено, такая и важность.
// Раньше здесь стояла эмодзи-молния, но на телефоне она рисуется оранжевой и
// была единственным насыщенным цветом во всём приложении — из-за неё карточка
// отсчёта выглядела чужой вставкой. Столбики берут цвет из палитры, тот же,
// что у полоски слева на карточке урока.
function PriorityMark({ value, height = 12, on, off }) {
  const info = priorityInfo(value);
  return (
    <span style={{ ...styles.priorityMark, height }} title={info.label} aria-label={"важность: " + info.label}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            ...styles.priorityBar,
            height: Math.round(height * (0.45 + i * 0.275)),
            background: i < info.value ? on || info.strong : off || "var(--line)",
          }}
        />
      ))}
    </span>
  );
}

function PriorityPicker({ value, onChange }) {
  return (
    <div style={styles.priorityRow}>
      {EVENT_PRIORITIES.map((p) => {
        const active = Number(value) === p.value;
        return (
          <button
            key={p.value}
            onClick={() => onChange(p.value)}
            title={p.label}
            style={{
              ...styles.priorityBtn,
              background: active ? p.color : "var(--btnInk)",
              borderColor: active ? p.color : "var(--line)",
            }}
          >
            <PriorityMark value={p.value} height={13} on={active ? "#fff" : undefined} off={active ? "rgba(255,255,255,.4)" : undefined} />
          </button>
        );
      })}
    </div>
  );
}

// Поле даты для уже заведённого события или экзамена. Сохраняет, только когда
// из поля уходят (или жмут Enter), а не на каждое изменение: пока дату набирают
// с клавиатуры, браузер отдаёт промежуточные значения — год 0002, 0020, 0202 —
// и событие тут же уезжало в «Прошедшие», а экзамен — на другой день недели,
// вместе с полем, в котором человек ещё печатал. Неполная или явно ошибочная
// дата (раньше 2000 года) не сохраняется: поле возвращается к прежней. Esc —
// отменить правку.
function DateField({ value, onCommit, style, title }) {
  const [draft, setDraft] = useState(value || "");
  const editing = useRef(false);
  // Esc уводит курсор из поля, и уход из поля не должен сохранить то, что
  // только что отменили.
  const cancelled = useRef(false);
  useEffect(() => {
    if (!editing.current) setDraft(value || "");
  }, [value]);

  function commit() {
    editing.current = false;
    if (cancelled.current) {
      cancelled.current = false;
      setDraft(value || "");
      return;
    }
    const ok = /^\d{4}-\d{2}-\d{2}$/.test(draft) && Number(draft.slice(0, 4)) >= 2000;
    if (ok && draft !== value) onCommit(draft);
    else setDraft(value || "");
  }

  return (
    <input
      type="date"
      value={draft}
      onFocus={() => {
        editing.current = true;
      }}
      onChange={(ev) => setDraft(ev.target.value)}
      onBlur={commit}
      onKeyDown={(ev) => {
        if (ev.key === "Enter") ev.currentTarget.blur();
        if (ev.key === "Escape") {
          cancelled.current = true;
          ev.currentTarget.blur();
        }
      }}
      style={style}
      title={title}
    />
  );
}

function EventsEditor({ upcoming, past, mainEventId, pickedMainId, onPickMain, onAdd, onUpdate, onRemove, onClearPast }) {
  const [name, setName] = useState("");
  const [date, setDate] = useState(todayStr());
  const [priority, setPriority] = useState(2);

  function submit() {
    if (!name.trim() || !date) return;
    onAdd(name, date, priority);
    setName("");
    setPriority(2);
  }

  function row(e, isPast) {
    const info = priorityInfo(e.priority);
    const left = daysUntilDate(e.date);
    return (
      <div
        key={e.id}
        className="ap-row"
        data-focus-id={"event:" + e.id}
        style={{
          ...styles.eventEditRow,
          opacity: isPast ? 0.55 : 1,
          borderLeftColor: info.strong,
          background: isPast ? "var(--neutralBg)" : info.tint,
        }}
      >
        {/* Сколько осталось — крупно и слева: ради этого числа список и открывают. */}
        <span style={{ ...styles.eventDays, color: isPast ? "var(--mute)" : info.strong }}>
          {isPast ? "—" : left}
          {!isPast && <span style={styles.eventDaysWord}>{daysWord(left)}</span>}
        </span>
        <AutoGrow value={e.name} onChange={(ev) => onUpdate(e.id, { name: ev.target.value })} style={styles.eventNameInput} />
        <DateField value={e.date} onCommit={(date) => onUpdate(e.id, { date })} style={styles.eventDateInput} />
        <PriorityPicker value={e.priority} onChange={(v) => onUpdate(e.id, { priority: v })} />
        {/* Одна и та же запись: правка здесь меняет её и в расписании. */}
        {e.fromSchedule && <span style={styles.fromScheduleBadge}>{examKindLabel(e.examKind)} из расписания</span>}
        {e.id === mainEventId ? (
          <span style={styles.mainBadge}>
            по нему считается план
            {pickedMainId === e.id && (
              <button onClick={() => onPickMain("")} style={styles.mainBadgeBtn} title="Считать по самому приоритетному, как раньше">
                вернуть авто
              </button>
            )}
          </span>
        ) : (
          <button onClick={() => onPickMain(e.id)} style={styles.mainPick} title="Считать план до этого события">
            считать план по нему
          </button>
        )}
        {isPast && <span style={styles.mutedSmall}>прошло</span>}
        <button
          onClick={() => onRemove(e.id)}
          style={styles.removeBtn}
          title={e.fromSchedule ? "Удалить из расписания и событий" : "Удалить событие"}
        >
          ×
        </button>
        <EventDetails event={e} fromSchedule={e.fromSchedule} onUpdate={(patch) => onUpdate(e.id, patch)} />
      </div>
    );
  }

  return (
    <div>

      {upcoming.map((e) => row(e, false))}
      {past.length > 0 && (
        <div style={styles.pastHead}>
          <span style={styles.pastLabel}>Прошедшие · {past.length}</span>
          <button onClick={onClearPast} style={styles.pastClear} title="Убрать все прошедшие события">
            🗑 очистить
          </button>
        </div>
      )}
      {past.map((e) => row(e, true))}

      <div style={styles.eventAddRow}>
        <AutoGrow
          placeholder="Например: региональный этап ВсОШ"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onEnter={submit}
          style={styles.eventNameInput}
        />
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={styles.eventDateInput} />
        <PriorityPicker value={priority} onChange={setPriority} />
        <button onClick={submit} style={styles.addBtnSmall} disabled={!name.trim()}>
          Добавить
        </button>
      </div>
    </div>
  );
}

// Урок — одна строка: галочка, номер, название (ссылка, если она есть),
// заметки, минуты и «⋯». Раньше рядом с каждым уроком стояли поле минут,
// «ссылка», «заметки» и крестик — строка разъезжалась на две, а удалить урок
// можно было промахнувшись мимо заметок. Ссылка, длительность и удаление теперь
// в «⋯», заметки раскрываются под строкой.
function TopicItem({
  subjectId,
  topic,
  index,
  displayName,
  isNext,
  notesOpen,
  onToggleNotes,
  linkOpen,
  onToggleLink,
  onSetUrl,
  onToggleDone,
  onDurationChange,
  onAddNote,
  onUpdateNote,
  onRemoveNote,
  onRemoveTopic,
  onUndo,
}) {
  const [noteText, setNoteText] = useState("");
  const [noteMins, setNoteMins] = useState("15");
  const [urlDraft, setUrlDraft] = useState(topic.url || "");
  const [minsDraft, setMinsDraft] = useState(String(topic.duration || D));
  const [openNoteBodies, setOpenNoteBodies] = useState({});
  const notes = topic.notes || [];
  const name = displayName || topic.name;

  return (
    <div style={styles.topicBlock} data-focus-id={"topic:" + topic.id}>
      <div className={"topic-row" + (isNext ? " is-next" : "")} style={{ ...styles.topicRow, ...(isNext ? styles.topicRowNext : null) }}>
        <input
          type="checkbox"
          checked={topic.done}
          onChange={onToggleDone}
          aria-label={(topic.done ? "Пройден: " : "Отметить пройденным: ") + name}
          style={styles.topicCheck}
        />
        <span style={styles.topicNum}>{index}</span>
        {topic.url ? (
          <a
            className="lesson-link"
            href={topic.url}
            target="_blank"
            rel="noreferrer"
            style={{ ...styles.topicName, ...(topic.done ? styles.topicDone : null), ...(isNext ? { fontWeight: 600 } : null) }}
          >
            {name}
          </a>
        ) : (
          <span style={{ ...styles.topicName, ...(topic.done ? styles.topicDone : null), ...(isNext ? { fontWeight: 600 } : null) }}>{name}</span>
        )}
        {notes.length > 0 && (
          <button type="button" onClick={onToggleNotes} aria-expanded={notesOpen} style={styles.noteBadge}>
            {notes.length} {notes.length === 1 ? "заметка" : notes.length < 5 ? "заметки" : "заметок"}
          </button>
        )}
        <span className="ap-topic-mins" style={styles.topicMins}>{topic.duration || D} мин</span>
        <MoreMenu
          quiet
          label={"Урок «" + name + "»"}
          size={34}
          items={[
            { label: notesOpen ? "Скрыть заметки" : notes.length ? "Заметки" : "+ Заметка со временем", onSelect: onToggleNotes },
            { label: linkOpen ? "Скрыть настройки" : topic.url ? "Изменить ссылку и длительность" : "Добавить ссылку, изменить длительность", onSelect: onToggleLink },
            { label: "Удалить урок", danger: true, onSelect: onRemoveTopic },
          ]}
        />
      </div>

      <Collapsible open={linkOpen}>
        <div className="ap-note-panel" style={styles.notesPanel}>
          <div style={styles.noteForm}>
            <input
              type="url"
              placeholder="Ссылка на урок: https://..."
              value={urlDraft}
              onChange={(e) => setUrlDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onSetUrl(urlDraft)}
              style={styles.noteInput}
              aria-label="Ссылка на урок"
            />
            <input
              type="number"
              min="5"
              step="5"
              value={minsDraft}
              onChange={(e) => setMinsDraft(e.target.value)}
              style={styles.smallNumInput}
              aria-label="Длительность урока, минут"
            />
            <span style={styles.hUnit}>мин</span>
            <button
              onClick={() => {
                onSetUrl(urlDraft);
                onDurationChange(minsDraft);
                onToggleLink();
              }}
              style={styles.addBtnSmall}
            >
              Сохранить
            </button>
          </div>
        </div>
      </Collapsible>

      <Collapsible open={notesOpen}>
        <div className="ap-note-panel" style={styles.notesPanel}>
          {notes.map((n) => {
            const bodyOpen = !!openNoteBodies[n.id];
            const hasBody = (n.html && n.html !== "<br>") || (n.files && n.files.length);
            return (
              <div key={n.id} style={styles.noteBlock}>
                <div style={styles.noteRow}>
                  <button
                    onClick={() => setOpenNoteBodies((prev) => ({ ...prev, [n.id]: !bodyOpen }))}
                    style={styles.noteChevron}
                    aria-expanded={bodyOpen}
                    aria-label={(bodyOpen ? "Свернуть конспект: " : "Конспект и файлы: ") + n.text}
                  >
                    {bodyOpen ? "▾" : "▸"}
                  </button>
                  <span style={styles.noteDate}>{new Date(n.date).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}</span>
                  <span style={styles.noteText}>{n.text}</span>
                  {!bodyOpen && hasBody && <span style={styles.noteHasBody}>конспект</span>}
                  <span style={styles.noteMins}>{n.minutes} мин</span>
                  <button onClick={() => onRemoveNote(n.id)} style={styles.removeBtn} aria-label={"Удалить заметку: " + n.text}>
                    ×
                  </button>
                </div>
                <Collapsible open={bodyOpen}>
                  <div style={styles.noteBody}>
                    <RichText
                      docId={n.id}
                      html={n.html}
                      onChange={(html) => onUpdateNote(n.id, { html })}
                      placeholder="Конспект урока, разбор задачи, что осталось выучить…"
                    />
                    <Attachments
                      files={n.files || []}
                      onChange={(files) =>
                        onUpdateNote(
                          n.id,
                          typeof files === "function" ? (note) => ({ files: files(note.files || []) }) : { files }
                        )
                      }
                      prefix={"note-" + n.id}
                      onUndo={onUndo}
                    />
                  </div>
                </Collapsible>
              </div>
            );
          })}
          <div style={styles.noteForm}>
            <input
              type="text"
              placeholder="Например: законспектировал, осталось выучить"
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  onAddNote(noteText, noteMins);
                  setNoteText("");
                }
              }}
              style={styles.noteInput}
              aria-label="Заметка к уроку"
            />
            <input
              type="number"
              min="0"
              step="5"
              value={noteMins}
              onChange={(e) => setNoteMins(e.target.value)}
              style={styles.smallNumInput}
              aria-label="Затраченное время, минут"
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
      </Collapsible>
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
        placeholder="+ Добавить урок"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        style={styles.addTopicInput}
        aria-label="Название нового урока"
      />
      {val.trim() && (
        <input
          type="url"
          placeholder="Ссылка (необязательно)"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          style={styles.addTopicUrlInput}
          aria-label="Ссылка на новый урок"
        />
      )}
      {val.trim() && (
        <button onClick={submit} style={{ ...styles.addBtn, background: color, color: "#fff" }}>
          Добавить
        </button>
      )}
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

// Задание под уроком. Длинное — в две строки, по нажатию разворачивается:
// задание на полэкрана раздвигало день так, что соседние уроки уезжали вниз.
// Отметка «сделано» — своей галочкой, чтобы разворачивание её не ставило.
// Минуты и «ещё» — строкой под текстом: справа от него в узкой колонке они
// отнимали полширины, и текст шёл столбиком по слову.
const TASK_FOLD_CHARS = 90;
function LessonTaskRow({ task: h, due, onToggle }) {
  const [open, setOpen] = useState(false);
  const text = h.text || "";
  const long = text.length > TASK_FOLD_CHARS || text.split("\n").length > 2;
  const meta = [h.minutes ? h.minutes + " мин" : "", h.date && h.date !== due ? h.date.slice(8) + "." + h.date.slice(5, 7) : ""]
    .filter(Boolean)
    .join(" · ");
  return (
    <div style={styles.lessonTaskRow}>
      <input type="checkbox" checked={!!h.done} onChange={onToggle} aria-label={"Сделано: " + text.slice(0, 40)} style={styles.lessonTaskCheck} />
      <div style={styles.lessonTaskBody}>
        <span
          style={{
            ...styles.lessonTaskText,
            ...(long && !open ? styles.lessonTaskFolded : null),
            textDecoration: h.done ? "line-through" : "none",
            cursor: long ? "pointer" : "default",
          }}
          onClick={long ? () => setOpen(!open) : undefined}
        >
          {text}
        </span>
        {(meta || long) && (
          <span style={styles.lessonTaskMetaRow}>
            {meta && <span style={styles.lessonTaskMeta}>{meta}</span>}
            {long && (
              <button
                type="button"
                onClick={() => setOpen(!open)}
                style={styles.lessonTaskMore}
                aria-expanded={open}
                aria-label={open ? "Свернуть задание" : "Развернуть задание"}
              >
                {open ? "свернуть" : "ещё"}
              </button>
            )}
          </span>
        )}
      </div>
    </div>
  );
}

// Задания урока целиком можно свернуть в одну строку — и короткие тоже:
// посмотрел, что задано, и убрал, чтобы день читался списком уроков.
function LessonTasks({ list, due, folded, onFold, onToggle }) {
  const left = list.filter((h) => !h.done).length;
  const label = list.length + " " + tasksWord(list.length) + (left < list.length ? " · осталось " + left : "");
  if (folded) {
    return (
      <button
        type="button"
        onClick={() => onFold(false)}
        style={styles.lessonTasksFolded}
        aria-expanded={false}
        aria-label={"Показать задания: " + label}
      >
        <span aria-hidden="true">▸</span> {label}
      </button>
    );
  }
  return (
    <div style={styles.lessonTasks}>
      {list.map((h) => (
        <LessonTaskRow key={h.id} task={h} due={due} onToggle={() => onToggle(h.id)} />
      ))}
      <button
        type="button"
        onClick={() => onFold(true)}
        style={styles.lessonTasksFold}
        aria-expanded={true}
        aria-label="Свернуть задания урока"
      >
        <span aria-hidden="true">▴</span> скрыть задания
      </button>
    </div>
  );
}

// wide — отдельная карточка сегодняшнего дня во всю ширину: уроки в ней
// строками. В сетке недели сегодняшний день только подсвечен, а уроки —
// карточками, как у остальных дней: строка в узкой колонке разваливалась.
function ScheduleDay({ day, label, entries, today, wide, onAdd, onUpdate, onRemove, tasks, onMoveDate, reopen, onReopenDone, editRequest, onEditDone }) {
  const [examOpen, setExamOpen] = useState(false);
  // С чем открыть форму экзамена: запрос из уведомления живёт только до того,
  // как форма открылась, а значения держим здесь, пока форму не отправят.
  const [formSeed, setFormSeed] = useState(null);
  // Форма урока — шесть полей; развёрнутая в каждом дне, она делала неделю
  // стеной из полей, поэтому раскрывается по кнопке.
  const [addOpen, setAddOpen] = useState(false);
  // Какому уроку сейчас пишут задание и что успели написать.
  const [taskFor, setTaskFor] = useState(null);
  const [taskText, setTaskText] = useState("");
  const [taskMinutes, setTaskMinutes] = useState("30");
  const due = tasks ? tasks.dueDate(day) : "";

  // Крестик в уведомлении о переносе только что добавленного экзамена: форма
  // этого дня открывается снова, с тем, что было введено.
  useEffect(() => {
    if (!reopen) return;
    setFormSeed(reopen);
    setExamOpen(true);
    if (onReopenDone) onReopenDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reopen]);

  return (
    <div className="ap-card" style={{ ...styles.scheduleDayBlock, ...(today ? styles.scheduleDayToday : null) }}>
      <div style={styles.scheduleDayTop}>
        <div style={styles.scheduleDayHeader}>
          {label}
          {today && <span style={styles.todayMark}>сегодня</span>}
        </div>
        <div style={styles.scheduleDayActions}>
          <button onClick={() => setAddOpen(!addOpen)} style={styles.examToggle}>
            {addOpen ? "Скрыть урок" : "+ Урок"}
          </button>
          <button onClick={() => setExamOpen(!examOpen)} style={styles.examToggle}>
            {examOpen ? "Скрыть" : "+ Экзамен"}
          </button>
        </div>
      </div>

      <Collapsible open={examOpen}>
        <AddExamForm
          key={formSeed ? formSeed.at : "new"}
          initial={formSeed ? formSeed.values : null}
          onAdd={(entry) => {
            onAdd({ ...entry, kind: "exam" });
            setExamOpen(false);
            setFormSeed(null);
          }}
        />
      </Collapsible>

      {entries.length === 0 && <div style={styles.mutedSmall}>Уроков нет</div>}
      {/* Один день — столбцом: сетка раскладывала уроки по строкам и колонкам, и
          порядок дня по ней читался хуже, чем простым списком сверху вниз.
          Строка при этом однострочная, поэтому столбец выходит короткий. */}
      <div style={wide ? styles.dayEntriesList : undefined}>
        {entries.map((e) => {
          const list = tasks ? tasks.forLesson(e) : [];
          return (
            <div key={e.id} data-focus-id={"lesson:" + e.id}>
              <ScheduleEntryRow
                entry={e}
                onUpdate={onUpdate}
                onMoveDate={onMoveDate}
                editRequest={editRequest}
                onEditDone={onEditDone}
                onRemove={() => onRemove(e.id)}
                compact={wide}
                onAddTask={tasks ? () => setTaskFor(taskFor === e.id ? null : e.id) : null}
              />
              {list.length > 0 && (
                <LessonTasks
                  list={list}
                  due={due}
                  folded={tasks.folded(e.id, due)}
                  onFold={(v) => tasks.setFolded(e.id, due, v)}
                  onToggle={(id) => tasks.toggle(id)}
                />
              )}
              {taskFor === e.id && (
                <div style={styles.lessonTaskForm}>
                  <AutoGrow
                    placeholder="Что задали?"
                    value={taskText}
                    onChange={(ev) => setTaskText(ev.target.value)}
                    onEnter={() => {
                      tasks.add(e, taskText, taskMinutes);
                      setTaskText("");
                      setTaskFor(null);
                    }}
                    style={styles.lessonTaskInput}
                  />
                  <input
                    type="number"
                    min="0"
                    step="5"
                    value={taskMinutes}
                    onChange={(ev) => setTaskMinutes(ev.target.value)}
                    style={styles.lessonTaskMinutes}
                    title="Сколько минут займёт"
                  />
                  <button
                    onClick={() => {
                      tasks.add(e, taskText, taskMinutes);
                      setTaskText("");
                      setTaskFor(null);
                    }}
                    style={styles.rowDone}
                  >
                    К {due.slice(8)}.{due.slice(5, 7)}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <Collapsible open={addOpen}>
        <AddScheduleForm
          onAdd={(entry) => {
            onAdd(entry);
            setAddOpen(false);
          }}
        />
      </Collapsible>
    </div>
  );
}

// Серия занятий — огонёк вместо восклицательного знака. Смайлик рядом с
// шрифтовой засечкой смотрелся чужеродно, поэтому пламя нарисовано теми же
// цветами, что и остальное приложение: золото снаружи, горячее ядро внутри.
// Значок напоминания. Раньше это была буква — «!», «✓» или «·» шрифтом на
// 44 пикселя. Буква в строке выравнивается по базовой линии, а не по своим
// чернилам: у «!» вся краска сверху, у «·» посередине, у «✓» своя высота — и
// каждый значок вставал на свою высоту, то есть криво. Огонёк рядом был
// рисунком и сидел ровно, отчего разнобой был ещё заметнее.
//
// Теперь все четыре — рисунки в одной сетке 24×24, и центр у них общий.
function ReminderMark({ kind }) {
  if (kind === "streak") return <StreakFlame />;
  return (
    <svg viewBox="0 0 24 24" width={MARK_SIZE} height={MARK_SIZE} aria-hidden="true">
      {kind === "warn" && (
        <g fill="currentColor">
          <path d="M9.4 1.8h5.2l-.8 13.4h-3.6L9.4 1.8z" />
          <circle cx="12" cy="20" r="2.4" />
        </g>
      )}
      {kind === "ok" && (
        <path
          d="M3.4 12.6l5.4 5.8L20.6 4.6"
          fill="none"
          stroke="currentColor"
          strokeWidth="3.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      {kind === "idle" && <circle cx="12" cy="12" r="4.2" fill="currentColor" />}
      {/* Новая неделя: круг со стрелкой — «начать заново». */}
      {kind === "week" && (
        <g fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
          <path d="M20 12a8 8 0 1 1-2.6-5.9" />
          <path d="M20.4 3.4v4.2h-4.2" strokeLinejoin="round" />
        </g>
      )}
    </svg>
  );
}

function StreakFlame({ size = MARK_SIZE }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      {/* Пламя узкое и в исходной сетке занимало меньше места, чем остальные
          значки, — рядом с ними оно выглядело мельче. Растягиваем от центра. */}
      <g transform="translate(12 12) scale(1.32) translate(-12 -12)">
      <path
        d="M12 2.2c3.4 3.6 5.6 6.5 5.6 10.2 0 3.5-2.5 6.3-5.6 6.3S6.4 15.9 6.4 12.4c0-2.1.9-3.8 2.1-5.4.3 1.5.9 2.4 1.6 2.9-.2-2.8.6-5.6 1.9-7.7z"
        fill="var(--gold)"
      />
      <path
        d="M12 17.6c-1.7 0-3-1.4-3-3.3 0-1.6 1-2.7 1.8-4 .5 1 .9 1.5 1.4 1.8.5-1 .8-2 .8-3 1.3 1.7 2 3.1 2 5.2 0 1.9-1.3 3.3-3 3.3z"
        fill="var(--redStrong)"
        opacity="0.85"
      />
      </g>
    </svg>
  );
}

// Экзамен в дне важнее урока: ради него день и смотрят, поэтому он стоит
// первым, а уроки за ним — по времени, как обычно.
function byExamFirst(a, b) {
  const examA = a.kind === "exam" ? 0 : 1;
  const examB = b.kind === "exam" ? 0 : 1;
  if (examA !== examB) return examA - examB;
  return String(a.start).localeCompare(String(b.start));
}

// Экзамен или олимпиада — разные вещи, и в расписании это видно сразу.
function ExamKindPicker({ value, onChange }) {
  const current = value === "olympiad" ? "olympiad" : "exam";
  return (
    <div style={styles.examKindPicker}>
      {EXAM_KINDS.map((k) => (
        <button
          key={k.value}
          onClick={() => onChange(k.value)}
          style={k.value === current ? styles.examKindOn : styles.examKindOff}
        >
          {k.label}
        </button>
      ))}
    </div>
  );
}

// Экзамен живёт в том же расписании, но описывается иначе: важно не «кабинет и
// преподаватель», а место проведения и ссылка на регистрацию или задания.
function AddExamForm({ onAdd, initial }) {
  // initial — то, что ввели перед крестиком в уведомлении о переносе.
  const from = initial || {};
  const [subjectName, setSubjectName] = useState(from.subjectName || "");
  const [examKind, setExamKind] = useState(from.examKind === "olympiad" ? "olympiad" : "exam");
  const [date, setDate] = useState(from.date || "");
  const [start, setStart] = useState(from.start || "10:00");
  const [end, setEnd] = useState(from.end || "13:00");
  const [place, setPlace] = useState(from.place || "");
  const [url, setUrl] = useState(from.url || "");

  function submit() {
    if (!subjectName.trim()) return;
    onAdd({ subjectName, examKind, date, start, end, place, url });
    setSubjectName("");
    setPlace("");
    setUrl("");
    setDate("");
  }

  return (
    <div style={styles.examForm}>
      <ExamKindPicker value={examKind} onChange={setExamKind} />
      <AutoGrow
        placeholder="Например: региональный этап по праву"
        value={subjectName}
        onChange={(e) => setSubjectName(e.target.value)}
        onEnter={submit}
        style={styles.scheduleSubjectInput}
      />
      <div style={styles.scheduleTimeRow}>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={styles.scheduleSelect} title="Дата" />
      </div>
      <div style={styles.mutedSmall}>
        День недели берётся из даты, так что ошибиться днём нельзя. Пока до даты больше недели, запись стоит
        полупрозрачно внизу дня — её можно свернуть; за неделю она встаёт наверх. Отсчёт — сразу в событиях.
      </div>
      <div style={styles.scheduleTimeRow}>
        <input type="time" value={start} onChange={(e) => setStart(e.target.value)} style={styles.scheduleTimeInput} />
        <span style={styles.mutedSmall}>–</span>
        <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} style={styles.scheduleTimeInput} />
      </div>
      <AutoGrow
        placeholder="Место проведения"
        value={place}
        onChange={(e) => setPlace(e.target.value)}
        onEnter={submit}
        style={styles.scheduleRoomInput}
      />
      <input
        type="url"
        placeholder="Ссылка: регистрация, задания"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        style={styles.scheduleRoomInput}
      />
      <button onClick={submit} style={styles.addBtnSmall} disabled={!subjectName.trim()}>
        + Добавить
      </button>
    </div>
  );
}

// Карандаш для кнопки «изменить»: в узкой карточке слово не помещалось.
function PencilIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4z" />
      <path d="M13.5 6.5l4 4" />
    </svg>
  );
}

// Стрелка для «свернуть / развернуть» дальнего экзамена.
function FoldIcon({ open }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={open ? "M6 15l6-6 6 6" : "M9 6l6 6-6 6"} />
    </svg>
  );
}

function ScheduleEntryRow({ entry, onUpdate, onMoveDate, editRequest, onEditDone, onRemove, compact, onAddTask }) {
  const isExam = entry.kind === "exam";
  // Урок читают куда чаще, чем правят, поэтому обычный вид — три короткие
  // строки, а поля появляются по «изменить». Раньше каждый урок был формой из
  // шести полей, и день из восьми уроков не помещался на экран.
  const [editing, setEditing] = useState(false);
  const rowRef = useRef(null);
  // Экзамен, до которого больше недели, стоит полупрозрачно внизу дня, и его
  // можно свернуть в строку. За неделю до даты он встаёт наверх как обычно —
  // свёрнутость тогда уже ни на что не влияет.
  const far = isExam && examPlace(entry) === "far";
  const folded = far && !!entry.folded;

  // Крестик в уведомлении о переносе: дата вернулась, открываем правку здесь.
  useEffect(() => {
    if (!editRequest || editRequest.id !== entry.id) return;
    setEditing(true);
    if (rowRef.current) rowRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    if (onEditDone) onEditDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editRequest, entry.id]);

  const box = {
    ...styles.scheduleEntry,
    borderLeftColor: priorityInfo(entry.priority).strong,
    background: priorityInfo(entry.priority).tint,
    ...(isExam ? styles.scheduleExam : null),
    ...(compact ? styles.scheduleEntryCompact : null),
    ...(far && !editing ? styles.scheduleFar : null),
  };

  if (folded && !editing) {
    const title = entry.subjectName || (entry.examKind === "olympiad" ? "Олимпиада" : "Экзамен");
    return (
      <button
        type="button"
        ref={rowRef}
        onClick={() => onUpdate(entry.id, { folded: false })}
        className="ap-row"
        style={{ ...box, ...styles.scheduleFolded }}
        aria-label={"Развернуть: " + title}
        title="Развернуть"
      >
        <FoldIcon open={false} />
        <span style={styles.foldedName}>{title}</span>
        <span style={styles.foldedDate}>{formatEventDate(entry.date)}</span>
      </button>
    );
  }

  // Кнопка «свернуть» — только у дальнего экзамена.
  const foldBtn = far ? (
    <button
      type="button"
      onClick={() => onUpdate(entry.id, { folded: true })}
      className="ap-row"
      style={styles.rowIconBtn}
      aria-label={"Свернуть до недели: " + (entry.subjectName || "экзамен")}
      title="Свернуть — развернётся сам за неделю до даты"
    >
      <FoldIcon open />
    </button>
  ) : null;

  if (!editing) {
    const facts = isExam
      ? [entry.date ? formatEventDate(entry.date) : "", entry.place]
      : [levelInfo(entry.level).short, entry.room, entry.teacher];
    const title = entry.subjectName || (isExam ? "Экзамен" : "Урок");
    const details = facts.filter(Boolean).join(" · ") || "без подробностей";

    if (compact) {
      return (
        <div ref={rowRef} style={box}>
          <div style={styles.listRow}>
            <span style={styles.rowTime}>{entry.start}</span>
            <span style={styles.rowName}>{title}</span>
            <span style={styles.listFacts}>{details}</span>
            {isExam && entry.url && (
              <a className="lesson-link" href={entry.url} target="_blank" rel="noreferrer" style={styles.examLink}>
                ссылка
              </a>
            )}
            <span style={styles.listRight}>
              <PriorityPicker value={entry.priority || 1} onChange={(v) => onUpdate(entry.id, { priority: v })} />
              {onAddTask && !isExam && (
                <button
                  type="button"
                  onClick={onAddTask}
                  className="ap-row"
                  style={styles.rowTaskBtn}
                  title="Добавить задание к этому уроку"
                >
                  <span aria-hidden="true" style={styles.rowTaskPlus}>+</span> задание
                </button>
              )}
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="ap-row"
                style={styles.rowIconBtn}
                aria-label={"Изменить: " + title}
                title="Изменить"
              >
                <PencilIcon />
              </button>
              {foldBtn}
            </span>
          </div>
        </div>
      );
    }

    // В узкой колонке недели три кнопки важности, «+ задание» и «изменить» в
    // одну строку не помещались: «изменить» уезжало за край карточки. Действия
    // переехали наверх, к времени, а внизу осталась одна важность.
    return (
      <div ref={rowRef} style={box}>
        <div style={styles.rowHead}>
          <span style={styles.rowTime}>{entry.start}</span>
          <span style={styles.rowActions}>
            {onAddTask && !isExam && (
              <button
                type="button"
                onClick={onAddTask}
                className="ap-row"
                style={styles.rowTaskBtn}
                title="Добавить задание к этому уроку"
              >
                <span aria-hidden="true" style={styles.rowTaskPlus}>+</span> задание
              </button>
            )}
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="ap-row"
              style={styles.rowIconBtn}
              aria-label={"Изменить: " + title}
              title="Изменить"
            >
              <PencilIcon />
            </button>
            {foldBtn}
          </span>
        </div>
        <div style={styles.rowName}>{title}</div>
        <div style={styles.rowFacts}>{details}</div>
        {isExam && entry.url && (
          <a className="lesson-link" href={entry.url} target="_blank" rel="noreferrer" style={styles.examLink}>
            Открыть ссылку
          </a>
        )}
        <div style={styles.rowBottom}>
          <PriorityPicker value={entry.priority || 1} onChange={(v) => onUpdate(entry.id, { priority: v })} />
        </div>
      </div>
    );
  }

  return (
    <div ref={rowRef} style={box}>
      {isExam && (
        <div style={styles.examRow}>
          <ExamKindPicker value={entry.examKind} onChange={(v) => onUpdate(entry.id, { examKind: v })} />
          <DateField
            value={entry.date || ""}
            onCommit={(date) => (onMoveDate ? onMoveDate(entry, date) : onUpdate(entry.id, { date }))}
            style={styles.examDateInput}
            title="Дата — по ней же считается день недели"
          />
        </div>
      )}
      <div style={styles.scheduleSubjectRow}>
        <AutoGrow
          placeholder={isExam ? "Название" : "Предмет"}
          value={entry.subjectName}
          onChange={(e) => onUpdate(entry.id, { subjectName: e.target.value })}
          style={styles.scheduleSubjectInput}
        />
        <PriorityPicker value={entry.priority || 1} onChange={(v) => onUpdate(entry.id, { priority: v })} />
      </div>
      <div style={styles.scheduleTimeRow}>
        <input type="time" value={entry.start} onChange={(e) => onUpdate(entry.id, { start: e.target.value })} style={styles.scheduleTimeInput} />
        <span style={styles.mutedSmall}>–</span>
        <input type="time" value={entry.end} onChange={(e) => onUpdate(entry.id, { end: e.target.value })} style={styles.scheduleTimeInput} />
      </div>
      {isExam ? (
        <>
          <AutoGrow
            placeholder="Место проведения"
            value={entry.place || ""}
            onChange={(e) => onUpdate(entry.id, { place: e.target.value })}
            style={styles.scheduleRoomInput}
          />
          <input
            type="url"
            placeholder="Ссылка: регистрация, задания"
            value={entry.url || ""}
            onChange={(e) => onUpdate(entry.id, { url: e.target.value })}
            style={styles.scheduleRoomInput}
          />
        </>
      ) : (
        <>
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
          <select
            value={entry.level || "base"}
            onChange={(e) => onUpdate(entry.id, { level: e.target.value })}
            style={{ ...styles.scheduleSelect, color: levelInfo(entry.level).color, fontWeight: 600 }}
            title="Тип урока"
          >
            {LESSON_LEVELS.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        </>
      )}
      <div style={styles.rowBottom}>
        <button onClick={() => setEditing(false)} style={styles.rowDone}>
          Готово
        </button>
        <button onClick={onRemove} style={styles.rowDelete}>
          Удалить
        </button>
      </div>
    </div>
  );
}

function AddScheduleForm({ onAdd }) {
  const [subjectName, setSubjectName] = useState("");
  const [start, setStart] = useState("08:30");
  const [end, setEnd] = useState("09:15");
  const [room, setRoom] = useState("");
  const [teacher, setTeacher] = useState("");
  const [level, setLevel] = useState("base");
  const [priority, setPriority] = useState(1);

  function submit() {
    if (!subjectName.trim()) return;
    onAdd({ subjectName, start, end, room, teacher, level, priority });
    setSubjectName("");
    setRoom("");
    setTeacher("");
  }

  return (
    <div style={styles.addScheduleRow}>
      <div style={styles.scheduleSubjectRow}>
        <AutoGrow
          placeholder="Предмет"
          value={subjectName}
          onChange={(e) => setSubjectName(e.target.value)}
          onEnter={submit}
          style={styles.scheduleSubjectInput}
        />
        <PriorityPicker value={priority} onChange={setPriority} />
      </div>
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
      <select value={level} onChange={(e) => setLevel(e.target.value)} style={styles.scheduleSelect}>
        {LESSON_LEVELS.map((l) => (
          <option key={l.value} value={l.value}>
            {l.label}
          </option>
        ))}
      </select>
      <button onClick={submit} style={styles.addBtnSmall}>
        + Урок
      </button>
    </div>
  );
}

function HomeworkAddForm({ onAdd, placeholder }) {
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
        placeholder={placeholder || "Например: параграф 12, упр. 5–8"}
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

// Найденный кусок текста — подсвечен, как маркером.
function Marked({ text, query }) {
  return markParts(text, query).map((part, i) =>
    part.hit ? (
      <mark key={i} style={styles.searchMark}>
        {part.text}
      </mark>
    ) : (
      <React.Fragment key={i}>{part.text}</React.Fragment>
    )
  );
}

function HomeworkItem({ hw, onToggleDone, onRemove, onAttach, onOpenAttachment, onRemoveAttachment, onUpdateReminder }) {
  const fileInputRef = useRef(null);
  const reminderMode = hw.reminderDays === "always" ? "always" : !hw.reminderDays || hw.reminderDays === 1 ? "1" : "custom";
  const customDays = typeof hw.reminderDays === "number" && hw.reminderDays !== 1 ? hw.reminderDays : 3;

  return (
    <div style={styles.homeworkItemBlock} data-focus-id={"hw:" + hw.id}>
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
          <FileGrid files={hw.attachments} onDownload={onOpenAttachment} onRemove={onRemoveAttachment} />
        </div>
      )}
      <div style={styles.hwReminderRow}>
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

// Правила таблицы стилей, которые не выразить инлайновым стилем: навигация,
// вкладки, поля ввода и плитки дня на телефоне.
const NEW_CSS = `
        .ap-card:hover { box-shadow: var(--shadow); }
        /* Состояния навигации описаны здесь целиком: инлайновый стиль перебивал :hover,
           и подсветка под курсором не появлялась. Выбранный раздел — подложка
           во всю строку, без полосы слева: полоса уже занята под важность урока. */
        .ap-nav {
          padding: 0 12px;
          border: none;
          border-radius: 10px;
          background: transparent;
          color: var(--railInk2);
          transition: background .18s ease, color .18s ease;
        }
        .ap-nav:hover { background: var(--railActive); color: var(--railInk); }
        .ap-nav.is-on { background: var(--railActive); color: var(--railInk); font-weight: 600; }
        .ap-nav.is-on svg { color: var(--accent); }
        .ap-rail::-webkit-scrollbar { display: none; }
        .ap-search { background: transparent; color: var(--railInk2); transition: background .18s ease, color .18s ease; }
        .ap-search:hover, .ap-search.is-on { background: var(--railActive); color: var(--railInk); }
        .ap-tab {
          border: none;
          background: transparent;
          color: var(--railInk2);
          padding: 4px 2px;
          transition: color .18s ease;
        }
        .ap-tab:hover, .ap-tab.is-on { color: var(--railInk); }
        .ap-tab.is-on { font-weight: 600; }
        .ap-tab-mark { background: transparent; transition: background .18s ease; }
        .ap-tab.is-on .ap-tab-mark { background: var(--railActive); color: var(--accent); }
        /* Поля ввода везде одни: скругление, рамка и заметный фокус. Скругление
           перебивает инлайновое — в стилях полей оно было то 7, то 8, то 9. */
        .ap-main input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"]):not([type="file"]),
        .ap-main select, .ap-main textarea, .ap-dialog input:not([type="checkbox"]):not([type="radio"]), .ap-dialog select {
          border-radius: var(--radiusSm) !important;
          min-height: 36px;
          transition: border-color .15s ease, box-shadow .15s ease;
        }
        .ap-main input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"]):focus,
        .ap-main select:focus, .ap-main textarea:focus, .ap-main [contenteditable="true"]:focus {
          outline: none;
          border-color: var(--accent) !important;
          box-shadow: 0 0 0 3px var(--accentSoft);
        }
        .ap-main input::placeholder, .ap-main textarea::placeholder { color: var(--mute); opacity: 1; }
        input[type="checkbox"], input[type="radio"] { accent-color: var(--green); }
        input[type="checkbox"] { width: 17px; height: 17px; }
        button:focus-visible, a:focus-visible, [role="button"]:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
        ::selection { background: var(--accentSoft); }
`;
const NEW_MOBILE_CSS = `
          .ap-main { padding: 20px 16px 104px !important; }
          .ap-main h1 { font-size: 32px !important; }
          .ap-desktop-only { display: none !important; }
          /* Три плитки дня на телефоне — одна полоса из трёх чисел: три
             карточки подряд заняли бы полэкрана раньше уроков. */
          .ap-tiles {
            gap: 0 !important;
            background: var(--panel);
            border: 1px solid var(--line);
            border-radius: 16px;
            padding: 14px 0;
            margin-bottom: 16px !important;
          }
          .ap-tiles > .ap-card {
            border: none !important;
            border-radius: 0 !important;
            background: none !important;
            padding: 2px 8px !important;
            align-items: center;
            text-align: center;
            gap: 4px !important;
            animation: none;
          }
          .ap-tiles > .ap-card + .ap-card { border-left: 1px solid var(--line) !important; }
          .ap-tiles > .ap-card:hover { box-shadow: none; }
          .ap-tiles > .ap-card > :first-child { order: 2; font-size: 12px !important; }
          .ap-tiles > .ap-card > :nth-child(2) { justify-content: center; }
          .ap-tiles > .ap-card > :nth-child(2) > :first-child { font-size: 25px !important; }
          .ap-tiles > .ap-card > :nth-child(2) > :nth-child(2),
          .ap-tiles > .ap-card > :last-child { display: none; }
          .ap-main section.ap-card { padding: 18px 16px !important; }
`;

const styles = {
  // «Подготовка», вариант A.
  studyGrid: { display: "grid", gridTemplateColumns: "288px minmax(0, 1fr)", gap: 22, alignItems: "start" },
  studyLeft: { display: "flex", flexDirection: "column", gap: 14, position: "sticky", top: 16 },
  studyList: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: "var(--radius)", padding: 8, display: "flex", flexDirection: "column", gap: 2 },
  studyRow: { display: "block", width: "100%", padding: "11px 12px 12px", border: "none", borderRadius: 12, textAlign: "left", color: "var(--ink)", cursor: "pointer" },
  studyRowTop: { display: "flex", alignItems: "center", gap: 10 },
  studyRowName: { flex: 1, minWidth: 0, fontSize: 15, fontWeight: 500 },
  studyRowCount: { fontSize: 12.5, color: "var(--ink3)", fontVariantNumeric: "tabular-nums" },
  studyRowTrack: { display: "block", height: 4, borderRadius: 999, background: "var(--line2)", margin: "8px 0 0 19px", overflow: "hidden" },
  studyRowFill: { display: "block", height: "100%", borderRadius: 999 },
  studyReview: { background: "var(--warmBg)", borderRadius: 16, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 },
  studyReviewHead: { fontSize: 13, fontWeight: 600, color: "var(--warmInk)" },
  studyReviewRow: { display: "flex", alignItems: "center", gap: 10 },
  studyReviewBtn: { flexShrink: 0, minHeight: 34, padding: "0 12px", border: "none", borderRadius: 9, background: "var(--btnBg)", color: "var(--btnInk)", fontSize: 12.5, fontWeight: 600 },
  studyDetail: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: "var(--radius)", padding: "24px 28px 26px", display: "flex", flexDirection: "column", gap: 16, minWidth: 0 },
  studyBack: { alignSelf: "flex-start", alignItems: "center", gap: 4, minHeight: 40, padding: "0 6px 0 0", border: "none", background: "none", color: "var(--ink3)", fontSize: 15 },
  studyHead: { display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" },
  studyTitle: { margin: 0, flex: 1, minWidth: 0, fontFamily: "var(--serif)", fontWeight: 400, fontSize: 30, lineHeight: 1.15 },
  studyMeta: { fontSize: 14, color: "var(--ink3)" },
  menuColor: { display: "flex", alignItems: "center", gap: 10, fontSize: 14, color: "var(--ink)", cursor: "pointer", minHeight: 36 },
  studyTrack: { height: 8, borderRadius: 999, background: "var(--line2)", overflow: "hidden", marginTop: -4 },
  studyFill: { height: "100%", borderRadius: 999 },
  studyTabsRow: { display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" },
  studyTabs: { display: "flex", gap: 2, padding: 3, borderRadius: 11, background: "var(--line2)" },
  studyTab: { minHeight: 36, padding: "0 14px", border: "none", borderRadius: 8, background: "transparent", color: "var(--ink2)", fontSize: 14 },
  studyTabOn: { background: "var(--panel2)", color: "var(--ink)", fontWeight: 600, boxShadow: "0 1px 2px rgba(34,32,27,.08)" },
  studyTabN: { color: "var(--ink3)", fontWeight: 400, marginLeft: 2 },
  studyHide: { display: "flex", alignItems: "center", gap: 8, marginLeft: "auto", fontSize: 13.5, color: "var(--ink2)", minHeight: 36 },
  nextCard: { display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", padding: "16px 18px", borderRadius: 14, background: "var(--accentSoft)" },
  nextLabel: { fontSize: 12, fontWeight: 600, color: "var(--warmInk)", letterSpacing: "0.03em" },
  nextName: { fontFamily: "var(--serif)", fontSize: 22, lineHeight: 1.25, marginTop: 4 },
  nextMeta: { fontSize: 13, color: "var(--ink3)", marginTop: 2 },
  nextActions: { display: "flex", gap: 8, flexWrap: "wrap" },
  nextOpen: { display: "inline-flex", alignItems: "center", minHeight: 42, padding: "0 16px", borderRadius: 11, background: "var(--btnBg)", color: "var(--btnInk)", fontSize: 14, fontWeight: 600, textDecoration: "none" },
  nextGhost: { minHeight: 42, padding: "0 14px", border: "1px solid var(--warmLine)", borderRadius: 11, background: "transparent", color: "var(--ink)", fontSize: 14 },
  doneCard: { padding: "14px 18px", borderRadius: 14, background: "var(--greenSoft)", color: "var(--green)", fontSize: 14.5, fontWeight: 600 },
  lessonList: { display: "flex", flexDirection: "column" },
  showDone: { alignSelf: "flex-start", minHeight: 38, marginTop: 6, padding: "0 12px", border: "none", borderRadius: 10, background: "none", color: "var(--accent)", fontSize: 13.5, fontWeight: 500 },
  studyNotebook: { margin: "0 -28px -26px", borderTop: "1px solid var(--line)", borderRadius: "0 0 var(--radius) var(--radius)", overflow: "hidden" },
  notesAll: { display: "flex", flexDirection: "column" },
  notesAllRow: { display: "flex", alignItems: "flex-start", gap: 14, padding: "12px 0", borderTop: "1px solid var(--line2)", fontSize: 14.5, lineHeight: 1.45 },
  notesAllDate: { width: 64, flexShrink: 0, fontSize: 13, color: "var(--mute)", paddingTop: 1 },
  notesAllTopic: { display: "block", fontSize: 12.5, color: "var(--ink3)", marginTop: 2 },
  notesAllMins: { flexShrink: 0, fontSize: 13, color: "var(--ink3)" },
  topicRowNext: { background: "var(--warmBg)", margin: "0 -12px", padding: "4px 12px", borderRadius: 10 },
  topicCheck: { width: 19, height: 19, margin: 0, flexShrink: 0 },
  topicNum: { width: 22, flexShrink: 0, fontSize: 13, color: "var(--mute)", fontVariantNumeric: "tabular-nums" },
  topicName: { flex: 1, minWidth: 0, fontSize: 15, lineHeight: 1.4, overflowWrap: "anywhere" },
  noteBadge: { flexShrink: 0, minHeight: 26, padding: "0 10px", border: "none", borderRadius: 13, background: "var(--neutralBg)", color: "var(--ink2)", fontSize: 12, cursor: "pointer" },
  topicMins: { flexShrink: 0, width: 58, textAlign: "right", fontSize: 13, color: "var(--ink3)" },
  // «Тетради», вариант A: три колонки в одной рамке.
  notesShell: { display: "grid", gridTemplateColumns: "228px minmax(0, 1fr)", background: "var(--panel)", border: "1px solid var(--line)", borderRadius: "var(--radius)", overflow: "hidden", minHeight: 640 },
  notesSide: { padding: "18px 10px", background: "var(--neutralBg)", borderRight: "1px solid var(--line)", minWidth: 0 },
  notesMain: { minWidth: 0, display: "flex", flexDirection: "column" },
  notesChips: { gap: 8, padding: "12px 14px", overflowX: "auto", borderBottom: "1px solid var(--line)", scrollbarWidth: "none" },
  notesChip: { display: "flex", alignItems: "center", gap: 7, flexShrink: 0, minHeight: 38, padding: "0 14px", border: "1px solid var(--line)", borderRadius: 999, background: "var(--panel2)", color: "var(--ink)", fontSize: 14, whiteSpace: "nowrap" },
  notesOrder: { padding: "14px 14px 16px", borderBottom: "1px solid var(--line)" },
  notesChipOn: { background: "var(--btnBg)", borderColor: "var(--btnBg)", color: "var(--btnInk)", fontWeight: 600 },
  // Оболочка: колонка навигации слева, экран справа. На телефоне колонка
  // превращается в полосу сверху — это делает таблица стилей выше.
  shell: { display: "flex", alignItems: "flex-start", minHeight: "100vh", background: "var(--bg)", color: "var(--ink)", position: "relative", fontFamily: "var(--sans)" },
  main: { flex: 1, minWidth: 0, padding: "36px 44px 56px", maxWidth: 1340 },
  // Между рядами — только отступ самой карточки: зазор сетки поверх него давал
  // 32 px между рядами при 16 между карточками вне сетки.
  grid2: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(340px, 100%), 1fr))", gap: "0 20px", alignItems: "start" },
  cardTitle: { fontFamily: "var(--serif)", fontSize: 22, lineHeight: 1.25, marginBottom: 8 },
  cardNote: { fontSize: 13.5, color: "var(--ink3)", marginBottom: 14, lineHeight: 1.5 },
  todayList: { display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 },
  todayRow: {
    display: "flex",
    alignItems: "baseline",
    gap: 8,
    flexWrap: "wrap",
    borderLeft: "3px solid",
    borderRadius: 10,
    padding: "9px 12px",
  },
  todayTime: { fontSize: 12.5, fontWeight: 600, minWidth: 42 },
  // Колонка значка важности в «Ближайших событиях». Звалась todayMark, как и
  // подпись «сегодня» в расписании, и та её перебивала: колонка теряла ширину,
  // и названия событий не выстраивались в столбик.
  eventMarkCol: { minWidth: 42, display: "flex", alignItems: "center" },
  // «Сейчас»: своя строка сверху, свой урок и то же время у всей параллели.
  reviewList: { display: "flex", flexDirection: "column", gap: 6 },
  reviewRow: {
    display: "flex",
    alignItems: "center",
    gap: 9,
    border: "1px solid var(--line2)",
    background: "var(--panel2)",
    borderRadius: 10,
    padding: "8px 11px",
  },
  reviewText: { display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 0 },
  reviewName: { fontSize: 13.5, fontWeight: 600, color: "var(--ink)", overflowWrap: "anywhere" },
  reviewNote: { fontSize: 11.5, color: "var(--ink3)" },
  reviewBtn: {
    flexShrink: 0,
    border: "1px solid var(--line)",
    background: "var(--panel)",
    color: "var(--ink2)",
    borderRadius: 10,
    padding: "6px 11px",
    fontSize: 12.5,
    fontWeight: 600,
  },
  searchInput: {
    width: "100%",
    border: "1px solid var(--line)",
    background: "var(--panel2)",
    color: "inherit",
    borderRadius: 10,
    padding: "11px 13px",
    fontSize: 15,
    marginBottom: 12,
  },
  searchCount: { fontSize: 12.5, color: "var(--mute)", marginBottom: 10 },
  searchWarn: {
    fontSize: 12.5, lineHeight: 1.5, color: "var(--mute)", background: "var(--panel)",
    border: "1px solid var(--line)", borderRadius: 10, padding: "8px 10px", margin: "10px 0",
  },
  searchGroup: { marginBottom: 22 },
  searchGroupTitle: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontFamily: "var(--serif)",
    fontSize: 17,
    color: "var(--ink)",
    margin: "4px 0 10px",
  },
  searchGroupIcon: {
    display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, flexShrink: 0,
    borderRadius: 8, background: "var(--accentSoft)", color: "var(--accent)",
  },
  searchGroupCount: {
    fontFamily: "var(--sans)", fontSize: 11.5, fontWeight: 700, color: "var(--accentInk)", background: "var(--accent)",
    borderRadius: 999, padding: "1px 8px", lineHeight: 1.5,
  },
  searchGroupLine: { flex: 1, height: 1, background: "var(--line)", marginLeft: 4 },
  searchRowMarked: { borderLeft: "3px solid", alignItems: "center" },
  searchMark: { background: "var(--accentSoft)", color: "inherit", borderRadius: 3, padding: "0 1px", boxShadow: "0 1px 0 var(--accent)" },
  searchRow: {
    display: "flex",
    alignItems: "flex-start",
    gap: 9,
    width: "100%",
    textAlign: "left",
    border: "1px solid var(--line2)",
    background: "var(--panel2)",
    borderRadius: 10,
    padding: "9px 11px",
    marginBottom: 5,
  },
  searchRowText: { display: "flex", flexDirection: "column", gap: 2, minWidth: 0 },
  searchRowTitle: { fontSize: 13.5, fontWeight: 600, color: "var(--ink)", overflowWrap: "anywhere" },
  searchRowNote: { fontSize: 11.5, color: "var(--ink3)" },
  searchRowBody: { fontSize: 12, color: "var(--ink2)", lineHeight: 1.45, overflowWrap: "anywhere" },
  searchMore: { fontSize: 11.5, color: "var(--mute)", marginTop: 2 },
  nowHead: { display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: 10 },
  nowTitle: { fontFamily: "'PT Serif', Georgia, serif", fontSize: 19 },
  nowNote: { fontSize: 12.5, color: "var(--ink3)", fontVariantNumeric: "tabular-nums" },
  nowMine: { display: "flex", flexDirection: "column", gap: 4, marginBottom: 12 },
  nowMineRow: { display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", fontSize: 13.5 },
  nowMineTag: { fontSize: 10.5, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--accent)", flexShrink: 0 },
  nowMineName: { fontWeight: 600, color: "var(--ink)" },
  nowMineMeta: { color: "var(--ink3)", fontSize: 12.5 },
  nowAll: { borderTop: "1px solid var(--line2)", paddingTop: 10 },
  nowAllTitle: { fontSize: 11.5, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--mute)", marginBottom: 8 },
  nowAllRow: { display: "flex", flexDirection: "column", gap: 2 },
  // Та же полоска, что у уроков в расписании: урок узнают по ней, и на
  // «Сегодня» он должен выглядеть так же, а не строчкой текста.
  nowMark: { borderLeft: "3px solid", borderRadius: 10, padding: "8px 11px" },
  nowAllName: { fontSize: 13.5, fontWeight: 600, color: "var(--ink2)", display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" },
  nowAllWho: { fontSize: 11, fontWeight: 400, color: "var(--mute)" },
  nowAllItems: { display: "flex", flexWrap: "wrap", gap: "2px 14px", fontSize: 12.5, color: "var(--ink3)" },
  nowAllItem: { whiteSpace: "nowrap" },
  todayEventHead: {
    fontSize: 11.5,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: "var(--mute)",
    marginBottom: 8,
  },
  todayEventRow: { display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap", marginBottom: 4 },
  todayEventName: { fontFamily: "'PT Serif', Georgia, serif", fontSize: 19, color: "var(--ink)" },
  todayEventNote: { fontSize: 12.5, color: "var(--ink3)" },
  nowTaskRow: { display: "flex", alignItems: "baseline", gap: 8, fontSize: 12.5, marginTop: 2, marginLeft: 2 },
  nowTaskText: { color: "var(--ink2)", minWidth: 0, overflowWrap: "anywhere" },
  nowTomorrowTasks: { marginTop: 8, display: "flex", flexDirection: "column", gap: 2 },
  todayName: { fontSize: 13.5, fontWeight: 600, flex: "1 1 120px", minWidth: 0 },
  todayMeta: { fontSize: 12, color: "var(--ink3)" },
  quickLog: { borderTop: "1px solid var(--line2)", paddingTop: 10, marginTop: 4 },
  reminderWarn: { background: "var(--warmBg)", borderColor: "var(--warmLine)" },
  reminderOk: { borderColor: "var(--green)" },
  reminderRow: { display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" },
  // Квадрат под значок: одинаковый для всех состояний, чтобы текст рядом не
  // сдвигался, когда напоминание меняется.
  reminderMark: {
    width: 54,
    height: 54,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "var(--accent)",
    flexShrink: 0,
  },
  reminderBody: { flex: "1 1 240px", minWidth: 0 },
  reminderTitle: { fontFamily: "'PT Serif', Georgia, serif", fontSize: 19, marginBottom: 4 },
  reminderText: { fontSize: 13.5, color: "var(--ink2)", lineHeight: 1.5 },
  jAuto: { fontSize: 11, color: "var(--mute)", whiteSpace: "nowrap" },
  offerBtn: {
    display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", width: "100%",
    marginTop: 10, padding: "8px 10px", textAlign: "left",
    border: "1px solid var(--line)", borderRadius: 10, background: "var(--panel)", cursor: "pointer",
  },
  offerText: { fontSize: 12.5, lineHeight: 1.5, color: "var(--ink)", flex: "1 1 220px" },
  offerGo: { fontSize: 12, color: "var(--accent)", whiteSpace: "nowrap" },
  streakBox: { textAlign: "center", minWidth: 78 },
  streakNum: { fontFamily: "'PT Serif', Georgia, serif", fontSize: 28, lineHeight: 1, color: "var(--green)" },
  streakWord: { fontSize: 11.5, color: "var(--ink3)", marginTop: 3 },
  // Полоска, а не карточка: напоминание о новой неделе стоит рядом с крупным
  // напоминанием о занятиях, и двум плашкам во весь экран подряд там тесно.
  weekStrip: {
    display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
    padding: "12px 14px 12px 20px", marginBottom: 20, borderRadius: 16,
    border: "1px solid transparent", background: "var(--accentSoft)",
  },
  weekStripText: { fontSize: 14.5, color: "var(--ink)", flex: "1 1 220px", minWidth: 0 },
  weekActions: { display: "flex", gap: 8, flexWrap: "wrap" },
  weekGo: { border: "none", color: "var(--btnInk)", background: "var(--btnBg)", borderRadius: 10, minHeight: 38, padding: "0 16px", fontSize: 13.5, fontWeight: 600 },
  weekSkip: {
    border: "none",
    background: "transparent",
    color: "var(--ink2)",
    borderRadius: 10,
    minHeight: 38,
    padding: "0 14px",
    fontSize: 13.5,
    fontWeight: 500,
  },
  // Пропущенный день подсвечивается тёплым — это напоминание, а не выговор.
  pulseWarm: {
    background: "var(--warmBg)",
    border: "1px solid var(--warmLine)",
    color: "var(--warmInk)",
    borderRadius: 10,
    padding: "8px 10px",
  },
  verdictLine: { fontSize: 12.5, lineHeight: 1.5, marginBottom: 8 },
  quickRow: { display: "flex", gap: 6, alignItems: "flex-start", marginBottom: 6, flexWrap: "wrap" },
  taskRow: { display: "flex", alignItems: "baseline", gap: 8, fontSize: 13, flexWrap: "wrap" },
  taskText: { flex: "1 1 140px", minWidth: 0 },
  taskMeta: { fontSize: 12 },
  progressRow: { display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 3 },
  notebookHead: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 5 },
  notebookSelect: {
    flex: "1 1 160px",
    minWidth: 0,
    padding: "7px 9px",
    border: "1px solid var(--line)",
    borderRadius: 10,
    fontSize: 13.5,
    fontWeight: 600,
    background: "var(--panel2)",
    color: "var(--ink)",
  },
  page: {
    fontFamily: "'Golos Text', system-ui, sans-serif",
    background: "var(--bg)",
    color: "var(--ink)",
    minHeight: "100vh",
    padding: "28px 20px 60px",
    maxWidth: 880,
    margin: "0 auto",
  },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 20, flexWrap: "wrap", marginBottom: 20 },
  eyebrow: { fontSize: 13, color: "var(--accent)", fontWeight: 600, marginBottom: 4 },
  h1: { fontFamily: "'PT Serif', Georgia, serif", fontSize: 28, margin: 0, lineHeight: 1.25, maxWidth: 480 },
  lead: { fontSize: 13.5, color: "var(--ink2)", lineHeight: 1.55, maxWidth: 420, margin: "10px 0 0" },
  leadMuted: { fontSize: 12.5, color: "var(--mute)", lineHeight: 1.55, maxWidth: 420, margin: "6px 0 0" },
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
  sectionChevron: { fontSize: 13, color: "var(--mute)", width: 12, flexShrink: 0 },
  // Отсчёт собран из того же, что и карточка урока: полоска важности слева и её
  // же оттенок фоном. Раньше здесь стояла тёмная плашка цветом боковой колонки —
  // единственная такая во всём приложении, и читалась она как чужая вставка.
  countdownLead: {
    display: "flex",
    alignItems: "center",
    gap: 16,
    borderWidth: "1px 1px 1px 3px",
    borderStyle: "solid",
    borderColor: "var(--line)",
    borderRadius: 10,
    padding: "14px 16px",
  },
  countdownNum: {
    fontFamily: "'PT Serif', Georgia, serif",
    fontSize: 42,
    lineHeight: 0.9,
    color: "var(--ink)",
    fontVariantNumeric: "tabular-nums",
    flexShrink: 0,
  },
  countdownLeadText: { minWidth: 0 },
  countdownLabel: { fontSize: 12, color: "var(--mute)", marginBottom: 4 },
  dateInput: { border: "1px solid var(--line)", background: "var(--panel2)", color: "inherit", borderRadius: 10, padding: "7px 9px", fontSize: 12.5, width: "100%" },
  countdownEvent: {
    display: "flex",
    alignItems: "center",
    gap: 7,
    fontSize: 15.5,
    fontWeight: 600,
    color: "var(--ink)",
    lineHeight: 1.3,
    overflowWrap: "anywhere",
  },
  countdownDate: { fontSize: 12, color: "var(--ink3)", marginTop: 3 },
  countdownTime: { color: "var(--ink2)" },
  countdownRest: { marginTop: 12, display: "flex", flexDirection: "column" },
  countdownRestRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 13,
    lineHeight: 1.4,
    padding: "7px 2px",
    borderTop: "1px solid var(--line2)",
  },
  countdownRestName: { flex: "1 1 auto", minWidth: 0, color: "var(--ink2)", overflowWrap: "anywhere" },
  countdownRestLeft: { fontSize: 13, color: "var(--ink3)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" },
  countdownPlan: { fontSize: 10, color: "var(--green)", marginLeft: 6, whiteSpace: "nowrap", letterSpacing: 0.4, textTransform: "uppercase" },
  countdownEmpty: { fontSize: 13, color: "var(--ink3)", lineHeight: 1.5 },
  eventsStrip: { marginBottom: 20, display: "flex", flexDirection: "column", gap: 6 },
  eventRow: { display: "flex", alignItems: "baseline", gap: 8, fontSize: 13, flexWrap: "wrap" },
  eventMark: { fontWeight: 700, minWidth: 14 },
  eventName: { fontWeight: 600 },
  eventDate: { color: "var(--ink3)", fontSize: 12.5 },
  eventLeft: { color: "var(--mute)", fontSize: 12.5, marginLeft: "auto" },
  calendarPanel: { background: "var(--neutralBg)", border: "1px solid var(--line)", borderRadius: 10, padding: 14, marginTop: 8 },
  calendarTitle: { fontFamily: "'PT Serif', Georgia, serif", fontSize: 15, marginBottom: 8 },
  calendarRow: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 8 },
  calendarLinkInput: {
    width: "100%",
    padding: "5px 8px",
    border: "1px solid var(--line)",
    borderRadius: 10,
    fontSize: 11.5,
    background: "var(--panel2)",
    color: "var(--ink2)",
  },
  calendarSync: { marginTop: 10, display: "flex", flexDirection: "column", gap: 4 },
  calendarSyncOk: { margin: 0, fontSize: 12, color: "var(--green)" },
  calendarSyncError: { margin: 0, fontSize: 12, color: "var(--red)" },
  calendarTrouble: { fontSize: 12, color: "var(--ink3)" },
  calendarTroubleHead: { cursor: "pointer", fontWeight: 600, color: "var(--ink2)" },
  calendarMsg: { fontSize: 12, color: "var(--green)", marginTop: 8 },
  calendarSteps: { margin: "0 0 8px", paddingLeft: 20, fontSize: 12.5, color: "var(--ink2)", lineHeight: 1.6 },
  // Ссылка webcal: выглядит и ведёт себя как кнопка рядом с соседями.
  subscribeLink: {
    display: "inline-block",
    border: "none",
    color: "var(--btnInk)",
    background: "var(--btnBg)",
    borderRadius: 10,
    padding: "5px 10px",
    fontSize: 12,
    fontWeight: 600,
    textDecoration: "none",
  },
  subscribeLinkSecondary: {
    display: "inline-block",
    border: "1px solid var(--line)",
    background: "var(--panel2)",
    borderRadius: 10,
    padding: "5px 10px",
    fontSize: 12,
    fontWeight: 600,
    color: "var(--ink)",
    textDecoration: "none",
  },
  secondaryBtnSmall: {
    border: "1px solid var(--line)",
    background: "var(--panel2)",
    borderRadius: 10,
    padding: "5px 10px",
    fontSize: 12,
    fontWeight: 600,
    color: "var(--ink)",
  },
  linkBtnSmall: {
    border: "none",
    background: "none",
    padding: 0,
    fontSize: 12,
    color: "var(--red)",
    textDecoration: "underline",
  },
  eventsActions: { display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" },
  calendarBtn: { background: "none", border: "none", padding: "0 2px", fontSize: 14, lineHeight: 1 },
  journalEntryHead: { borderTop: "1px solid var(--line2)", paddingTop: 14, marginTop: 18 },
  journalListHead: { fontSize: 11.5, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--mute)", margin: "4px 0 6px" },
  // Переход на другой экран — всегда одинаково: «Все события →».
  goLink: {
    alignSelf: "flex-start", background: "none", border: "none", padding: 0,
    fontSize: 13, color: "var(--accent)", fontWeight: 600, cursor: "pointer", textAlign: "left",
  },
  emptyStrip: {
    display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "6px 22px",
    padding: "4px 2px 16px",
  },
  emptyStripNote: { fontSize: 13, color: "var(--mute)" },
  eventsToggle: {
    alignSelf: "flex-start",
    background: "none",
    border: "none",
    padding: 0,
    fontSize: 12.5,
    color: "var(--accent)",
    fontWeight: 600,
    textDecoration: "underline",
  },
  eventEditRow: {
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
    flexWrap: "wrap",
    marginBottom: 8,
    borderLeft: "3px solid",
    borderRadius: 12,
    padding: "12px 14px",
  },
  eventDays: {
    fontFamily: "'PT Serif', Georgia, serif",
    fontSize: 22,
    lineHeight: 1.1,
    minWidth: 42,
    textAlign: "center",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  },
  eventDaysWord: { fontFamily: "'Golos Text', system-ui, sans-serif", fontSize: 10.5, fontWeight: 600, opacity: 0.85, marginTop: 2 },
  eventAddRow: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
    marginTop: 12,
    paddingTop: 12,
    borderTop: "1px solid var(--line2)",
  },
  eventNameInput: { flex: "3 1 200px", minWidth: 0, padding: "7px 10px", border: "1px solid var(--line)", borderRadius: 10, fontSize: 13, background: "var(--panel2)" },
  eventDateInput: { padding: "5px 6px", border: "1px solid var(--line)", borderRadius: 10, fontSize: 12.5, background: "var(--panel2)" },
  priorityMark: { display: "inline-flex", alignItems: "flex-end", gap: 2, flexShrink: 0, verticalAlign: "-1px" },
  priorityBar: { width: 3, borderRadius: 1.5, display: "block" },
  priorityRow: { display: "flex", gap: 4 },
  priorityBtn: { border: "1px solid", borderRadius: 10, padding: "4px 7px", fontSize: 12, fontWeight: 700, lineHeight: 1.1 },
  tabsRow: { display: "flex", gap: 6, marginTop: 10 },
  tabBtn: { border: "1px solid", borderRadius: 10, padding: "4px 12px", fontSize: 12.5, fontWeight: 600 },
  subHead: { fontFamily: "'PT Serif', Georgia, serif", fontSize: 18, margin: "22px 0 10px" },
  // Сворачиваемые блоки раздела выглядят одинаково — что «Предметы», что
  // «Готовое расписание»: одна рамка, один заголовок, один шеврон.
  foldCard: {
    border: "1px solid var(--line)",
    background: "var(--panel2)",
    borderRadius: 14,
    padding: "10px 14px",
    marginBottom: 12,
  },
  foldCardHead: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
    width: "100%",
    border: "none",
    background: "none",
    padding: 0,
    color: "var(--ink)",
    textAlign: "left",
  },
  foldCardTitle: { fontSize: 13.5, fontWeight: 700 },
  foldCardEmpty: { fontSize: 12.5, color: "var(--ink3)", lineHeight: 1.55, margin: "10px 0 0" },
  lyceumSubjectRow: { display: "flex", alignItems: "center", gap: 8 },
  sundayRow: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 },
  sundayBtn: {
    border: "1px solid var(--line)",
    background: "var(--panel2)",
    borderRadius: 10,
    padding: "5px 12px",
    fontSize: 12.5,
    fontWeight: 600,
    color: "var(--ink2)",
  },
  lyceumNotebooks: { marginBottom: 18, display: "flex", flexDirection: "column", gap: 6 },
  lyceumNotebookBlock: { borderBottom: "1px solid var(--line2)", paddingBottom: 6 },
  lyceumNotebookHead: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    width: "100%",
    background: "none",
    border: "none",
    padding: "4px 0",
    fontSize: 13.5,
    fontWeight: 600,
    textAlign: "left",
  },
  lyceumNotebookBody: { padding: "6px 0 10px 20px" },
  undoStack: {
    position: "fixed",
    left: 12,
    right: 12,
    bottom: 12,
    zIndex: 50,
    display: "flex",
    flexDirection: "column",
    gap: 8,
    alignItems: "center",
    pointerEvents: "none",
  },
  undoToast: {
    width: "100%",
    maxWidth: 560,
    pointerEvents: "auto",
    // Тёмная плашка в обеих темах: при переводе цветов в токены фон уехал на
    // цвет кнопки, а он в ночной теме золотой — светлый текст на нём пропадал.
    background: "var(--rail)",
    color: "var(--railInk)",
    border: "1px solid var(--railActive)",
    borderRadius: 10,
    boxShadow: "0 6px 20px rgba(0,0,0,0.25)",
    overflow: "hidden",
    zIndex: 50,
  },
  undoBarTrack: { height: 3, background: "var(--railActive)" },
  undoBar: { height: "100%", background: "var(--accent)" },
  undoRow: { display: "flex", alignItems: "center", gap: 10, padding: "10px 12px" },
  undoText: { flex: 1, fontSize: 12.5, lineHeight: 1.45 },
  undoCancel: {
    border: "1px solid var(--railInk2)",
    background: "transparent",
    color: "var(--railInk)",
    borderRadius: 10,
    padding: "4px 10px",
    fontSize: 13,
  },
  undoConfirm: { border: "none", background: "var(--green)", color: "#fff", borderRadius: 10, padding: "4px 10px", fontSize: 13 },
  dayPriority: { fontSize: 11, fontWeight: 700, marginLeft: 6 },
  levelChip: {
    border: "1px solid",
    borderRadius: 10,
    fontSize: 10,
    fontWeight: 600,
    padding: "1px 5px",
    marginLeft: 6,
    verticalAlign: "middle",
  },
  fromScheduleBadge: { fontSize: 10.5, color: "var(--red)", border: "1px solid var(--redLine)", borderRadius: 10, padding: "1px 6px" },
  mainPick: {
    border: "1px solid var(--line)",
    background: "none",
    borderRadius: 999,
    padding: "2px 9px",
    fontSize: 11,
    fontWeight: 600,
    color: "var(--ink3)",
    whiteSpace: "nowrap",
  },
  mainBadgeBtn: {
    border: "none",
    background: "none",
    padding: "0 0 0 7px",
    fontSize: 11,
    color: "var(--ink3)",
    fontWeight: 600,
    textDecoration: "underline",
  },
  mainBadge: { fontSize: 11, color: "var(--green)", fontWeight: 600 },
  pastHead: { display: "flex", alignItems: "baseline", gap: 10, margin: "12px 0 6px", flexWrap: "wrap" },
  pastLabel: { fontSize: 11.5, color: "var(--mute)" },
  pastClear: {
    border: "1px solid var(--line)",
    background: "var(--panel2)",
    color: "var(--ink3)",
    borderRadius: 10,
    padding: "4px 10px",
    fontSize: 11.5,
  },
  overallBar: { marginBottom: 24 },
  overallTrack: { height: 9, background: "var(--line)", borderRadius: 999, overflow: "hidden" },
  overallFill: { height: "100%", background: "var(--accent)", borderRadius: 999 },
  overallBtn: { display: "block", width: "100%", border: "none", background: "none", padding: 0, textAlign: "left" },
  overallHint: { color: "var(--accent)", fontWeight: 600, marginLeft: 8, fontSize: 12 },
  overallText: { fontSize: 13, color: "var(--ink2)", marginTop: 6 },
  card: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: "var(--radius)", padding: "22px 24px", marginBottom: 20 },
  // Подпись справа от заголовка карточки: «6 уроков · с 8:30».
  cardMeta: { fontSize: 13, color: "var(--ink3)", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" },
  headAction: {
    display: "inline-flex",
    alignItems: "center",
    gap: 9,
    minHeight: 46,
    padding: "0 20px",
    border: "none",
    borderRadius: 12,
    background: "var(--btnBg)",
    color: "var(--btnInk)",
    fontSize: 14.5,
    fontWeight: 600,
  },
  // Три числа дня. На телефоне они складываются в одну полосу — это делает
  // таблица стилей: там плитки без рамок, в одной карточке, разделены чертой.
  tiles: { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 16, marginBottom: 20 },
  tile: {
    background: "var(--panel)",
    border: "1px solid var(--line)",
    borderRadius: 16,
    padding: "18px 20px",
    display: "flex",
    flexDirection: "column",
    gap: 10,
    minWidth: 0,
  },
  tileLabel: { fontSize: 13.5, color: "var(--ink3)" },
  tileValueRow: { display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" },
  tileValue: { fontFamily: "var(--serif)", fontSize: 34, lineHeight: 1, fontVariantNumeric: "tabular-nums" },
  tileOf: { fontSize: 14, color: "var(--ink3)" },
  tileTrack: { height: 6, borderRadius: 999, background: "var(--line2)", overflow: "hidden" },
  tileFill: { height: "100%", borderRadius: 999 },
  streakDots: { display: "flex", gap: 5 },
  streakDot: { flex: 1, height: 6, borderRadius: 999 },
  // Уроки чуть шире формы: в строке урока время, название, кабинет и учитель.
  gridToday: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(360px, 100%), 1fr))", gap: "0 20px", alignItems: "start" },
  quickGrid: { display: "flex", gap: 12, flexWrap: "wrap", marginTop: 6 },
  quickField: { display: "flex", flexDirection: "column", gap: 6, flex: "1 1 180px", minWidth: 0 },
  quickLabel: { fontSize: 13, color: "var(--ink3)" },
  quickControl: {
    width: "100%",
    minHeight: 44,
    padding: "10px 12px",
    border: "1px solid var(--line)",
    background: "var(--panel2)",
    color: "var(--ink)",
    fontSize: 15,
  },
  quickSubmit: {
    width: "100%",
    minHeight: 46,
    marginTop: 16,
    border: "none",
    borderRadius: 12,
    background: "var(--btnBg)",
    color: "var(--btnInk)",
    fontSize: 15,
    fontWeight: 600,
  },
  // Экран, который сам состоит из карточек: своей коробки ему не нужно.
  plainBlock: { display: "block", marginBottom: 16 },
  muted: { fontSize: 13.5, color: "var(--ink3)", lineHeight: 1.6, marginTop: 0 },
  label: { fontSize: 13, fontWeight: 600, color: "var(--ink2)", display: "block", marginBottom: 6 },
  dailyGoalsBlock: { marginBottom: 18 },
  dailyGoalsRow: { display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 6, marginTop: 4 },
  dailyGoalCell: { display: "flex", flexDirection: "column", alignItems: "center", gap: 3, minWidth: 0 },
  dailyGoalLabel: { fontSize: 11.5, color: "var(--mute)" },
  dailyGoalInput: { width: "100%", padding: "4px 3px", border: "1px solid var(--line)", borderRadius: 10, fontSize: 13, textAlign: "center", background: "var(--panel2)" },
  dailyGoalHours: { fontSize: 11, color: "var(--ink3)" },
  allocGrid: { display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 },
  allocBlock: { marginBottom: 4 },
  allocRow: { display: "flex", alignItems: "center", gap: 10 },
  recTrack: { position: "relative", height: 6, borderRadius: 999, background: "var(--line)", margin: "6px 0 3px" },
  recPlan: { position: "absolute", left: 0, top: 0, bottom: 0, borderRadius: 999 },
  recMark: { position: "absolute", top: -3, bottom: -3, width: 2, background: "var(--gold)", borderRadius: 999 },
  recLabels: { display: "flex", justifyContent: "space-between", fontSize: 11.5, color: "var(--ink3)" },
  dot: { width: 10, height: 10, borderRadius: "50%", flexShrink: 0, display: "inline-block" },
  allocName: { fontSize: 13.5, width: 120, flexShrink: 0 },
  smallNumInput: { width: 52, padding: "7px 9px", border: "1px solid var(--line)", borderRadius: 10, fontSize: 13, background: "var(--panel2)" },
  hUnit: { fontSize: 11.5, color: "var(--mute)", width: 34 },
  capacityBox: { border: "1px solid", borderRadius: 10, padding: "12px 14px", fontSize: 13.5, lineHeight: 1.9, background: "var(--panel2)" },
  skewWarning: {
    marginTop: 10,
    padding: "10px 14px",
    background: "var(--redBg)",
    border: "1px solid var(--redLine)",
    borderRadius: 10,
    fontSize: 13.5,
    color: "var(--red)",
    fontWeight: 600,
  },
  skewWarningInline: {
    marginTop: 8,
    fontSize: 13,
    color: "var(--red)",
    fontWeight: 600,
  },
  warn: { color: "var(--red)", fontWeight: 600 },
  ppfSection: { marginTop: 22, paddingTop: 18, borderTop: "1px solid var(--line2)" },
  balanceHead: { marginBottom: 12 },
  ppfControls: { flex: "1 1 220px", minWidth: 220 },
  select: { padding: "8px 10px", border: "1px solid var(--line)", borderRadius: 10, fontSize: 13, background: "var(--panel2)" },
  svg: { flex: "1 1 280px", maxWidth: 320, background: "var(--panel2)", border: "1px solid var(--line)", borderRadius: 9 },
  // alignItems: start — иначе короткая карточка тянется под высоту соседней
  // по строке сетки и кажется раскрытой и пустой.
  emptyList: { margin: "0 0 12px", paddingLeft: 20, fontSize: 13.5, lineHeight: 1.7, color: "var(--ink2)" },
  subjGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14, alignItems: "start" },
  subjCard: {
    background: "var(--panel2)",
    border: "1px solid",
    borderRadius: 14,
    padding: "16px 18px",
    transition: "transform 0.15s ease",
    // Карточка объявлена контейнером: строка урока переносится по её ширине,
    // а не по ширине экрана — в сетке из трёх колонок это разные вещи.
    containerType: "inline-size",
  },
  subjHeader: { display: "flex", alignItems: "center", gap: 8, flex: 1, background: "none", border: "none", padding: 0, textAlign: "left" },
  subjHeaderRow: { display: "flex", alignItems: "center", gap: 4 },
  addSubjectRow: { display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" },
  addSubjectInput: { flex: "1 1 240px", padding: "7px 10px", border: "1px solid var(--line)", borderRadius: 10, fontSize: 13.5, background: "var(--panel2)" },
  // alignItems: start — иначе день без уроков вытягивается под высоту дня с
  // экзаменом и выглядит пустой коробкой во весь столбец.
  scheduleGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(min(220px, 100%), 1fr))",
    gap: 12,
    marginTop: 16,
    alignItems: "start",
  },
  scheduleDayBlock: { background: "var(--panel2)", border: "1px solid var(--line)", borderRadius: 14, padding: "14px 16px" },
  scheduleDayHeader: { fontSize: 13.5, fontWeight: 700, marginBottom: 8 },
  // Сегодняшний день видно и в общей сетке: искать его глазами по датам не нужно.
  scheduleDayToday: { borderColor: "var(--accent)", boxShadow: "inset 0 0 0 1px var(--accent)" },
  todayMark: {
    marginLeft: 7,
    fontSize: 10.5,
    fontWeight: 700,
    letterSpacing: "0.05em",
    textTransform: "uppercase",
    color: "var(--accent)",
  },
  todayDayWrap: { marginBottom: 16 },
  dayEntriesList: { display: "flex", flexDirection: "column", gap: 6 },
  // Задания живут под своим уроком: «к какому уроку» — это первое, что
  // спрашивают, а раньше они лежали отдельным списком и связи не было видно.
  lessonTasks: { display: "flex", flexDirection: "column", gap: 3, margin: "3px 0 2px 14px" },
  lessonTaskRow: { display: "flex", alignItems: "flex-start", gap: 7, fontSize: 12.5 },
  lessonTaskCheck: { marginTop: 2, flexShrink: 0 },
  lessonTaskBody: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 1 },
  lessonTaskMetaRow: { display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" },
  lessonTasksFold: {
    alignSelf: "flex-start", border: "none", background: "none", padding: "1px 0", fontSize: 11.5,
    color: "var(--mute)", cursor: "pointer",
  },
  lessonTasksFolded: {
    display: "block", margin: "3px 0 2px 14px", border: "none", background: "none", padding: "1px 0",
    fontSize: 12, color: "var(--ink3)", cursor: "pointer", textAlign: "left",
  },
  // Длинное задание — в две строки, пока его не развернут.
  lessonTaskFolded: { display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" },
  lessonTaskMore: {
    border: "none", background: "none", padding: 0, fontSize: 11.5, color: "var(--accent)",
    fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
  },
  lessonTaskText: { color: "var(--ink2)", overflowWrap: "break-word" },
  lessonTaskMeta: { fontSize: 11.5, color: "var(--mute)", whiteSpace: "nowrap" },
  lessonTaskForm: { display: "flex", alignItems: "center", gap: 6, margin: "4px 0 6px 14px", flexWrap: "wrap" },
  lessonTaskInput: {
    flex: "1 1 180px",
    minWidth: 0,
    border: "1px solid var(--line)",
    background: "var(--panel2)",
    borderRadius: 10,
    padding: "6px 9px",
    fontSize: 12.5,
    resize: "none",
  },
  lessonTaskMinutes: {
    width: 62,
    border: "1px solid var(--line)",
    background: "var(--panel2)",
    borderRadius: 10,
    padding: "6px 8px",
    fontSize: 12.5,
  },
  // Строка одного дня: время, предмет, подробности и справа — важность с
  // «изменить». В узкой колонке недели те же данные идут в три строки, но
  // здесь ширины хватает, и день умещается в экран целиком.
  listRow: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", width: "100%" },
  listFacts: { flex: "1 1 220px", minWidth: 0, fontSize: 12, color: "var(--ink3)", overflowWrap: "anywhere" },
  listRight: { display: "flex", alignItems: "center", gap: 10, marginLeft: "auto", flexShrink: 0 },
  mutedSmall: { fontSize: 12, color: "var(--mute)" },
  scheduleEntry: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    borderLeft: "3px solid",
    borderRadius: 10,
    padding: "8px 10px",
    marginBottom: 8,
  },
  // В сетке карточка сама себе строка, поэтому нижний отступ лишний.
  rowTop: { display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" },
  rowTime: { fontSize: 12.5, color: "var(--ink3)", fontVariantNumeric: "tabular-nums" },
  rowName: { fontSize: 13.5, fontWeight: 700, minWidth: 0, overflowWrap: "anywhere" },
  rowFacts: { fontSize: 11.5, color: "var(--ink3)", lineHeight: 1.45, overflowWrap: "anywhere" },
  rowBottom: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 2 },
  // Дальний экзамен: до даты больше недели — полупрозрачно, внизу дня.
  scheduleFar: { opacity: 0.55 },
  scheduleFolded: {
    flexDirection: "row", alignItems: "center", gap: 6, width: "100%", textAlign: "left",
    padding: "5px 8px", cursor: "pointer", font: "inherit", color: "var(--ink3)",
  },
  foldedName: { fontSize: 12, fontWeight: 600, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: "1 1 auto" },
  foldedDate: { fontSize: 11, color: "var(--mute)", whiteSpace: "nowrap" },
  // Шапка карточки урока: время слева, действия справа.
  rowHead: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, minHeight: 26 },
  rowActions: { display: "flex", alignItems: "center", gap: 4, flexShrink: 0 },
  rowTaskBtn: {
    display: "inline-flex", alignItems: "center", gap: 3, height: 26, padding: "0 8px",
    border: "1px solid var(--line)", borderRadius: 8, background: "transparent",
    fontSize: 11.5, color: "var(--ink3)", whiteSpace: "nowrap", cursor: "pointer",
  },
  rowTaskPlus: { fontSize: 14, lineHeight: 1, marginTop: -1 },
  rowIconBtn: {
    display: "inline-flex", alignItems: "center", justifyContent: "center", width: 26, height: 26, padding: 0,
    border: "1px solid var(--line)", borderRadius: 8, background: "transparent",
    color: "var(--ink3)", cursor: "pointer",
  },
  rowEdit: {
    marginLeft: "auto",
    border: "none",
    background: "none",
    padding: 0,
    fontSize: 11.5,
    color: "var(--ink3)",
    textDecoration: "underline",
  },
  rowDone: { border: "none", color: "var(--btnInk)", background: "var(--btnBg)", borderRadius: 10, minHeight: 34, padding: "0 14px", fontSize: 12.5, fontWeight: 600 },
  rowDelete: {
    marginLeft: "auto",
    border: "none",
    background: "none",
    padding: 0,
    fontSize: 11.5,
    color: "var(--red)",
    textDecoration: "underline",
  },
  scheduleEntryCompact: { marginBottom: 0, gap: 3, padding: "5px 8px" },
  scheduleDayTop: { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, flexWrap: "wrap" },
  scheduleDayActions: { display: "flex", gap: 10, flexWrap: "wrap" },
  examToggle: {
    background: "none",
    border: "none",
    padding: 0,
    fontSize: 11.5,
    color: "var(--accent)",
    fontWeight: 600,
    textDecoration: "underline",
  },
  examForm: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    padding: "8px 8px 10px",
    marginBottom: 8,
    border: "1px dashed var(--gold)",
    borderRadius: 10,
    background: "var(--warmBg)",
  },
  // Экзамен выделяется рамкой: цвет заливки уже занят под важность. Границы заданы
  // по сторонам, иначе сокращённое `border` сбрасывало бы толстую полосу слева.
  scheduleExam: {
    borderTop: "1px solid var(--redStrong)",
    borderRight: "1px solid var(--redStrong)",
    borderBottom: "1px solid var(--redStrong)",
    borderLeftColor: "var(--redStrong)",
  },
  examRow: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 2 },
  examKindPicker: { display: "flex", gap: 4 },
  examKindOn: {
    border: "1px solid var(--redStrong)",
    background: "var(--redStrong)",
    color: "var(--btnInk)",
    borderRadius: 10,
    padding: "2px 8px",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  examKindOff: {
    // Невыбранное — серое: иначе два значка рядом читаются как две пометки сразу.
    border: "1px solid var(--line)",
    background: "var(--panel)",
    color: "var(--mute)",
    borderRadius: 10,
    padding: "2px 8px",
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  examDateInput: { padding: "5px 7px", border: "1px solid var(--line)", borderRadius: 10, fontSize: 12, background: "var(--panel2)" },
  examLink: { fontSize: 12, color: "var(--blue)" },
  // Название переносится на несколько строк, значки важности остаются у первой.
  scheduleSubjectRow: { display: "flex", alignItems: "flex-start", gap: 6, flexWrap: "wrap" },
  priorityLegend: { fontSize: 11.5, color: "var(--ink3)", lineHeight: 1.5, marginBottom: 10 },
  scheduleSelect: { padding: "7px 9px", border: "1px solid var(--line)", borderRadius: 10, fontSize: 12.5, background: "var(--panel2)", width: "100%" },
  scheduleSubjectInput: {
    flex: "1 1 120px",
    minWidth: 0,
    padding: "4px 6px",
    border: "1px solid var(--line)",
    borderRadius: 10,
    fontSize: 12.5,
    background: "var(--panel2)",
    fontWeight: 600,
  },
  scheduleTimeRow: { display: "flex", alignItems: "center", gap: 4 },
  scheduleTimeInput: { padding: "5px 6px", border: "1px solid var(--line)", borderRadius: 10, fontSize: 12, background: "var(--panel2)", width: 82 },
  scheduleRoomInput: { padding: "7px 9px", border: "1px solid var(--line)", borderRadius: 10, fontSize: 12.5, background: "var(--panel2)" },
  scheduleTeacherInput: { padding: "7px 9px", border: "1px solid var(--line)", borderRadius: 10, fontSize: 12.5, background: "var(--panel2)" },
  addScheduleRow: { display: "flex", flexDirection: "column", gap: 4, marginTop: 6, paddingTop: 6, borderTop: "1px dashed var(--line)" },
  subjName: { fontSize: 15.5, fontWeight: 600, flex: 1, color: "var(--ink)" },
  subjPct: { fontSize: 12.5, color: "var(--ink3)" },
  miniTrack: { height: 6, background: "var(--line)", borderRadius: 999, marginTop: 8, overflow: "hidden" },
  miniFill: { height: "100%", borderRadius: 999 },
  topicList: { marginTop: 12, display: "flex", flexDirection: "column", gap: 5, maxHeight: 420, overflowY: "auto" },
  topicBlock: { borderTop: "1px solid var(--line2)" },
  topicRow: { display: "flex", alignItems: "center", gap: 12, minHeight: 50, padding: "4px 0", fontSize: 15 },
  topicLabel: { display: "flex", alignItems: "center", gap: 8, cursor: "pointer", flex: "1 1 160px", minWidth: 0 },
  topicDone: { textDecoration: "line-through", color: "var(--mute)" },
  durationBox: { display: "inline-flex", alignItems: "center", gap: 4 },
  durationInput: { width: 44, padding: "5px 7px", border: "1px solid var(--line)", borderRadius: 10, fontSize: 12, background: "var(--panel2)" },
  notesToggle: { background: "none", border: "1px solid var(--line)", borderRadius: 10, fontSize: 11.5, padding: "3px 7px", color: "var(--ink2)" },
  colorPick: {
    width: 24,
    height: 20,
    padding: 0,
    border: "1px solid var(--line)",
    borderRadius: 10,
    background: "var(--panel2)",
    flexShrink: 0,
  },
  subjRemoveBtn: {
    border: "none",
    background: "none",
    color: "var(--red)",
    fontSize: 20,
    lineHeight: 1,
    // Крестик на телефоне должен попадаться под палец, а не под пиксель.
    padding: "6px 10px",
    marginRight: -6,
  },
  removeBtn: { marginLeft: 2, background: "none", border: "none", color: "var(--red)", fontSize: 16, lineHeight: 1, padding: "0 4px" },
  notesPanel: { margin: "0 0 10px 56px", padding: "12px 14px", background: "var(--neutralBg)", borderRadius: 12, display: "flex", flexDirection: "column", gap: 8 },
  noteBlock: { marginBottom: 6 },
  noteChevron: { background: "none", border: "none", padding: 0, fontSize: 11, color: "var(--mute)", width: 12 },
  noteHasBody: { fontSize: 12, color: "var(--accent)" },
  noteBody: { display: "flex", flexDirection: "column", gap: 6, margin: "6px 0 10px 14px" },
  noteRow: { display: "flex", alignItems: "center", gap: 10, fontSize: 14, minHeight: 36 },
  noteDate: { color: "var(--mute)", width: 64, flexShrink: 0, fontSize: 13 },
  noteText: { flex: 1, color: "var(--ink2)" },
  noteMins: { color: "var(--ink3)", width: 46, flexShrink: 0, textAlign: "right" },
  noteForm: { display: "flex", alignItems: "center", gap: 6, marginTop: 6, flexWrap: "wrap" },
  noteInput: { flex: "1 1 180px", padding: "7px 10px", border: "1px solid var(--line)", borderRadius: 10, fontSize: 12.5, background: "var(--panel2)" },
  addBtnSmall: { border: "none", color: "var(--btnInk)", background: "var(--btnBg)", borderRadius: 10, minHeight: 36, padding: "0 14px", fontSize: 13, fontWeight: 600 },
  addTopicRow: { display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" },
  addTopicInput: { flex: "1 1 220px", minHeight: 44, padding: "0 14px", border: "1px dashed var(--line)", borderRadius: 12, fontSize: 14.5, background: "transparent", color: "var(--ink)" },
  addTopicUrlInput: { flex: "1 1 200px", minHeight: 44, padding: "0 14px", border: "1px solid var(--line)", borderRadius: 12, fontSize: 14.5, background: "var(--panel2)", color: "var(--ink)" },
  addBtn: { border: "none", color: "var(--btnInk)", background: "var(--btnBg)", borderRadius: 10, minHeight: 38, padding: "0 16px", fontSize: 13.5, fontWeight: 600 },
  calendarWrap: { marginBottom: 18 },
  calHeader: { display: "flex", alignItems: "center", justifyContent: "center", gap: 16, marginBottom: 8 },
  calNavBtn: { background: "none", border: "1px solid var(--line)", borderRadius: 10, width: 28, height: 28, fontSize: 15, color: "var(--ink)" },
  // capitalize поднимал и «г.» в «Г.», поэтому заглавная ставится только первой букве.
  calMonthLabel: { fontSize: 14.5, fontWeight: 600, minWidth: 150, textAlign: "center" },
  calWeekdays: { display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 4 },
  calWeekday: { fontSize: 11, color: "var(--mute)", textAlign: "center" },
  calGrid: { display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 },
  calCell: {
    position: "relative",
    aspectRatio: "1",
    border: "none",
    borderRadius: 10,
    fontSize: 12.5,
    fontWeight: 600,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    background: "var(--neutralBg)",
    color: "var(--ink)",
  },
  calFill: { position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 0 },
  calRing: { position: "absolute", inset: 0, border: "2px solid var(--ink)", borderRadius: 10, zIndex: 3, pointerEvents: "none" },
  calExamRing: {
    position: "absolute",
    inset: 0,
    border: "2px solid var(--redStrong)",
    borderRadius: 10,
    zIndex: 2,
    pointerEvents: "none",
  },
  calDayNum: { position: "relative", zIndex: 1 },
  calLegend: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: 12, color: "var(--ink3)", margin: "12px 0 8px" },
  calLegendItem: { display: "flex", alignItems: "center", gap: 5 },
  calLegendBox: { width: 12, height: 12, borderRadius: 3 },
  calLegendScale: { flex: "1 1 120px", height: 10, borderRadius: 999, minWidth: 80 },
  hwDot: { position: "absolute", bottom: 3, width: 4, height: 4, borderRadius: "50%", background: "var(--accent)", zIndex: 1 },
  // Точки сидят над заливкой, поэтому подложка им больше не нужна.
  lessonDots: { position: "absolute", top: 3, display: "flex", gap: 2, alignItems: "center", zIndex: 1 },
  lessonDot: { width: 5, height: 5, borderRadius: "50%" },
  dayDetail: { background: "var(--panel2)", border: "1px solid var(--line)", borderRadius: 14, padding: "14px 16px", marginBottom: 16 },
  homeworkBlock: { marginTop: 12, paddingTop: 10, borderTop: "1px dashed var(--line)" },
  homeworkTitle: { fontSize: 13, fontWeight: 700, marginBottom: 6 },
  homeworkSubjectBlock: { marginBottom: 10 },
  homeworkSubjectName: { fontSize: 12.5, fontWeight: 700, marginBottom: 3 },
  homeworkItemBlock: { marginBottom: 4 },
  homeworkItemRow: { display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, padding: "3px 0" },
  homeworkText: { flex: 1, color: "var(--ink2)" },
  homeworkAddRow: { display: "flex", alignItems: "center", gap: 6, marginTop: 4, flexWrap: "wrap" },
  homeworkInput: { flex: "1 1 160px", padding: "7px 10px", border: "1px solid var(--line)", borderRadius: 10, fontSize: 12.5, background: "var(--panel2)" },
  homeworkMinutesInput: { width: 46, padding: "4px 5px", border: "1px solid var(--line)", borderRadius: 10, fontSize: 12, background: "var(--panel2)" },
  attachBtn: { background: "none", border: "none", fontSize: 13, padding: "0 2px" },
  attachmentsRow: { marginLeft: 24, marginBottom: 4, minWidth: 0 },
  // Строка напоминания у домашнего задания. Раньше звалась reminderRow — так же,
  // как строка напоминания о занятиях на «Сегодня», и в одном объекте
  // выигрывала она: у той карточки был чужой отступ слева.
  hwReminderRow: { display: "flex", alignItems: "center", gap: 6, marginLeft: 24, marginBottom: 6 },
  reminderSelect: { padding: "2px 4px", border: "1px solid var(--line)", borderRadius: 10, fontSize: 11.5, background: "var(--panel2)" },
  reminderDaysInput: { width: 40, padding: "2px 4px", border: "1px solid var(--line)", borderRadius: 10, fontSize: 11.5, background: "var(--panel2)" },
  hwBanner: {
    display: "flex",
    alignItems: "stretch",
    gap: 12,
    background: "var(--warmBg)",
    border: "1px solid var(--warmLine)",
    borderRadius: 16,
    padding: "14px 18px",
    marginBottom: 20,
  },
  hwBannerBody: { flex: 1, minWidth: 0 },
  hwBannerTitle: {
    fontFamily: "'PT Serif', Georgia, serif",
    fontSize: 16,
    fontWeight: 700,
    marginBottom: 6,
    color: "var(--warmInk)",
  },
  hwBannerRow: { fontSize: 13.5, color: "var(--ink)", marginBottom: 3, lineHeight: 1.45 },
  hwBannerSubject: { fontWeight: 700 },
  hwBannerMinutes: { color: "var(--mute)" },
  hwBannerDue: { color: "var(--redStrong)", fontWeight: 600 },
  // Знак ростом во всю плашку: напоминание должно цеплять взгляд, а не теряться.
  hwBannerMark: {
    display: "flex",
    alignItems: "center",
    fontFamily: "'PT Serif', Georgia, serif",
    fontSize: 46,
    lineHeight: 1,
    fontWeight: 700,
    color: "var(--gold)",
    flexShrink: 0,
  },
  // Без capitalize: он поднимал заглавные во всей строке — «12 Сентября 2026 Г. — 0 Ч Из 4 Ч Цели».
  dayDetailTitle: { fontSize: 13.5, fontWeight: 600, marginBottom: 8 },
  journalForm: { display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16, alignItems: "center" },
  textInput: { flex: "1 1 200px", padding: "8px 10px", border: "1px solid var(--line)", borderRadius: 10, fontSize: 13.5, background: "var(--panel2)" },
  journalList: { display: "flex", flexDirection: "column", gap: 4, maxHeight: 320, overflowY: "auto" },
  // Длинная заметка раздвигала строку и уносила крестик за край экрана.
  journalRow: { display: "flex", alignItems: "center", gap: 10, fontSize: 13.5, padding: "7px 8px", borderBottom: "1px solid var(--line2)", flexWrap: "wrap" },
  jDate: { color: "var(--mute)", width: 78, flexShrink: 0 },
  jSubj: { width: 100, flexShrink: 0, fontWeight: 600 },
  jHours: { width: 44, flexShrink: 0, color: "var(--ink3)" },
  jNote: { flex: "1 1 120px", minWidth: 0, color: "var(--ink2)", overflowWrap: "anywhere" },
  saveErr: { fontSize: 12, color: "var(--red)", marginTop: 10, lineHeight: 1.6 },
  backupHint: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 22 },
  pendingBadge: { fontSize: 11.5, color: "var(--accent)", fontWeight: 600 },
  themeRow: { display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 },
  themeBtn: { border: "1px solid", borderRadius: 10, padding: "6px 14px", fontSize: 13, fontWeight: 600 },
  eggRow: { display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 },
  eggBtn: {
    border: "1px solid var(--line)",
    background: "var(--panel2)",
    color: "var(--ink2)",
    borderRadius: 999,
    padding: "6px 13px",
    fontSize: 12.5,
    fontWeight: 600,
  },
  bgRow: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 14 },
  themeHours: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 13, marginBottom: 8 },
  versionRow: { fontSize: 11, color: "var(--mute)", textAlign: "center", marginTop: 26, lineHeight: 1.5 },
  syncRow: { display: "flex", alignItems: "center", gap: 10, marginTop: 20, paddingTop: 12, borderTop: "1px solid var(--line)" },
  syncBtn: {
    border: "1px solid var(--line)",
    background: "var(--panel2)",
    borderRadius: 10,
    padding: "5px 10px",
    fontSize: 12.5,
    color: "var(--ink)",
  },
  backupTextarea: {
    width: "100%",
    minHeight: 90,
    padding: "8px 10px",
    border: "1px solid var(--line)",
    borderRadius: 10,
    fontSize: 11.5,
    fontFamily: "monospace",
    background: "var(--panel2)",
    resize: "vertical",
    boxSizing: "border-box",
  },
  backupRow: { display: "flex", alignItems: "center", gap: 10, marginTop: 6, marginBottom: 4, flexWrap: "wrap" },
};

