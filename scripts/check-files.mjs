// Один файл — в нескольких местах (1.7.0). Файл из задания добавляется в ветку
// тетради через окно «Выбрать из загруженных» с поиском, и наоборот — из
// тетради к заданию в Дневнике и к новому заданию при добавлении. Файл не
// копируется: в обоих местах та же ссылка. Убрали его из одного места — в
// хранилище он остаётся, пока есть другое; убрали отовсюду — стирается.
//
// Запуск: npm run check:files (нужны playwright и Chromium)
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
let bad = 0;
const want = (name, ok, note = "") => { if (!ok) bad += 1; console.log((ok ? "✓ " : "✗ ") + name + (note ? " — " + note : "")); };

const iso = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
const TODAY = iso(new Date());
const KONST = { name: "Конституция РФ.pdf", size: 1200, key: "hwfile-hw-1-1" };
const MAP = { name: "Карта Европы.png", size: 3400, key: "hwfile-note-2-2" };
const extra = Array.from({ length: 12 }, (_, i) => ({ name: "Конспект " + (i + 1) + ".docx", size: 500 + i, key: "hwfile-misc-" + (10 + i) }));
const state = {
  journal: [],
  lyceumSchedule: [{ id: "l1", day: "mon", start: "09:00", end: "09:45", subjectName: "Право" }],
  homework: [
    { id: "hw-1", date: TODAY, subjectName: "Право", text: "Прочитать главу 1 Конституции", minutes: 30, done: false, attachments: [KONST] },
    { id: "hw-2", date: TODAY, subjectName: "", text: "Повторить карту", minutes: 10, done: false, attachments: [] },
    { id: "hw-3", date: TODAY, subjectName: "", text: "Разное", minutes: 10, done: false, attachments: extra },
  ],
  notebooks: {
    "lyceum:Право": [{ id: "b1", title: "Конституционное право", branches: [{ id: "r1", title: "Основы строя", html: "<p>…</p>", files: [] }] }],
    "lyceum:География": [{ id: "b2", title: "Европа", branches: [{ id: "r2", title: "Страны", html: "", files: [MAP] }] }],
  },
};

const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
page.setDefaultTimeout(6000);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.addInitScript(([st, files]) => {
  if (sessionStorage.getItem("seeded")) return;
  sessionStorage.setItem("seeded", "1");
  localStorage.setItem("planner-intro-version", "0.6.0-schedule");
  localStorage.setItem("planner-design-intro", "1.0.0");
  localStorage.setItem("planner-screen", "notes");
  localStorage.setItem("planner:planner-state-v5", JSON.stringify({ value: JSON.stringify(st), updatedAt: Date.now() - 1000 }));
  files.forEach((f) => localStorage.setItem("planner:" + f.key, JSON.stringify({ value: "data:text/plain;base64,MQ==", updatedAt: Date.now() })));
}, [state, [KONST, MAP, ...extra]]);
await page.goto(URL0);
await page.waitForTimeout(2200);
const stored = () => page.evaluate(() => JSON.parse(JSON.parse(localStorage.getItem("planner:planner-state-v5")).value));
const kvHas = (key) => page.evaluate((k) => localStorage.getItem("planner:" + k) !== null, key);

// 1. Тетрадь «Право» → ветка «Основы строя» → «Из загруженных» → поиск «конст».
await page.locator(".ap-notes-subject", { hasText: "Право" }).first().click().catch(() => {});
await page.getByRole("button", { name: /Основы строя/ }).first().click().catch(() => {});
await page.waitForTimeout(400);
await page.getByRole("button", { name: "Из загруженных" }).first().click();
const dialog = page.getByRole("dialog", { name: "Выбрать из загруженных" });
want("окно выбора открылось", await dialog.isVisible());
const all = await dialog.getByRole("option").count();
want("в окне все загруженные файлы, кроме уже прикреплённых здесь", all === 2 + extra.length, String(all));
const first = await dialog.getByRole("option").first().innerText();
want("файлы предмета — первыми", /Конституция/.test(first), first.split("\n")[0]);
await dialog.getByLabel("Поиск файла").fill("конст");
want("поиск по названию сужает список", (await dialog.getByRole("option").count()) === 1);
await dialog.getByLabel("Поиск файла").fill("тетрадь европа");
want("поиск по месту: «тетрадь европа» — карта", (await dialog.getByRole("option").count()) === 1 && /Карта Европы/.test(await dialog.getByRole("option").first().innerText()));
await dialog.getByLabel("Поиск файла").fill("конст");
await dialog.getByRole("option").first().click();
await dialog.getByRole("button", { name: "Прикрепить (1)" }).click();
await page.waitForTimeout(1300);
let st = await stored();
const r1 = st.notebooks["lyceum:Право"][0].branches[0];
want("файл задания появился в ветке тетради — та же ссылка", (r1.files || []).length === 1 && r1.files[0].key === KONST.key, JSON.stringify(r1.files));
want("у задания он остался", st.homework.find((h) => h.id === "hw-1").attachments[0].key === KONST.key);
await page.getByRole("button", { name: "Из загруженных" }).first().click();
want("повторно: в окне помечено «уже здесь»", /уже здесь/.test(await dialog.innerText()));
await dialog.getByRole("button", { name: "Отмена" }).click();

// 2. Дневник: к заданию «Повторить карту» — карта из тетради географии.
await page.evaluate(() => localStorage.setItem("planner-screen", "journal"));
await page.reload();
await page.waitForTimeout(2200);
const hw2 = page.locator('[data-focus-id="hw:hw-2"]');
await hw2.getByTitle("Выбрать файл, который уже загружен в задание или тетрадь").click();
await dialog.getByLabel("Поиск файла").fill("карта");
await dialog.getByRole("option").first().click();
await dialog.getByRole("button", { name: /^Прикрепить/ }).click();
await page.waitForTimeout(1300);
st = await stored();
want("файл из тетради прикреплён к заданию", st.homework.find((h) => h.id === "hw-2").attachments.some((f) => f.key === MAP.key));
want("и виден у задания плиткой", /Карта Европы/.test(await hw2.innerText()));

// 3. Новое задание — сразу с файлом из тетради. Форма открывается «+ дело».
await page.locator(".ap-dfree .ap-dadd").click();
const freeForm = page.getByPlaceholder("Например: подать заявку на олимпиаду");
await freeForm.fill("Нанести столицы");
const formRow = freeForm.locator("xpath=..");
await formRow.getByTitle("Выбрать файл, который уже загружен в задание или тетрадь").click();
await dialog.getByLabel("Поиск файла").fill("европы");
await dialog.getByRole("option").first().click();
await dialog.getByRole("button", { name: /^Прикрепить/ }).click();
want("выбранный файл показан у формы до добавления", (await page.locator("[data-staged]").count()) === 1);
await freeForm.press("Enter");
await page.waitForTimeout(1300);
st = await stored();
const added = st.homework.find((h) => h.text === "Нанести столицы");
want("новое задание создано с файлом", !!added && added.attachments.length === 1 && added.attachments[0].key === MAP.key);

// 4. Убрали файл из одного задания — в хранилище он остаётся (он ещё в тетради и в другом задании).
await hw2.getByRole("button", { name: "Убрать файл: " + MAP.name }).click();
// Уведомление «Отменить» живёт 20 секунд, затем проверка ссылок — ещё 1,5.
await page.waitForTimeout(23500);
st = await stored();
want("из задания файл убран", !st.homework.find((h) => h.id === "hw-2").attachments.some((f) => f.key === MAP.key));
want("в хранилище он остался — нужен в других местах", await kvHas(MAP.key));

// 5. Задание, где файл был только у него, удалили — файл из хранилища стирается.
await page.locator('[data-focus-id="hw:hw-3"]').getByRole("button", { name: "×", exact: true }).first().click();
await page.waitForTimeout(23500);
want("файл, на который не осталось ссылок, стёрт", !(await kvHas(extra[0].key)));
want("ошибок нет", errors.length === 0, errors[0] || "");

await browser.close();
server.close();
if (bad) {
  console.log(`\n${bad} проверок не прошло`);
  process.exit(1);
}
console.log("\nфайлы в нескольких местах: всё в порядке");
