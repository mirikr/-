// Проверяет, что записи прошлой версии переживают обновление.
//
// Худшее, что может сделать ежедневник, — потерять полугодовые конспекты при
// переходе на новую версию. Проверка кладёт в хранилище состояние, каким оно
// лежит у человека сейчас, открывает собранное приложение и смотрит, что всё
// на месте и ничего не упало.
//
// Запуск: npm run check:upgrade
// (нужны playwright и Chromium: PLAYWRIGHT_MODULE и CHROMIUM_PATH)
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, extname } from "node:path";

const playwright = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const { chromium } = playwright.chromium ? playwright : playwright.default;
const BROWSER = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

const DIST = resolve(process.cwd(), "dist");
if (!existsSync(resolve(DIST, "index.html"))) {
  console.error("Нет собранного приложения: сначала npx vite build");
  process.exit(1);
}

const TYPES = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".png": "image/png",
  ".webmanifest": "application/manifest+json",
  ".json": "application/json",
};

const server = createServer(async (req, res) => {
  // Боевая сборка живёт под префиксом репозитория — снимаем первый сегмент.
  let path = req.url.split("?")[0].replace(/^\/[^/]+\//, "/");
  if (path === "/" || path.endsWith("/")) path += "index.html";
  try {
    const body = await readFile(resolve(DIST, "." + path));
    res.writeHead(200, { "content-type": TYPES[extname(path)] || "application/octet-stream" });
    res.end(body);
  } catch (e) {
    res.writeHead(404).end("not found");
  }
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const port = server.address().port;

const ymd = (d) => d.toISOString().slice(0, 10);
const inDays = (n) => ymd(new Date(Date.now() + n * 86400000));

// Состояние прошлой версии: по записи каждого вида, какие приложение хранит.
// Заметьте: customSubjects есть, а его записи в data — нет. Так бывает, когда
// правки с двух устройств доезжают по частям, и на этом приложение когда-то
// падало белым экраном.
const OLD_STATE = {
  journal: [
    { id: "j1", date: inDays(0), subject: "Право", hours: 2, note: "Конституция" },
    { id: "j2", date: inDays(-2), subject: "Экономика", hours: 1.5, note: "Спрос" },
  ],
  budget: {
    daily: { mon: 150, tue: 150, wed: 150, thu: 150, fri: 150, sat: 240, sun: 240 },
    alloc: { law: 3, econ: 5, polit: 2, soc: 4, phil: 1, hist: 2 },
  },
  events: [{ id: "ev1", name: "Региональный этап ВсОШ", date: inDays(30), priority: 3 }],
  lyceumSchedule: [
    { id: "s1", day: "mon", kind: "lesson", subjectName: "Алгебра", level: "prof", priority: 2, start: "08:30", end: "09:10", room: "каб. 402", teacher: "Гранкина И.В.", place: "", url: "", date: "" },
    { id: "s2", day: "wed", kind: "exam", examKind: "olympiad", subjectName: "Олимпиада по праву", level: "base", priority: 3, start: "10:00", end: "13:00", room: "", teacher: "", place: "ЮФУ", url: "", date: inDays(5) },
    // Урок из готового расписания прошлого выпуска: приложение должно пересобрать
    // его само, не тронув две записи выше — они добавлены руками.
    { id: "sch-lyceum10-tue-3-1", day: "tue", kind: "lesson", subjectName: "Русский язык", level: "base", priority: 1, start: "10:20", end: "11:00", room: "каб. 401", teacher: "Петращук В.В.", place: "", url: "", date: "", preset: "lyceum10" },
  ],
  presetChoices: { school: "law", groups: { rus: "timoshkova", eng: "ivanova", math: "base" }, specs: [] },
  notebooks: {
    "subj:law": [{ id: "b1", name: "ТГП", branches: [{ id: "br1", name: "Источники права", html: "<p>Конспект</p>", notes: [], files: [] }] }],
  },
  customSubjects: [{ id: "c1", name: "Английский", color: "#2F4E70", topics: [{ id: "t1", name: "Времена", done: true }], custom: [] }],
  hiddenSubjects: ["phil"],
  subjectColors: { law: "#B23A3A" },
  homework: [{ id: "h1", date: inDays(0), subjectName: "Алгебра", text: "№12", minutes: 30, done: false }],
  showSunday: true,
  openSections: { events: true },
};

const browser = await chromium.launch({ executablePath: BROWSER });
const page = await browser.newPage({ viewport: { width: 1300, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.addInitScript((value) => {
  localStorage.setItem("planner:planner-state-v5", JSON.stringify({ value, updatedAt: Date.now() - 86400000 }));
}, JSON.stringify(OLD_STATE));

await page.goto(`http://127.0.0.1:${port}/`);
await page.waitForTimeout(2200);

const after = await page.evaluate(() => {
  const raw = localStorage.getItem("planner:planner-state-v5");
  return raw ? JSON.parse(JSON.parse(raw).value) : null;
});

const problems = [];
function want(name, got, expected) {
  const ok = JSON.stringify(got) === JSON.stringify(expected);
  if (!ok) problems.push(`${name}: ${JSON.stringify(got)} вместо ${JSON.stringify(expected)}`);
  console.log((ok ? "✓ " : "✗ ") + name);
}

if (!after) {
  problems.push("состояние исчезло из хранилища целиком");
} else {
  want("записи дневника", after.journal?.length, 2);
  want("события", after.events?.length, 1);
  // Свои записи не должны пострадать от пересборки готового расписания.
  want("свой урок на месте", !!after.lyceumSchedule?.some((e) => e.id === "s1"), true);
  want("своя олимпиада на месте", !!after.lyceumSchedule?.some((e) => e.id === "s2"), true);
  want("готовое расписание пересобралось", after.lyceumSchedule?.length > 3, true);
  want("новый урок подтянулся сам", !!after.lyceumSchedule?.some((e) => /Основы ИИ/.test(e.subjectName)), true);
  want("блоки тетради", after.notebooks?.["subj:law"]?.length, 1);
  want("конспект внутри ветки", after.notebooks?.["subj:law"]?.[0]?.branches?.[0]?.html, "<p>Конспект</p>");
  want("свои предметы", after.customSubjects?.length, 1);
  want("домашние задания", after.homework?.length, 1);
  want("скрытые предметы", after.hiddenSubjects?.length, 1);
  want("свой цвет предмета", after.subjectColors?.law, "#B23A3A");
  want("часы распределения", after.budget?.alloc?.econ, 5);
  want("воскресенье в расписании", after.showSunday, true);
}

const text = await page.locator("#root").innerText();
want("приложение нарисовалось", text.length > 400, true);
if (errors.length) problems.push("ошибки на странице: " + errors.join("; "));
console.log(errors.length ? "✗ ошибок на странице: " + errors.length : "✓ ошибок на странице нет");

await browser.close();
server.close();

if (problems.length) {
  console.error("\nОбновление ломает данные:\n- " + problems.join("\n- "));
  process.exit(1);
}
console.log("\nзаписи прошлой версии пережили обновление");
