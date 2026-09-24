// Проверка страховки: если данные испорчены и приложение падает, человек должен
// увидеть не белый лист, а экран с копией своих записей.
//
// Испорченные данные тут не выдуманные: ровно так выглядит запись, приехавшая
// с другого устройства в чужом формате — на этом приложение уже белело один раз.
//
// Запуск: node scripts/check-crash.mjs (нужны PLAYWRIGHT_MODULE и CHROMIUM_PATH)
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const playwright = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const { chromium } = playwright.chromium ? playwright : playwright.default;
const BROWSER = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const DIST = resolve(process.cwd(), "dist");

const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".webmanifest": "application/manifest+json" };
const server = createServer(async (req, res) => {
  // Боевая сборка живёт под префиксом репозитория — снимаем первый сегмент.
  let path = req.url.split("?")[0].replace(/^\/[^/]+\//, "/");
  if (path === "/" || path.endsWith("/")) path += "index.html";
  const file = resolve(DIST, "." + path);
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": types[path.slice(path.lastIndexOf("."))] || "application/octet-stream" });
    res.end(body);
  } catch (e) {
    res.writeHead(404).end("not found");
  }
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const url = `http://127.0.0.1:${server.address().port}/`;

const browser = await chromium.launch({ executablePath: BROWSER });
const page = await browser.newPage({ viewport: { width: 900, height: 800 } });
await page.addInitScript(() => {
  localStorage.setItem("planner-intro-version", "0.6.0-schedule"); localStorage.setItem("planner-design-intro", "1.0.0");
  const state = {
    journal: [{ id: 1, date: "2026-09-01", subjectId: "law", hours: 2, note: "Занятие" }],
    events: [{ id: "e1", name: "Региональный этап", date: "2026-11-01", priority: 3 }],
    // Расписание должно быть списком. Строка вместо него роняет отрисовку —
    // это и проверяем.
    lyceumSchedule: "сломано",
  };
  localStorage.setItem(
    "planner:planner-state-v5",
    JSON.stringify({ value: JSON.stringify(state), updatedAt: Date.now() })
  );
});
page.on("pageerror", (e) => { if (process.env.DEBUG) console.log("PAGEERROR:", e.message, "\n", (e.stack||"").split("\n").slice(0,4).join("\n")); });
page.on("console", (m) => { if (process.env.DEBUG && m.type() === "error") console.log("CONSOLE:", m.text().slice(0, 400)); });
await page.goto(url);
await page.waitForTimeout(2000);

const text = await page.locator("body").innerText();
if (process.env.DEBUG) { console.log("---\n" + text.slice(0, 600) + "\n---"); }
const fail = (msg) => {
  console.error("✗ " + msg);
  process.exitCode = 1;
};

if (text.trim().length < 40) fail("страница пустая — страховка не сработала");
else console.log("✓ вместо белого листа что-то показано");

if (!/Приложение сломалось/.test(text)) fail("нет объяснения, что произошло");
else console.log("✓ человеку сказали, что случилось");

if (!/Записи целы/.test(text)) fail("не сказано, что записи на месте");
else console.log("✓ сказано, что записи на месте");

// Главное: копия должна быть настоящей — с записями внутри, а не пустой болванкой.
const dump = await page.locator("textarea").first().inputValue();
if (!dump.includes("Региональный этап") || !dump.includes("2026-09-01")) fail("в копии нет записей");
else console.log("✓ в копии лежат настоящие записи");

for (const name of ["Скачать копию", "Перезагрузить"]) {
  if (!(await page.getByRole("button", { name }).count())) fail(`нет кнопки «${name}»`);
  else console.log(`✓ есть кнопка «${name}»`);
}

await browser.close();
server.close();
if (!process.exitCode) console.log("\nстраховка от белого экрана работает");
