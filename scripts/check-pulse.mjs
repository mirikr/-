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
  want("полчаса засчитаны в часы", /Сегодня записано 0,5 ч|Записано сегодня\s*0,5\s*ч|сегодня\s*0,5\s*ч/i.test(screenText),
    (screenText.match(/(Сегодня записано|Записано сегодня|сегодня)[^\n]*\n?[^\n]*/i) || [])[0]);

  // И в дневнике — отдельной строкой, которую руками не удалить.
  // Видимая кнопка: в полосе вкладок телефона есть своя «Дневник», на компьютере она скрыта.
  await page.locator("button:visible", { hasText: "Дневник" }).first().click();
  await page.waitForTimeout(900);
  const jour = await page.locator("body").innerText();
  // Строка записи: предмет, заметка, часы — часы с 1.11 стоят после заметки.
  const row = (jour.match(/[^\n]*\n[^\n]*\n[^\n]*Тренажёр: 5 заданий[^\n]*(\n[^\n]*){0,2}/) || [])[0] || "";
  want("в дневнике есть строка тренажёра", /Тренажёр: 5 заданий/.test(jour), row.replace(/\n/g, " | "));
  want("у строки назван предмет", /Физика/.test(row), row.replace(/\n/g, " | "));
  want("в строке стоит полчаса", /0,5 ч/.test(row));
  want("строку тренажёра не удалить", /секундомер/.test(jour));
  want("ошибок нет", errors.length === 0, errors[0] || "");
  await browser.close();
}

// --- запись с «Сегодня» — всегда за сегодня --------------------------------
// В «Дневнике» выбранный день — свой. Запись с «Сегодня» уходит в сегодня, даже
// если в дневнике открыт другой день; «+ Записать» под днём дневника — в этот день.
{
  const where = "Сегодня";
  const { browser, page, errors } = await open({});
  const localDay = (shift) => page.evaluate((n) => {
    const d = new Date(); d.setDate(d.getDate() + n);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }, shift);
  const todayLocal = await localDay(0);
  const yesterday = await localDay(-1);
  const stored = (n) => page.evaluate((note) => {
    const raw = localStorage.getItem("planner:planner-state-v5");
    const value = raw ? JSON.parse(JSON.parse(raw).value) : {};
    return (value.journal || []).find((e) => e.note === note) || null;
  }, n);
  const writeInDialog = async (note) => {
    const dialog = page.locator('[role="dialog"]').last();
    await dialog.locator('textarea[placeholder^="Например: конституционные"]').fill(note);
    await dialog.locator("button", { hasText: /^Записать$/ }).last().click();
    await page.waitForTimeout(1600);
  };

  // В дневнике выбираем вчерашний день.
  await page.locator("button:visible", { hasText: "Дневник" }).first().click();
  await page.waitForTimeout(700);
  await page.locator(`[data-day="${yesterday}"]:visible`).first().click();
  await page.waitForTimeout(300);

  // Возвращаемся на «Сегодня» и пишем занятие оттуда.
  await page.locator("button:visible", { hasText: "Сегодня" }).first().click();
  await page.waitForTimeout(700);
  await page.locator('button:visible[title="Записать уже прошедшее занятие"]').first().click();
  await page.waitForTimeout(300);
  const note = "проверка даты " + where;
  await writeInDialog(note);
  const entry = await stored(note);
  want(`${where}: запись с «Сегодня» сохранилась`, !!entry);
  want(`${where}: запись с «Сегодня» — за сегодня, а не за день из дневника`,
    entry && entry.date === todayLocal, entry ? entry.date + " вместо " + todayLocal : "записи нет");

  // «+ Записать» под вчерашним днём в дневнике — запись за вчера.
  await page.locator("button:visible", { hasText: "Дневник" }).first().click();
  await page.waitForTimeout(700);
  await page.locator(".ap-dbtn:visible", { hasText: "+ Записать" }).first().click();
  await page.waitForTimeout(300);
  const note2 = "проверка даты Дневник";
  await writeInDialog(note2);
  const entry2 = await stored(note2);
  want("Дневник: «+ Записать» под днём — запись за этот день", entry2 && entry2.date === yesterday, entry2 ? entry2.date + " вместо " + yesterday : "записи нет");
  want(`${where}: ошибок нет`, errors.length === 0, errors[0] || "");
  await browser.close();
}

// --- таймер без предмета и «+ задание» в дневнике -------------------------
// Таймер запускается и без предмета: выбрать его можно в конце или не выбирать.
// Кнопка «+ задание» у урока в дневнике видна сразу, без наведения.
{
  // Состояние пишется заново при каждой перезагрузке — расписание кладём сразу.
  const dow = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][new Date().getDay()];
  const { browser, page, errors } = await open({ lyceumSchedule: [{ id: "l1", day: dow, start: "09:00", end: "09:45", subjectName: "Право" }] });
  await page.locator("button:visible", { hasText: /Засечь/ }).first().click();
  await page.waitForTimeout(300);
  const dialog = page.locator('[role="dialog"]').last();
  await dialog.locator("[data-no-subject]").first().click();
  const start = dialog.locator("button", { hasText: "Начать" }).last();
  want("таймер: «Без предмета» — «Начать» доступна", !(await start.isDisabled()));
  await start.click();
  await page.waitForTimeout(400);
  await page.reload();
  await page.waitForTimeout(1200);
  const stop = page.locator("button:visible", { hasText: /Стоп|стоп|■/ }).first();
  want("таймер без предмета идёт и после перезагрузки", (await stop.count()) > 0);
  if (await stop.count()) {
    await stop.click();
    await page.waitForTimeout(400);
    await page.locator('[role="dialog"]').last().locator("button", { hasText: /^Записать$/ }).last().click();
    await page.waitForTimeout(1600);
  }
  const entry = await page.evaluate(() => {
    const raw = localStorage.getItem("planner:planner-state-v5");
    const value = raw ? JSON.parse(JSON.parse(raw).value) : {};
    return (value.journal || [])[0] || null;
  });
  want("таймер без предмета: запись в дневнике", entry && !entry.subjectId && entry.hours > 0, JSON.stringify(entry));

  // «Отменить» у записи — запись убрана, окно занятия снова открыто.
  const journalLen = () => page.evaluate(() => {
    const raw = localStorage.getItem("planner:planner-state-v5");
    return ((raw ? JSON.parse(JSON.parse(raw).value) : {}).journal || []).length;
  });
  const finishOpen = () => page.locator('[role="dialog"][aria-label="Занятие окончено"]').count();
  await page.getByRole("button", { name: "Отменить запись и вернуться к окну" }).first().click();
  await page.waitForTimeout(1600);
  want("отмена записи с таймера: окно занятия снова открыто", (await finishOpen()) === 1);
  want("отмена записи с таймера: запись убрана", (await journalLen()) === 0);
  // «Не записывать» — окно закрыто, записи нет; крестиком в уведомлении — назад к окну.
  await page.locator('[role="dialog"] [data-discard]').click();
  await page.waitForTimeout(1600);
  want("«Не записывать»: окно закрыто, записи нет", (await finishOpen()) === 0 && (await journalLen()) === 0);
  await page.getByRole("button", { name: "Вернуться к окну занятия" }).first().click();
  await page.waitForTimeout(400);
  want("«Не записывать» можно отменить — окно вернулось", (await finishOpen()) === 1);
  await page.locator('[role="dialog"]').last().locator("button", { hasText: /^Записать$/ }).last().click();
  await page.waitForTimeout(1600);
  want("после возврата запись сохраняется", (await journalLen()) === 1);

  await page.locator("button:visible", { hasText: "Дневник" }).first().click();
  await page.waitForTimeout(900);
  const add = page.locator('[data-diary-lesson="Право"] .ap-dadd');
  const opacity = (await add.count()) ? await add.evaluate((e) => getComputedStyle(e).opacity) : "нет кнопки";
  want("дневник: «+ задание» у урока видно без наведения", opacity === "1", "opacity " + opacity);
  want("таймер без предмета: ошибок нет", errors.length === 0, errors[0] || "");
  await browser.close();
}

// --- «Пора повторить» целиком; занятия с таймера в «Подготовке» -----------
{
  const iso = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
  const custom = Array.from({ length: 10 }, (_, i) => ({ id: "t" + i, name: "Тема " + (i + 1), duration: 40, done: i < 8 }));
  const journal = custom.filter((t) => t.done).map((t, i) => ({ id: 100 + i, date: iso(-10 - i), subjectId: "c1", hours: 0.67, note: t.name, auto: true, lessonId: t.id }));
  journal.unshift({ id: 999, date: iso(0), subjectId: "c1", hours: 0.5, note: "Тема 9 — разбор задач", lessonId: "t8", timer: true });
  const { browser, page, errors } = await open({ journal, customSubjects: [{ id: "c1", name: "Математика", color: "#8C7326" }], data: { c1: { topics: [], custom } } });
  const rows = () => page.locator("button:visible", { hasText: /^Повторил$/ }).count();
  want("«Пора повторить»: сначала три", (await rows()) === 3, String(await rows()));
  await page.locator("[data-review-more]:visible").first().click();
  await page.waitForTimeout(300);
  want("«Пора повторить»: «Показать все» — все восемь", (await rows()) === 8, String(await rows()));

  await page.locator(".ap-nav", { hasText: "Подготовка" }).first().click();
  await page.waitForTimeout(700);
  await page.locator("button:visible", { hasText: "Математика" }).first().click();
  await page.waitForTimeout(500);
  const mark = page.locator('[data-timed="t8"]');
  want("«Подготовка»: у урока пометка таймера", (await mark.count()) === 1 && /30 мин/.test(await mark.innerText()), (await mark.count()) ? await mark.innerText() : "нет");
  // Отметили урок пройденным и сняли отметку — занятие с таймера осталось.
  const box = page.getByRole("checkbox", { name: "Отметить пройденным: Тема 9" });
  await box.check();
  await page.waitForTimeout(300);
  await page.getByRole("checkbox", { name: "Пройден: Тема 9" }).uncheck();
  await page.waitForTimeout(1600);
  const left = await page.evaluate(() => {
    const raw = localStorage.getItem("planner:planner-state-v5");
    return ((raw ? JSON.parse(JSON.parse(raw).value) : {}).journal || []).filter((e) => e.lessonId === "t8").map((e) => (e.timer ? "timer" : e.auto ? "auto" : "other"));
  });
  want("снятая отметка «пройден» не удаляет занятие с таймера", left.length === 1 && left[0] === "timer", left.join(","));
  await mark.click();
  await page.waitForTimeout(300);
  const list = await page.locator("[data-subject-sessions]").innerText();
  want("«Занятия»: занятие с таймера в списке", /Тема 9/.test(list) && /таймер/.test(list), list.slice(0, 120).replace(/\n/g, " | "));
  want("«Пора повторить» и «Занятия»: ошибок нет", errors.length === 0, errors[0] || "");
  await browser.close();
}

server.close();
if (problems.length) { console.error("\nНе так:\n- " + problems.join("\n- ")); process.exit(1); }
console.log("\nтренажёр считается занятием");
