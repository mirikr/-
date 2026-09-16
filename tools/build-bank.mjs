// Сборка набора заданий для приложения из выгрузок банка ФИПИ и наших ответов.
// Сборка набора заданий: из выгрузок сборщика ФИПИ и наших ответов получается
// src/fipi-bank.js. Запуск: FIPI_DIR=<папка с выгрузками> node tools/build-bank.mjs
// (нужен playwright с Chromium — им разбирается разметка условий).
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { cleanBodies } from "./clean-body.mjs";

// Где лежат выгрузки сборщика и наши ответы. Пути передаются переменной
// окружения, потому что сами файлы в репозиторий не кладутся: это сырьё.
const UP = process.env.FIPI_DIR || "./fipi";
const SOURCES = [
  // Свежая выгрузка физики идёт первой: в ней целы и формулы, и картинки.
  // Прежние оставлены — из них берутся задания, которых в новой не оказалось.
  { subject: "Физика", file: UP + "6b6f257f-_______300________.json",
    older: [UP + "4c6d30da-fipi-100.json", UP + "1910c825-fipi-110.json", UP + "ac16a348-fipi-100.json"],
    answers: "answers/physics.json" },
  { subject: "Обществознание", file: UP + "195a230a-__________________i-250.json",
    older: [UP + "b2a0ec16-_________100_______________.json", UP + "770f85e5-__________________-120.json"],
    answers: "answers/social.json" },
  { subject: "Информатика", file: UP + "ccaafe63-____________100_______________.json", answers: "answers/informatics.json" },
];

// Сколько всего заданий лежит в открытом банке ФИПИ по каждому предмету. Число
// считано на самом сайте банка: по нему видно, какая часть уже перенесена к нам.
const TOTALS = { "Обществознание": 1678, "Информатика": 2475, "Физика": 2344 };

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
  // Знака «±» на клавиатуре телефона нет — принимаем и то, чем его заменяют.
  "4A99FA": ["0,4 +- 0,1", "0,4+-0,1", "0,4 0,1", "0,40,1"],
  // Два поля ответа — «число протонов» и «число нейтронов»: их пишут и слитно.
  "10ACF0": ["34", "3 4", "3;4"],
  "1182F1": ["2936", "29 36", "29;36"],
  "2B6FF4": ["82210", "82 210", "82;210"],
  "DD65FF": ["3,8 +- 0,2", "3,8+-0,2", "3,8 0,2", "3,80,2"],
  "A46BFA": ["0,36 +- 0,02", "0,36+-0,02", "0,36 0,02", "0,360,02"],
  "9503F7": ["36 +- 2", "36+-2", "36 2", "362"],
  "1A3704": ["0,4 +- 0,05", "0,4+-0,05", "0,4 0,05", "0,40,05"],
  "1F660F": ["19 +- 1", "19+-1", "19 1", "191"],
  "189A00": ["1,8 +- 0,1", "1,8+-0,1", "1,8 0,1", "1,80,1"],
  "AFA401": ["3 +- 0,2", "3+-0,2", "3 0,2", "30,2", "3,0 +- 0,2", "3,0+-0,2"],
  "23190A": ["4761", "47 61", "47;61"],
  "51C0F9": ["48", "4 8", "4;8"],
  "8217F2": ["25499", "254 99", "254;99"],
};

const out = [];
const forBody = [];
for (const src of SOURCES) {
  const answers = JSON.parse(readFileSync(new URL(src.answers, import.meta.url), "utf8"));
  const seen = new Map();
  // Сначала кладём старые выгрузки, потом свежую — она перекрывает их.
  for (const file of [...(src.older || []), src.file].filter(Boolean)) {
    for (const t of JSON.parse(readFileSync(file, "utf8")).tasks) {
      const was = seen.get(t.id);
      const better = !was || t.raw || (t.pictures || []).some((p) => p.data && !(was.pictures || []).some((q) => q.data));
      if (better) seen.set(t.id, t);
    }
  }
  for (const t of seen.values()) {
    const a = answers[t.id];
    if (!a) continue;
    // Задания второй части проверяет эксперт, а не строчка с ответом. В тренажёре им нечего делать.
    if (/Развернутый/i.test(t.answerType || "")) continue;
    const c = clean(t.text);
    const pictures = (t.pictures || []).filter((p) => p.data).map((p) => ({ data: p.data, w: p.w, h: p.h }));
    forBody.push({ id: t.id, html: t.html, raw: t.raw || "", pictures: t.pictures || [] });
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
  // Картинка, которая уже встала в разметку, второй раз не нужна: иначе набор
  // тащит каждый рисунок дважды, а это мегабайты на ровном месте.
  t.pictures = t.pictures.filter((p) => !t.body.includes(p.data));
});

// Сторож: задание без своего рисунка решать нечем. Свежая выгрузка сборщика
// иногда приносит не саму картинку, а только ссылку на ege.fipi.ru — с сайта
// она не загрузится, и в тренажёре останется условие «определите по рисунку»
// без рисунка. Такие задания в набор не берём и называем вслух: их нужно снять
// сборщиком заново.
// Таблица истинности в банке тоже называется «рисунком», но она приходит
// разметкой и читается прекрасно — такие задания не трогаем.
const blind = out.filter((t) => /рисун|график|схем|диаграмм/i.test(t.lead + " " + t.text) &&
  !t.pictures.length && !/<img|<table/.test(t.body || ""));
if (blind.length) {
  console.log("!! без рисунка, в набор не взяты — " + blind.length + ":");
  blind.forEach((t) => console.log("   " + t.subject + " " + t.id));
}
const blindIds = new Set(blind.map((t) => t.id));
for (let i = out.length - 1; i >= 0; i -= 1) if (blindIds.has(out[i].id)) out.splice(i, 1);

out.sort((a, b) => a.section.localeCompare(b.section, "ru") || a.id.localeCompare(b.id));

// Порядок предметов в приложении: сначала тот, к чему готовятся всерьёз.
const ORDER = ["Обществознание", "Физика", "Информатика"];
const subjects = [...new Set(out.map((t) => t.subject))]
  .sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
const sections = {};
subjects.forEach((s) => { sections[s] = [...new Set(out.filter((t) => t.subject === s).map((t) => t.section))]; });

const totals = {};
subjects.forEach((s) => { if (TOTALS[s]) totals[s] = TOTALS[s]; });

// Латинское имя файла для предмета: кириллица в путях сборки только мешает.
const SLUG = { "Обществознание": "society", "Физика": "physics", "Информатика": "informatics" };

// Картинки уезжают из набора в отдельные файлы. Раньше каждая лежала внутри
// разметки строкой base64: это на треть толще самой картинки, одна и та же
// диаграмма повторялась в разных заданиях, и весь ворох грузился разом — даже
// если человек решал одно задание. Имя файла — отпечаток содержимого, поэтому
// повторы сами склеиваются в один файл.
const picsDir = new URL("../public/fipi/", import.meta.url);
rmSync(picsDir, { recursive: true, force: true });
mkdirSync(picsDir, { recursive: true });
const savedPics = new Map();
function savePicture(data) {
  const m = String(data).match(/^data:image\/([a-z]+);base64,(.+)$/);
  if (!m) return "";
  const kind = m[1] === "jpeg" ? "jpg" : m[1];
  const bytes = Buffer.from(m[2], "base64");
  const name = createHash("sha1").update(bytes).digest("hex").slice(0, 16) + "." + kind;
  if (!savedPics.has(name)) {
    writeFileSync(new URL(name, picsDir), bytes);
    savedPics.set(name, bytes.length);
  }
  return "fipi/" + name;
}
// Адрес пишем без начального слэша: приложение живёт и в подпапке сайта, и в
// предпросмотре, и подставляет свой корень само.
out.forEach((t) => {
  t.body = String(t.body || "").replace(/src="(data:image\/[a-z]+;base64,[^"]+)"/g,
    (all, data) => { const src = savePicture(data); return src ? 'src="' + src + '"' : all; });
  t.pictures = (t.pictures || []).map((p) => {
    const src = savePicture(p.data);
    return src ? { src, w: p.w, h: p.h } : null;
  }).filter(Boolean);
});

const head = (subject) => `// Задания открытого банка ФИПИ по предмету «${subject}»: условия сняты со страницы
// банка, у каждого сохранён его номер — по нему задание находится в самом банке.
//
// Правильных ответов банк не отдаёт: его страница отправляет ответ на сервер и получает
// в ответ только «верно» или «неверно». Поэтому ответы здесь решены нами и помечены как
// несверенные, а проверяются они сообща — по совпадениям и отметкам учеников.
//
// Файл собран из выгрузок сборщика, менять его руками не нужно.
export const TASKS = `;

// По файлу на предмет: набор грузится тот, который открыли, а не все сразу.
const bankDir = new URL("../src/bank/", import.meta.url);
mkdirSync(bankDir, { recursive: true });
readdirSync(bankDir).forEach((f) => { if (f.endsWith(".js")) rmSync(new URL(f, bankDir)); });
const sizes = {};
subjects.forEach((s) => {
  const list = out.filter((t) => t.subject === s);
  const file = (SLUG[s] || s.toLowerCase()) + ".js";
  writeFileSync(new URL(file, bankDir), head(s) + JSON.stringify(list, null, 1) + ";\n");
  sizes[s] = readFileSync(new URL(file, bankDir)).length;
});

// Опись набора: имена предметов, разделы и номера заданий. Она крошечная и
// грузится вместе с приложением — по ней рисуется выбор предмета и считается,
// сколько решено, ещё до того как открыт хоть один набор.
const index = `// Опись набора заданий: предметы, разделы и номера. Сами задания лежат по
// файлу на предмет в src/bank — грузится только открытый.
// Файл собран из выгрузок сборщика, менять его руками не нужно.
export const BANK_SOURCE = "Открытый банк заданий ЕГЭ, ФИПИ — ege.fipi.ru/bank";
export const BANK_URL = "https://ege.fipi.ru/bank/";

export const BANK_SUBJECTS = ${JSON.stringify(subjects.map((s) => ({
  name: s,
  file: SLUG[s] || s.toLowerCase(),
  count: out.filter((t) => t.subject === s).length,
  whole: TOTALS[s] || 0,
  sections: sections[s].map((name) => ({ name, count: out.filter((t) => t.subject === s && t.section === name).length })),
  ids: out.filter((t) => t.subject === s).map((t) => t.id),
})), null, 2)};

export const BANK_IDS = ${JSON.stringify(out.map((t) => t.id))};
`;
writeFileSync(new URL("../src/fipi-index.js", import.meta.url), index);

// Опись для поиска: номер, предмет, раздел и начало условия. Поиск по номеру
// задания нужен там же, где ищется всё остальное, — но тянуть ради него
// полтора мегабайта условий нельзя. Поэтому здесь только начало текста: по нему
// и ищется, и показывается строчка находки. Файл грузится отдельным куском и
// только тогда, когда открыли поиск.
const HEAD = 200;
const findable = out.map((t) => {
  const plain = String(t.text || "").replace(/\s+/g, " ").trim();
  return {
    id: t.id,
    subject: t.subject,
    section: t.section,
    text: plain.length > HEAD ? plain.slice(0, HEAD).replace(/\s+\S*$/, "") + "…" : plain,
  };
});
const find = `// Опись для поиска: номер задания, предмет, раздел и начало условия.
// Сами условия лежат по файлу на предмет в src/bank — здесь их нет: опись
// грузится отдельным куском, когда открыли поиск, и должна оставаться лёгкой.
// Файл собран из выгрузок сборщика, менять его руками не нужно.
// По строке на задание: так в истории правок видно, что именно изменилось.
export const FIND = [
${findable.map((t) => JSON.stringify(t)).join(",\n")}
];
`;
writeFileSync(new URL("../src/bank-find.js", import.meta.url), find);

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
  console.log("  " + s + ":", list.length, "| с картинками:", list.filter((t) => t.pictures.length || /<img/.test(t.body || "")).length,
    "| разделы:", sections[s].join(", "));
});
subjects.forEach((s) => console.log("  набор «" + s + "»:", Math.round(sizes[s] / 1024), "КБ"));
let picBytes = 0;
savedPics.forEach((n) => { picBytes += n; });
console.log("картинок отдельными файлами:", savedPics.size, "|", Math.round(picBytes / 1024), "КБ");
console.log("опись для поиска:", Math.round(readFileSync(new URL("../src/bank-find.js", import.meta.url)).length / 1024), "КБ");
