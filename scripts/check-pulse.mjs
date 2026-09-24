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

// Карточка-напоминание о занятиях. Ищем её по содержимому, а не по номеру:
// в новом дизайне над ней стоят плитки, и порядок карточек другой.
const REMINDER = /Сегодня записано|Начните с первого|Занятий не было|Вчера был последний|Сегодня ещё ничего не записано/;
const reminder = (page) => page.locator("section.ap-card").filter({ hasText: REMINDER }).first().innerText();

const open = async (state) => {
  const browser = await chromium.launch({ executablePath: BROWSER });
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript((payload) => {
    try {
      localStorage.setItem("planner-intro-version", "0.6.0-schedule");
      // Анонс нового дизайна показывается один раз и закрывает экран — здесь он не нужен.
      localStorage.setItem("planner-design-intro", "1.0.0");
      localStorage.setItem("planner-screen", "today");
      localStorage.setItem("planner:planner-state-v5", JSON.stringify({ value: JSON.stringify(payload), at: Date.now() }));
    } catch (e) { /* приватный режим */ }
  }, state);
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForTimeout(1500);
  return { browser, page, errors };
};

// --- совсем чистое приложение: предложение всё равно на виду ---------------
// Тому, кто ещё ни разу не открывал тренажёр, оно нужнее всего.
{
  const { browser, page, errors } = await open({});
  const card = await reminder(page);
  want("на чистом приложении предложение есть", /Реши \d+ задани/i.test(card),
    (card.match(/Реши[^\n]*/i) || [])[0] || card.slice(0, 80));
  want("названы и предмет, и порог пониже", /Обществознание/.test(card) && /хватит 5/.test(card),
    (card.match(/Реши[^\n]*/i) || [])[0] || "");
  want("предложение ведёт в тренажёр", /В тренажёр/.test(card));
  want("ошибок нет", errors.length === 0, errors[0] || "");
  await browser.close();
}

// --- мало заданий: день ещё не засчитан, но предложение видно --------------
{
  const { browser, page, errors } = await open(seed(phys.ids.slice(0, 2), 360));
  const card = await reminder(page);
  want("предложение показано с остатком", /осталось 3 задания/i.test(card), (card.match(/Решено[^\n]*/) || [])[0]);
  want("назван предмет", /Физика/.test(card));
  want("две задачи серию не продлевают", !/подряд/.test(card), (card.match(/\d+\s*\n?дн\S*\s*подряд/) || [])[0] || "");
  const tile = ((await page.locator("main").innerText()).match(/Серия\s*\n\s*(\d+)/) || [])[1];
  want("и в плитке серии ноль", tile === undefined || tile === "0", "серия: " + tile);
  want("время всё равно записано", /записано 0,2 ч/i.test(card), (card.match(/Сегодня записано[^\n]*/) || [])[0]);
  want("ошибок нет", errors.length === 0, errors[0] || "");
  await browser.close();
}

// --- пять заданий: день засчитан ------------------------------------------
{
  const { browser, page, errors } = await open(seed(phys.ids.slice(0, 5), 360));
  // Когда день засчитан, в новом дизайне напоминание уходит совсем, а часы и
  // серия видны в плитках. Поэтому смотрим весь экран, а не одну карточку.
  const screenText = await page.locator("main").innerText();
  want("порог взят — предложения больше нет", !/осталось \d+ задани|Реши \d+ задани/i.test(screenText),
    (screenText.match(/(осталось \d+ задани|Реши \d+ задани)[^\n]*/i) || [])[0] || "");
  want("полчаса засчитаны в часы", /Сегодня записано 0,5 ч|Записано сегодня\s*0,5\s*ч/i.test(screenText),
    (screenText.match(/(Сегодня записано|Записано сегодня)[^\n]*\n?[^\n]*/) || [])[0]);

  // И в дневнике — отдельной строкой, которую руками не удалить.
  // Видимая кнопка: в полосе вкладок телефона есть своя «Дневник», на компьютере она скрыта.
  await page.locator("button:visible", { hasText: "Дневник" }).first().click();
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

// --- запись с «Сегодня» — всегда за сегодня --------------------------------
// Форма на «Сегодня» и форма в «Дневнике» делят одно состояние. Если в дневнике
// открыт другой день, запись с «Сегодня» уходила туда, а не в сегодня.
for (const design of ["new", "classic"]) {
  const { browser, page, errors } = await open({});
  await page.evaluate((d) => localStorage.setItem("planner-design", d), design);
  await page.reload();
  await page.waitForTimeout(1500);
  const localDay = (shift) => page.evaluate((n) => {
    const d = new Date(); d.setDate(d.getDate() + n);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }, shift);
  const todayLocal = await localDay(0);
  const yesterday = await localDay(-1);

  // В дневнике выбираем вчерашний день.
  await page.locator("button:visible", { hasText: "Дневник" }).first().click();
  await page.waitForTimeout(700);
  await page.locator('input[type="date"]:visible').first().fill(yesterday);
  await page.waitForTimeout(300);

  // Возвращаемся на «Сегодня» и пишем занятие оттуда.
  await page.locator("button:visible", { hasText: "Сегодня" }).first().click();
  await page.waitForTimeout(700);
  const note = "проверка даты " + design;
  const field = page.locator('textarea:visible, input[type="text"]:visible')
    .filter({ has: page.locator("xpath=self::*[contains(@placeholder, 'прошли') or contains(@placeholder, 'Например: конституционные')]") })
    .first();
  await field.fill(note);
  const submit = design === "new"
    ? page.locator("#quick-log button", { hasText: /^Записать$/ })
    : page.locator("button:visible", { hasText: "+ Записать" }).first();
  await submit.click();
  await page.waitForTimeout(1600);

  const entry = await page.evaluate((n) => {
    const raw = localStorage.getItem("planner:planner-state-v5");
    const value = raw ? JSON.parse(JSON.parse(raw).value) : {};
    return (value.journal || []).find((e) => e.note === n) || null;
  }, note);
  want(`${design}: запись с «Сегодня» сохранилась`, !!entry);
  want(`${design}: запись с «Сегодня» — за сегодня, а не за день из дневника`,
    entry && entry.date === todayLocal, entry ? entry.date + " вместо " + todayLocal : "записи нет");
  want(`${design}: ошибок нет`, errors.length === 0, errors[0] || "");
  await browser.close();
}

server.close();
if (problems.length) { console.error("\nНе так:\n- " + problems.join("\n- ")); process.exit(1); }
console.log("\nтренажёр считается занятием");
