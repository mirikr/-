import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { get as storageGet, set as storageSet, onAuthChange, cloudAvailable } from "./storage.js";
import { stampState, mergeSerialized } from "./sync-state.js";
import Notebook, { Attachments } from "./notebook.jsx";
import RichText from "./rich-text.jsx";
import Collapsible from "./collapsible.jsx";
import HoursChart from "./hours-chart.jsx";
import { buildIcs } from "./calendar.js";
import { newFeedToken, publishFeed, feedUrls, removeFeed } from "./calendar-feed.js";
import AutoGrow from "./auto-grow.jsx";
import CalendarHowTo from "./calendar-howto.jsx";
import { Rail, ScreenHead, TabBar, Countdowns } from "./shell.jsx";
import BalanceChart from "./balance-chart.jsx";
import InstallHint from "./install-hint.jsx";
import CloudPanel from "./cloud-panel.jsx";
import { currentUser, signOut, authReady, cloudConfigured } from "./supabase.js";
import { THEME_CSS, useThemeMode } from "./theme.js";
import ReleaseNotesDialog from "./release-notes.jsx";
import IntroDialog from "./intro-dialog.jsx";
import { platform as detectPlatform } from "./device.js";
import { attachFile, attachmentUrl, removeAttachment as deleteAttachment } from "./files.js";
import SchedulePreset from "./lyceum-preset.jsx";
import ExamPreset from "./lyceum-exams-panel.jsx";
import { KT_PRESET_ID, DEFAULT_KT } from "./lyceum-exams-10.js";
import { PRESET_ID } from "./lyceum-schedule-10.js";

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
  { value: 1, mark: "!", label: "не особо важно", color: "var(--mute)", onDark: "#B9B2A0", strong: "var(--ink3)", tint: "var(--neutralBg)" },
  { value: 2, mark: "⚡", label: "важно", color: "var(--accent)", onDark: "#D9BE6A", strong: "var(--gold)", tint: "var(--warmBg)" },
  { value: 3, mark: "⚡⚡⚡", label: "очень важно", color: "var(--red)", onDark: "#D98A8A", strong: "var(--redStrong)", tint: "var(--redBg)" },
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
const INTRO_KEY = "planner-intro-version";
// Про что именно рассказываем. Привязка к номеру приложения всплывала бы с
// каждым обновлением, а рассказ один и тот же.
const INTRO_VERSION = "0.6.0-schedule";
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

const SCHEDULE_EVENT_PREFIX = "sch-ev:";

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

// Запись, до которой больше недели, тут же исчезает из сетки — без объяснения
// это выглядит как потерянная работа.
function examAddedNote(entry) {
  const olympiad = entry.examKind === "olympiad";
  const what = olympiad ? "Олимпиада" : "Экзамен";
  const added = olympiad ? "добавлена" : "добавлен";
  if (!entry.date) {
    return `${what} ${added}. Впишите дату — запись сама встанет на нужный день недели.`;
  }
  const when = `${formatEventDate(entry.date)} (${WEEKDAY_LABELS[weekdayKeyFromDate(entry.date)]})`;
  const left = daysUntilDate(entry.date);
  if (left < 0) return `${what} ${added}: ${when} — эта дата уже прошла.`;
  if (left >= EXAM_SCHEDULE_DAYS) {
    return `${what} ${added}: ${when}. В расписании появится за неделю до даты, а отсчёт до неё уже идёт в событиях наверху.`;
  }
  return `${what} ${added}: ${when}.`;
}

function eventIcsItem(event) {
  const info = priorityInfo(event.priority);
  return {
    uid: event.id,
    title: `${info.mark} ${event.name}`,
    date: event.date,
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

function daysWord(n) {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return "дней";
  if (last === 1) return "день";
  if (last >= 2 && last <= 4) return "дня";
  return "дней";
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
  const [subjectTab, setSubjectTab] = useState({});
  const [openLyceumNotebook, setOpenLyceumNotebook] = useState(null);
  const [openSubject, setOpenSubject] = useState(null);
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
  // Событие, по которому считается план. Пусто — берётся самое приоритетное:
  // так было всегда, и для большинства этого достаточно.
  const [mainEventId, setMainEventId] = useState("");
  const [homework, setHomework] = useState([]);
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
  const [cloudPending, setCloudPending] = useState(false);
  const [cloudOn, setCloudOn] = useState(false);
  const [showBackup, setShowBackup] = useState(false);
  // Токен подписки хранится вместе с остальными данными: он один на все устройства.
  const { mode, setMode, theme, nightWindow, setNightWindow } = useThemeMode();
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
          const parsed = JSON.parse(res.value);
          syncSnapshot.current = parsed;
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
          if (parsed.mainEventId !== undefined) setMainEventId(parsed.mainEventId);
          if (parsed.openSections) setOpenSections(parsed.openSections);
          if (parsed.homework) setHomework(parsed.homework);
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
        const stamped = stampState(syncSnapshot.current, {
          data,
          journal,
          budget,
          events,
          notebooks,
          customSubjects,
          hiddenSubjects,
          subjectColors,
          showSunday,
          calendarToken,
          lyceumSchedule,
          presetChoices,
          examPicks,
          mainEventId,
          openSections,
          homework,
        });
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
  }, [data, journal, budget, events, notebooks, customSubjects, hiddenSubjects, subjectColors, showSunday, calendarToken, lyceumSchedule, presetChoices, examPicks, mainEventId, openSections, homework, loaded]);

  // Считать цель дня приходится на каждый столбец графика, поэтому функция должна
  // меняться только вместе с бюджетом, иначе график пересчитывается на каждый рендер.
  const goalForDate = useCallback((date) => goalHoursForDate(budget, date), [budget]);

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
          description: [e.place, e.start && e.end ? e.start + "–" + e.end : "", e.url].filter(Boolean).join(" · "),
        })),
    [lyceumSchedule]
  );

  const allEvents = useMemo(() => [...events, ...scheduleEvents], [events, scheduleEvents]);

  const upcomingEvents = useMemo(
    () => allEvents.filter((e) => e.date && daysUntilDate(e.date) >= 0).sort((a, b) => a.date.localeCompare(b.date)),
    [allEvents]
  );

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

  const showUndo = useCallback((message, restore, finalize) => {
    const id = "undo-" + Date.now() + "-" + Math.round(Math.random() * 10000);
    setUndoQueue((prev) => [...prev, { id, message, restore, finalize }]);
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
      notes: (t.notes || []).map((n) => (n.id === noteId ? { ...n, ...patch } : n)),
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
      { data, journal, budget, events, notebooks, customSubjects, hiddenSubjects, subjectColors, showSunday, calendarToken, lyceumSchedule, presetChoices, examPicks, mainEventId, openSections, homework },
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
      if (parsed.mainEventId !== undefined) setMainEventId(parsed.mainEventId);
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

  // Пульс занятий: сколько записано сегодня, сколько дней подряд идут занятия и
  // сколько прошло с последней записи. Нужен для короткого напоминания на
  // «Сегодня» — без укоров, просто «вернитесь, это недолго».
  const studyPulse = useMemo(() => {
    const byDate = {};
    journal.forEach((e) => {
      byDate[e.date] = (byDate[e.date] || 0) + (Number(e.hours) || 0);
    });
    const dates = Object.keys(byDate).filter((d) => byDate[d] > 0).sort();
    const todayHours = Math.round((byDate[todayStr()] || 0) * 10) / 10;
    if (!dates.length) return { todayHours, daysSince: null, streak: 0 };

    const last = dates[dates.length - 1];
    const daysSince = Math.max(0, -daysUntilDate(last));

    // Серия считается назад от последнего дня с записями: пропуск её обрывает.
    let streak = 0;
    const cursor = new Date(last + "T00:00:00");
    while (byDate[ymd(cursor)] > 0) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
    return { todayHours, daysSince, streak };
  }, [journal]);

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

  // В календарь уходит всё, у чего есть дата: события, экзамены из расписания и
  // домашние задания. Расписание уроков — нет: недельная сетка живёт в приложении.
  const calendarIcs = useMemo(() => {
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
    return buildIcs(items, { name: "Ежедневник лицеиста", refreshHours: 1 });
  }, [allEvents, homework, studyReminder]);

  async function enableCalendarFeed() {
    setCalendarBusy(true);
    setCalendarMsg("");
    const token = calendarToken || newFeedToken();
    const res = await publishFeed(token, calendarIcs);
    setCalendarBusy(false);
    if (!res.ok) {
      setCalendarMsg(res.error);
      return;
    }
    publishedIcs.current = calendarIcs;
    setCalendarToken(token);
    setCalendarLinks(await feedUrls(token));
    setCalendarMsg("Подписка готова.");
  }

  async function refreshCalendarFeed() {
    if (!calendarToken) return;
    setCalendarBusy(true);
    const res = await publishFeed(calendarToken, calendarIcs);
    setCalendarBusy(false);
    publishedIcs.current = res.ok ? calendarIcs : publishedIcs.current;
    setCalendarMsg(res.ok ? "Обновлено." : res.error);
  }

  // Файл подписки обновляется сам, когда меняется то, что в нём лежит: иначе
  // календарь в телефоне показывал бы вчерашние даты.
  useEffect(() => {
    if (!loaded || !calendarToken || !cloudOn) return;
    if (publishedIcs.current === calendarIcs) return;
    const timer = setTimeout(async () => {
      const res = await publishFeed(calendarToken, calendarIcs);
      if (res.ok) publishedIcs.current = calendarIcs;
    }, 5000);
    return () => clearTimeout(timer);
  }, [calendarIcs, calendarToken, cloudOn, loaded]);

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

  function setNotebook(ownerKey, blocks) {
    setNotebooks((prev) => ({ ...prev, [ownerKey]: blocks }));
  }

  // Пока воскресенье скрыто, его уроки не участвуют в дневнике и домашних заданиях,
  // но остаются в данных: вернули день — вернулись и уроки.
  const activeSchedule = useMemo(
    () => (showSunday ? lyceumSchedule : lyceumSchedule.filter((e) => e.day !== "sun")),
    [lyceumSchedule, showSunday]
  );

  const scheduleDays = useMemo(() => (showSunday ? [...LYCEUM_DAYS, "sun"] : LYCEUM_DAYS), [showSunday]);

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
    const subjectData = data[id];
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
          setData((prev) => ({ ...prev, [id]: subjectData }));
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
          ...((subjectData && subjectData.topics) || []),
          ...((subjectData && subjectData.custom) || []),
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

  const presetExams = useMemo(() => lyceumSchedule.filter((e) => e.preset === KT_PRESET_ID).length, [lyceumSchedule]);

  function applyExams(entries) {
    setLyceumSchedule((prev) => [...prev.filter((e) => e.preset !== KT_PRESET_ID), ...entries]);
    if (entries.some((e) => e.day === "sun")) setShowSunday(true);
  }

  function clearExams() {
    setLyceumSchedule((prev) => prev.filter((e) => e.preset !== KT_PRESET_ID));
  }

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
  }

  function updateScheduleEntry(id, patch) {
    setLyceumSchedule((prev) =>
      prev.map((e) => {
        if (e.id !== id) return e;
        const next = { ...e, ...patch };
        if (next.kind === "exam" && patch.date !== undefined) {
          // Дата — единственный источник правды о дне недели для экзамена.
          const day = weekdayKeyFromDate(patch.date);
          if (day) next.day = day;
        }
        return next;
      })
    );
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

  function addHomework(date, subjectName, text, minutes) {
    if (!text.trim()) return;
    const id = "hw-" + Date.now() + "-" + Math.round(Math.random() * 1000);
    setHomework((prev) => [
      ...prev,
      { id, date, subjectName, text: text.trim(), minutes: Math.max(0, Number(minutes) || 0), done: false, attachments: [] },
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

  function removeAttachment(hwId, att) {
    deleteAttachment(att).catch(() => {});
    setHomework((prev) =>
      prev.map((h) => (h.id === hwId ? { ...h, attachments: (h.attachments || []).filter((a) => a !== att) } : h))
    );
  }



  // Рекомендация: недельный ресурс делится между предметами по тому, сколько на
  // каждом осталось работы. Это не «правильный» план, а точка отсчёта — от неё
  // видно, где вы сознательно отошли от равномерного темпа.
  const recommendedHours = useMemo(() => {
    const remaining = {};
    let total = 0;
    ALL_SUBJECTS.forEach((s) => {
      const list = [...data[s.id].topics, ...data[s.id].custom];
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
    journal.forEach((e) => {
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
  }, [journal, budget, ALL_SUBJECTS, stats, recommendedHours]);

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
    const own = ALL_SUBJECTS.map((s) => ({ key: "subj:" + s.id, name: s.name, color: s.color }));
    const lyceum = lyceumSubjectNames.map((name) => ({ key: "lyceum:" + name, name, color: lyceumColorOf(name) }));
    return own.concat(lyceum);
  }, [ALL_SUBJECTS, lyceumSubjectNames, subjectColors]);

  const currentNotebook = notebookOwners.find((o) => o.key === notebookOwner) || notebookOwners[0] || null;

  const weeklyBudget = weeklyBudgetHours(budget);
  const navItems = [
    { key: "today", label: "Сегодня", hint: todayLessons.length ? String(todayLessons.length) : "" },
    { key: "events", label: "События", hint: upcomingEvents.length ? String(upcomingEvents.length) : "" },
    { key: "budget", label: "Распределение", hint: Math.round(weeklyBudget) + " ч" },
    { key: "study", label: "Подготовка", hint: stats.totalAll ? stats.overallPct + "%" : "" },
    { key: "school", label: "Лицей КЭО", short: "Лицей", hint: "" },
    { key: "journal", label: "Дневник", hint: weeklyJournalHours ? weeklyJournalHours + " ч" : "" },
    { key: "notes", label: "Тетради", hint: "" },
    { key: "settings", label: "Синхронизация", short: "Облако", hint: saveErr ? "!" : "" },
  ];

  const SCREEN_TEXT = {
    today: ["Сегодня", "Что сегодня в лицее, сколько времени уже записано и что горит по срокам"],
    events: ["События", "Приоритет решает, до какого события считается план"],
    budget: [
      "Распределение времени (КПВ)",
      "КПВ — и кривая производственных возможностей из экономики, и коэффициент полезного времени: " +
        "сначала бюджет дня, потом предметы",
    ],
    study: ["Самостоятельная подготовка", "Уроки, заметки и тетради по своим предметам"],
    school: ["Лицей КЭО", "Предметы лицея и расписание недели с ролями уроков"],
    journal: ["Дневник занятий", "Календарь занятий, записи за день и домашние задания"],
    notes: ["Тетради", "Блоки и ветки: конспект с форматированием и вложениями"],
    settings: ["Синхронизация и данные", "Облако, резервная копия, оформление, установка на устройство и версия"],
  };
  const screenInfo = { title: (SCREEN_TEXT[screen] || SCREEN_TEXT.today)[0], note: (SCREEN_TEXT[screen] || SCREEN_TEXT.today)[1] };

  const todayLabel = new Date().toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" });
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
    <div data-theme={theme} className="ap-shell" style={styles.shell}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=PT+Serif:wght@400;700&family=Inter:wght@400;500;600&display=swap');
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
        .ap-card:hover { box-shadow: var(--shadow); border-color: var(--mute); }
        /* Состояния навигации описаны здесь целиком: инлайновый стиль перебивал :hover,
           и подсветка под курсором не появлялась. */
        .ap-nav {
          padding: 10px 12px;
          border: none;
          border-left: 3px solid transparent;
          border-radius: 8px;
          background: transparent;
          color: var(--railInk2);
          transition: background .22s ease, color .22s ease, border-color .22s ease, padding-left .22s ease;
        }
        .ap-nav:hover { background: var(--railActive); color: var(--railInk); padding-left: 16px; }
        .ap-nav.is-on { background: var(--railActive); color: var(--railInk); border-left-color: var(--accent); font-weight: 600; }
        .ap-tab {
          border: none;
          background: transparent;
          color: var(--railInk2);
          padding: 10px 4px 12px;
          transition: background .22s ease, color .22s ease;
        }
        .ap-tab:hover { background: var(--railActive); color: var(--railInk); }
        .ap-tab.is-on { background: var(--railActive); color: var(--railInk); font-weight: 600; }
        .ap-tab-mark { background: transparent; transition: background .22s ease; }
        .ap-tab.is-on .ap-tab-mark, .ap-tab:hover .ap-tab-mark { background: var(--accent); }
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
        @media (max-width: 900px) {
          .ap-shell { flex-direction: column; }
          .ap-rail { display: none !important; }
          .ap-tabbar, .ap-only-mobile { display: block; }
          .ap-main { padding: 16px 14px 96px !important; }
          /* minmax(0, 1fr), а не 1fr: иначе колонка тянется под самый широкий
             элемент внутри карточки и уезжает за край экрана. */
          .ap-grid2, .ap-grid3 { grid-template-columns: minmax(0, 1fr) !important; }
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

        <ScreenHead title={screenInfo.title} note={screenInfo.note}>
          <div className="ap-only-mobile">
            <Countdowns next={nextCountdown} main={mainCountdown} />
          </div>
        </ScreenHead>

        {/* key={screen} заставляет React пересобрать содержимое при переходе — иначе
            анимация входа проигрывалась бы один раз за всё время работы. */}
        <div key={screen} className="ap-screen">

        {screen === "today" && (
          <>
            {/* Напоминание крупным планом: строчкой внизу карточки его не замечали. */}
            <section
              className="ap-card"
              style={{
                ...styles.card,
                ...(studyReminder.tone === "warn" ? styles.reminderWarn : null),
                ...(studyReminder.tone === "ok" ? styles.reminderOk : null),
              }}
            >
              <div style={styles.reminderRow}>
                <div style={styles.reminderMark} aria-hidden="true">
                  {studyStreakOn ? (
                    <StreakFlame />
                  ) : studyReminder.tone === "ok" ? (
                    "✓"
                  ) : studyReminder.tone === "warn" ? (
                    "!"
                  ) : (
                    "·"
                  )}
                </div>
                <div style={styles.reminderBody}>
                  <div style={styles.reminderTitle}>{studyReminder.title}</div>
                  <div style={styles.reminderText}>{studyReminder.text}</div>
                </div>
                {/* Серия показывается, только пока она идёт: после пропуска «4 дня подряд»
                    рядом с «занятий не было два дня» звучало издевательски. */}
                {studyStreakOn && (
                  <div style={styles.streakBox}>
                    <div style={styles.streakNum}>{studyPulse.streak}</div>
                    <div style={styles.streakWord}>{daysWord(studyPulse.streak)} подряд</div>
                  </div>
                )}
              </div>
            </section>
          <div className="ap-grid2" style={styles.grid2}>
            <section className="ap-card" style={styles.card}>
              <div style={styles.cardTitle}>Часы занятий</div>
              <div style={styles.cardNote}>
                Столбец — факт за день, полоса под ним — коридор дневной цели. Зелёный столбец значит, что цель взята.
              </div>
              <div style={styles.overallTrack}>
                <div className="ap-fill" style={{ ...styles.overallFill, width: stats.overallPct + "%" }} />
              </div>
              <div style={styles.overallText}>
                Пройдено {stats.doneAll} из {stats.totalAll} уроков · {stats.overallPct}%
              </div>
              {/* График не сворачивается: ради него карточка и существует. */}
              <HoursChart journal={journal} homework={homework} subjects={ALL_SUBJECTS} goalForDate={goalForDate} />
            </section>

            <section className="ap-card" style={styles.card}>
              <div style={styles.cardTitle}>Сегодня в лицее</div>
              <div style={styles.cardNote}>Важность — полосой слева, роль урока — подписью</div>
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

              <div style={styles.quickLog}>
                <div style={styles.cardTitle}>Записать занятие</div>
                <div style={styles.cardNote}>Запись попадёт в дневник за сегодня</div>

                <div style={styles.quickRow}>
                  <select
                    value={jForm.subjectId}
                    onChange={(e) => setJForm({ ...jForm, subjectId: e.target.value })}
                    style={styles.select}
                  >
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
                    title="Часы"
                  />
                </div>
                <div style={styles.quickRow}>
                  <AutoGrow
                    placeholder="Что прошли?"
                    value={jForm.note}
                    onChange={(e) => setJForm({ ...jForm, note: e.target.value })}
                    onEnter={() => {
                      setJForm({ ...jForm, date: todayStr() });
                      addJournalEntry();
                    }}
                    style={styles.noteInput}
                  />
                  <button
                    onClick={() => {
                      setJForm({ ...jForm, date: todayStr() });
                      addJournalEntry();
                    }}
                    style={styles.addBtnSmall}
                  >
                    + Записать
                  </button>
                </div>
              </div>
            </section>
          </div>

          <div className="ap-grid3" style={styles.grid3}>
            <section className="ap-card" style={styles.card}>
              <div style={styles.cardTitle}>Ближайшие события</div>
              {upcomingEvents.length === 0 ? (
                <p style={styles.muted}>Событий пока нет — добавьте экзамен или олимпиаду в разделе «События».</p>
              ) : (
                <div style={styles.todayList}>
                  {upcomingEvents.slice(0, 4).map((e) => {
                    const left = daysUntilDate(e.date);
                    const info = priorityInfo(e.priority);
                    return (
                      <div key={e.id} style={{ ...styles.todayRow, borderLeftColor: info.strong, background: info.tint }}>
                        <span style={{ ...styles.todayTime, color: info.color }}>{info.mark}</span>
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
              <button onClick={() => goScreen("events")} style={styles.eventsToggle}>
                Все события
              </button>
            </section>

            <section className="ap-card" style={styles.card}>
              <div style={styles.cardTitle}>Дела и сроки</div>
              <div style={styles.cardNote}>По сроку, а не по предмету</div>
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
              <button onClick={() => goScreen("journal")} style={styles.eventsToggle}>
                Дневник и задания
              </button>
            </section>

            <section className="ap-card" style={styles.card}>
              <div style={styles.cardTitle}>Подготовка</div>
              <div style={styles.cardNote}>
                Пройдено {stats.doneAll} из {stats.totalAll} уроков
              </div>
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
              <button onClick={() => goScreen("study")} style={styles.eventsToggle}>
                Открыть подготовку
              </button>
            </section>
          </div>
          </>
        )}

        {screen === "events" && (
          <>
          <div className="ap-grid2" style={styles.grid2}>
            <section className="ap-card" style={styles.card}>
              <div style={styles.cardTitle}>Отсчёт</div>
              <div style={styles.countdownBox}>
                {nextEvent ? (
                  <>
                    <div style={styles.countdownNum}>{daysUntilDate(nextEvent.date)}</div>
                    <div style={styles.countdownLabel}>{daysWord(daysUntilDate(nextEvent.date))} до события</div>
                    <div style={styles.countdownEvent}>
                      <span style={{ color: priorityInfo(nextEvent.priority).onDark }}>
                        {priorityInfo(nextEvent.priority).mark}
                      </span>{" "}
                      {nextEvent.name}
                    </div>
                    <div style={styles.countdownDate}>
                      {formatEventDate(nextEvent.date)}
                      {mainEvent && mainEvent.id === nextEvent.id && <span style={styles.countdownPlan}>план</span>}
                    </div>
                    {upcomingEvents.length > 1 && (
                      <div style={styles.countdownRest}>
                        {upcomingEvents.slice(1).map((e) => {
                          const left = daysUntilDate(e.date);
                          const info = priorityInfo(e.priority);
                          return (
                            <div key={e.id} style={styles.countdownRestRow}>
                              <span style={{ color: info.onDark }}>{info.mark}</span>
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
                  <div style={styles.countdownEmpty}>
                    Событий пока нет.
                    <br />
                    Добавьте экзамен или олимпиаду рядом.
                  </div>
                )}
              </div>

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
                </div>
              </Collapsible>
            </section>

            <section className="ap-card" style={styles.card}>
              <div style={styles.cardTitle}>События</div>
              <EventsEditor
                upcoming={upcomingEvents}
                past={pastEvents}
                mainEventId={mainEvent ? mainEvent.id : null}
                pickedMainId={mainEventId}
                onPickMain={setMainEventId}
                onAdd={addEvent}
                onUpdate={updateEvent}
                onRemove={removeEvent}
              />
            </section>
          </div>
          </>
        )}

        {screen === "budget" && (
          <section className="ap-card" style={styles.card}>
            <p style={styles.muted}>
              Время — ограниченный ресурс, и его количество разное в разные дни недели. Укажите, сколько минут в день вы
              реально можете заниматься; ниже — сколько часов в неделю вы распределяете по предметам и проверка, хватит
              ли этого ресурса на оставшиеся уроки.
              {mainEvent
                ? ` Отсчёт идёт до самого приоритетного события — «${mainEvent.name}».`
                : ""}
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
                        style={{ accentColor: s.color, flex: 1, minWidth: 0 }}
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
                <div style={styles.cardTitle}>Баланс предметов</div>
                <div style={styles.cardNote}>
                  По горизонтали — план на неделю, по вертикали — записанное в дневнике за последние семь дней.
                  Диагональ — линия баланса: точка на ней значит, что план и факт сошлись. Выше — предмет забирает
                  больше времени, чем ему отведено, ниже — недобирает. Размер точки — сколько тем по нему пройдено.
                </div>
              </div>
              <BalanceChart items={balanceItems} />
            </div>
          </section>
        )}

        {screen === "study" && (
          <section style={styles.plainBlock}>
            {ALL_SUBJECTS.length === 0 && (
              <section className="ap-card" style={styles.card}>
                <div style={styles.cardTitle}>Здесь живёт подготовка вне лицея</div>
                <p style={styles.muted}>
                  Курсы, олимпиадная подготовка, любой предмет, который вы учите сами. Раздел отвечает на два вопроса:
                  что осталось пройти и сколько времени на это ушло.
                </p>
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
                <p style={styles.muted}>
                  Начните с одного предмета — например «Обществознание» или «Математика для олимпиад». Цвет выбирается
                  рядом с названием, его же будет носить предмет в дневнике и на графиках.
                </p>
              </section>
            )}
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
                  <div key={s.id} className="subj-card ap-card" style={{ ...styles.subjCard, borderColor: s.color }}>
                    <div style={styles.subjHeaderRow}>
                      <button onClick={() => setOpenSubject(open ? null : s.id)} style={styles.subjHeader}>
                        <span style={{ ...styles.dot, background: s.color }} />
                        <span style={styles.subjName}>{s.name}</span>
                        <span style={styles.subjPct}>
                          {st.done}/{st.total} · {st.pct}%
                        </span>
                      </button>
                      <input
                        type="color"
                        value={hexOf(s.color)}
                        onChange={(e) => setSubjectColor(s.id, e.target.value)}
                        style={styles.colorPick}
                        title="Цвет предмета"
                      />
                      <button onClick={() => removeSubject(s.id)} style={styles.subjRemoveBtn} title="Удалить предмет">
                        ×
                      </button>
                    </div>
                    <div style={styles.miniTrack}>
                      <div className="ap-fill" style={{ ...styles.miniFill, width: st.pct + "%", background: s.color }} />
                    </div>
                    <Collapsible open={open}>
                      <div style={styles.tabsRow}>
                        {[
                          ["lessons", "Уроки"],
                          ["notebook", "Тетрадь"],
                        ].map(([key, label]) => {
                          const active = (subjectTab[s.id] || "lessons") === key;
                          return (
                            <button
                              key={key}
                              onClick={() => setSubjectTab((prev) => ({ ...prev, [s.id]: key }))}
                              style={{
                                ...styles.tabBtn,
                                color: active ? "#fff" : "var(--ink2)",
                                background: active ? s.color: "var(--btnInk)",
                                borderColor: active ? s.color : "var(--line)",
                              }}
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                      {(subjectTab[s.id] || "lessons") === "notebook" ? (
                      <div style={styles.topicList}>
                        <Notebook
                          blocks={notebooks["subj:" + s.id] || []}
                          onChange={(blocks) => setNotebook("subj:" + s.id, blocks)}
                          onUndo={showUndo}
                          prefix={"subj-" + s.id}
                        />
                      </div>
                      ) : (
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
                            onUpdateNote={(noteId, patch) => updateNote(s.id, t.id, t.custom, noteId, patch)}
                            onRemoveNote={(noteId) => removeNote(s.id, t.id, t.custom, noteId)}
                            onRemoveTopic={() => removeTopic(s.id, t.id, t.custom)}
                          />
                        ))}
                        <AddTopicForm onAdd={(name, url) => addCustomTopic(s.id, name, url)} color={s.color} />
                      </div>
                      )}
                    </Collapsible>
                  </div>
                );
              })}
            </div>
            <AddSubjectForm onAdd={addSubject} placeholder="Добавить свой предмет (например, «Математика для олимпиад»)" />
          </section>
        )}

        {screen === "school" && (
          <section style={styles.plainBlock}>
            <p style={styles.muted}>
              Отдельно от самостоятельного изучения. Сверху — предметы лицея с тетрадями и цветом, ниже — расписание
              с реальными звонками: время, кабинет, преподаватель и роль урока.
            </p>

            {/* Предметов набирается полтора десятка, и списком они занимали
                пол-экрана над расписанием — ради которого сюда и заходят. */}
            <button onClick={() => toggleSection("lyceumSubjects")} style={styles.foldHead}>
              <span style={styles.sectionChevron}>{openSections.lyceumSubjects ? "▾" : "▸"}</span>
              <span style={styles.subHeadInline}>Предметы</span>
              {lyceumSubjectNames.length > 0 && (
                <span style={styles.mutedSmall}>{lyceumSubjectNames.length} — тетради и цвет</span>
              )}
            </button>
            {lyceumSubjectNames.length === 0 ? (
              <p style={styles.muted}>Предметы появятся здесь, как только вы впишете их в расписание ниже.</p>
            ) : (
              <Collapsible open={!!openSections.lyceumSubjects}>
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
              </Collapsible>
            )}

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
            <ExamPreset
              picked={examPicks}
              onPicked={setExamPicks}
              onApply={applyExams}
              onClear={clearExams}
              appliedCount={presetExams}
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
                  <span style={{ color: p.strong, fontWeight: 700 }}>{p.mark}</span> {p.label}
                </span>
              ))}
            </div>

            <div style={styles.scheduleGrid}>
              {scheduleDays.map((day) => (
                <ScheduleDay
                  key={day}
                  day={day}
                  label={WEEKDAY_LABELS[day]}
                  entries={lyceumSchedule
                    .filter((e) => e.day === day && (e.kind !== "exam" || examVisibleInSchedule(e)))
                    .sort(byExamFirst)}
                  onAdd={(entry) => addScheduleEntry(day, entry)}
                  onUpdate={updateScheduleEntry}
                  onRemove={removeScheduleEntry}
                />
              ))}
            </div>
          </section>
        )}

        {screen === "journal" && (
          <div className="ap-grid2" style={styles.grid2}>
            <section className="ap-card" style={styles.card}>
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
                          перекрывала и выступала из-под рамки полоской. */}
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
              <p style={styles.mutedSmall}>
                Высота заливки — доля дневной цели, а цель на каждый день недели задаётся в «Распределении».
                Точки сверху — пройденные уроки, точка снизу — домашнее задание на этот день.
              </p>
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
                              <span style={{ ...styles.dayPriority, color: priorityInfo(dayInfo.priority).strong }}>
                                {priorityInfo(dayInfo.priority).mark}
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
            </section>
          </div>
        )}

        {screen === "notes" && (
          <>
          <div className="ap-grid2" style={styles.grid2}>
            <section className="ap-card" style={styles.card}>
              <div style={styles.cardTitle}>Предметы</div>
              <div style={styles.cardNote}>Тетрадь есть у каждого предмета — и своего, и лицейского</div>
              <div style={styles.notebookList}>
                {notebookOwners.map((o) => {
                  const on = o.key === notebookOwner;
                  const blocks = notebooks[o.key] || [];
                  return (
                    <button
                      key={o.key}
                      onClick={() => setNotebookOwner(o.key)}
                      style={{
                        ...styles.notebookPick,
                        background: on ? "var(--neutralBg)" : "transparent",
                        borderColor: on ? "var(--mute)" : "var(--line2)",
                      }}
                    >
                      <span style={{ ...styles.notebookDot, background: o.color }} />
                      <span style={styles.notebookName}>{o.name}</span>
                      <span style={styles.mutedSmall}>{blocks.length ? blocks.length + " блок." : "пусто"}</span>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="ap-card" style={styles.card}>
              <div style={styles.cardTitle}>{currentNotebook ? "Тетрадь · " + currentNotebook.name : "Тетрадь"}</div>
              <div style={styles.cardNote}>Блок — большая тема, внутри ветки с конспектом и вложениями</div>
              {currentNotebook ? (
                <Notebook
                  blocks={notebooks[currentNotebook.key] || []}
                  onChange={(blocks) => setNotebook(currentNotebook.key, blocks)}
                  onUndo={showUndo}
                  prefix={"nb-" + currentNotebook.key}
                />
              ) : (
                <p style={styles.muted}>Предметы появятся, как только вы добавите их в подготовку или в расписание.</p>
              )}
            </section>
          </div>
          </>
        )}

        {screen === "settings" && (
          <div className="ap-grid3" style={styles.grid3}>
            <section className="ap-card" style={styles.card}>
              <div style={styles.cardTitle}>Облако</div>
              <div style={styles.cardNote}>
                Один аккаунт на все устройства: правки с телефона и ноутбука сливаются, а не затирают друг друга.
              </div>
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
              <div style={styles.cardTitle}>Резервная копия</div>
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
                  <div style={styles.cardNote}>
                    Если автоматическая синхронизация не работает, данные переносятся вручную: скопируйте текст на
                    одном устройстве и вставьте его в поле импорта на другом.
                  </div>
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

            <section className="ap-card" style={styles.card}>
              <div style={styles.cardTitle}>Оформление</div>
              <div style={styles.cardNote}>
                Тема и границы ночи — настройка устройства: телефон вечером может быть в ночной, а ноутбук днём в
                светлой. В облако это не уходит.
              </div>
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
            </section>

            <section className="ap-card" style={styles.card}>
              <div style={styles.cardTitle}>Приложение</div>
              <div style={styles.cardNote}>
                С иконки ежедневник открывается без адресной строки и работает без сети — правки уйдут в облако, когда
                связь появится.
              </div>
              <InstallHint />
              <div style={styles.versionRow}>
                Ежедневник лицеиста · бета {__APP_VERSION__} · сборка от{" "}
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

      {undoQueue.length > 0 && (
        <div style={styles.undoStack}>
          {undoQueue.map((item) => (
            <div key={item.id} className="undo-toast" style={styles.undoToast}>
              <div style={styles.undoBarTrack}>
                <div className="undo-bar" style={styles.undoBar} />
              </div>
              <div style={styles.undoRow}>
                <span style={styles.undoText}>
                  {item.message}. Если это по ошибке — нажмите крестик, всё вернётся.
                </span>
                <button onClick={() => cancelUndo(item.id)} style={styles.undoCancel} title="Вернуть">
                  ✕
                </button>
                <button onClick={() => confirmUndo(item.id)} style={styles.undoConfirm} title="Да, удалить">
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
              color: active ? "#fff" : p.color,
              background: active ? p.color: "var(--btnInk)",
              borderColor: active ? p.color : "var(--line)",
            }}
          >
            {p.mark}
          </button>
        );
      })}
    </div>
  );
}

function EventsEditor({ upcoming, past, mainEventId, pickedMainId, onPickMain, onAdd, onUpdate, onRemove }) {
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
        <input type="date" value={e.date} onChange={(ev) => onUpdate(e.id, { date: ev.target.value })} style={styles.eventDateInput} />
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
      </div>
    );
  }

  return (
    <div style={styles.eventsEditor}>
      <p style={styles.muted}>
        Экзамены, этапы олимпиад, пробники — всё, до чего нужен отсчёт. Приоритет решает, до какого события считается
        план: «{EVENT_PRIORITIES[2].mark}» важнее «{EVENT_PRIORITIES[1].mark}» и «{EVENT_PRIORITIES[0].mark}». Если
        приоритет одинаковый, берётся ближайшее. Можно выбрать и вручную — «считать план по нему» у любого события.
        Экзамены и олимпиады, заведённые в расписании, появляются здесь сами —
        это одна и та же запись, и править её можно с любой стороны.
      </p>

      {upcoming.map((e) => row(e, false))}
      {past.length > 0 && <div style={styles.pastLabel}>Прошедшие</div>}
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
  onUpdateNote,
  onRemoveNote,
  onRemoveTopic,
}) {
  const [noteText, setNoteText] = useState("");
  const [noteMins, setNoteMins] = useState("15");
  const [urlDraft, setUrlDraft] = useState(topic.url || "");
  const [openNoteBodies, setOpenNoteBodies] = useState({});
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
        {/* Поле и «мин» — один блок: при переносе строки они разъезжались по разным. */}
        <span style={styles.durationBox}>
          <input
            type="number"
            min="5"
            value={topic.duration}
            onChange={(e) => onDurationChange(e.target.value)}
            style={styles.durationInput}
            title="Длительность урока, минут"
          />
          <span style={styles.hUnit}>мин</span>
        </span>
        <button onClick={onToggleLink} style={styles.notesToggle} title="Добавить или изменить ссылку">
          {topic.url ? "ссылка ✓" : "+ ссылка"}
        </button>
        <button onClick={onToggleNotes} style={styles.notesToggle}>
          заметки{notes.length ? ` (${notes.length})` : ""}
        </button>
        <button onClick={onRemoveTopic} style={styles.removeBtn} title="Удалить урок">
          ×
        </button>
      </div>

      <Collapsible open={linkOpen}>
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
      </Collapsible>

      <Collapsible open={notesOpen}>
        <div style={styles.notesPanel}>
          {notes.map((n) => {
            const bodyOpen = !!openNoteBodies[n.id];
            const hasBody = (n.html && n.html !== "<br>") || (n.files && n.files.length);
            return (
              <div key={n.id} style={styles.noteBlock}>
                <div style={styles.noteRow}>
                  <button
                    onClick={() => setOpenNoteBodies((prev) => ({ ...prev, [n.id]: !bodyOpen }))}
                    style={styles.noteChevron}
                    title="Конспект и файлы"
                  >
                    {bodyOpen ? "▾" : "▸"}
                  </button>
                  <span style={styles.noteDate}>{new Date(n.date).toLocaleDateString("ru-RU")}</span>
                  <span style={styles.noteText}>{n.text}</span>
                  {!bodyOpen && hasBody && <span style={styles.noteHasBody}>✎</span>}
                  <span style={styles.noteMins}>{n.minutes} мин</span>
                  <button onClick={() => onRemoveNote(n.id)} style={styles.removeBtn}>
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
                      onChange={(files) => onUpdateNote(n.id, { files })}
                      prefix={"note-" + n.id}
                    />
                  </div>
                </Collapsible>
              </div>
            );
          })}
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
  const [examOpen, setExamOpen] = useState(false);
  const [examNote, setExamNote] = useState("");
  // Форма урока — шесть полей; развёрнутая в каждом дне, она делала неделю
  // стеной из полей, поэтому раскрывается по кнопке.
  const [addOpen, setAddOpen] = useState(false);

  useEffect(() => {
    if (!examNote) return;
    const timer = setTimeout(() => setExamNote(""), 12000);
    return () => clearTimeout(timer);
  }, [examNote]);

  return (
    <div className="ap-card" style={styles.scheduleDayBlock}>
      <div style={styles.scheduleDayTop}>
        <div style={styles.scheduleDayHeader}>{label}</div>
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
          onAdd={(entry) => {
            onAdd({ ...entry, kind: "exam" });
            setExamOpen(false);
            setExamNote(examAddedNote(entry));
          }}
        />
      </Collapsible>
      <Collapsible open={!!examNote}>
        <div style={styles.examNote}>{examNote}</div>
      </Collapsible>

      {entries.length === 0 && <div style={styles.mutedSmall}>Уроков нет</div>}
      {entries.map((e) => (
        <ScheduleEntryRow key={e.id} entry={e} onUpdate={onUpdate} onRemove={() => onRemove(e.id)} />
      ))}
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
function StreakFlame() {
  return (
    <svg viewBox="0 0 24 24" width="38" height="38" aria-hidden="true">
      <path
        d="M12 2.2c3.4 3.6 5.6 6.5 5.6 10.2 0 3.5-2.5 6.3-5.6 6.3S6.4 15.9 6.4 12.4c0-2.1.9-3.8 2.1-5.4.3 1.5.9 2.4 1.6 2.9-.2-2.8.6-5.6 1.9-7.7z"
        fill="var(--gold)"
      />
      <path
        d="M12 17.6c-1.7 0-3-1.4-3-3.3 0-1.6 1-2.7 1.8-4 .5 1 .9 1.5 1.4 1.8.5-1 .8-2 .8-3 1.3 1.7 2 3.1 2 5.2 0 1.9-1.3 3.3-3 3.3z"
        fill="var(--redStrong)"
        opacity="0.85"
      />
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
function AddExamForm({ onAdd }) {
  const [subjectName, setSubjectName] = useState("");
  const [examKind, setExamKind] = useState("exam");
  const [date, setDate] = useState("");
  const [start, setStart] = useState("10:00");
  const [end, setEnd] = useState("13:00");
  const [place, setPlace] = useState("");
  const [url, setUrl] = useState("");

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
        День недели берётся из даты, так что ошибиться днём нельзя. В расписании запись появится за неделю до даты,
        отсчёт до неё — сразу в событиях наверху.
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

function ScheduleEntryRow({ entry, onUpdate, onRemove }) {
  const isExam = entry.kind === "exam";

  return (
    <div
      style={{
        ...styles.scheduleEntry,
        borderLeftColor: priorityInfo(entry.priority).strong,
        background: priorityInfo(entry.priority).tint,
        ...(isExam ? styles.scheduleExam : null),
      }}
    >
      {isExam && (
        <div style={styles.examRow}>
          <ExamKindPicker value={entry.examKind} onChange={(v) => onUpdate(entry.id, { examKind: v })} />
          <input
            type="date"
            value={entry.date || ""}
            onChange={(e) => onUpdate(entry.id, { date: e.target.value })}
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
          {entry.url && (
            <a className="lesson-link" href={entry.url} target="_blank" rel="noreferrer" style={styles.examLink}>
              Открыть ссылку
            </a>
          )}
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
          {hw.attachments.map((a, i) => (
            <span key={a.path || a.key || i} style={styles.attachmentChip}>
              <button onClick={() => onOpenAttachment(a)} style={styles.attachmentLink}>
                {a.name}
              </button>
              <button onClick={() => onRemoveAttachment(a)} style={styles.removeBtn}>
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
  // Оболочка: колонка навигации слева, экран справа. На телефоне колонка
  // превращается в полосу сверху — это делает таблица стилей выше.
  shell: { display: "flex", minHeight: "100vh", background: "var(--bg)", color: "var(--ink)" },
  main: { flex: 1, minWidth: 0, padding: "24px 26px 40px", maxWidth: 1400 },
  grid2: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(340px, 100%), 1fr))", gap: 16, marginBottom: 16 },
  grid3: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(280px, 100%), 1fr))", gap: 16, marginBottom: 16 },
  cardTitle: { fontFamily: "'PT Serif', Georgia, serif", fontSize: 19, marginBottom: 5 },
  cardNote: { fontSize: 13.5, color: "var(--ink3)", marginBottom: 14, lineHeight: 1.5 },
  todayList: { display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 },
  todayRow: {
    display: "flex",
    alignItems: "baseline",
    gap: 8,
    flexWrap: "wrap",
    borderLeft: "4px solid",
    borderRadius: "0 4px 4px 0",
    padding: "6px 9px",
  },
  todayTime: { fontSize: 12.5, fontWeight: 600, minWidth: 42 },
  todayName: { fontSize: 13.5, fontWeight: 600, flex: "1 1 120px", minWidth: 0 },
  todayMeta: { fontSize: 12, color: "var(--ink3)" },
  quickLog: { borderTop: "1px solid var(--line2)", paddingTop: 10, marginTop: 4 },
  reminderWarn: { background: "var(--warmBg)", borderColor: "var(--warmLine)" },
  reminderOk: { borderColor: "var(--green)" },
  reminderRow: { display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" },
  reminderMark: {
    fontFamily: "'PT Serif', Georgia, serif",
    fontSize: 44,
    lineHeight: 1,
    width: 46,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "var(--accent)",
    flexShrink: 0,
  },
  reminderBody: { flex: "1 1 240px", minWidth: 0 },
  reminderTitle: { fontFamily: "'PT Serif', Georgia, serif", fontSize: 19, marginBottom: 4 },
  reminderText: { fontSize: 13.5, color: "var(--ink2)", lineHeight: 1.5 },
  streakBox: { textAlign: "center", minWidth: 78 },
  streakNum: { fontFamily: "'PT Serif', Georgia, serif", fontSize: 28, lineHeight: 1, color: "var(--green)" },
  streakWord: { fontSize: 11.5, color: "var(--ink3)", marginTop: 3 },
  // Пропущенный день подсвечивается тёплым — это напоминание, а не выговор.
  pulseWarm: {
    background: "var(--warmBg)",
    border: "1px solid var(--warmLine)",
    color: "var(--warmInk)",
    borderRadius: 9,
    padding: "8px 10px",
  },
  verdictLine: { fontSize: 12.5, lineHeight: 1.5, marginBottom: 8 },
  quickRow: { display: "flex", gap: 6, alignItems: "flex-start", marginBottom: 6, flexWrap: "wrap" },
  taskRow: { display: "flex", alignItems: "baseline", gap: 8, fontSize: 13, flexWrap: "wrap" },
  taskText: { flex: "1 1 140px", minWidth: 0 },
  taskMeta: { fontSize: 12 },
  progressRow: { display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 3 },
  notebookList: { display: "flex", flexDirection: "column", gap: 4 },
  notebookPick: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "7px 9px",
    border: "1px solid",
    borderRadius: 10,
    fontSize: 13.5,
    textAlign: "left",
  },
  notebookDot: { width: 9, height: 9, borderRadius: "50%", flexShrink: 0 },
  notebookName: { flex: 1, minWidth: 0 },
  page: {
    fontFamily: "Inter, system-ui, sans-serif",
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
  countdownBox: { background: "var(--rail)", color: "var(--railInk)", borderRadius: 10, padding: "16px 18px", textAlign: "center", width: "100%" },
  countdownNum: { fontFamily: "'PT Serif', Georgia, serif", fontSize: 34, lineHeight: 1 },
  countdownLabel: { fontSize: 12, opacity: 0.75, marginTop: 2, marginBottom: 8 },
  dateInput: { border: "1px solid var(--line)", background: "var(--panel2)", color: "inherit", borderRadius: 8, padding: "7px 9px", fontSize: 12.5, width: "100%" },
  countdownEvent: { fontSize: 16, fontWeight: 700, marginTop: 8, lineHeight: 1.3 },
  countdownDate: { fontSize: 12, opacity: 0.7, marginTop: 3 },
  countdownRest: {
    marginTop: 10,
    paddingTop: 8,
    borderTop: "1px solid var(--railActive)",
    display: "flex",
    flexDirection: "column",
    gap: 5,
    textAlign: "left",
  },
  countdownRestRow: { display: "flex", alignItems: "baseline", gap: 6, fontSize: 12.5, lineHeight: 1.4, padding: "3px 0" },
  countdownRestName: { flex: "1 1 auto", minWidth: 0, opacity: 0.9, textAlign: "left", overflowWrap: "anywhere" },
  countdownRestLeft: { fontSize: 13.5, opacity: 0.75, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" },
  countdownPlan: { fontSize: 9.5, color: "var(--green)", marginLeft: 6, whiteSpace: "nowrap" },
  countdownEmpty: { fontSize: 12.5, opacity: 0.8, lineHeight: 1.5 },
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
    borderRadius: 8,
    fontSize: 11.5,
    background: "var(--panel2)",
    color: "var(--ink2)",
  },
  calendarMsg: { fontSize: 12, color: "var(--green)", marginTop: 8 },
  calendarSteps: { margin: "0 0 8px", paddingLeft: 20, fontSize: 12.5, color: "var(--ink2)", lineHeight: 1.6 },
  // Ссылка webcal: выглядит и ведёт себя как кнопка рядом с соседями.
  subscribeLink: {
    display: "inline-block",
    border: "none",
    color: "var(--btnInk)",
    background: "var(--btnBg)",
    borderRadius: 8,
    padding: "5px 10px",
    fontSize: 12,
    fontWeight: 600,
    textDecoration: "none",
  },
  subscribeLinkSecondary: {
    display: "inline-block",
    border: "1px solid var(--line)",
    background: "var(--panel2)",
    borderRadius: 8,
    padding: "5px 10px",
    fontSize: 12,
    fontWeight: 600,
    color: "var(--ink)",
    textDecoration: "none",
  },
  secondaryBtnSmall: {
    border: "1px solid var(--line)",
    background: "var(--panel2)",
    borderRadius: 8,
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
  eventsEditor: { background: "var(--neutralBg)", border: "1px solid var(--line)", borderRadius: 10, padding: 14, marginTop: 4 },
  eventEditRow: {
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
    flexWrap: "wrap",
    marginBottom: 8,
    borderLeft: "4px solid",
    borderRadius: "0 9px 9px 0",
    padding: "10px 12px",
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
  eventDaysWord: { fontFamily: "Inter, system-ui, sans-serif", fontSize: 10.5, fontWeight: 600, opacity: 0.85, marginTop: 2 },
  eventAddRow: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
    marginTop: 12,
    paddingTop: 12,
    borderTop: "1px solid var(--line2)",
  },
  eventNameInput: { flex: "3 1 200px", minWidth: 0, padding: "7px 10px", border: "1px solid var(--line)", borderRadius: 8, fontSize: 13, background: "var(--panel2)" },
  eventDateInput: { padding: "5px 6px", border: "1px solid var(--line)", borderRadius: 8, fontSize: 12.5, background: "var(--panel2)" },
  priorityRow: { display: "flex", gap: 4 },
  priorityBtn: { border: "1px solid", borderRadius: 8, padding: "4px 7px", fontSize: 12, fontWeight: 700, lineHeight: 1.1 },
  tabsRow: { display: "flex", gap: 6, marginTop: 10 },
  tabBtn: { border: "1px solid", borderRadius: 8, padding: "4px 12px", fontSize: 12.5, fontWeight: 600 },
  subHead: { fontFamily: "'PT Serif', Georgia, serif", fontSize: 18, margin: "22px 0 10px" },
  subHeadInline: { fontFamily: "'PT Serif', Georgia, serif", fontSize: 18 },
  foldHead: {
    display: "flex",
    alignItems: "baseline",
    gap: 8,
    border: "none",
    background: "none",
    padding: 0,
    margin: "22px 0 10px",
    color: "var(--ink)",
    textAlign: "left",
  },
  lyceumSubjectRow: { display: "flex", alignItems: "center", gap: 8 },
  sundayRow: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 },
  sundayBtn: {
    border: "1px solid var(--line)",
    background: "var(--panel2)",
    borderRadius: 8,
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
    borderRadius: 8,
    padding: "4px 10px",
    fontSize: 13,
  },
  undoConfirm: { border: "none", background: "var(--green)", color: "#fff", borderRadius: 8, padding: "4px 10px", fontSize: 13 },
  dayPriority: { fontSize: 11, fontWeight: 700, marginLeft: 6 },
  levelChip: {
    border: "1px solid",
    borderRadius: 7,
    fontSize: 10,
    fontWeight: 600,
    padding: "1px 5px",
    marginLeft: 6,
    verticalAlign: "middle",
  },
  fromScheduleBadge: { fontSize: 10.5, color: "var(--red)", border: "1px solid var(--redLine)", borderRadius: 8, padding: "1px 6px" },
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
  pastLabel: { fontSize: 11.5, color: "var(--mute)", margin: "10px 0 6px" },
  overallBar: { marginBottom: 24 },
  overallTrack: { height: 9, background: "var(--line)", borderRadius: 999, overflow: "hidden" },
  overallFill: { height: "100%", background: "var(--accent)", borderRadius: 999 },
  overallBtn: { display: "block", width: "100%", border: "none", background: "none", padding: 0, textAlign: "left" },
  overallHint: { color: "var(--accent)", fontWeight: 600, marginLeft: 8, fontSize: 12 },
  overallText: { fontSize: 13, color: "var(--ink2)", marginTop: 6 },
  card: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, padding: "18px 20px", marginBottom: 16 },
  // Экран, который сам состоит из карточек: своей коробки ему не нужно.
  plainBlock: { display: "block", marginBottom: 16 },
  muted: { fontSize: 13.5, color: "var(--ink3)", lineHeight: 1.6, marginTop: 0 },
  label: { fontSize: 13, fontWeight: 600, color: "var(--ink2)", display: "block", marginBottom: 6 },
  dailyGoalsBlock: { marginBottom: 18 },
  dailyGoalsRow: { display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 6, marginTop: 4 },
  dailyGoalCell: { display: "flex", flexDirection: "column", alignItems: "center", gap: 3, minWidth: 0 },
  dailyGoalLabel: { fontSize: 11.5, color: "var(--mute)" },
  dailyGoalInput: { width: "100%", padding: "4px 3px", border: "1px solid var(--line)", borderRadius: 8, fontSize: 13, textAlign: "center", background: "var(--panel2)" },
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
  smallNumInput: { width: 52, padding: "7px 9px", border: "1px solid var(--line)", borderRadius: 8, fontSize: 13, background: "var(--panel2)" },
  hUnit: { fontSize: 11.5, color: "var(--mute)", width: 34 },
  capacityBox: { border: "1px solid", borderRadius: 9, padding: "12px 14px", fontSize: 13.5, lineHeight: 1.9, background: "var(--panel2)" },
  skewWarning: {
    marginTop: 10,
    padding: "10px 14px",
    background: "var(--redBg)",
    border: "1px solid var(--redLine)",
    borderRadius: 9,
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
  select: { padding: "8px 10px", border: "1px solid var(--line)", borderRadius: 8, fontSize: 13, background: "var(--panel2)" },
  svg: { flex: "1 1 280px", maxWidth: 320, background: "var(--panel2)", border: "1px solid var(--line)", borderRadius: 9 },
  // alignItems: start — иначе короткая карточка тянется под высоту соседней
  // по строке сетки и кажется раскрытой и пустой.
  emptyList: { margin: "0 0 12px", paddingLeft: 20, fontSize: 13.5, lineHeight: 1.7, color: "var(--ink2)" },
  subjGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14, alignItems: "start" },
  subjCard: {
    background: "var(--panel2)",
    border: "1px solid",
    borderRadius: 11,
    padding: "16px 18px",
    transition: "transform 0.15s ease",
    // Карточка объявлена контейнером: строка урока переносится по её ширине,
    // а не по ширине экрана — в сетке из трёх колонок это разные вещи.
    containerType: "inline-size",
  },
  subjHeader: { display: "flex", alignItems: "center", gap: 8, flex: 1, background: "none", border: "none", padding: 0, textAlign: "left" },
  subjHeaderRow: { display: "flex", alignItems: "center", gap: 4 },
  addSubjectRow: { display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" },
  addSubjectInput: { flex: "1 1 240px", padding: "7px 10px", border: "1px solid var(--line)", borderRadius: 8, fontSize: 13.5, background: "var(--panel2)" },
  // alignItems: start — иначе день без уроков вытягивается под высоту дня с
  // экзаменом и выглядит пустой коробкой во весь столбец.
  scheduleGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(min(220px, 100%), 1fr))",
    gap: 12,
    marginTop: 16,
    alignItems: "start",
  },
  scheduleDayBlock: { background: "var(--panel2)", border: "1px solid var(--line)", borderRadius: 11, padding: "14px 16px" },
  scheduleDayHeader: { fontSize: 13.5, fontWeight: 700, marginBottom: 8 },
  mutedSmall: { fontSize: 12, color: "var(--mute)" },
  scheduleEntry: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    borderLeft: "5px solid",
    borderRadius: "0 4px 4px 0",
    padding: "6px 8px",
    marginBottom: 8,
  },
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
    borderRadius: 9,
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
  examNote: { fontSize: 11.5, color: "var(--green)", lineHeight: 1.5, marginTop: 6 },
  examKindPicker: { display: "flex", gap: 4 },
  examKindOn: {
    border: "1px solid var(--redStrong)",
    background: "var(--redStrong)",
    color: "var(--btnInk)",
    borderRadius: 8,
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
    borderRadius: 8,
    padding: "2px 8px",
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  examDateInput: { padding: "5px 7px", border: "1px solid var(--line)", borderRadius: 8, fontSize: 12, background: "var(--panel2)" },
  examLink: { fontSize: 12, color: "var(--blue)" },
  // Название переносится на несколько строк, значки важности остаются у первой.
  scheduleSubjectRow: { display: "flex", alignItems: "flex-start", gap: 6, flexWrap: "wrap" },
  priorityLegend: { fontSize: 11.5, color: "var(--ink3)", lineHeight: 1.5, marginBottom: 10 },
  scheduleSelect: { padding: "7px 9px", border: "1px solid var(--line)", borderRadius: 8, fontSize: 12.5, background: "var(--panel2)", width: "100%" },
  scheduleSubjectInput: {
    flex: "1 1 120px",
    minWidth: 0,
    padding: "4px 6px",
    border: "1px solid var(--line)",
    borderRadius: 8,
    fontSize: 12.5,
    background: "var(--panel2)",
    fontWeight: 600,
  },
  scheduleTimeRow: { display: "flex", alignItems: "center", gap: 4 },
  scheduleTimeInput: { padding: "5px 6px", border: "1px solid var(--line)", borderRadius: 8, fontSize: 12, background: "var(--panel2)", width: 82 },
  scheduleRoomInput: { padding: "7px 9px", border: "1px solid var(--line)", borderRadius: 8, fontSize: 12.5, background: "var(--panel2)" },
  scheduleTeacherInput: { padding: "7px 9px", border: "1px solid var(--line)", borderRadius: 8, fontSize: 12.5, background: "var(--panel2)" },
  addScheduleRow: { display: "flex", flexDirection: "column", gap: 4, marginTop: 6, paddingTop: 6, borderTop: "1px dashed var(--line)" },
  subjName: { fontSize: 15.5, fontWeight: 600, flex: 1, color: "var(--ink)" },
  subjPct: { fontSize: 12.5, color: "var(--ink3)" },
  miniTrack: { height: 6, background: "var(--line)", borderRadius: 999, marginTop: 8, overflow: "hidden" },
  miniFill: { height: "100%", borderRadius: 999 },
  topicList: { marginTop: 12, display: "flex", flexDirection: "column", gap: 5, maxHeight: 420, overflowY: "auto" },
  topicBlock: { borderBottom: "1px solid var(--line2)", paddingBottom: 5 },
  topicRow: { display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, padding: "8px 10px", borderRadius: 9, border: "1px solid transparent", flexWrap: "wrap" },
  topicLabel: { display: "flex", alignItems: "center", gap: 8, cursor: "pointer", flex: "1 1 160px", minWidth: 0 },
  topicDone: { textDecoration: "line-through", color: "var(--mute)" },
  durationBox: { display: "inline-flex", alignItems: "center", gap: 4 },
  durationInput: { width: 44, padding: "5px 7px", border: "1px solid var(--line)", borderRadius: 8, fontSize: 12, background: "var(--panel2)" },
  notesToggle: { background: "none", border: "1px solid var(--line)", borderRadius: 8, fontSize: 11.5, padding: "3px 7px", color: "var(--ink2)" },
  colorPick: {
    width: 24,
    height: 20,
    padding: 0,
    border: "1px solid var(--line)",
    borderRadius: 7,
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
  notesPanel: { margin: "4px 0 8px 26px", padding: "8px 10px", background: "var(--panel2)", border: "1px solid var(--line2)", borderRadius: 9 },
  noteBlock: { marginBottom: 6 },
  noteChevron: { background: "none", border: "none", padding: 0, fontSize: 11, color: "var(--mute)", width: 12 },
  noteHasBody: { fontSize: 11, color: "var(--accent)" },
  noteBody: { display: "flex", flexDirection: "column", gap: 6, margin: "6px 0 10px 14px" },
  noteRow: { display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, padding: "3px 0" },
  noteDate: { color: "var(--mute)", width: 68, flexShrink: 0 },
  noteText: { flex: 1, color: "var(--ink2)" },
  noteMins: { color: "var(--ink3)", width: 46, flexShrink: 0, textAlign: "right" },
  noteForm: { display: "flex", alignItems: "center", gap: 6, marginTop: 6, flexWrap: "wrap" },
  noteInput: { flex: "1 1 180px", padding: "7px 10px", border: "1px solid var(--line)", borderRadius: 8, fontSize: 12.5, background: "var(--panel2)" },
  addBtnSmall: { border: "none", color: "var(--btnInk)", background: "var(--btnBg)", borderRadius: 8, padding: "5px 10px", fontSize: 12, fontWeight: 600 },
  addTopicRow: { display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" },
  addTopicInput: { flex: 1, padding: "7px 10px", border: "1px solid var(--line)", borderRadius: 8, fontSize: 13, background: "var(--panel2)" },
  addTopicUrlInput: { flex: "1 1 160px", padding: "7px 10px", border: "1px solid var(--line)", borderRadius: 8, fontSize: 13, background: "var(--panel2)" },
  addBtn: { border: "none", color: "var(--btnInk)", background: "var(--btnBg)", borderRadius: 8, padding: "6px 12px", fontSize: 13, fontWeight: 600 },
  calendarWrap: { marginBottom: 18 },
  calHeader: { display: "flex", alignItems: "center", justifyContent: "center", gap: 16, marginBottom: 8 },
  calNavBtn: { background: "none", border: "1px solid var(--line)", borderRadius: 8, width: 28, height: 28, fontSize: 15, color: "var(--ink)" },
  // capitalize поднимал и «г.» в «Г.», поэтому заглавная ставится только первой букве.
  calMonthLabel: { fontSize: 14.5, fontWeight: 600, minWidth: 150, textAlign: "center" },
  calWeekdays: { display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 4 },
  calWeekday: { fontSize: 11, color: "var(--mute)", textAlign: "center" },
  calGrid: { display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 },
  calCell: {
    position: "relative",
    aspectRatio: "1",
    border: "none",
    borderRadius: 8,
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
  calRing: { position: "absolute", inset: 0, border: "2px solid var(--ink)", borderRadius: 8, zIndex: 2, pointerEvents: "none" },
  calDayNum: { position: "relative", zIndex: 1 },
  calLegend: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: 12, color: "var(--ink3)", margin: "12px 0 8px" },
  calLegendItem: { display: "flex", alignItems: "center", gap: 5 },
  calLegendBox: { width: 12, height: 12, borderRadius: 3 },
  calLegendScale: { flex: "1 1 120px", height: 10, borderRadius: 999, minWidth: 80 },
  hwDot: { position: "absolute", bottom: 3, width: 4, height: 4, borderRadius: "50%", background: "var(--accent)", zIndex: 1 },
  // Точки сидят над заливкой, поэтому подложка им больше не нужна.
  lessonDots: { position: "absolute", top: 3, display: "flex", gap: 2, alignItems: "center", zIndex: 1 },
  lessonDot: { width: 5, height: 5, borderRadius: "50%" },
  dayDetail: { background: "var(--panel2)", border: "1px solid var(--line)", borderRadius: 9, padding: "12px 14px", marginBottom: 16 },
  homeworkBlock: { marginTop: 12, paddingTop: 10, borderTop: "1px dashed var(--line)" },
  homeworkTitle: { fontSize: 13, fontWeight: 700, marginBottom: 6 },
  homeworkSubjectBlock: { marginBottom: 10 },
  homeworkSubjectName: { fontSize: 12.5, fontWeight: 700, marginBottom: 3 },
  homeworkItemBlock: { marginBottom: 4 },
  homeworkItemRow: { display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, padding: "3px 0" },
  homeworkText: { flex: 1, color: "var(--ink2)" },
  homeworkAddRow: { display: "flex", alignItems: "center", gap: 6, marginTop: 4, flexWrap: "wrap" },
  homeworkInput: { flex: "1 1 160px", padding: "7px 10px", border: "1px solid var(--line)", borderRadius: 8, fontSize: 12.5, background: "var(--panel2)" },
  homeworkMinutesInput: { width: 46, padding: "4px 5px", border: "1px solid var(--line)", borderRadius: 8, fontSize: 12, background: "var(--panel2)" },
  attachBtn: { background: "none", border: "none", fontSize: 13, padding: "0 2px" },
  attachmentsRow: { display: "flex", flexWrap: "wrap", gap: 6, marginLeft: 24, marginBottom: 4 },
  attachmentChip: {
    display: "inline-flex",
    alignItems: "center",
    gap: 2,
    background: "var(--neutralBg)",
    borderRadius: 10,
    padding: "2px 4px 2px 8px",
    fontSize: 11.5,
  },
  attachmentLink: { background: "none", border: "none", color: "var(--blue)", textDecoration: "underline", fontSize: 11.5, padding: 0 },
  reminderRow: { display: "flex", alignItems: "center", gap: 6, marginLeft: 24, marginBottom: 6 },
  reminderSelect: { padding: "2px 4px", border: "1px solid var(--line)", borderRadius: 8, fontSize: 11.5, background: "var(--panel2)" },
  reminderDaysInput: { width: 40, padding: "2px 4px", border: "1px solid var(--line)", borderRadius: 8, fontSize: 11.5, background: "var(--panel2)" },
  hwBanner: {
    display: "flex",
    alignItems: "stretch",
    gap: 12,
    background: "var(--warmBg)",
    border: "1px solid var(--gold)",
    borderLeft: "5px solid var(--gold)",
    borderRadius: 10,
    padding: "12px 14px",
    marginBottom: 16,
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
  textInput: { flex: "1 1 200px", padding: "8px 10px", border: "1px solid var(--line)", borderRadius: 8, fontSize: 13.5, background: "var(--panel2)" },
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
  themeBtn: { border: "1px solid", borderRadius: 8, padding: "6px 14px", fontSize: 13, fontWeight: 600 },
  themeHours: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 13, marginBottom: 8 },
  versionRow: { fontSize: 11, color: "var(--mute)", textAlign: "center", marginTop: 26, lineHeight: 1.5 },
  syncRow: { display: "flex", alignItems: "center", gap: 10, marginTop: 20, paddingTop: 12, borderTop: "1px solid var(--line)" },
  syncBtn: {
    border: "1px solid var(--line)",
    background: "var(--panel2)",
    borderRadius: 8,
    padding: "5px 10px",
    fontSize: 12.5,
    color: "var(--ink)",
  },
  backupTextarea: {
    width: "100%",
    minHeight: 90,
    padding: "8px 10px",
    border: "1px solid var(--line)",
    borderRadius: 9,
    fontSize: 11.5,
    fontFamily: "monospace",
    background: "var(--panel2)",
    resize: "vertical",
    boxSizing: "border-box",
  },
  backupRow: { display: "flex", alignItems: "center", gap: 10, marginTop: 6, marginBottom: 4, flexWrap: "wrap" },
};
