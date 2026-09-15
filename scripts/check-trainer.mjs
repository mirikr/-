// Проверяет тренажёр по банку ФИПИ в собранном приложении.
//
// Смотрим на то, что легко сломать незаметно: идёт ли настоящий секундомер,
// честно ли считается ответ, видно ли номер задания, работают ли отметки о
// сверке ключа и переживает ли прогресс перезагрузку страницы.
//
// Запуск: npm run check:trainer
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

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".webmanifest": "application/manifest+json", ".json": "application/json" };
const server = createServer(async (req, res) => {
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

const problems = [];
function want(name, ok, note) {
  if (!ok) problems.push(name + (note ? ": " + note : ""));
  console.log((ok ? "✓ " : "✗ ") + name + (note ? " — " + note : ""));
}

const browser = await chromium.launch({ executablePath: BROWSER });
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

// Окно «что нового» перекрывает экран и к тренажёру не пускает — для проверки
// помечаем его как уже показанное.
await page.addInitScript(() => {
  try {
    localStorage.setItem("planner-intro-version", "0.6.0-schedule");
    localStorage.setItem("planner-screen", "trainer");
  } catch (e) { /* приватный режим — не беда */ }
});

await page.goto(`http://127.0.0.1:${port}/`);
await page.waitForTimeout(1500);

// В меню есть раздел, и он открывается.
const navButton = page.getByRole("button", { name: /Тренажёр/ }).first();
want("раздел «Тренажёр» есть в меню", await navButton.count() > 0);
await navButton.click();
await page.waitForTimeout(400);

const card = page.locator("section.ap-card").first();
const head = await card.innerText();
want("видно номер задания", /№\s*[0-9A-Za-zА-Яа-я]{5,8}/.test(head), (head.match(/№\s*\S+/) || [])[0]);
want("видно условие", head.length > 200);

// Секундомер идёт: через две секунды на экране должно стать больше.
const clockText = () => page.locator('[aria-label="Время на задание"]').innerText();
const first = await clockText();
await page.waitForTimeout(2300);
const second = await clockText();
const secs = (s) => (s.includes(":") ? Number(s.split(":")[0]) * 60 + Number(s.split(":")[1]) : parseInt(s, 10) || 0);
want("секундомер идёт", secs(second) > secs(first), first + " → " + second);

// Какое задание показано и какой у него ответ — берём из набора приложения.
const shownId = (head.match(/№\s*([0-9A-Za-zА-Яа-я]{5,8})/) || [])[1];
const bank = await import("../src/fipi-bank.js");
const task = bank.BANK_TASKS.find((t) => t.id === shownId);
want("в наборе три предмета", bank.BANK_SUBJECTS.length === 3, bank.BANK_SUBJECTS.join(", "));
want("сказано, что это альфа и ключи наши", /альфа-верс/i.test(head) && /решены нами/i.test(head));
want("просьба жать «В банке другой ответ» на виду", /В банке другой ответ/.test(head));
want("задание из набора", !!task, shownId);

// Неверный ответ: приложение должно сказать «Неверно», показать ключ и разбор.
await page.getByLabel("Ваш ответ").fill("этонеответ");
await page.getByRole("button", { name: "Ответить" }).click();
await page.waitForTimeout(300);
const afterWrong = await card.innerText();
// Разбор обязан относиться к тому заданию, которое на экране: когда набор
// пересобирался после ответа, карточка успевала показать уже следующее.
want("на экране осталось то же задание", afterWrong.includes(shownId), (afterWrong.match(/№\s*\S+/) || [])[0]);
want("неверный ответ распознан", /Неверно/.test(afterWrong));
want("показан правильный ответ", afterWrong.includes(task.answer));
want("показан разбор", afterWrong.includes(task.why.slice(0, 20)));
want("ключ помечен как несверенный", /не сверен/i.test(afterWrong));
want("сказано, скольких совпадений не хватает", /нужно ещё \d/.test(afterWrong), (afterWrong.match(/нужно ещё \d/) || [])[0]);
want("есть просьба перепроверить в банке", /перепроверь/i.test(afterWrong) && afterWrong.includes(shownId));

// Отметки о сверке: подтверждение и жалоба меняют плашку.
await page.getByRole("button", { name: /Сверил/ }).click();
await page.waitForTimeout(250);
want("подтверждение отмечается", /сверен с банком/i.test(await card.innerText()));
await page.getByRole("button", { name: /В банке другой ответ/ }).click();
await page.waitForTimeout(250);
const disputedText = await page.locator("#root").innerText();
want("жалоба делает ключ спорным", /Спорный: банк ответил иначе/i.test(disputedText));
want("спорный ключ попал в список", /Спорные ключи/i.test(disputedText));

// Верный ответ следующего задания.
await page.getByRole("button", { name: "Следующее" }).click();
await page.waitForTimeout(300);
const nextHead = await card.innerText();
const nextId = (nextHead.match(/№\s*([0-9A-Za-zА-Яа-я]{5,8})/) || [])[1];
const nextTask = bank.BANK_TASKS.find((t) => t.id === nextId);
want("показано другое задание", nextId && nextId !== shownId, shownId + " → " + nextId);
await page.getByLabel("Ваш ответ").fill(nextTask.answer);
await page.getByRole("button", { name: "Ответить" }).click();
await page.waitForTimeout(300);
const afterRight = await card.innerText();
want("верный ответ засчитан", /Верно/.test(afterRight) && !/Неверно/.test(afterRight));
want("после верного ответа задание не подменилось", afterRight.includes(nextId), (afterRight.match(/№\s*\S+/) || [])[0]);
want("разбор от своего задания", afterRight.includes(nextTask.why.slice(0, 20)));

const stats = await page.locator("#root").innerText();
want("в итогах учтены попытки", /прорешано/.test(stats) && /подряд верно/.test(stats));

// Видно ли, считается счёт по всему классу или только по себе.
want("сказано, откуда берётся счёт ключей", /счёт идёт только по твоим ответам|Общий счёт ответов подключён/.test(stats),
  (stats.match(/[^\n]*счёт[^\n]*/) || [])[0]);

// Итоги должны относиться к выбранному предмету, а не ко всему сразу.
const firstSubject = bank.BANK_SUBJECTS[0];
want("в заголовке итогов назван предмет", stats.toLowerCase().includes("как идут дела · " + firstSubject.toLowerCase()),
  (stats.match(/Как идут дела[^\n]*/) || [])[0]);
const otherSubject = bank.BANK_SUBJECTS[1];
await page.getByRole("button", { name: new RegExp("^" + otherSubject) }).first().click();
await page.waitForTimeout(400);
const otherStats = await page.locator("#root").innerText();
const done = (otherStats.match(/(\d+)\s*\nпрорешано/) || [])[1];
want("у другого предмета свои итоги", done === "0", otherSubject + ": прорешано " + done);
want("списки жалоб тоже по предмету", !/Спорные ключи/.test(otherStats) && !/Задания, на которые пожаловались/.test(otherStats));
await page.getByRole("button", { name: new RegExp("^" + firstSubject) }).first().click();
await page.waitForTimeout(400);
want("у своего предмета итоги на месте", /Спорные ключи/.test(await page.locator("#root").innerText()));

// Самое важное: прогресс должен пережить перезагрузку.
await page.waitForTimeout(1200);
await page.reload();
await page.waitForTimeout(1800);
await page.getByRole("button", { name: /Тренажёр/ }).first().click();
await page.waitForTimeout(500);
const saved = await page.evaluate(() => {
  const raw = localStorage.getItem("planner:planner-state-v5");
  const value = raw ? JSON.parse(JSON.parse(raw).value) : {};
  return { log: (value.trainerLog || []).length, marks: (value.bankMarks || []).length };
});
want("попытки сохранились", saved.log === 2, "записей: " + saved.log);
want("отметка о ключе сохранилась", saved.marks === 1, "отметок: " + saved.marks);
const afterReload = await page.locator("#root").innerText();
want("итоги на месте после перезагрузки", /прорешано/.test(afterReload) && /Спорные ключи/.test(afterReload));

// Разметка условия: таблица должна остаться таблицей, а не строкой слов.
const structured = await page.evaluate(() => {
  const el = document.querySelector("section.ap-card .ap-fipi");
  if (!el) return null;
  return { tables: el.querySelectorAll("table").length, cells: el.querySelectorAll("td").length };
});
want("условие показано разметкой, а не сплошным текстом", !!structured, structured ? JSON.stringify(structured) : "разметки нет");
want("в условии есть таблица", structured && structured.tables > 0, structured ? structured.tables + " шт." : "");

// Жалоба на само задание: кнопка есть, отмечается и попадает в список.
const beforeBroken = await card.innerText();
want("есть кнопка жалобы на задание", /Пожаловаться на задание/.test(beforeBroken));
await page.getByRole("button", { name: "Пожаловаться на задание" }).click();
await page.waitForTimeout(250);
want("жалоба отмечается", /Пожаловались на задание/.test(await card.innerText()));
want("задание попало в список жалоб", /Задания, на которые пожаловались/.test(await page.locator("#root").innerText()));
await page.waitForTimeout(1400);
const brokenSaved = await page.evaluate(() => {
  const raw = localStorage.getItem("planner:planner-state-v5");
  const value = raw ? JSON.parse(JSON.parse(raw).value) : {};
  return (value.bankMarks || []).filter((m) => m.kind === "broken").length;
});
want("жалоба на задание сохранилась", brokenSaved === 1, "записей: " + brokenSaved);

// Предметы переключаются, и набор меняется.
for (const name of bank.BANK_SUBJECTS.slice(1)) {
  await page.getByRole("button", { name: new RegExp("^" + name) }).first().click();
  await page.waitForTimeout(400);
  const t = await card.innerText();
  const id = (t.match(/№\s*([0-9A-Za-zА-Яа-я]{5,8})/) || [])[1];
  const found = bank.BANK_TASKS.find((x) => x.id === id);
  want("предмет «" + name + "» открывается", !!found && found.subject === name, id + " → " + (found ? found.subject : "не нашлось"));
}

// Задания с рисунком должны рисунок показывать. Листаем, пока такое не попадётся.
await page.getByRole("button", { name: /^Физика/ }).first().click();
await page.waitForTimeout(400);
// Рисунок стоит прямо в разметке условия; отдельным списком он лежит только там,
// где в разметку не попал.
const withPictures = new Set(bank.BANK_TASKS
  .filter((t) => t.subject === "Физика" && (t.pictures.length || /<img/.test(t.body || "")))
  .map((t) => t.id));
want("в наборе есть задания с рисунками", withPictures.size > 0, withPictures.size + " шт.");
let shownPicture = 0;
for (let step = 0; step < 40; step += 1) {
  const t = await card.innerText();
  const id = (t.match(/№\s*([0-9A-Za-zА-Яа-я]{5,8})/) || [])[1];
  if (withPictures.has(id)) {
    shownPicture = await page.evaluate(() => [...document.querySelectorAll("section.ap-card img")]
      .filter((i) => i.currentSrc.startsWith("data:image") && i.naturalWidth > 10).length);
    break;
  }
  await page.getByRole("button", { name: "Пропустить" }).click();
  await page.waitForTimeout(120);
}
want("рисунок задания виден на экране", shownPicture > 0, "картинок в карточке: " + shownPicture);

// Телефон: карточка не должна разъезжаться вбок.
await page.setViewportSize({ width: 390, height: 780 });
await page.waitForTimeout(400);
const wide = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
want("на телефоне ничего не едет вбок", wide);

want("ошибок на странице нет", errors.length === 0, errors[0] || "");

await browser.close();
server.close();

if (problems.length) {
  console.error("\nТренажёр работает не так:\n- " + problems.join("\n- "));
  process.exit(1);
}
console.log("\nтренажёр работает");
