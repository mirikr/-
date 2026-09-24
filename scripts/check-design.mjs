// Проверяет новый дизайн 1.0.0 целиком.
//
// Анонс нового вида показывается один раз и больше не предлагает вернуть
// старый: переключателя дизайна больше нет. Кто успел включить старый, после
// обновления оказывается в новом, а записи от этого не меняются. Все разделы
// открываются без ошибок в светлой и ночной теме, на компьютере и телефоне.
//
// Запуск: npm run check:design
// (нужны playwright и Chromium: PLAYWRIGHT_MODULE и CHROMIUM_PATH)
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

const STATE = { journal: [{ id: "j1", date: new Date().toISOString().slice(0, 10), subject: "Право", hours: 1, note: "Конституция" }], events: [{ id: "e1", name: "Региональный этап", date: new Date(Date.now() + 20 * 864e5).toISOString().slice(0, 10), priority: 3 }] };

async function fresh(viewport, extra) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(([state, extra]) => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem("planner-intro-version", "0.6.0-schedule");
    localStorage.setItem("planner:planner-state-v5", JSON.stringify({ value: JSON.stringify(state), updatedAt: Date.now() - 1000 }));
    for (const [k, v] of Object.entries(extra || {})) localStorage.setItem(k, v);
  }, [STATE, extra]);
  await page.goto(URL0);
  await page.waitForTimeout(2200);
  return { ctx, page, errors };
}
const design = (page) => page.evaluate(() => document.documentElement.getAttribute("data-design"));
const announce = (page) => page.getByText("У ежедневника новый дизайн").count();

// 1. Анонс: показан один раз, «Отлично» закрывает навсегда, о старом дизайне — ни слова.
{
  const { ctx, page, errors } = await fresh({ width: 1280, height: 900 });
  want("анонс 1.0.0 показан после обновления", (await announce(page)) > 0);
  const dialog = await page.locator("body").innerText();
  want("в анонсе нет кнопки «Вернуть старый»", (await page.getByRole("button", { name: /Вернуть (старый|прежний)/ }).count()) === 0);
  want("в анонсе нет напоминания про старый дизайн", !/(старый|прежний) дизайн/i.test(dialog),
    (dialog.match(/[^\n]*(старый|прежний) дизайн[^\n]*/i) || [])[0] || "");
  await page.getByRole("button", { name: "Отлично" }).click();
  await page.waitForTimeout(400);
  want("«Отлично» закрывает анонс", (await announce(page)) === 0);
  await page.reload(); await page.waitForTimeout(2000);
  want("после перезагрузки анонса нет", (await announce(page)) === 0);
  const txt = await page.locator("#root").innerText();
  want("записи на месте", /Региональный этап/.test(txt) || /1\s*ч/.test(txt));
  want("ошибок нет", errors.length === 0, errors[0] || "");
  await ctx.close();
}

// 2. Переключателя больше нет, а кто включал старый — оказывается в новом, с теми же записями.
{
  const { ctx, page, errors } = await fresh({ width: 1280, height: 900 }, { "planner-design-intro": "1.0.0", "planner-design": "classic" });
  want("сохранённый «старый дизайн» не включается", (await design(page)) !== "classic", String(await design(page)));
  want("открыт новый вид: плитки дня на месте", /Записано сегодня/.test(await page.locator("main").innerText()));
  const stored = await page.evaluate(() => JSON.parse(JSON.parse(localStorage.getItem("planner:planner-state-v5")).value));
  want("записи не тронуты", stored.journal?.length === 1 && stored.events?.length === 1);
  await page.evaluate(() => localStorage.setItem("planner-screen", "prefs"));
  await page.reload(); await page.waitForTimeout(1500);
  const prefs = await page.locator("main").innerText();
  want("настройки открываются", /Оформление/.test(prefs));
  want("в настройках нет выбора дизайна", !/(Старый|Прежний)\b/.test(prefs) && (await page.getByRole("button", { name: /^(Старый|Прежний)$/ }).count()) === 0);
  want("ошибок нет", errors.length === 0, errors[0] || "");
  await ctx.close();
}

// 3. Все экраны в светлой и ночной теме, на компьютере и телефоне — без ошибок.
for (const theme of ["light", "night"]) for (const vp of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  const { ctx, page, errors } = await fresh(vp, { "planner-design-intro": "1.0.0", "planner-theme-mode": theme });
  const keys = ["today", "events", "budget", "study", "trainer", "school", "journal", "notes", "search", "settings", "prefs"];
  let opened = 0;
  for (const k of keys) {
    await page.evaluate((k) => { localStorage.setItem("planner-screen", k); }, k);
    await page.reload(); await page.waitForTimeout(900);
    const t = (await page.locator("#root").innerText()).length;
    if (t > 150) opened += 1;
  }
  const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  want(`${theme}/${vp.width}px: экраны открываются`, opened === keys.length, opened + " из " + keys.length);
  if (vp.width < 500) want(`${theme}/${vp.width}px: ничего не едет вбок`, wide <= 1, wide + " px");
  want(`${theme}/${vp.width}px: ошибок нет`, errors.length === 0, errors[0] || "");
  await ctx.close();
}

// 4. Карточки уроков в расписании: кнопки не вылезают за край, а важность —
// свойство предмета и меняется во всех его уроках сразу, кроме экзаменов.
{
  const lesson = (id, day, start, name, priority) => ({ id, day, kind: "lesson", subjectName: name, level: "base", priority, start, end: start, room: "каб. 502", teacher: "Митяева Н.В.", place: "", url: "", date: "" });
  const exam = { id: "x1", day: "wed", kind: "exam", examKind: "exam", subjectName: "Английский язык (гр. 1)", level: "base", priority: 2, start: "16:00", end: "18:00", room: "", teacher: "", place: "КЭО", url: "", date: new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10) };
  const schedule = [
    lesson("a1", "mon", "12:20", "Английский язык (гр. 1)", 2),
    lesson("a2", "mon", "13:20", "Английский язык (гр. 1)", 2),
    lesson("a3", "thu", "10:20", "Английский язык (гр. 1)", 2),
    lesson("b1", "mon", "15:45", "Физическая культура", 1),
    exam,
  ];
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript((sch) => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem("planner-intro-version", "0.6.0-schedule");
    localStorage.setItem("planner-design-intro", "1.0.0");
    localStorage.setItem("planner-screen", "school");
    localStorage.setItem("planner:planner-state-v5", JSON.stringify({ value: JSON.stringify({ lyceumSchedule: sch }), updatedAt: Date.now() - 1000 }));
  }, schedule);
  await page.goto(URL0);
  await page.waitForTimeout(2000);
  // Вся неделя раскрыта: карточки понедельника — в узкой колонке.
  const week = page.getByRole("button", { name: /Вся неделя/ }).first();
  if (await week.count()) { await week.click(); await page.waitForTimeout(600); }
  const edit = page.getByRole("button", { name: /^Изменить: Английский язык \(гр\. 1\)/ });
  want("у урока есть кнопка «изменить»", (await edit.count()) >= 3, "кнопок: " + (await edit.count()));
  want("и «+ задание»", (await page.getByRole("button", { name: /задание/ }).count()) >= 3);
  // Ничего не вылезает за правый край своей карточки.
  const overflow = await page.evaluate(() => {
    let worst = 0;
    document.querySelectorAll('button[aria-label^="Изменить: "]').forEach((btn) => {
      let card = btn.parentElement;
      while (card && !(getComputedStyle(card).borderLeftWidth !== "0px" && getComputedStyle(card).borderLeftStyle !== "none")) card = card.parentElement;
      if (!card) return;
      const edge = card.getBoundingClientRect().right;
      card.querySelectorAll("button").forEach((b) => { worst = Math.max(worst, b.getBoundingClientRect().right - edge); });
    });
    return Math.round(worst);
  });
  want("кнопки не вылезают за край карточки", overflow <= 0, "на " + overflow + " px");

  // Важность: «очень важно» у понедельничного урока в 12:20.
  const card = edit.first().locator("xpath=ancestor::div[.//button[@title='очень важно']][1]");
  await card.getByTitle("очень важно").first().click();
  await page.waitForTimeout(1600);
  const stored = await page.evaluate(() => JSON.parse(JSON.parse(localStorage.getItem("planner:planner-state-v5")).value).lyceumSchedule);
  const pr = (id) => (stored.find((e) => e.id === id) || {}).priority;
  want("важность сменилась у самого урока", pr("a1") === 3, "a1: " + pr("a1"));
  want("и у второй пары в тот же день", pr("a2") === 3, "a2: " + pr("a2"));
  want("и в другой день", pr("a3") === 3, "a3: " + pr("a3"));
  want("другой предмет не тронут", pr("b1") === 1, "b1: " + pr("b1"));
  want("экзамен по тому же предмету не тронут", pr("x1") === 2, "x1: " + pr("x1"));
  want("расписание: ошибок нет", errors.length === 0, errors[0] || "");
  await ctx.close();
}

// 5. Дата события сохраняется, только когда из поля уходят. Пока её набирают
// с клавиатуры, браузер отдаёт промежуточные значения (год 0002, 0020, 0202),
// и раньше событие на лету уезжало в «Прошедшие» вместе с полем под курсором.
{
  const soon = new Date(Date.now() + 20 * 864e5).toISOString().slice(0, 10);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "ru-RU" });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript((date) => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem("planner-intro-version", "0.6.0-schedule");
    localStorage.setItem("planner-design-intro", "1.0.0");
    localStorage.setItem("planner-screen", "events");
    localStorage.setItem("planner:planner-state-v5", JSON.stringify({ value: JSON.stringify({ events: [{ id: "e1", name: "Региональный этап ВсОШ", date, priority: 3 }] }), updatedAt: Date.now() - 1000 }));
  }, soon);
  await page.goto(URL0);
  await page.waitForTimeout(1800);
  const stored = () => page.evaluate(() => (JSON.parse(JSON.parse(localStorage.getItem("planner:planner-state-v5")).value).events || [])[0]?.date);
  // Поле даты в строке самого события — первое на экране; ниже форма добавления.
  const field = page.locator('input[type="date"]').first();
  // Порядок частей даты зависит от языка браузера; здесь он «месяц/день/год».
  // Первая цифра года делает его 0002 — на этом событие раньше и уезжало.
  const blurOut = () => page.locator("h1").first().click();
  await field.click({ position: { x: 12, y: 10 } });
  await page.keyboard.type("1001");
  await page.keyboard.type("2");
  await page.waitForTimeout(1700);
  const focusedStill = await page.evaluate(() => document.activeElement && document.activeElement.type === "date");
  want("пока дату набирают, поле не теряет курсор", focusedStill);
  want("и событие не уезжает в прошедшие", !/Прошедшие/.test(await page.locator("main").innerText()));
  want("и ничего не сохраняется раньше времени", (await stored()) === soon, (await stored()) + " вместо " + soon);
  // Дописываем год и уходим из поля — теперь дата сохраняется.
  await page.keyboard.type("027");
  // Tab внутри поля даты ходит по его частям, поэтому уходим щелчком мимо.
  await blurOut();
  await page.waitForTimeout(1700);
  want("после ухода из поля дата сохранилась", (await stored()) === "2027-10-01", String(await stored()));
  // Esc отменяет незаконченную правку.
  await field.click({ position: { x: 12, y: 10 } });
  await page.keyboard.type("05");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(1700);
  want("Esc отменяет правку", (await stored()) === "2027-10-01", String(await stored()));
  want("события: ошибок нет", errors.length === 0, errors[0] || "");
  await ctx.close();
}

await browser.close(); server.close();
console.log(bad ? `\nпровалов: ${bad}` : "\nновый дизайн работает, старого переключателя нет, записи целы");
process.exit(bad ? 1 : 0);
