// Сборка набора заданий для приложения из выгрузок банка ФИПИ и наших ответов.
// Сборка набора заданий: из выгрузок сборщика ФИПИ и наших ответов получается
// src/fipi-bank.js. Запуск: FIPI_DIR=<папка с выгрузками> node tools/build-bank.mjs
// (нужен playwright с Chromium — им разбирается разметка условий).
import { readFileSync, writeFileSync } from "node:fs";
import { cleanBodies } from "./clean-body.mjs";

// Где лежат выгрузки сборщика и наши ответы. Пути передаются переменной
// окружения, потому что сами файлы в репозиторий не кладутся: это сырьё.
const UP = process.env.FIPI_DIR || "./fipi";
const SOURCES = [
  { subject: "Физика", file: UP + "4c6d30da-fipi-100.json", extra: UP + "1910c825-fipi-110.json", answers: "answers/physics.json" },
  { subject: "Обществознание", file: UP + "b2a0ec16-_________100_______________.json", answers: "answers/social.json" },
  { subject: "Информатика", file: UP + "ccaafe63-____________100_______________.json", answers: "answers/informatics.json" },
];

const LEADS = [
  "Впишите правильный ответ.",
  "Выберите один или несколько правильных ответов.",
  "Установите соответствие и впишите ответ.",
  "Выберите правильный ответ.",
];
const TAILS = ["%", "кг", "м", "с", "К", "Дж", "кДж", "кПа", "см", "мг", "м/с", "кг ∙ м/с", "В", "А", "кДж/кг",
  "в раз(а)", "в (раз)а", "на Дж", "м/с2"];

// Раздел задания: берём первую цифру кода КЭС и переводим в человеческое название.
const SECTIONS = {
  "Физика": { 1: "Механика", 2: "Молекулярная физика и термодинамика", 3: "Электродинамика", 4: "Квантовая физика" },
  "Обществознание": { 1: "Человек и общество", 2: "Экономика", 3: "Социальные отношения", 4: "Политика", 5: "Право" },
  "Информатика": { 1: "Информация и сети", 2: "Кодирование и алгоритмы", 3: "Программирование", 4: "Базы данных и таблицы", 5: "Обработка информации" },
};
const BY_HAND = {
  BA974A: "Механика", "46D7FD": "Механика", "420AF5": "Механика", F4D3FF: "Механика", CE0949: "Механика", F13F4D: "Механика",
  "0FDA4F": "Всё вместе", A11646: "Всё вместе", C2CF4D: "Всё вместе", "826D45": "Всё вместе",
  A94A44: "Электродинамика", BBFB41: "Механика",
};

function clean(text) {
  let s = String(text || "").replace(/ /g, " ").replace(/[ \t]+/g, " ");
  let lead = "";
  for (const l of LEADS) {
    if (s.trimStart().startsWith(l)) { lead = l; s = s.trimStart().slice(l.length); break; }
  }
  s = s.split("\n").map((l) => l.trim()).join("\n").replace(/\n{3,}/g, "\n\n").trim();
  let units = "";
  for (const tail of TAILS.slice().sort((a, b) => b.length - a.length)) {
    const re = new RegExp("(?:^|\\n)\\s*" + tail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*$");
    if (re.test(s)) { units = tail === "в раз(а)" || tail === "в (раз)а" ? "во сколько раз" : tail; s = s.replace(re, "").trim(); break; }
  }
  // Хвост вида «А Б 1 2 3 4 1 2 3 4» — это разметка полей ответа, а не условие.
  s = s.replace(/\n?\s*(?:[А-Д]\s+){2,5}(?:[1-6]\s*){2,40}$/u, "").trim();
  s = s.replace(/\n?\s*Ответ:\s*$/i, "").trim();
  return { lead, text: s, units };
}

function section(subject, task) {
  if (BY_HAND[task.id]) return BY_HAND[task.id];
  const m = String(task.kes || "").match(/^(\d)[.\s]/);
  const map = SECTIONS[subject] || {};
  return (m && map[m[1]]) || "Разное";
}

const EXTRA_ACCEPT = {
  BA68F8: ["10978", "109 78", "109;78"],
  F13F4D: ["0,75 0,05", "0,75±0,05", "0,750,05"],
  "2B1449": ["5069", "50 69", "50;69"],
  B00348: ["3138", "31 38", "31;38"],
};

const out = [];
const forBody = [];
for (const src of SOURCES) {
  const answers = JSON.parse(readFileSync(new URL(src.answers, import.meta.url), "utf8"));
  const seen = new Map();
  for (const file of [src.file, src.extra].filter(Boolean)) {
    for (const t of JSON.parse(readFileSync(file, "utf8")).tasks) {
      const was = seen.get(t.id);
      if (!was || (t.pictures || []).some((p) => p.data)) seen.set(t.id, t);
    }
  }
  for (const t of seen.values()) {
    const a = answers[t.id];
    if (!a) continue;
    const c = clean(t.text);
    const pictures = (t.pictures || []).filter((p) => p.data).map((p) => ({ data: p.data, w: p.w, h: p.h }));
    forBody.push({ id: t.id, html: t.html, pictures: t.pictures || [] });
    out.push({
      id: t.id,
      subject: src.subject,
      guid: t.guid || "",
      kes: t.kes || "",
      section: section(src.subject, t),
      type: t.answerType,
      lead: c.lead,
      text: c.text,
      units: c.units,
      pictures,
      answer: a.answer,
      accept: EXTRA_ACCEPT[t.id] || [],
      why: a.why,
      sure: a.sure && a.sure.startsWith("высокая") ? "" : a.sure,
    });
  }
}
// Разметка условия: таблицы и столбцы, без которых задание читается как каша.
const bodies = await cleanBodies(forBody);
out.forEach((t) => {
  const body = bodies[t.id] || "";
  // Совсем пустая или подозрительно короткая разметка — значит на текст надёжнее.
  t.body = body.replace(/<[^>]+>/g, "").replace(/[\s\u00A0]/g, "").length > 30 ? body : "";
});

out.sort((a, b) => a.section.localeCompare(b.section, "ru") || a.id.localeCompare(b.id));

// Порядок предметов в приложении: сначала тот, к чему готовятся всерьёз.
const ORDER = ["Обществознание", "Физика", "Информатика"];
const subjects = [...new Set(out.map((t) => t.subject))]
  .sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
const sections = {};
subjects.forEach((s) => { sections[s] = [...new Set(out.filter((t) => t.subject === s).map((t) => t.section))]; });

const header = `// Задания открытого банка ФИПИ: условия сняты со страницы банка, у каждого сохранён
// его номер — по нему задание находится в самом банке.
//
// Правильных ответов банк не отдаёт: его страница отправляет ответ на сервер и получает
// в ответ только «верно» или «неверно». Поэтому ответы здесь решены нами и помечены как
// несверенные, а проверяются они сообща — по совпадениям и отметкам учеников.
//
// Файл собран из выгрузок сборщика, менять его руками не нужно.
export const BANK_SOURCE = "Открытый банк заданий ЕГЭ, ФИПИ — ege.fipi.ru/bank";
export const BANK_URL = "https://ege.fipi.ru/bank/";

export const BANK_SUBJECTS = ${JSON.stringify(subjects, null, 2)};

export const BANK_SECTIONS = ${JSON.stringify(sections, null, 2)};

export const BANK_TASKS = `;

writeFileSync(new URL("../src/fipi-bank.js", import.meta.url), header + JSON.stringify(out, null, 1) + ";\n");

// Сторож: разметка не должна терять текст условия. Однажды вместе с полями
// ввода вылетала вся таблица, а с ней — все варианты ответа.
const plainOf = (html) => String(html).replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
const lost = out.filter((t) => {
  const inBody = plainOf(t.body).length;
  const inText = t.text.replace(/\s+/g, " ").trim().length;
  return inText > 120 && inBody < inText * 0.75;
});
if (lost.length) {
  console.log("!! разметка потеряла текст у " + lost.length + " заданий:");
  lost.slice(0, 10).forEach((t) => console.log("   " + t.subject + " " + t.id +
    ": в разметке " + plainOf(t.body).length + " против " + t.text.replace(/\s+/g, " ").trim().length));
}

console.log("всего заданий:", out.length, "| с разметкой условия:", out.filter((t) => t.body).length,
  "| с таблицами:", out.filter((t) => /<table/.test(t.body)).length);
subjects.forEach((s) => {
  const list = out.filter((t) => t.subject === s);
  console.log("  " + s + ":", list.length, "| с картинками:", list.filter((t) => t.pictures.length).length,
    "| разделы:", sections[s].join(", "));
});
const size = readFileSync(new URL("../src/fipi-bank.js", import.meta.url)).length;
console.log("размер файла:", Math.round(size / 1024), "КБ");
