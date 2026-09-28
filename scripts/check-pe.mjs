// Физкультура днями (1.5.2): в «Настроить расписание» — сетка «день × урок»
// (вт–пт, 7–8 урок), не больше двух клеток: два дня по уроку или один день
// двумя уроками. Прежний выбор группой читается как оба урока её дня — уроки и
// задания не меняются, пока человек сам не поменяет дни. Перенёс дни — задание
// к физкультуре уезжает на новый день той же недели.
//
// Панель готового расписания без входа в аккаунт закрыта, поэтому проверка
// идёт на сборке без облака:
//   BASE_PATH=/-/ VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= npx vite build --outDir dist-nocloud
//   DIST=dist-nocloud npm run check:pe
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { buildSchedule } from "../src/lyceum-schedule-10.js";
const playwright = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const { chromium } = playwright.chromium ? playwright : playwright.default;
const DIST = resolve(process.cwd(), process.env.DIST || "dist-nocloud");
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

const iso = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
// Следующая неделя целиком в будущем: задание на её вторник уедет на четверг.
const now = new Date();
const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + (((8 - now.getDay()) % 7) || 7));
const day = (n) => iso(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + n));
const [TUE, THU] = [day(1), day(3)];

const choices = { school: "hum", groups: { eng: "ivanova", math: "andropova", rus: "pobortseva", pe: "g1f" }, tiers: { eng: "base", math: "base" }, specs: [] };
const lessons = buildSchedule(choices);
const pe = (list) => list.filter((e) => e.subjectName === "Физическая культура");
const tuePe = pe(lessons).find((e) => e.start === "14:05");
const homework = [{ id: "hw-pe", lessonId: tuePe.id, date: TUE, subjectName: "Физическая культура", text: "Спортивная форма", minutes: 5, done: false, attachments: [] }];
const notebooks = { "lyceum:Физическая культура": [{ id: "b-pe", title: "Нормативы", branches: [{ id: "r-pe", title: "Бег", html: "<p>60 м</p>", files: [] }] }] };
const state = { lyceumRevision: 3, presetChoices: choices, lyceumSchedule: lessons, homework, notebooks };

for (const [w, tag] of [[1280, "desktop"], [390, "phone"]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 } });
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
  const stored = () => page.evaluate(() => JSON.parse(JSON.parse(localStorage.getItem("planner:planner-state-v5")).value));

  const first = await stored();
  want(`${tag}: после обновления физкультура та же — вторник, два урока`, JSON.stringify(pe(first.lyceumSchedule).map((e) => e.id)) === JSON.stringify(pe(lessons).map((e) => e.id)));
  want(`${tag}: окна о смене расписания нет`, (await page.getByRole("dialog", { name: "Расписание лицея изменилось" }).count()) === 0);

  await page.getByRole("button", { name: "Настроить расписание" }).first().click();
  await page.waitForTimeout(600);
  const grid = page.getByRole("group", { name: "Физкультура" });
  const cell = (d, n) => grid.getByRole("button", { name: `Физкультура: ${d}, ${n} урок` });
  const pressed = async () => {
    const out = [];
    for (const d of ["Вт", "Ср", "Чт", "Пт"]) for (const n of [7, 8]) if ((await cell(d, n).getAttribute("aria-pressed")) === "true") out.push(d + n);
    return out.join(",");
  };
  want(`${tag}: прежняя группа показана днями — Вт 7 и Вт 8`, (await pressed()) === "Вт7,Вт8", await pressed());
  want(`${tag}: подпись «один день, два урока»`, /один день, два урока/.test(await grid.innerText()));
  if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/pe-${tag}.png`, fullPage: true });

  await cell("Чт", 7).click();
  want(`${tag}: третья отметка снимает самую раннюю`, (await pressed()) === "Вт8,Чт7", await pressed());
  want(`${tag}: подпись «два дня по уроку»`, /два дня по уроку/.test(await grid.innerText()));
  await cell("Чт", 8).click();
  want(`${tag}: один день двумя уроками — Чт 7 и Чт 8`, (await pressed()) === "Чт7,Чт8", await pressed());
  await page.getByRole("button", { name: "Обновить расписание" }).click();
  await page.waitForTimeout(1500);

  const after = await stored();
  const peNow = pe(after.lyceumSchedule);
  want(`${tag}: физкультура теперь в четверг, два урока`, peNow.length === 2 && peNow.every((e) => e.day === "thu"), peNow.map((e) => e.day + " " + e.start).join(", "));
  want(`${tag}: преподаватель — по группе девочек`, peNow.every((e) => e.teacher === "Дьяченко Д.Д."));
  const hw = after.homework.find((h) => h.id === "hw-pe");
  const target = after.lyceumSchedule.find((e) => e.id === hw.lessonId);
  want(`${tag}: задание к физкультуре переехало на четверг той же недели`, hw.date === THU && target && target.day === "thu", hw.date);
  want(`${tag}: выбор хранится днями, прежняя группа убрана`, JSON.stringify(after.presetChoices.pe) === JSON.stringify({ at: ["thu#7", "thu#8"], group: "f" }) && !after.presetChoices.groups.pe);
  want(`${tag}: остальные уроки не тронуты`, after.lyceumSchedule.filter((e) => e.subjectName !== "Физическая культура").map((e) => e.id).join() === lessons.filter((e) => e.subjectName !== "Физическая культура").map((e) => e.id).join());
  want(`${tag}: тетрадь физкультуры цела`, JSON.stringify(after.notebooks["lyceum:Физическая культура"].map((b) => b.title)) === '["Нормативы"]');
  if (tag === "phone") {
    const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    want("телефон: ничего не едет вбок", wide <= 1, wide + " px");
  }
  want(`${tag}: ошибок нет`, errors.length === 0, errors[0] || "");
  await ctx.close();
}

await browser.close();
server.close();
if (bad) {
  console.log(`\n${bad} проверок не прошло`);
  process.exit(1);
}
console.log("\nфизкультура днями: выбор, перенос заданий и прежние записи — в порядке");
