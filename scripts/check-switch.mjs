// Переход на новую сетку лицея — на живом приложении.
//
// Берём расписание, собранное по прежней сетке (scripts/fixtures), задания на
// следующую неделю, тетради и свою важность уроков — и открываем новую версию.
// Проверяем: уроки пересобраны по новой сетке, задания переехали на новые
// уроки своих предметов, тетради и предметы на месте, важность сохранилась,
// окно «Расписание лицея изменилось» говорит, что куда переехало и что нужно
// выбрать, и после «Понятно» больше не появляется.
//
// Запуск: npm run check:switch
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
const playwright = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const { chromium } = playwright.chromium ? playwright : playwright.default;
const DIST = resolve(process.cwd(), process.env.DIST || "dist");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".png": "image/png", ".webmanifest": "application/manifest+json" };
const server = createServer(async (req, res) => {
  let p = req.url.split("?")[0].replace(/^\/[^/]+\//, "/"); if (p.endsWith("/")) p += "index.html";
  try { const b = await readFile(resolve(DIST, "." + p)); res.writeHead(200, { "content-type": TYPES[p.slice(p.lastIndexOf("."))] || "application/octet-stream" }); res.end(b); } catch (e) { res.writeHead(404).end(); }
});
await new Promise((d) => server.listen(0, "127.0.0.1", d));
const URL0 = `http://127.0.0.1:${server.address().port}/-/`;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const SHOT_DIR = process.env.SHOT_DIR || "";
let bad = 0;
const want = (name, ok, note = "") => { if (!ok) bad += 1; console.log((ok ? "✓ " : "✗ ") + name + (note ? " — " + note : "")); };

const fixture = JSON.parse(await readFile(resolve(process.cwd(), "scripts/fixtures/lyceum-grid-2026-09-01.json"), "utf8"));
const iso = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
// Следующая неделя: понедельник после сегодняшнего дня.
const now = new Date();
const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + (((8 - now.getDay()) % 7) || 7));
const day = (n) => iso(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + n));
const [MON, TUE, WED, THU] = [day(0), day(1), day(2), day(3)];
const yesterday = iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));

// Своя важность — у обществознания: в новой сетке оно на других днях, и
// важность должна перейти по предмету, а не по часу.
const old = fixture.schedule.map((e) => (e.subjectName === "Обществознание" ? { ...e, priority: 3 } : e));
const oldSocTue = old.find((e) => e.subjectName === "Обществознание" && e.day === "tue");
const oldLogic = old.find((e) => e.subjectName === "Логика");
const manual = { id: "sch-manual-1", day: "sat", kind: "lesson", subjectName: "Репетитор по праву", level: "base", priority: 2, start: "15:00", end: "16:00", room: "", teacher: "", place: "", url: "", date: "" };
const notebooks = {
  "lyceum:Логика": [{ id: "b-logic", title: "Силлогизмы", branches: [{ id: "r-logic", title: "Фигуры", html: "<p>AAA</p>", files: [] }] }],
  "lyceum:Английский язык (гр. 1)": [{ id: "b-eng", title: "Unit 2", branches: [{ id: "r-eng", title: "Слова", html: "<p>museum</p>", files: [] }] }],
};
const homework = [
  // Обществознание вторником → в новой сетке у права оно в пн, ср и чт: среда.
  { id: "hw-soc", lessonId: oldSocTue.id, date: TUE, subjectName: "Обществознание", text: "Эссе про право", minutes: 40, done: false, attachments: [] },
  // Логика понедельником (трек) → теперь урок школы права во вторник.
  { id: "hw-logic", lessonId: oldLogic.id, date: MON, subjectName: "Логика", text: "Задачи 1–5", minutes: 20, done: false, attachments: [] },
  // Из «Дневника»: русский язык в среду → в новой сетке он во вт и чт: четверг.
  { id: "hw-rus", date: WED, subjectName: "Русский язык", text: "Упр. 120", minutes: 25, done: false, attachments: [], lessonId: "" },
  { id: "hw-done", lessonId: oldSocTue.id, date: TUE, subjectName: "Обществознание", text: "уже сделано", done: true, attachments: [] },
  { id: "hw-past", lessonId: oldSocTue.id, date: yesterday, subjectName: "Обществознание", text: "прошлое", done: false, attachments: [] },
];
const state = { lyceumRevision: 2, presetChoices: fixture.choices, lyceumSchedule: [...old, manual], homework, notebooks };

const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
page.setDefaultTimeout(5000);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.addInitScript((st) => {
  if (sessionStorage.getItem("seeded")) return;
  sessionStorage.setItem("seeded", "1");
  localStorage.setItem("planner-intro-version", "0.6.0-schedule");
  localStorage.setItem("planner-design-intro", "1.0.0");
  localStorage.setItem("planner-screen", "school");
  localStorage.setItem("planner:planner-state-v5", JSON.stringify({ value: JSON.stringify(st), updatedAt: Date.now() - 1000 }));
}, state);
await page.goto(URL0);
await page.waitForTimeout(2200);

const dialog = page.getByRole("dialog", { name: "Расписание лицея изменилось" });
want("после обновления — окно «Расписание лицея изменилось»", await dialog.isVisible());
const text = (await dialog.innerText()).replace(/\s+/g, " ");
want("в окне — сколько заданий переехало", /Перенесено 3 задания/.test(text), text.slice(0, 160));
want("в окне — задание по обществознанию и куда оно переехало", (await dialog.locator('[data-news-move="hw-soc"]').count()) === 1);
want("в окне — просьба выбрать группу физкультуры", /Группу физкультуры/.test(text));
if (SHOT_DIR) await page.screenshot({ path: SHOT_DIR + "/switch-dialog.png" });

await page.waitForTimeout(1200);
const stored = await page.evaluate(() => JSON.parse(JSON.parse(localStorage.getItem("planner:planner-state-v5")).value));
const lessons = stored.lyceumSchedule || [];
const ids = new Set(lessons.map((e) => e.id));
const hw = Object.fromEntries((stored.homework || []).map((h) => [h.id, h]));
want("расписание пересобрано по новой сетке", stored.lyceumRevision === 3 && lessons.some((e) => e.subjectName === "Логика" && e.day === "tue" && e.start === "12:20"));
want("урок, заведённый руками, на месте", lessons.some((e) => e.id === "sch-manual-1"));
want("обществознание: вторник → среда той же недели, к новому уроку", hw["hw-soc"].date === WED && ids.has(hw["hw-soc"].lessonId), hw["hw-soc"].date + " " + hw["hw-soc"].lessonId);
want("логика: понедельник → вторник той же недели", hw["hw-logic"].date === TUE && ids.has(hw["hw-logic"].lessonId), hw["hw-logic"].date);
want("задание из «Дневника» по русскому: среда → четверг", hw["hw-rus"].date === THU, hw["hw-rus"].date);
want("сделанное и прошедшее задания не тронуты", hw["hw-done"].date === TUE && hw["hw-done"].lessonId === oldSocTue.id && hw["hw-past"].date === yesterday);
const strip = (list) => JSON.stringify((list || []).map(({ __u, ...b }) => ({ ...b, branches: (b.branches || []).map(({ __u: x, ...r }) => r) })));
want("тетради не изменились", Object.keys(notebooks).every((k) => strip(stored.notebooks[k]) === strip(notebooks[k])));
const soc = lessons.filter((e) => e.subjectName === "Обществознание");
want("своя важность обществознания перешла на новые уроки", soc.length > 0 && soc.every((e) => Number(e.priority) === 3), soc.map((e) => e.day + ":" + e.priority).join(","));

// «Выбрать» ведёт к панели готового расписания и раскрывает её.
await dialog.getByRole("button", { name: "Выбрать" }).click();
await page.waitForTimeout(800);
// Без входа в аккаунт панель просит войти (готовое расписание живёт в облаке);
// со входом — показывает выбор групп, в том числе физкультуры.
const opened = (await page.getByText("Физкультура", { exact: true }).count()) >= 1 || (await page.getByRole("button", { name: "Войти или зарегистрироваться" }).isVisible());
want("«Выбрать» ведёт к раскрытой панели готового расписания", opened && !(await dialog.isVisible()));
await page.reload();
await page.waitForTimeout(1800);
want("после «Понятно»/«Выбрать» окно больше не появляется", !(await dialog.isVisible()));

// Предметы и тетради в «Тетрадях» — те же.
await page.evaluate(() => localStorage.setItem("planner-screen", "notes"));
await page.reload();
await page.waitForTimeout(1500);
const subjects = await page.locator(".ap-notes-subject").allInnerTexts();
want("в «Тетрадях» — предметы с тетрадями на месте", subjects.some((s) => s.includes("Логика")) && subjects.some((s) => s.includes("Английский язык (гр. 1)")), subjects.length + " предметов");

// Будущее: предмет пропал из сетки — его тетрадь с записями остаётся в списке.
await page.evaluate(() => {
  const raw = JSON.parse(localStorage.getItem("planner:planner-state-v5"));
  const st = JSON.parse(raw.value);
  st.lyceumSchedule = st.lyceumSchedule.filter((e) => e.subjectName !== "Логика");
  localStorage.setItem("planner:planner-state-v5", JSON.stringify({ value: JSON.stringify(st), updatedAt: Date.now() }));
});
await page.reload();
await page.waitForTimeout(1500);
const after = await page.locator(".ap-notes-subject").allInnerTexts();
want("предмета нет в сетке — тетрадь с записями всё равно в списке", after.some((s) => s.includes("Логика")));

want("ошибок нет", errors.length === 0, errors[0] || "");
await ctx.close();

// Обновление вида (1.3 → 1.5: новая лента «Лицея», «Распределение») на записях,
// какими их сохраняет 1.3: ни урок, ни задание, ни тетрадь, ни запись дневника
// не меняются и не пропадают. Выбор среди одновременных уроков только ставит
// пометку skip и снимается обратно.
{
  const { buildSchedule } = await import(resolve(process.cwd(), "src/lyceum-schedule-10.js"));
  const choices = { school: "law", groups: { eng: "ivanova", math: "andropova", rus: "timoshkova", pe: "g2m" }, tiers: { eng: "base", math: "base" }, specs: ["soc", "law"] };
  const schedule = buildSchedule(choices).map((e) => (e.subjectName === "Обществознание" ? { ...e, priority: 3 } : e));
  const soc = schedule.find((e) => e.subjectName === "Обществознание");
  const st13 = {
    lyceumRevision: 3,
    presetChoices: choices,
    lyceumSchedule: [...schedule, manual],
    homework: [{ id: "hw-1", lessonId: soc.id, date: TUE, subjectName: "Обществознание", text: "Эссе", minutes: 40, done: false, attachments: [] }],
    notebooks,
    journal: [{ id: "j1", date: yesterday, subjectId: "law", hours: 1.5, note: "Конспект" }],
    events: [{ id: "ev1", name: "Олимпиада по праву", date: THU, priority: 3 }],
  };
  const c2 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const p2 = await c2.newPage();
  p2.setDefaultTimeout(5000);
  const errs = [];
  p2.on("pageerror", (e) => errs.push(e.message));
  await p2.addInitScript((st) => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem("planner-intro-version", "0.6.0-schedule");
    localStorage.setItem("planner-design-intro", "1.0.0");
    localStorage.setItem("planner-screen", "school");
    localStorage.setItem("planner:planner-state-v5", JSON.stringify({ value: JSON.stringify(st), updatedAt: Date.now() - 1000 }));
  }, st13);
  await p2.goto(URL0);
  await p2.waitForTimeout(1500);
  // Пройтись по всем дням и разделам, как человек после обновления.
  for (const tab of await p2.getByRole("tab").all()) { await tab.click(); await p2.waitForTimeout(150); }
  for (const scr of ["today", "budget", "study", "notes", "journal", "events", "school"]) {
    await p2.evaluate((k) => localStorage.setItem("planner-screen", k), scr);
    await p2.reload();
    await p2.waitForTimeout(700);
  }
  const noStamp = (list) => JSON.stringify((list || []).map(({ __u, ...rest }) => rest));
  const got = await p2.evaluate(() => JSON.parse(JSON.parse(localStorage.getItem("planner:planner-state-v5")).value));
  want("1.3 → 1.5: уроки расписания те же, все на месте", noStamp(got.lyceumSchedule) === noStamp(st13.lyceumSchedule), (got.lyceumSchedule || []).length + " из " + st13.lyceumSchedule.length);
  want("1.3 → 1.5: задания не тронуты", noStamp(got.homework) === noStamp(st13.homework));
  want("1.3 → 1.5: записи дневника и события не тронуты", noStamp(got.journal) === noStamp(st13.journal) && noStamp(got.events) === noStamp(st13.events));
  want("1.3 → 1.5: тетради не тронуты", Object.keys(notebooks).every((k) => strip(got.notebooks[k]) === strip(notebooks[k])));
  want("1.3 → 1.5: пересборки сетки не было (окна о смене нет)", got.lyceumRevision === 3 && !(await p2.getByRole("dialog", { name: "Расписание лицея изменилось" }).isVisible()));

  // Одновременные уроки: выбор — пометка, а не удаление.
  let picked = null;
  for (const tab of await p2.getByRole("tab").all()) {
    await tab.click();
    await p2.waitForTimeout(200);
    if (await p2.locator(".ap-sd-opt").count()) { picked = tab; break; }
  }
  if (picked) {
    await p2.locator(".ap-sd-opt").first().click();
    await p2.waitForTimeout(1500);
    const after = await p2.evaluate(() => JSON.parse(JSON.parse(localStorage.getItem("planner:planner-state-v5")).value).lyceumSchedule);
    want("выбор среди одновременных: ни один урок не удалён", after.length === st13.lyceumSchedule.length, after.length + " из " + st13.lyceumSchedule.length);
    want("остальные варианты только помечены", after.filter((e) => e.skip).length > 0);
    await p2.getByRole("button", { name: "Изменить выбор" }).first().click();
    await p2.waitForTimeout(1500);
    const back = await p2.evaluate(() => JSON.parse(JSON.parse(localStorage.getItem("planner:planner-state-v5")).value).lyceumSchedule);
    want("«Изменить выбор» снимает пометки", back.filter((e) => e.skip).length === 0 && noStamp(back) === noStamp(st13.lyceumSchedule));
  } else {
    want("в неделе есть одновременные уроки для проверки выбора", false);
  }
  want("1.3 → 1.5: ошибок нет", errs.length === 0, errs[0] || "");
  await c2.close();
}

await browser.close();
server.close();
console.log(bad ? `\nпровалено: ${bad}` : "\nпереход на новую сетку проходит без потерь");
process.exit(bad ? 1 : 0);
