// Проверяет, что тренажёр считается занятием: время его секундомера идёт в часы
// и в цель дня, а взятый порог решённых заданий продлевает серию.
//
// Смотрим на то, что легко сломать незаметно: не засчитывается ли день от двух
// задач, виден ли остаток в предложении, доходит ли время до дневника — и
// называется ли там предмет, которого среди предметов приложения нет.
//
// Запуск: npm run check:pulse
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, extname } from "node:path";

const playwright = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const { chromium } = playwright.chromium ? playwright : playwright.default;
const BROWSER = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const DIST = resolve(process.cwd(), "dist");
if (!existsSync(resolve(DIST, "index.html"))) {
  console.error("Нет собранного приложения: сначала BASE_PATH=/-/ npx vite build");
  process.exit(1);
}

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".webmanifest": "application/manifest+json" };
const server = createServer(async (req, res) => {
  let path = req.url.split("?")[0].replace(/^\/[^/]+\//, "/");
  if (path === "/" || path.endsWith("/")) path += "index.html";
  try {
    const body = await readFile(resolve(DIST, "." + path));
    res.writeHead(200, { "content-type": TYPES[extname(path)] || "application/octet-stream" });
    res.end(body);
  } catch { res.writeHead(404).end("404"); }
});
await new Promise((d) => server.listen(0, "127.0.0.1", d));
const port = server.address().port;

const problems = [];
const want = (n, ok, note) => { if (!ok) problems.push(n + (note ? ": " + note : "")); console.log((ok ? "✓ " : "✗ ") + n + (note ? " — " + note : "")); };

const index = await import("../src/fipi-index.js");
const phys = index.BANK_SUBJECTS.find((s) => s.name === "Физика");
const today = new Date().toISOString().slice(0, 10);

// Кладём готовый журнал попыток: пять заданий по физике, по 6 минут каждое.
const seed = (ids, seconds) => ({
  trainerLog: ids.map((id, i) => ({ id: "try-" + id, at: today + "T10:0" + i + ":00.000Z", taskId: id, answer: "1", ok: true, seconds })),
});

const open = async (state) => {
  const browser = await chromium.launch({ executablePath: BROWSER });
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript((payload) => {
    try {
      localStorage.setItem("planner-intro-version", "0.6.0-schedule");
      localStorage.setItem("planner-screen", "today");
      localStorage.setItem("planner:planner-state-v5", JSON.stringify({ value: JSON.stringify(payload), at: Date.now() }));
    } catch (e) { /* приватный режим */ }
  }, state);
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForTimeout(1500);
  return { browser, page, errors };
};

// --- мало заданий: день ещё не засчитан, но предложение видно --------------
{
  const { browser, page, errors } = await open(seed(phys.ids.slice(0, 2), 360));
  const card = await page.locator("section.ap-card").nth(1).innerText();
  want("предложение показано с остатком", /осталось 3 задания/i.test(card), (card.match(/Решено[^\n]*/) || [])[0]);
  want("назван предмет", /Физика/.test(card));
  want("две задачи серию не продлевают", !/подряд/.test(card), (card.match(/\d+\s*\n?дн\S*\s*подряд/) || [])[0] || "");
  want("время всё равно записано", /записано 0,2 ч/i.test(card), (card.match(/Сегодня записано[^\n]*/) || [])[0]);
  want("ошибок нет", errors.length === 0, errors[0] || "");
  await browser.close();
}

// --- пять заданий: день засчитан ------------------------------------------
{
  const { browser, page, errors } = await open(seed(phys.ids.slice(0, 5), 360));
  const card = await page.locator("section.ap-card").nth(1).innerText();
  want("порог взят — предложения больше нет", !/осталось/i.test(card), (card.match(/осталось[^\n]*/i) || [])[0] || "");
  want("полчаса засчитаны в часы", /записано 0,5 ч/i.test(card), (card.match(/Сегодня записано[^\n]*/) || [])[0]);

  // И в дневнике — отдельной строкой, которую руками не удалить.
  await page.getByRole("button", { name: /Дневник/ }).first().click();
  await page.waitForTimeout(900);
  const jour = await page.locator("body").innerText();
  const row = (jour.match(/[^\n]*\n[^\n]*\n[^\n]*Тренажёр: 5 заданий/) || [])[0] || "";
  want("в дневнике есть строка тренажёра", /Тренажёр: 5 заданий/.test(jour), row.replace(/\n/g, " | "));
  want("у строки назван предмет", /Физика/.test(row), row.replace(/\n/g, " | "));
  want("в строке стоит полчаса", /0,5 ч/.test(row));
  want("строку тренажёра не удалить", /секундомер/.test(jour));
  want("ошибок нет", errors.length === 0, errors[0] || "");
  await browser.close();
}

server.close();
if (problems.length) { console.error("\nНе так:\n- " + problems.join("\n- ")); process.exit(1); }
console.log("\nтренажёр считается занятием");
