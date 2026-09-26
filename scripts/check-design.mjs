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
const SHOT_DIR = process.env.SHOT_DIR || "";
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
    // Экран открылся, если у него есть заголовок и хоть какое-то содержимое.
    // Считать только объём текста нельзя: пустые «Тетради» на телефоне без
    // отсчёта до события — меньше 150 знаков, хотя открыты целиком.
    const t = (await page.locator("#root").innerText()).length;
    const head = await page.locator("main h1").count();
    if (head === 1 && t > 100) opened += 1;
  }
  const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  want(`${theme}/${vp.width}px: экраны открываются`, opened === keys.length, opened + " из " + keys.length);
  if (vp.width < 500) want(`${theme}/${vp.width}px: ничего не едет вбок`, wide <= 1, wide + " px");
  want(`${theme}/${vp.width}px: ошибок нет`, errors.length === 0, errors[0] || "");
  await ctx.close();
}

// 3б. Ползунки «Распределения» — наши, а не системные: системному Chrome красит
// дорожку сам «для контраста», и у своих предметов с тёмным цветом она в ночной
// теме горела белым.
{
  const { ctx, page, errors } = await fresh({ width: 1280, height: 900 }, {
    "planner-design-intro": "1.0.0", "planner-theme-mode": "night", "planner-screen": "budget",
  });
  await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem("planner:planner-state-v5"));
    const v = JSON.parse(raw.value);
    v.customSubjects = [{ id: "c1", name: "История", color: "#7A5233", topics: [] }];
    raw.value = JSON.stringify(v);
    localStorage.setItem("planner:planner-state-v5", JSON.stringify(raw));
  });
  await page.reload(); await page.waitForTimeout(1500);
  const ranges = await page.evaluate(() => [...document.querySelectorAll('main input[type="range"]')].map((r) => r.className));
  want("в «Распределении» есть ползунки", ranges.length > 0, "их " + ranges.length);
  want("все ползунки — свои, не системные", ranges.every((c) => /\bap-range\b/.test(c)), ranges.join(" | "));
  want("распределение: ошибок нет", errors.length === 0, errors[0] || "");
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

// 6. Экзамены в неделе «Лицея». Дальний (до даты больше недели) — полупрозрачно
// в самом низу своего дня, его можно свернуть; ближний — наверху. Если запись
// встала не туда, где её заводили или правили, — уведомление, и крестик в нём
// возвращает к правке.
{
  const DOW = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const LABEL = { mon: "Пн", tue: "Вт", wed: "Ср", thu: "Чт", fri: "Пт", sat: "Сб", sun: "Вс" };
  const at = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d; };
  const ymd = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  // Будний день через 3 недели и через 3 дня — чтобы не упереться в воскресенье.
  let farN = 21; while (DOW[at(farN).getDay()] === "sun") farN += 1;
  let nearN = 3; while (DOW[at(nearN).getDay()] === "sun" || DOW[at(nearN).getDay()] === DOW[at(farN).getDay()]) nearN += 1;
  const farDay = DOW[at(farN).getDay()];
  const nearDay = DOW[at(nearN).getDay()];
  const exam = (id, name, n, kind) => ({ id, day: DOW[at(n).getDay()], kind: "exam", examKind: kind, subjectName: name, level: "base", priority: 3, start: "10:00", end: "13:00", room: "", teacher: "", place: "", url: "", date: ymd(at(n)) });
  const schedule = [
    { id: "l1", day: farDay, kind: "lesson", subjectName: "Алгебра", level: "base", priority: 2, start: "08:30", end: "09:10", room: "каб. 402", teacher: "", place: "", url: "", date: "" },
    exam("far1", "Олимпиада по праву", farN, "olympiad"),
    exam("near1", "Пробник по обществу", nearN, "exam"),
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
  // «Вся неделя» разворачивается и запоминает это — жмём, только если карточек дней не видно.
  const openWeek = async () => {
    const visibleDays = await page.evaluate(() => [...document.querySelectorAll(".ap-card")]
      .filter((c) => c.offsetParent && /^(Пн|Вт|Ср|Пт|Сб)(\s|$)/.test((c.firstElementChild || {}).innerText || "")).length);
    if (visibleDays === 0) { await page.getByRole("button", { name: /Вся неделя/ }).first().click(); await page.waitForTimeout(600); }
  };
  await openWeek();
  const stored = () => page.evaluate(() => JSON.parse(JSON.parse(localStorage.getItem("planner:planner-state-v5")).value).lyceumSchedule);

  // Где стоит запись: в каком дне (по подписи дня) и какая по счёту среди записей дня.
  const placeOf = (name) => page.evaluate((name) => {
    const out = [];
    document.querySelectorAll(".ap-card").forEach((card) => {
      // У сегодняшнего дня подпись склеивается с «сегодня»: «ЧтСЕГОДНЯ».
      const head = ((card.firstElementChild ? card.firstElementChild.innerText.trim() : "").match(/^(Пн|Вт|Ср|Чт|Пт|Сб|Вс)/) || [])[1];
      if (!head || !card.offsetParent) return;
      // Запись — элемент с цветом полосы сбоку: он задан у каждой записи дня.
      const rows = [...card.querySelectorAll("[style*='border-left-color']")].filter((r) => r.offsetParent);
      rows.forEach((r, i) => {
        if (r.innerText.includes(name)) out.push({ day: head, index: i, count: rows.length, opacity: getComputedStyle(r).opacity });
      });
    });
    return out;
  }, name);

  const far = await placeOf("Олимпиада по праву");
  want("дальняя олимпиада видна в неделе", far.length > 0, JSON.stringify(far));
  const farHere = far.find((p) => p.day === LABEL[farDay]) || far[0] || {};
  want("и стоит в своём дне", farHere.day === LABEL[farDay], farHere.day + " вместо " + LABEL[farDay]);
  want("в самом низу дня, под уроками", farHere.index === farHere.count - 1 && farHere.count > 1, JSON.stringify(farHere));
  want("полупрозрачно", Number(farHere.opacity) < 1, "opacity " + farHere.opacity);
  const near = (await placeOf("Пробник по обществу")).find((p) => p.day === LABEL[nearDay]) || {};
  want("ближний экзамен — наверху дня и не прозрачный", near.index === 0 && Number(near.opacity) === 1, JSON.stringify(near));

  // Свернуть дальнюю олимпиаду — и свёрнутость переживает перезагрузку.
  await page.getByRole("button", { name: /^Свернуть до недели: Олимпиада по праву/ }).first().click();
  await page.waitForTimeout(1700);
  want("свёрнутая — одна строка с кнопкой «развернуть»", (await page.getByRole("button", { name: /^Развернуть: Олимпиада по праву/ }).count()) > 0);
  want("свёрнутость сохранилась в записи", (await stored()).find((e) => e.id === "far1").folded === true);
  await page.reload(); await page.waitForTimeout(1800); await openWeek();
  want("после перезагрузки осталась свёрнутой", (await page.getByRole("button", { name: /^Развернуть: Олимпиада по праву/ }).count()) > 0);
  await page.getByRole("button", { name: /^Развернуть: Олимпиада по праву/ }).first().click();
  await page.waitForTimeout(600);
  want("и разворачивается обратно", (await page.getByRole("button", { name: /^Свернуть до недели: Олимпиада по праву/ }).count()) > 0);

  // Добавить олимпиаду в день ближнего экзамена, а дата — у дальнего: запись уезжает.
  const toastText = () => page.locator(".undo-toast").allInnerTexts();
  const dayCard = (label) => page.locator(".ap-card:visible").filter({ has: page.locator(`xpath=./*[1][starts-with(normalize-space(.), '${label}')]`) }).first();
  const card = dayCard(LABEL[nearDay]);
  await card.getByRole("button", { name: "+ Экзамен" }).click();
  await page.waitForTimeout(400);
  await card.getByPlaceholder("Например: региональный этап по праву").fill("Пробный тест по истории");
  await card.locator('input[type="date"]').first().fill(ymd(at(farN)));
  await card.getByRole("button", { name: /Добавить$/ }).first().click();
  await page.waitForTimeout(700);
  const t1 = (await toastText()).join(" | ");
  want("о переезде добавленного экзамена — уведомление", /Экзамен «Пробный тест по истории» добавлен на/.test(t1), t1.slice(0, 160));
  want("в уведомлении сказано, что внизу и наверх встанет за неделю", /внизу дня, наверх встанет за неделю/.test(t1));
  await page.getByRole("button", { name: "Вернуться к правке" }).first().click();
  await page.waitForTimeout(800);
  want("крестик убирает запись", !(await stored()).some((e) => e.subjectName === "Пробный тест по истории"));
  const refill = await card.getByPlaceholder("Например: региональный этап по праву").inputValue().catch(() => "");
  want("и снова открывает форму с тем, что было введено", refill === "Пробный тест по истории", refill);

  // Правка даты ближнего экзамена: переезжает на день дальнего.
  await page.getByRole("button", { name: /^Изменить: Пробник по обществу/ }).first().click();
  await page.waitForTimeout(400);
  const dateField = page.locator('input[type="date"]').filter({ hasNot: page.locator("xpath=self::*[not(@value)]") });
  const editDate = page.locator(`input[type="date"][value="${ymd(at(nearN))}"]`).first();
  await editDate.fill(ymd(at(farN)));
  await page.locator("h1").first().click();
  await page.waitForTimeout(900);
  const t2 = (await toastText()).join(" | ");
  want("о переезде при правке даты — уведомление", /Экзамен «Пробник по обществу» перенесён на/.test(t2), t2.slice(0, 160));
  want("дата в записи сменилась", (await stored()).find((e) => e.id === "near1").date === ymd(at(farN)));
  await page.getByRole("button", { name: "Вернуться к правке" }).last().click();
  await page.waitForTimeout(1700);
  want("крестик возвращает прежнюю дату", (await stored()).find((e) => e.id === "near1").date === ymd(at(nearN)),
    (await stored()).find((e) => e.id === "near1").date);
  want("и открывает правку этого экзамена", (await page.locator(`input[type="date"][value="${ymd(at(nearN))}"]`).count()) > 0);
  want("экзамены: ошибок нет", errors.length === 0, errors[0] || "");
  await ctx.close();
}

// 7. Задания под уроками в неделе «Лицея». Задание из «Дневника» знает предмет
// и дату, но не урок, — раньше в неделе его не было вовсе. Длинное задание
// свёрнуто в две строки и разворачивается по нажатию.
{
  const DOW = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  let n = 2; while (DOW[new Date(Date.now() + n * 864e5).getDay()] === "sun") n += 1;
  const d = new Date(Date.now() + n * 864e5);
  const date = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  const day = DOW[d.getDay()];
  const lesson = (id, start) => ({ id, day, kind: "lesson", subjectName: "Обществознание", level: "prof", priority: 2, start, end: start, room: "каб. 401", teacher: "Калиниченко А.О.", place: "", url: "", date: "" });
  const long = "1. Теория по уроку 1 и 2! Учим! Отвечаем на уроке и отрабатываем этот материал заданиями 2 части. 2. Тесты выполняем в домашних условиях, планы учим! 3. Задания к уроку 1 также выполняйте!";
  const state = {
    lyceumSchedule: [lesson("s1", "12:20"), lesson("s2", "13:20")],
    // Заведено в «Дневнике»: предмет и дата есть, урока нет.
    homework: [{ id: "hw-j1", date, subjectName: "Обществознание", text: long, minutes: 60, done: false, attachments: [], lessonId: "" }],
  };
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
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
  await page.waitForTimeout(2000);
  const visibleDays = await page.evaluate(() => [...document.querySelectorAll(".ap-card")]
    .filter((c) => c.offsetParent && /^(Пн|Вт|Ср|Пт|Сб)(\s|$)/.test((c.firstElementChild || {}).innerText || "")).length);
  if (visibleDays === 0) { await page.getByRole("button", { name: /Вся неделя/ }).first().click(); await page.waitForTimeout(600); }
  const shown = page.locator("span", { hasText: "Теория по уроку 1 и 2" });
  const count = await shown.evaluateAll((els) => els.filter((e) => e.offsetParent).length);
  want("задание из «Дневника» видно под уроком", count >= 1, "видно раз: " + count);
  want("на паре подряд — один раз, а не дважды", count === 1, "раз: " + count);
  const box = await shown.first().boundingBox();
  want("длинное задание свёрнуто в две строки", box && box.height < 40, box ? Math.round(box.height) + " px" : "нет");
  await page.getByRole("button", { name: "Развернуть задание" }).first().click();
  await page.waitForTimeout(300);
  const open = await shown.first().boundingBox();
  want("по нажатию разворачивается", open && open.height > box.height + 10, open ? Math.round(open.height) + " px" : "нет");
  want("задания: ошибок нет", errors.length === 0, errors[0] || "");
  await ctx.close();
}

// 8. Сегодняшний день. В сетке недели он только подсвечен, а уроки в нём —
// карточками, как в соседних днях (раньше — строками старого вида, которые в
// узкой колонке разваливались). Развёрнутое длинное задание занимает всю
// ширину, а не столбик по слову. Задания урока — и короткие — сворачиваются в
// строку, и это видно в обеих карточках дня и после перезагрузки.
{
  const DOW = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const now = new Date();
  const day = DOW[now.getDay()] === "sun" ? null : DOW[now.getDay()];
  if (day) {
    const iso = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-" + String(now.getDate()).padStart(2, "0");
    const lesson = (id, start, subjectName) => ({ id, day, kind: "lesson", subjectName, level: "base", priority: 2, start, end: start, room: "каб. 401", teacher: "Саркисян О.А.", place: "", url: "", date: "" });
    const long = "1. Теория по уроку 1 и 2! Учим! Отвечаем на уроке и отрабатываем этот материал заданиями 2 части. 2. Тесты выполняем в домашних условиях, планы учим! 3. Задания к уроку 1 также выполняйте!";
    const state = {
      lyceumSchedule: [lesson("t1", "09:25", "Математика"), lesson("t2", "10:20", "Всеобщая география"), lesson("t3", "11:20", "Обществознание")],
      homework: [
        { id: "hw-s", date: iso, subjectName: "Всеобщая география", text: "Открыть сайт ООН и выписать все страны с их столицами (можно выучить)", minutes: 60, done: false, attachments: [], lessonId: "t2" },
        { id: "hw-l", date: iso, subjectName: "Обществознание", text: long, minutes: 60, done: false, attachments: [], lessonId: "t3" },
      ],
      openSections: { scheduleWeek: true },
    };
    for (const [w, h, tag] of [[1280, 900, "desktop"], [900, 900, "narrow"], [390, 844, "phone"]]) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h } });
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
      await page.waitForTimeout(2000);
      want(`${tag}: у уроков нет старой ссылки «изменить»`, (await page.getByRole("button", { name: "изменить", exact: true }).count()) === 0);
      want(`${tag}: у каждого урока карандаш — в обеих карточках дня`, (await page.getByRole("button", { name: "Изменить: Математика" }).count()) === 2);
      // В сетке недели уроки сегодняшнего дня — карточками: время над названием.
      const stacked = await page.evaluate(() => {
        const names = [...document.querySelectorAll("div")].filter((d) => d.innerText === "Математика" && d.offsetParent);
        return names.length;
      });
      want(`${tag}: в сетке недели сегодняшний урок — карточкой`, stacked >= 1, "карточек: " + stacked);
      if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/today-${tag}.png`, fullPage: true });

      // Длинное задание во всю ширину: развернули — ширина текста близка к ширине дня.
      const more = page.getByRole("button", { name: "Развернуть задание" });
      await more.last().click();
      await page.waitForTimeout(300);
      const widths = await page.evaluate(() => {
        const span = [...document.querySelectorAll("span")].filter((e) => e.offsetParent && e.innerText.startsWith("1. Теория по уроку")).pop();
        const card = span && span.closest(".ap-card");
        return span && card ? [span.getBoundingClientRect().width, card.getBoundingClientRect().width] : null;
      });
      want(`${tag}: развёрнутое задание — во всю ширину`, widths && widths[0] > widths[1] * 0.6, widths ? widths.map(Math.round).join(" из ") : "нет");
      if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/today-open-${tag}.png`, fullPage: true });

      // Короткое задание сворачивается в строку — в обеих карточках сразу.
      // Считаем только задания под уроками: тот же текст есть и в «Скоро сдавать».
      const shortShown = () => page.locator("span", { hasText: "Открыть сайт ООН" }).evaluateAll((els) => els.filter((e) => {
        const box = e.parentElement && e.parentElement.previousElementSibling;
        return e.offsetParent && box && box.type === "checkbox";
      }).length);
      want(`${tag}: короткое задание видно в обеих карточках`, (await shortShown()) === 2);
      await page.getByRole("button", { name: "Свернуть задания урока" }).first().click();
      await page.waitForTimeout(300);
      want(`${tag}: свернулось — в обеих карточках`, (await shortShown()) === 0 && (await page.getByRole("button", { name: /Показать задания: 1 задание/ }).count()) === 2);
      await page.reload();
      await page.waitForTimeout(1800);
      want(`${tag}: свёрнуто и после перезагрузки`, (await shortShown()) === 0);
      await page.getByRole("button", { name: /Показать задания: 1 задание/ }).first().click();
      await page.waitForTimeout(300);
      want(`${tag}: разворачивается обратно`, (await shortShown()) === 2);
      want(`${tag}: ошибок нет`, errors.length === 0, errors[0] || "");
      await ctx.close();
    }
  } else {
    console.log("· сегодня воскресенье — проверка сегодняшнего дня пропущена");
  }
}

// 9. Подробности событий: время, место, ссылки, описание. У олимпиады из
// расписания они видны сразу и правятся там же, где живут, — в записи
// расписания; у своего события их можно добавить.
{
  const inDays = (n) => { const d = new Date(Date.now() + n * 864e5); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
  const DOW = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const oDate = inDays(4);
  const state = {
    events: [{ id: "ev-own", name: "Пробник по обществознанию", date: inDays(9), priority: 2 }],
    lyceumSchedule: [{ id: "sch-o1", day: DOW[new Date(oDate + "T00:00:00").getDay()], kind: "exam", examKind: "olympiad", subjectName: "Право · ВсОШ", level: "base", priority: 3, start: "10:00", end: "13:00", room: "", teacher: "", place: "Лицей НИУ ВШЭ · итоги 20 октября", url: "https://siriusolymp.ru", date: oDate }],
  };
  for (const [w, h, tag] of [[1280, 900, "desktop"], [390, 844, "phone"]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    page.setDefaultTimeout(5000);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript((st) => {
      if (sessionStorage.getItem("seeded")) return;
      sessionStorage.setItem("seeded", "1");
      localStorage.setItem("planner-intro-version", "0.6.0-schedule");
      localStorage.setItem("planner-design-intro", "1.0.0");
      localStorage.setItem("planner-screen", "events");
      localStorage.setItem("planner:planner-state-v5", JSON.stringify({ value: JSON.stringify(st), updatedAt: Date.now() - 1000 }));
    }, state);
    await page.goto(URL0);
    await page.waitForTimeout(2000);
    const details = page.locator('[data-event-details="schedule:sch-o1"], [data-event-details$="sch-o1"]').first();
    const txt = (await details.count()) ? await details.innerText() : "";
    want(`${tag}: у олимпиады видно время`, /10:00–13:00/.test(txt), txt.replace(/\n/g, " "));
    want(`${tag}: и место`, /Лицей НИУ ВШЭ/.test(txt));
    const link = details.getByRole("link", { name: /siriusolymp\.ru/ });
    want(`${tag}: и ссылка — открывается в новой вкладке`, (await link.count()) === 1 && (await link.getAttribute("target")) === "_blank" && (await link.getAttribute("href")) === "https://siriusolymp.ru");
    want(`${tag}: в отсчёте — время события`, /10:00–13:00/.test(await page.locator("main").innerText()));

    // Время олимпиады меняется здесь — и в расписании тоже.
    await page.getByRole("button", { name: "Подробности: Право · ВсОШ" }).click();
    await page.getByLabel("Начало").first().fill("11:30");
    await page.getByLabel("Конец").first().fill("14:30");
    await page.getByPlaceholder("Что взять с собой, что повторить, когда итоги").first().fill("Взять паспорт\nПравила: olimpiada.ru/vos");
    await page.getByRole("button", { name: "Скрыть подробности: Право · ВсОШ" }).click();
    await page.waitForTimeout(1500);
    const stored = await page.evaluate(() => JSON.parse(JSON.parse(localStorage.getItem("planner:planner-state-v5")).value));
    const entry = (stored.lyceumSchedule || []).find((e) => e.id === "sch-o1") || {};
    want(`${tag}: время записано в расписание`, entry.start === "11:30" && entry.end === "14:30", entry.start + "–" + entry.end);
    want(`${tag}: описание записано`, /паспорт/.test(entry.note || ""));
    const after = await details.innerText();
    want(`${tag}: новое время на экране`, /11:30–14:30/.test(after), after.replace(/\n/g, " "));
    const noteLink = page.getByRole("link", { name: "olimpiada.ru/vos" });
    want(`${tag}: ссылка в описании — кликабельна`, (await noteLink.count()) === 1 && (await noteLink.getAttribute("href")) === "https://olimpiada.ru/vos");

    // Своё событие: подробностей не было — добавляем.
    await page.getByRole("button", { name: "Подробности: Пробник по обществознанию" }).click();
    await page.getByLabel("Начало").first().fill("09:00");
    await page.getByPlaceholder("Например: лицей, ауд. 401").first().fill("Лицей, ауд. 305");
    await page.getByPlaceholder("Регистрация, задания, результаты").first().fill("javascript:alert(1) https://example.org/probnik");
    await page.getByRole("button", { name: "Скрыть подробности: Пробник по обществознанию" }).click();
    await page.waitForTimeout(1500);
    const own = ((await page.evaluate(() => JSON.parse(JSON.parse(localStorage.getItem("planner:planner-state-v5")).value))).events || []).find((e) => e.id === "ev-own") || {};
    want(`${tag}: у своего события время и место сохранились`, own.start === "09:00" && own.place === "Лицей, ауд. 305");
    const ownBox = page.locator('[data-event-details="ev-own"]');
    const ownLinks = await ownBox.getByRole("link").evaluateAll((els) => els.map((a) => a.getAttribute("href")));
    want(`${tag}: javascript: ссылкой не становится`, ownLinks.length === 1 && ownLinks[0] === "https://example.org/probnik", JSON.stringify(ownLinks));
    await page.reload();
    await page.waitForTimeout(1800);
    want(`${tag}: после перезагрузки всё на месте`, /09:00/.test(await ownBox.innerText()) && /11:30–14:30/.test(await details.innerText()));
    const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    want(`${tag}: ничего не едет вбок`, wide <= 0, wide + " px");
    if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/events-${tag}.png`, fullPage: true });
    want(`${tag}: события без ошибок`, errors.length === 0, errors[0] || "");
    await ctx.close();
  }
}

// 10. Поиск. Разделы — заметными заголовками, уроки и события подсвечены
// важностью, найденное выделено маркером. Запрос из нескольких слов ищет
// каждое. Задание открывает дневник на своей дате и подсвечивается; ветка
// тетради раскрывается; по названию предмета находится его тетрадь.
{
  const inDays = (n) => { const d = new Date(Date.now() + n * 864e5); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
  const hwDate = inDays(40);
  const state = {
    lyceumSchedule: [{ id: "en1", day: "mon", kind: "lesson", subjectName: "Английский язык (гр. 1)", teacher: "Митяева Н.В.", room: "каб. 502", priority: 3, level: "prof", start: "12:20", end: "13:00" }],
    homework: [{ id: "hw-en", date: hwDate, subjectName: "Английский язык (гр. 1)", text: "Найти 5 музеев и 5 художников на английском", minutes: 30, done: false, attachments: [] }],
    events: [{ id: "ev-en", name: "Английский язык — высшая проба", date: inDays(8), priority: 3 }],
    notebooks: { "lyceum:Английский язык (гр. 1)": [{ id: "nb-b", title: "Unit 1", branches: [{ id: "nb-r", title: "Времена", html: "<div>Present Perfect — опыт и результат</div>", files: [] }] }] },
  };
  for (const [w, h, tag] of [[1280, 900, "desktop"], [390, 844, "phone"]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    page.setDefaultTimeout(5000);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript((st) => {
      if (sessionStorage.getItem("seeded")) return;
      sessionStorage.setItem("seeded", "1");
      localStorage.setItem("planner-intro-version", "0.6.0-schedule");
      localStorage.setItem("planner-design-intro", "1.0.0");
      localStorage.setItem("planner-screen", "search");
      localStorage.setItem("planner:planner-state-v5", JSON.stringify({ value: JSON.stringify(st), updatedAt: Date.now() - 1000 }));
    }, state);
    await page.goto(URL0);
    await page.waitForTimeout(1800);
    const box = page.getByLabel("Поиск по записям");
    await box.fill("Анг");
    await page.waitForTimeout(400);
    const groups = await page.locator("[data-search-group]").evaluateAll((els) => els.map((e) => e.dataset.searchGroup));
    want(`${tag}: по «Анг» — задание, расписание, событие и тетрадь`, ["homework", "schedule", "events", "notes"].every((g) => groups.includes(g)), groups.join(","));
    const head = await page.locator('[data-search-group="notes"] > div').first().evaluate((el) => ({ size: parseFloat(getComputedStyle(el).fontSize), svg: !!el.querySelector("svg") }));
    want(`${tag}: заголовок раздела крупный и со значком`, head.size >= 16 && head.svg, JSON.stringify(head));
    const lesson = await page.locator('[data-search-group="schedule"] button').first().evaluate((el) => getComputedStyle(el).borderLeftWidth);
    want(`${tag}: урок подсвечен полоской важности`, lesson === "3px", lesson);
    const marks = await page.locator("main mark").allInnerTexts();
    want(`${tag}: найденное выделено маркером`, marks.length >= 3 && marks.every((m) => /^анг$/i.test(m)), marks.slice(0, 4).join(","));
    if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/search-${tag}.png`, fullPage: true });

    // Несколько слов — каждое, в любом порядке.
    await box.fill("опыт present");
    await page.waitForTimeout(400);
    want(`${tag}: «опыт present» находит ветку тетради`, (await page.locator('[data-search-group="notes"] button').count()) >= 1);
    await page.locator('[data-search-group="notes"] button').first().click();
    await page.waitForTimeout(1200);
    want(`${tag}: ветка тетради раскрыта`, await page.locator('[data-focus-id="branch:nb-r"] [contenteditable]').isVisible());

    // Задание — дневник на своей дате, задание подсвечено.
    await page.evaluate(() => localStorage.setItem("planner-screen", "search"));
    await page.reload();
    await page.waitForTimeout(1500);
    await page.getByLabel("Поиск по записям").fill("музеев");
    await page.waitForTimeout(400);
    await page.locator('[data-search-group="homework"] button').first().click();
    await page.waitForTimeout(400);
    const hw = page.locator('[data-focus-id="hw:hw-en"]');
    want(`${tag}: задание открылось в дневнике на своей дате`, await hw.isVisible());
    want(`${tag}: и подсвечено`, await hw.evaluate((el) => el.classList.contains("ap-flash")));
    const inView = await hw.evaluate((el) => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= window.innerHeight; });
    await page.waitForTimeout(900);
    want(`${tag}: и прокручено на экран`, inView || (await hw.evaluate((el) => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= window.innerHeight; })));
    const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    want(`${tag}: ничего не едет вбок`, wide <= 0, wide + " px");
    want(`${tag}: поиск без ошибок`, errors.length === 0, errors[0] || "");
    await ctx.close();
  }
}

await browser.close(); server.close();
console.log(bad ? `\nпровалов: ${bad}` : "\nновый дизайн работает, старого переключателя нет, записи целы");
process.exit(bad ? 1 : 0);
