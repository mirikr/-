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

// Сначала выбор предмета: сразу решать никого не бросает.
const card = page.locator("section.ap-card").first();
const picker = await card.innerText();
want("сперва показан выбор предмета", /Начать тест/.test(picker) && /Обществознание/.test(picker));
want("сказано, сколько заданий в наборе", /\d+ задани/.test(picker));
want("есть «решать все задания»", /Решать все задания подряд/.test(picker));
// Кнопка живёт на карточке предмета: «все подряд» — это весь предмет целиком,
// а не три предмета вперемешку.
want("«все подряд» — про один предмет, а не про все сразу",
  !/вперемешку|Все предметы/i.test(picker) && /весь предмет целиком/i.test(picker));
want("сказано, что это альфа и ключи наши", /альфа-верс/i.test(picker) && /решены нами/i.test(picker));
want("просьба прислать ответ из банка на виду", /который банк засчитал/i.test(picker));

await page.getByRole("button", { name: "Начать тест" }).first().click();
await page.waitForTimeout(1200);
const head = await card.innerText();
want("видно номер задания", /№\s*[0-9A-Za-zА-Яа-я]{5,8}/.test(head), (head.match(/№\s*\S+/) || [])[0]);
want("видно условие", head.length > 200);
want("можно вернуться к выбору предмета", /К выбору предмета/.test(head));

// Секундомер идёт: через две секунды на экране должно стать больше.
const clockText = () => page.locator('[aria-label="Время на задание"]').innerText();
const first = await clockText();
await page.waitForTimeout(2300);
const second = await clockText();
const secs = (s) => (s.includes(":") ? Number(s.split(":")[0]) * 60 + Number(s.split(":")[1]) : parseInt(s, 10) || 0);
want("секундомер идёт", secs(second) > secs(first), first + " → " + second);

// Какое задание показано и какой у него ответ — берём из набора приложения.
const shownId = (head.match(/№\s*([0-9A-Za-zА-Яа-я]{5,8})/) || [])[1];
const index = await import("../src/fipi-index.js");
const bankOf = async (file) => (await import("../src/bank/" + file + ".js")).TASKS;
const society = await bankOf("society");
const task = society.find((t) => t.id === shownId);
want("в описи три предмета", index.BANK_SUBJECTS.length === 3, index.BANK_SUBJECTS.map((s) => s.name).join(", "));
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
want("сказано, что делать в банке", /найди задание/i.test(afterWrong) && afterWrong.includes(shownId));

// Главное, ради чего всё затевалось: человек переписывает ответ, который засчитал
// банк, и этот ответ закрепляется за заданием.
const bankField = page.getByLabel("Ответ, который засчитал банк ФИПИ");
want("есть поле для ответа с ФИПИ", await bankField.count() === 1);
await bankField.fill("такого ответа нет");
await page.getByRole("button", { name: "Отправить" }).click();
await page.waitForTimeout(250);
const afterSend = await card.innerText();
want("ответ с ФИПИ записан", /Ответ с ФИПИ записан/i.test(afterSend) && afterSend.includes("такого ответа нет"));
want("видно, что он расходится с ключом", /расходится с нашим ключом/i.test(afterSend));
want("ключ стал спорным по ответу банка", /Спорный: на ФИПИ засчитан ответ/i.test(afterSend));
const collected = await page.locator("#root").innerText();
want("ответ попал в список для сверки", /Ответы с ФИПИ — собрано 1/i.test(collected));
want("в списке видно оба ответа", collected.includes("ФИПИ: такого ответа нет"));

// Отменить и вписать заново — поле возвращается.
await page.getByRole("button", { name: /Отменить и вписать заново/ }).click();
await page.waitForTimeout(250);
want("после отмены поле вернулось", await page.getByLabel("Ответ, который засчитал банк ФИПИ").count() === 1);

// Отметки о сверке: подтверждение и жалоба меняют плашку.
await page.getByRole("button", { name: /Банк засчитал наш ответ/ }).click();
await page.waitForTimeout(250);
want("подтверждение отмечается", /сверен с банком/i.test(await card.innerText()));
await page.getByRole("button", { name: /В банке ответ другой/ }).click();
await page.waitForTimeout(250);
const disputedText = await page.locator("#root").innerText();
want("жалоба делает ключ спорным", /Спорный: банк ответил иначе/i.test(disputedText));
want("спорный ключ попал в список", /Спорные ключи/i.test(disputedText));

// Верный ответ следующего задания.
await page.getByRole("button", { name: "Следующее" }).click();
await page.waitForTimeout(300);
const nextHead = await card.innerText();
const nextId = (nextHead.match(/№\s*([0-9A-Za-zА-Яа-я]{5,8})/) || [])[1];
const nextTask = society.find((t) => t.id === nextId);
want("показано другое задание", nextId && nextId !== shownId, shownId + " → " + nextId);
await page.getByLabel("Ваш ответ").fill(nextTask.answer);
await page.getByRole("button", { name: "Ответить" }).click();
await page.waitForTimeout(300);
const afterRight = await card.innerText();
want("верный ответ засчитан", /Верно/.test(afterRight) && !/Неверно/.test(afterRight));
want("после верного ответа задание не подменилось", afterRight.includes(nextId), (afterRight.match(/№\s*\S+/) || [])[0]);
want("разбор от своего задания", afterRight.includes(nextTask.why.slice(0, 20)));

const stats = await page.locator("#root").innerText();
want("в итогах учтены попытки", /\nрешено/.test(stats) && /подряд верно/.test(stats));

// Видно ли, считается счёт по всему классу или только по себе.
want("сказано, откуда берётся счёт ключей", /счёт идёт только по твоим ответам|Общий счёт ответов подключён/.test(stats),
  (stats.match(/[^\n]*счёт[^\n]*/) || [])[0]);

// Итоги должны относиться к выбранному предмету, а не ко всему сразу.
const firstSubject = index.BANK_SUBJECTS[0].name;
want("в заголовке итогов назван предмет", stats.toLowerCase().includes("как идут дела · " + firstSubject.toLowerCase()),
  (stats.match(/Как идут дела[^\n]*/) || [])[0]);
const otherSubject = index.BANK_SUBJECTS[1].name;
const openSubject = async (name) => {
  const back = page.getByRole("button", { name: "К выбору предмета" });
  if (await back.count()) { await back.first().click(); await page.waitForTimeout(300); }
  const row = page.locator("section.ap-card div").filter({ hasText: new RegExp("^" + name) });
  await page.getByRole("button", { name: /Начать тест|Продолжить/ }).nth(index.BANK_SUBJECTS.findIndex((s) => s.name === name)).click();
  await page.waitForTimeout(900);
  return row;
};
await openSubject(otherSubject);
const otherStats = await page.locator("#root").innerText();
const done = (otherStats.match(/(\d+)\s*\nрешено/) || [])[1];
want("у другого предмета свои итоги", done === "0", otherSubject + ": решено " + done);
want("списки жалоб тоже по предмету", !/Спорные ключи/.test(otherStats) && !/Задания, на которые пожаловались/.test(otherStats));
await openSubject(firstSubject);
want("у своего предмета итоги на месте", /Спорные ключи/.test(await page.locator("#root").innerText()));

// Самое важное: прогресс должен пережить перезагрузку.
await page.waitForTimeout(1200);
await page.reload();
await page.waitForTimeout(1800);
await page.getByRole("button", { name: /Тренажёр/ }).first().click();
await page.waitForTimeout(1200);
const saved = await page.evaluate(() => {
  const raw = localStorage.getItem("planner:planner-state-v5");
  const value = raw ? JSON.parse(JSON.parse(raw).value) : {};
  return { log: (value.trainerLog || []).length, marks: (value.bankMarks || []).length };
});
want("попытки сохранились", saved.log === 2, "записей: " + saved.log);
want("отметка о ключе сохранилась", saved.marks === 1, "отметок: " + saved.marks);
const afterReload = await page.locator("#root").innerText();
want("итоги на месте после перезагрузки", /\nрешено/.test(afterReload) && /Спорные ключи/.test(afterReload));
// Приложение должно открыться там же, где его закрыли: на том же предмете и
// на том же задании, а не на выборе предмета.
want("после перезагрузки открыт тот же предмет", afterReload.includes(firstSubject), (afterReload.match(/Как идут дела[^\n]*/) || [])[0]);
const resumedId = ((await card.innerText()).match(/№\s*([0-9A-Za-zА-Яа-я]{5,8})/) || [])[1];
want("и то же задание", !!resumedId, "№ " + resumedId);

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
for (const s of index.BANK_SUBJECTS.slice(1)) {
  await openSubject(s.name);
  const t = await card.innerText();
  const id = (t.match(/№\s*([0-9A-Za-zА-Яа-я]{5,8})/) || [])[1];
  const found = (await bankOf(s.file)).find((x) => x.id === id);
  want("предмет «" + s.name + "» открывается", !!found && found.subject === s.name, id + " → " + (found ? found.subject : "не нашлось"));
}

// «Решать все задания подряд» открывает тот же предмет, но вместе с решённым:
// задание, которое только что решили верно, из набора не выпадает.
{
  await page.getByRole("button", { name: "К выбору предмета" }).first().click();
  await page.waitForTimeout(400);
  const one = index.BANK_SUBJECTS[0];
  const i = 0;
  await page.getByRole("button", { name: "Решать все задания подряд" }).nth(i).click();
  await page.waitForTimeout(1200);
  const t = await card.innerText();
  const id = (t.match(/№\s*([0-9A-Za-zА-Яа-я]{5,8})/) || [])[1];
  const found = (await bankOf(one.file)).find((x) => x.id === id);
  want("«все подряд» открывает один предмет", !!found && found.subject === one.name,
    id + " → " + (found ? found.subject : "не нашлось"));
  const solved = await page.evaluate(() => {
    const raw = localStorage.getItem("planner:planner-state-v5");
    const value = raw ? JSON.parse(JSON.parse(raw).value) : {};
    const last = new Map();
    (value.trainerLog || []).forEach((a) => last.set(a.taskId, a.ok));
    return [...last.entries()].filter(([, ok]) => ok).map(([k]) => k);
  });
  const all = (await bankOf(one.file)).map((x) => x.id);
  const from = all.indexOf(id);
  const ahead = all.slice(from).filter((x) => solved.includes(x));
  want("решённое из набора не выпадает", solved.length > 0 && ahead.length > 0,
    "решено " + solved.length + ", впереди решённых " + ahead.length);
}

// Первое задание после «Начать тест» ни за кем не закреплено: оно просто
// первое в очереди. Верный ответ убирает его из очереди — и на экране молча
// оказывалось следующее: ни разбора прочитать, ни ответ с ФИПИ вписать.
{
  await page.getByRole("button", { name: "К выбору предмета" }).first().click();
  await page.waitForTimeout(400);
  const i = index.BANK_SUBJECTS.findIndex((x) => x.name === "Информатика");
  await page.getByRole("button", { name: /Начать тест|Продолжить/ }).nth(i).click();
  await page.waitForTimeout(1200);
  const first = await card.innerText();
  const id = (first.match(/№\s*([0-9A-Za-zА-Яа-я]{5,8})/) || [])[1];
  const t = (await bankOf("informatics")).find((x) => x.id === id);
  want("первое задание предмета показано", !!t, "№ " + id);
  await page.getByLabel("Ваш ответ").fill(t.answer);
  await page.getByRole("button", { name: "Ответить" }).click();
  await page.waitForTimeout(400);
  const after = await card.innerText();
  want("после верного ответа первое задание не убежало", after.includes(id),
    id + " → " + ((after.match(/№\s*(\S+)/) || [])[1] || "?"));
  want("разбор от своего задания", after.includes(t.why.slice(0, 20)));

  // Кнопка «Банк засчитал наш ответ» — это и есть ответ с ФИПИ: наш же ключ.
  // Раньше она ставила отметку, но ответ в копилку не попадал, и его
  // приходилось вписывать руками второй раз.
  await page.getByRole("button", { name: /Банк засчитал наш ответ/ }).click();
  await page.waitForTimeout(1600);
  const marked = await card.innerText();
  want("кнопка сама записывает ответ с ФИПИ", /Ответ с ФИПИ записан/i.test(marked) && marked.includes(t.answer),
    (marked.match(/Ответ с ФИПИ записан[^\n]*/) || [])[0] || marked.slice(0, 60));
  const savedAnswer = await page.evaluate((taskId) => {
    const raw = localStorage.getItem("planner:planner-state-v5");
    const value = raw ? JSON.parse(JSON.parse(raw).value) : {};
    const m = (value.bankMarks || []).find((x) => x.taskId === taskId && x.kind === "ok");
    return m ? { fipiAnswer: m.fipiAnswer || "", byButton: "byButton" in m } : null;
  }, id);
  want("ответ с ФИПИ сохранился", savedAnswer && savedAnswer.fipiAnswer === t.answer,
    savedAnswer ? JSON.stringify(savedAnswer) : "отметки нет");
  want("служебный признак кнопки в записи не хранится", savedAnswer && !savedAnswer.byButton);

  // Нажали ту же кнопку второй раз — передумали, отметка снимается.
  await page.getByRole("button", { name: /Банк засчитал наш ответ/ }).click();
  await page.waitForTimeout(1600);
  const off = await page.evaluate((taskId) => {
    const raw = localStorage.getItem("planner:planner-state-v5");
    const value = raw ? JSON.parse(JSON.parse(raw).value) : {};
    return (value.bankMarks || []).filter((x) => x.taskId === taskId && x.kind === "ok").length;
  }, id);
  want("повторное нажатие снимает отметку", off === 0, "отметок: " + off);
}

// Итог по всем предметам сразу: по отдельным карточкам его не собрать, а
// смотреть на него приходят чаще, чем на любой отдельный предмет.
{
  await page.getByRole("button", { name: "К выбору предмета" }).first().click();
  await page.waitForTimeout(500);
  const picker = await card.innerText();
  want("на выборе предмета есть общий итог", /Всего в тренажёре/.test(picker));
  want("в итоге назван весь набор", /из \d{3,} решено/.test(picker),
    (picker.match(/из \d+ решено/) || [])[0] || "");
  want("в итоге есть доля верных и время", /% ?\nверных|верных/.test(picker) && /за секундомером/.test(picker));
  want("на карточке предмета видно, сколько перенесено из банка",
    /Перенесено из банка ФИПИ: \d+ из \d+ — [\d,]+%/.test(picker),
    (picker.match(/Перенесено[^\n]*/) || [])[0] || "");
  // Заголовок карточки повторял заголовок экрана — его быть не должно.
  want("заголовок не задвоен", (picker.match(/Тренажёр по банку ФИПИ/g) || []).length === 0);
  // Подсказка про кнопки одна на все предметы, а не на каждой карточке.
  want("подсказка про кнопки одна", (picker.match(/«Начать тест» — только то/g) || []).length === 1);
}

// Неверно решённые задания должны возвращаться отдельной кнопкой: разобрать
// ошибку — это и есть подготовка, а искать её среди сотен заданий нечем.
{
  // Мы уже на выборе предмета — сюда вернулись в проверке общего итога.
  const picker = await card.innerText();
  want("на карточке есть «Перерешать неверные»", /Перерешать неверные \(\d+\)/.test(picker),
    (picker.match(/Перерешать неверные[^\n]*/) || [])[0] || "кнопки нет");
  // Неверно отвечали по первому предмету — там кнопка и должна стоять.
  const wrongIds = await page.evaluate(() => {
    const raw = localStorage.getItem("planner:planner-state-v5");
    const value = raw ? JSON.parse(JSON.parse(raw).value) : {};
    const last = new Map();
    (value.trainerLog || []).forEach((a) => last.set(a.taskId, a.ok));
    return [...last.entries()].filter(([, ok]) => !ok).map(([k]) => k);
  });
  want("в записях есть неверно решённые", wrongIds.length > 0, "их " + wrongIds.length);
  await page.getByRole("button", { name: /Перерешать неверные/ }).first().click();
  await page.waitForTimeout(1200);
  const opened = await card.innerText();
  const id = (opened.match(/№\s*([0-9A-Za-zА-Яа-я]{5,8})/) || [])[1];
  want("открылось именно неверно решённое задание", wrongIds.includes(id),
    id + " из " + wrongIds.join(", "));
  want("сказано, что показаны только неверные", /показаны только неверно решённые/.test(opened),
    (opened.match(/показаны только[^\n]*/) || [])[0] || "");

  // Ответили верно — задание уходит из набора неверных.
  const t = (await bankOf(index.BANK_SUBJECTS[0].file)).find((x) => x.id === id);
  await page.getByLabel("Ваш ответ").fill(t.answer);
  await page.getByRole("button", { name: "Ответить" }).click();
  await page.waitForTimeout(1600);
  const left = await page.evaluate((taskId) => {
    const raw = localStorage.getItem("planner:planner-state-v5");
    const value = raw ? JSON.parse(JSON.parse(raw).value) : {};
    const last = new Map();
    (value.trainerLog || []).forEach((a) => last.set(a.taskId, a.ok));
    return last.get(taskId);
  }, id);
  want("разобранное задание больше не числится неверным", left === true, "последняя попытка: " + left);
}

// Разбор ошибок по темам: видно, в каких разделах сыпешься, и одним нажатием
// можно взяться именно за них.
{
  await openSubject(firstSubject);
  // Нарочно ошибаемся: без ошибки разбирать нечего.
  await page.getByLabel("Ваш ответ").fill("заведомо не тот ответ");
  await page.getByRole("button", { name: "Ответить" }).click();
  await page.waitForTimeout(1600);
  const shown = await card.innerText();
  const themeName = (shown.match(/№\s*\S+\s*\n([^\n]+)/) || [])[1] || "";
  const whole = await page.locator("#root").innerText();
  want("в итогах есть разбор ошибок по темам", /Разбор ошибок по темам/.test(whole));
  const row = page.locator("button").filter({ hasText: /\d+ из \d+ неверн/ }).first();
  want("в разборе перечислен раздел, где ошиблись", await row.count() > 0,
    (whole.match(/Разбор ошибок по темам[\s\S]{0,120}/) || [])[0]);
  const line = await row.innerText();
  want("у раздела сказано, сколько из скольких неверно", /\d+ из \d+ неверн/.test(line), line);
  want("назван тот самый раздел", !themeName || line.includes(themeName), themeName + " · " + line);
  await row.click();
  await page.waitForTimeout(1200);
  const opened = await card.innerText();
  want("нажатие на раздел ведёт к его неверным заданиям",
    /показаны только неверно решённые/.test(opened) && (!themeName || opened.includes(themeName)),
    themeName + " · " + (opened.match(/показаны только[^\n]*/) || [])[0]);
}

// Порядок заданий: по банку, вперемешку, по темам. Порядок запоминается — иначе
// после перезагрузки человек оказался бы неизвестно где.
{
  await openSubject(firstSubject);
  const shownId = async () => ((await card.innerText()).match(/№\s*([0-9A-Za-zА-Яа-я]{5,8})/) || [])[1];
  // Пять номеров подряд в выбранном порядке: листаем «Пропустить», ничего не решая.
  const walk = async () => {
    const out = [];
    for (let i = 0; i < 5; i += 1) {
      out.push(await shownId());
      await page.getByRole("button", { name: "Пропустить" }).click();
      await page.waitForTimeout(350);
    }
    return out;
  };
  const pickOrder = async (name) => {
    await page.getByRole("button", { name }).first().click();
    await page.waitForTimeout(500);
  };

  const rootText = await page.locator("#root").innerText();
  want("есть выбор порядка заданий", /Порядок/.test(rootText) && /Вперемешку/.test(rootText) && /По темам/.test(rootText),
    (rootText.match(/Порядок[^\n]*(\n[^\n]+){0,4}/) || [])[0]);

  await pickOrder("По порядку");
  const byBank = await walk();
  await pickOrder("Вперемешку");
  const mixed = await walk();
  want("вперемешку идёт другой порядок", mixed.join() !== byBank.join(), byBank.join(" ") + " → " + mixed.join(" "));
  want("в перемешанном наборе задания не повторяются", new Set(mixed).size === mixed.length, mixed.join(" "));

  // Порядок должен пережить перезагрузку вместе с зерном: иначе «вперемешку»
  // каждый раз новое, и продолжить с того же места нельзя.
  const before = await shownId();
  const orderOf = () => page.evaluate(() => {
    const raw = localStorage.getItem("planner:planner-state-v5");
    const value = raw ? JSON.parse(JSON.parse(raw).value) : {};
    return value.trainerState || {};
  });
  await page.waitForTimeout(1600);
  const wasOrder = await orderOf();
  want("порядок записан вместе с зерном", wasOrder.order === "shuffle" && wasOrder.orderSeed > 0,
    wasOrder.order + " · зерно " + wasOrder.orderSeed);
  await page.reload();
  await page.waitForTimeout(1800);
  await page.getByRole("button", { name: /Тренажёр/ }).first().click();
  await page.waitForTimeout(1200);
  want("после перезагрузки порядок остался перемешанным",
    /Перемешать заново/.test(await page.locator("#root").innerText()));
  want("и задание то же", (await shownId()) === before, before + " → " + (await shownId()));
  // Зерно то же — значит и порядок тот же: что при одном зерне он повторяется,
  // проверено отдельно в tests/trainer-order.test.mjs.
  const nowOrder = await orderOf();
  want("зерно перемешивания пережило перезагрузку", nowOrder.orderSeed === wasOrder.orderSeed,
    wasOrder.orderSeed + " → " + nowOrder.orderSeed);
  const again = await walk();

  // «Перемешать заново» действительно тасует.
  await pickOrder("Перемешать заново");
  const reshuffled = await walk();
  want("«перемешать заново» даёт новый порядок", reshuffled.join() !== again.join(),
    again.join(" ") + " → " + reshuffled.join(" "));

  // По темам задания идут разделами, а не вперемешку.
  await pickOrder("По темам");
  const themes = [];
  for (let i = 0; i < 6; i += 1) {
    const text = await card.innerText();
    themes.push((text.match(/№\s*\S+\s*\n([^\n]+)/) || [])[1] || "");
    await page.getByRole("button", { name: "Пропустить" }).click();
    await page.waitForTimeout(350);
  }
  const jumps = themes.filter((t, i) => i > 0 && t !== themes[i - 1] && themes.slice(0, i).includes(t));
  want("по темам разделы идут подряд, а не вперемешку", jumps.length === 0, themes.join(" · "));

  await pickOrder("По порядку");
}

// Задания с рисунком должны рисунок показывать. Листаем, пока такое не попадётся.
await openSubject("Физика");
// Рисунок стоит прямо в разметке условия; отдельным списком он лежит только там,
// где в разметку не попал.
const physics = await bankOf("physics");
const withPictures = new Set(physics
  .filter((t) => t.pictures.length || /<img/.test(t.body || ""))
  .map((t) => t.id));
want("в наборе есть задания с рисунками", withPictures.size > 0, withPictures.size + " шт.");
let shownPicture = 0;
for (let step = 0; step < 40; step += 1) {
  const t = await card.innerText();
  const id = (t.match(/№\s*([0-9A-Za-zА-Яа-я]{5,8})/) || [])[1];
  if (withPictures.has(id)) {
    // Картинки теперь лежат отдельными файлами рядом со сборкой.
    shownPicture = await page.evaluate(() => [...document.querySelectorAll("section.ap-card img")]
      .filter((i) => /\/fipi\//.test(i.currentSrc) && i.naturalWidth > 10).length);
    break;
  }
  await page.getByRole("button", { name: "Пропустить" }).click();
  await page.waitForTimeout(120);
}
want("рисунок задания виден на экране", shownPicture > 0, "картинок в карточке: " + shownPicture);

// Поиск по номеру задания. Номер подписан у каждого задания в тренажёре — по
// нему задание и ищут; найденное должно открываться сразу на нём, а не «где-то
// там в тренажёре» — и открываться даже тогда, когда его уже решали.
{
  const wanted = (await bankOf("physics"))[3];
  await page.getByRole("button", { name: /Поиск/ }).first().click();
  await page.waitForTimeout(400);
  const box = page.locator('[aria-label="Поиск по записям"]');
  await box.fill(wanted.id);
  // Опись заданий приезжает отдельным куском — ей нужно время долететь.
  await page.waitForTimeout(1500);
  const list = await page.locator("section.ap-card").first().innerText();
  want("задание нашлось по номеру", list.includes("№ " + wanted.id) && /задания банка/i.test(list),
    (list.match(/№\s*\S+/) || [])[0] || list.slice(0, 80));
  want("у находки подписан предмет", list.includes(wanted.subject));

  // По началу номера — тоже: весь номер на память никто не держит.
  await box.fill(wanted.id.slice(0, 4));
  await page.waitForTimeout(500);
  want("задание находится по началу номера",
    (await page.locator("section.ap-card").first().innerText()).includes("№ " + wanted.id));

  await box.fill(wanted.id);
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: new RegExp("№ " + wanted.id) }).first().click();
  await page.waitForTimeout(1500);
  const opened = await page.locator("section.ap-card").first().innerText();
  want("находка открывает именно это задание", opened.includes("№ " + wanted.id),
    (opened.match(/№\s*\S+/) || [])[0] || opened.slice(0, 80));
  want("и открывает его в нужном предмете", opened.includes(wanted.subject));
}

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
