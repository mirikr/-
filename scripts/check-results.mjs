// Раздел «Результаты» (предпросмотр, вид B): слева предметы и олимпиады, справа
// страница предмета — плитки, график, записи; на телефоне — чипы. Свои записи по
// разным шкалам, средний балл — среднее арифметическое по 100-балльной,
// разделение на официальные и свои, демо-результаты из обновления, роль учителя (выложить
// ученику — ученик видит, убрать — пропадает), телефон. И что на сайте раздела нет.
//
// Запуск: DIST=<сборка предпросмотра> npm run check:results
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

const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
page.setDefaultTimeout(6000);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.addInitScript(() => {
  if (sessionStorage.getItem("seeded")) return;
  sessionStorage.setItem("seeded", "1");
  localStorage.setItem("planner-intro-version", "0.6.0-schedule");
  localStorage.setItem("planner-design-intro", "1.0.0");
  localStorage.setItem("planner-screen", "results");
  localStorage.setItem("planner:planner-state-v5", JSON.stringify({ value: JSON.stringify({ journal: [], customSubjects: [{ id: "c0", name: "Право", color: "#C0563B", topics: [] }] }), updatedAt: Date.now() - 1000 }));
});
await page.goto(URL0);
await page.waitForTimeout(2500);
const stored = async () => JSON.parse(JSON.parse(await page.evaluate(() => localStorage.getItem("planner:planner-state-v5"))).value).results || [];
const cards = () => page.locator("[data-result]").evaluateAll((els) => els.map((e) => e.getAttribute("data-result")));
const scores = (scope) => page.locator(scope + " [data-result]").evaluateAll((els) => els.map((e) => e.getAttribute("data-result") + "=" + e.getAttribute("data-score")));
const officialScores = (subject) => page.locator(`[data-subject-page="${subject}"] [data-result][data-official]`).evaluateAll((els) => els.map((e) => e.getAttribute("data-score")).sort());
const text = async (sel) => ((await page.locator(sel).count()) ? (await page.locator(sel).first().innerText()).trim() : "");
const nav = async (name) => { await page.locator(`[data-nav-subject="${name}"]`).click(); await page.waitForTimeout(200); };
const menuItems = async (title) => {
  await page.getByRole("button", { name: "Действия: " + title, exact: true }).first().click();
  const items = await page.getByRole("menuitem").allInnerTexts();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(100);
  return items.map((x) => x.trim());
};
const act = async (title, item) => {
  await page.getByRole("button", { name: "Действия: " + title, exact: true }).first().click();
  await page.getByRole("menuitem", { name: item, exact: true }).click();
  await page.waitForTimeout(250);
};
// Клетка журнала — кнопка; поле появляется, когда её открывают. Tab — сохранить.
const setCell = async (rc, v) => {
  const c = page.locator(`[data-cell="${rc}"]`);
  await c.click();
  await c.fill(v);
  await c.press("Tab");
  await page.waitForTimeout(60);
};
const cellText = (rc) => text(`[data-cell="${rc}"]`);
const mode = async (m) => { await page.getByRole("group", { name: "Показывать" }).getByRole("button", { name: m }).click(); await page.waitForTimeout(200); };

want("в меню есть «Результаты»", (await page.locator(".ap-nav", { hasText: "Результаты" }).count()) >= 1);
want("вид B: слева предметы, справа страница", (await page.locator('[data-layout="desktop"] nav [data-nav-subject="Все предметы"]').count()) === 1 && (await page.locator('[data-subject-page="Все предметы"]').count()) === 1);
want("демо-результаты из обновления видны", (await cards()).includes("Высшая проба") && (await cards()).includes("Пробник ЕГЭ (лицейский)"), (await cards()).join(" | "));
const official = page.locator('[data-result="Высшая проба"]');
want("официальный — с замком и без «Изменить»", /🔒/.test(await official.innerText()) && (await official.getAttribute("data-official")) === "true" && !(await menuItems("Высшая проба")).includes("Изменить"));
const probe = page.locator('[data-result="Пробник ЕГЭ (лицейский)"]');
want("пробник: вторичные крупно, первичные подписью", (await probe.getAttribute("data-score")) === "78" && /первичных 46 из 58/.test(await probe.innerText()), await probe.innerText());
want("олимпиада слева: «59 · прошёл ✓»", (await text('[data-nav-olympiad="Высшая проба"] [data-olympiad-badge]')) === "59 · прошёл ✓", await text('[data-nav-olympiad="Высшая проба"] [data-olympiad-badge]'));
await page.locator('[data-nav-olympiad="Высшая проба"]').click();
await page.waitForTimeout(200);
const opage = await text('[data-olympiad-page="Высшая проба"]');
want("олимпиада: туры, сумма и проходной", /Тест\s*38\s*из 50/.test(opage) && /сумма 59 из 100/.test(opage) && /прошёл дальше ✓/.test(opage) && /Прошёл на следующий этап/.test(opage), opage.replace(/\n/g, " | "));
await nav("Все предметы");
await page.getByRole("button", { name: "Код ученика" }).click();
want("код ученика — в окне", /^[A-Z2-9]{4}(-[A-Z2-9]{4}){4}$/.test(await text('[role=dialog][aria-label="Код ученика"] [data-results-code]')));
await page.keyboard.press("Escape");
await page.waitForTimeout(200);

// Свои: две оценки за уроки по 100-балльной.
async function addLesson(title, score) {
  await page.getByRole("button", { name: "+ Результат" }).click();
  await page.waitForTimeout(250);
  const dlg = page.getByRole("dialog", { name: "Новый результат" });
  await dlg.getByRole("button", { name: "Урок", exact: true }).click();
  await dlg.getByLabel("Предмет").fill("Право");
  await dlg.getByLabel("Название").fill(title);
  await dlg.getByLabel("Баллы", { exact: true }).fill(String(score));
  want("урок — по умолчанию из 100", (await dlg.getByLabel("Из скольких (максимум)").inputValue()) === "100");
  await dlg.getByRole("button", { name: "Сохранить" }).click();
  await page.waitForTimeout(300);
}
await addLesson("Урок 1", 90);
await addLesson("Урок 2", 70);
await page.waitForTimeout(1500);
want("свои записи сохранились", (await stored()).length === 2 && (await stored())[0].score === 90, JSON.stringify(await stored()));

// Право: уроки 90 и 70 и олимпиада 59 → средний 73; средняя оценка (5 + 4) / 2.
await nav("Право");
want("Право: записи предмета", JSON.stringify((await scores('[data-subject-page="Право"]')).sort()) === JSON.stringify(["Высшая проба=59", "Урок 1=90", "Урок 2=70"]), (await scores('[data-subject-page="Право"]')).join(" | "));
want("Право: средний слева и на плитке — 73", (await text('[data-nav-avg="Право"]')) === "73" && /^Средний\s*73/.test(await text('[data-tile="avg"]')), await text('[data-tile="avg"]'));
want("Право: лучший и средняя оценка", /90/.test(await text('[data-tile="best"]')) && /4,5/.test(await text('[data-tile="other"]')), (await text('[data-tile="best"]')) + " / " + (await text('[data-tile="other"]')));
want("Право: график с порогом", (await page.locator("[data-score-chart]").count()) === 1);
await page.locator('[data-subject-page="Право"] [data-records]').getByRole("button", { name: "Урок", exact: true }).click();
await page.waitForTimeout(150);
want("Право: фильтр записей по виду", JSON.stringify((await scores('[data-subject-page="Право"]')).sort()) === JSON.stringify(["Урок 1=90", "Урок 2=70"]));
await page.locator('[data-subject-page="Право"] [data-records]').getByRole("button", { name: "Все", exact: true }).click();
await nav("Все предметы");
await page.getByLabel("Найти предмет").fill("общ");
await page.waitForTimeout(150);
const navNames = () => page.locator("[data-nav-subject]").evaluateAll((els) => els.map((e) => e.getAttribute("data-nav-subject")));
want("поиск предмета: остался только найденный", JSON.stringify(await navNames()) === JSON.stringify(["Все предметы", "Обществознание"]), (await navNames()).join(" | "));
await page.getByLabel("Найти предмет").press("Enter");
await page.waitForTimeout(150);
want("поиск: Enter открывает найденный предмет", (await page.locator('[data-subject-page="Обществознание"]').count()) === 1);
await page.getByLabel("Найти предмет").fill("химия");
want("поиск: «Ничего не нашлось»", (await page.locator("[data-search-empty]").count()) === 1);
await page.getByLabel("Найти предмет").fill("");
await nav("Все предметы");
// Цвет — смесь цветов темы: доля зелёного растёт с баллом.
const greenShare = (t) => page.evaluate((t) => { const el = document.querySelector(`[data-result="${t}"] [data-score-color]`); const m = el && /var\(--green\) (\d+)%/.exec(el.style.color); return m ? Number(m[1]) : 0; }, t);
want("цвет балла — по величине: 90 зеленее 70", (await greenShare("Урок 1")) > (await greenShare("Урок 2")) && (await greenShare("Урок 2")) > 0, (await greenShare("Урок 1")) + " / " + (await greenShare("Урок 2")));
await nav("Все предметы");
// Все четыре: 90, 70, 78 (пробник), 59 (олимпиада) → 74,3.
want("средний по всем — среднее арифметическое", (await text('[data-nav-avg="Все предметы"]')) === "74,3" && /Средний балл 74,3 из 100 по 4 записям · 2 официальных, 2 своих/.test(await text("[data-results-summary]")), await text("[data-results-summary]"));
await mode("Оценки");
// Оценки: 5, 4 (урок 70), 4 (пробник 78); олимпиада — без оценки.
want("в оценках — средняя оценка 4,3", (await text('[data-nav-avg="Все предметы"]')) === "4,3" && (await page.locator('[data-result="Урок 1"]').getAttribute("data-score")) === "5", await text('[data-nav-avg="Все предметы"]'));
await mode("Баллы");

// Правка и удаление своей, скрытие официальной — через «⋯».
await act("Урок 2", "Изменить");
await page.getByRole("dialog").getByLabel("Баллы", { exact: true }).fill("80");
await page.getByRole("dialog").getByRole("button", { name: "Сохранить" }).click();
await page.waitForTimeout(1500);
want("правка своей записи сохраняется", (await stored()).find((r) => r.title === "Урок 2").score === 80);
await page.getByRole("button", { name: "+ Результат" }).click();
await page.getByRole("dialog").getByRole("button", { name: "КТ", exact: true }).click();
await page.getByRole("dialog").getByLabel("Название").fill("Своя КТ");
await page.getByRole("dialog").getByRole("group", { name: "Оценка" }).getByRole("button", { name: "4" }).click();
await page.getByRole("dialog").getByRole("button", { name: "Сохранить" }).click();
await page.waitForTimeout(300);
want("своя запись — «моя запись» и «Изменить»", /моя запись/.test(await page.locator('[data-result="Своя КТ"]').innerText()) && (await menuItems("Своя КТ")).includes("Изменить"));
await act("Своя КТ", "Удалить");
await page.waitForTimeout(1500);
want("удаление своей", !(await cards()).includes("Своя КТ") && (await stored()).length === 2);
await act("Высшая проба", "Скрыть у себя");
want("официальную можно скрыть у себя", !(await cards()).includes("Высшая проба") && (await page.locator('[data-nav-olympiad="Высшая проба"]').count()) === 0 && (await page.getByRole("button", { name: /Показать скрытые · 1/ }).count()) === 1);

// Дневник: день с результатом отмечен в календаре, в карточке дня — список,
// по нажатию — «Результаты» на странице предмета.
const todayKey = await page.evaluate(() => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); });
await page.locator(".ap-nav", { hasText: "Дневник" }).first().click();
await page.waitForTimeout(600);
// С 1.11 в клетке — до двух оценок цифрами (остальное — «+N»).
const dayMarks = await page.locator(`[data-day-grade="${todayKey}"]`).allInnerTexts();
want("дневник: день с результатами отмечен оценками", dayMarks.length === 2 && dayMarks.every((t) => /^[2-5]$/.test(t.trim())), dayMarks.join(", ") || "нет");
const dayList = await text("[data-day-results]");
want("дневник: в карточке дня — результаты", /Право · Урок 1/.test(dayList) && /Право · Урок 2/.test(dayList), dayList.replace(/\n/g, " | "));
await page.locator("[data-day-results] button", { hasText: "Урок 1" }).click();
await page.waitForTimeout(600);
want("дневник → «Результаты» на странице предмета", (await page.locator('[data-subject-page="Право"]').count()) === 1);
await nav("Все предметы");

// Роль учителя: выложить ученику, ученик видит; убрать — пропадает.
await page.getByRole("button", { name: "Учитель", exact: true }).click();
await page.waitForTimeout(300);
want("учитель: шапка «Вы — учитель»", /Вы — учитель/.test(await text("[data-teacher-who]")));
await page.getByRole("button", { name: "Отдельный результат" }).click();
await page.waitForTimeout(200);
want("учитель: учебный ученик уже выбран", (await page.locator('[data-chosen="student@demo"]').count()) === 1);
await page.locator("[data-student-picker]").getByRole("checkbox", { name: "Иванов Иван" }).check();
want("учитель: ученика выбирают галочкой из списка класса", (await page.locator('[data-chosen="ivanov@demo"]').count()) === 1);
await page.getByRole("button", { name: "Убрать: Иванов Иван · 10Б" }).click();
want("учитель: и убирают из выбранных", (await page.locator('[data-chosen="ivanov@demo"]').count()) === 0);
want("учитель: без почты выбрать нельзя", await page.locator("[data-student-picker]").getByRole("checkbox", { name: "Сидоров Пётр" }).isDisabled());
await page.getByLabel("Подпись учителя").fill("Петрова И. В.");
await page.getByRole("button", { name: "КТ", exact: true }).click();
await page.getByLabel("Предмет").fill("Право");
await page.getByLabel("Название").fill("КТ №1 по ТГП");
await page.getByRole("group", { name: "Оценка" }).getByRole("button", { name: "5" }).click();
await page.getByRole("button", { name: "Выложить" }).click();
await page.waitForTimeout(500);
want("учитель: «Выложено: 1 ученику»", /Выложено: 1 ученику/.test(await page.getByRole("status").innerText()));
want("учитель видит выложенное", /КТ №1 по ТГП · student@demo/.test(await page.locator("body").innerText()));
await page.getByRole("button", { name: "Ученик", exact: true }).click();
await page.waitForTimeout(600);
const kt = page.locator('[data-result="КТ №1 по ТГП"]');
want("ученик видит результат от учителя", (await kt.count()) === 1 && /Петрова И. В./.test(await kt.innerText()) && /оценка 5/.test(await kt.innerText()), (await kt.count()) ? await kt.innerText() : "нет");
want("и изменить его не может", (await kt.getAttribute("data-official")) === "true" && !(await menuItems("КТ №1 по ТГП")).includes("Изменить"));
if (process.env.SHOT_DIR) await page.screenshot({ path: process.env.SHOT_DIR + "/results-desktop.png", fullPage: true });
await page.getByRole("button", { name: "Учитель", exact: true }).click();
await page.waitForTimeout(300);
await page.getByRole("button", { name: "Отдельный результат" }).click();
await page.waitForTimeout(200);
await page.getByRole("button", { name: "Убрать", exact: true }).first().click();
await page.waitForTimeout(300);
await page.getByRole("button", { name: "Ученик", exact: true }).click();
await page.waitForTimeout(600);
want("учитель убрал — у ученика пропало", (await page.locator('[data-result="КТ №1 по ТГП"]').count()) === 0);

// Журнал учителя: класс из списка — ученики строками, даты уроков столбцами,
// отметки уходят ученикам.
await page.getByRole("button", { name: "Учитель", exact: true }).click();
await page.waitForTimeout(300);
await page.getByRole("button", { name: "Журнал", exact: true }).click();
const classNames = await page.locator("[data-class]").evaluateAll((els) => els.map((e) => e.getAttribute("data-class")));
want("журнал: классы — списком сбоку", (await page.locator("[data-class-list]").count()) === 1 && classNames.join(",") === "10Б,11А", classNames.join(","));
await page.locator('[data-class="10Б"]').click();
await page.waitForTimeout(200);
// Класс: предметы из его расписания — журнал создаётся одним нажатием, дни уроков — оттуда же.
const classSubs = await page.locator("[data-class-page] [data-new-journal]").evaluateAll((els) => els.map((e) => e.getAttribute("data-new-journal")).filter(Boolean));
want("класс: предметы — из расписания класса", JSON.stringify(classSubs) === JSON.stringify(["Право", "История", "Обществознание", "Английский язык (гр. 1)"]), classSubs.join(" | "));
await page.locator('[data-new-journal="Право"]').click();
await page.waitForTimeout(300);
want("новый журнал: сразу таблица, дни — из расписания класса", (await page.locator("[data-gradebook-table]").count()) === 1 && (await page.locator("[data-journal-setup]").count()) === 0 && (await page.locator("[data-settings]").count()) === 0);
want("журнал: сводка настроек на кнопке", /пн, чт/.test(await text("[data-settings-summary]")) && /100-балльная/.test(await text("[data-settings-summary]")), await text("[data-settings-summary]"));
want("журнал: где вы — «10Б / Право»", /10Б\s*\/\s*Право/.test(await text("[data-crumbs]")), await text("[data-crumbs]"));
await page.locator("[data-crumbs]").getByRole("button", { name: "10Б" }).click();
await page.waitForTimeout(200);
want("класс: журнал в списке, его предмета среди новых больше нет", (await page.locator('[data-class-page] [data-journal="Право"]').count()) === 1 && (await page.locator('[data-new-journal="Право"]').count()) === 0);
await page.locator('[data-journal="Право"]').click();
await page.waitForTimeout(200);
const studentsRows = await page.locator("[data-student]").evaluateAll((els) => els.map((e) => e.getAttribute("data-student")));
want("журнал: ученики класса подставились сами, по фамилии", JSON.stringify(studentsRows) === JSON.stringify(["Иванов Иван", "Петрова Анна", "Сидоров Пётр", "Учебный ученик"]), studentsRows.join(" | "));
await page.getByRole("button", { name: "Убрать из журнала: Петрова Анна" }).click();
await page.getByRole("button", { name: "+ Ученик" }).click();
await page.getByLabel("Найти ученика").fill("кузн");
await page.locator('[data-candidate="Кузнецова Мария"]').click();
await page.waitForTimeout(200);
const rows2 = await page.locator("[data-student]").evaluateAll((els) => els.map((e) => e.getAttribute("data-student")));
want("журнал: убрали одного, добавили из 11А", JSON.stringify(rows2) === JSON.stringify(["Иванов Иван", "Кузнецова Мария", "Сидоров Пётр", "Учебный ученик"]), rows2.join(" | "));
await page.getByLabel("Фамилия нового ученика").fill("Новиков");
await page.getByLabel("Имя нового ученика").fill("Олег");
await page.getByRole("button", { name: "Добавить", exact: true }).click();
await page.waitForTimeout(200);
want("журнал: ученика можно добавить вручную", (await page.locator('[data-student="Новиков Олег"]').count()) === 1);
const dateCols = await page.locator("[data-gradebook-table] th[data-date]").evaluateAll((els) => els.map((e) => e.getAttribute("data-date")));
const dowOk = dateCols.length >= 8 && dateCols.every((d) => [1, 4].includes(new Date(d + "T12:00").getDay()));
want("журнал: столбцы — даты по понедельникам и четвергам месяца", dowOk, dateCols.join(","));
const row = async (name) => (await page.locator("[data-student]").evaluateAll((els) => els.map((e) => e.getAttribute("data-student")))).indexOf(name);
const ru = await row("Учебный ученик");
const ri = await row("Иванов Иван");
const rs = await row("Сидоров Пётр");
await setCell(`${ru}:0`, "90");
await setCell(`${ru}:1`, "75");
await setCell(`${ru}:2`, "н");
await page.locator(`[data-cell="${ri}:0"]`).click();
await page.locator(`[data-cell="${ri}:0"]`).fill("60");
await page.locator(`[data-cell="${ri}:0"]`).press("Enter");
await page.keyboard.type("50");
await page.waitForTimeout(200);
want("журнал: Enter — на ученика ниже", (await page.locator(`[data-cell="${ri + 1}:0"]`).inputValue()) === "50");
await page.keyboard.press("Tab");
await page.waitForTimeout(100);
want("журнал: в таблице лёгкие клетки, поле — только у открытой", (await page.locator("[data-gradebook-table] input[data-cell]").count()) === 0 && (await page.locator("[data-gradebook-table] button[data-cell]").count()) > 20);
want("журнал: средний по ученику («н» не считается)", (await text('[data-avg="Учебный ученик"]')) === "82,5", await text('[data-avg="Учебный ученик"]'));
want("журнал: средняя оценка, пропуски и распределение", (await text('[data-avg-grade="Учебный ученик"]')) === "4,5" && (await text('[data-absent="Учебный ученик"]')) === "1" && (await text('[data-dist="Учебный ученик"]')) === "1 · 1 · 0 · 0", [await text('[data-avg-grade="Учебный ученик"]'), await text('[data-absent="Учебный ученик"]'), await text('[data-dist="Учебный ученик"]')].join(" / "));
await page.locator("[data-gradebook]").getByRole("group", { name: "Показывать" }).getByRole("button", { name: "Оценки" }).click();
await page.waitForTimeout(200);
want("журнал: «Оценки» — в клетках оценки по шкале уроков", (await text(`[data-grade-cell="${ru}:0"]`)) === "5" && (await text(`[data-grade-cell="${ru}:1"]`)) === "4" && (await text(`[data-grade-cell="${ri}:0"]`)) === "3");
await page.locator("[data-gradebook]").getByRole("group", { name: "Показывать" }).getByRole("button", { name: "Баллы" }).click();
await page.waitForTimeout(200);
want("журнал: сводка по классу", /средняя оценка\s*3,8/.test(await text("[data-class-stats]")) && /Лучший средний: Учебный ученик/.test(await text("[data-class-stats]")), await text("[data-class-stats]"));
await setCell(`${rs}:1`, "120");
await page.waitForTimeout(150);
const issuesText = () => text("[data-mark-issues]");
want("опечатка: «120» — подсказка с исправлением", /Похоже на опечатку: 1/.test(await issuesText()) && /120 — больше 100/.test(await issuesText()) && (await page.getByRole("button", { name: /^Исправить на 12: Сидоров Пётр/ }).count()) === 1, await issuesText());
await setCell(`${rs}:2`, "8о");
want("опечатка: «о» вместо нуля исправляется сама", (await cellText(`${rs}:2`)) === "80", await cellText(`${rs}:2`));
await setCell(`${rs}:3`, "9б");
want("опечатка: буква — подсказка «9»", (await page.getByRole("button", { name: /^Исправить на 9: Сидоров Пётр/ }).count()) === 1);
await page.getByRole("button", { name: /^Исправить на 9: Сидоров Пётр/ }).click();
want("опечатка: исправление в один клик", (await cellText(`${rs}:3`)) === "9" && /Похоже на опечатку: 1/.test(await issuesText()));
await setCell(`${rs}:2`, "");
await setCell(`${rs}:3`, "");
const pubBtn = () => page.getByRole("button", { name: /Выложить изменения|Всё выложено/ });
// 90, 75, «н», 60 и 50 (Кузнецова) — с почтой; Сидоров без почты — ему не уходит; 120 — вне шкалы.
want("журнал: вне шкалы и без почты — не уходят", /Выложить изменения · 5/.test(await pubBtn().innerText()), await pubBtn().innerText());
await setCell(`${rs}:1`, "");
const status = () => text("[data-gradebook] [role=status]");
want("журнал: внизу — сколько не выложено и кому без почты", /5 новых отмет\S* ещё не выложен/.test(await status()) && /Без почты: 2/.test(await status()), await status());
if (process.env.SHOT_DIR) await page.screenshot({ path: process.env.SHOT_DIR + "/gradebook.png", fullPage: true });
await page.getByRole("button", { name: /Выложить изменения · 5/ }).click();
await page.waitForTimeout(500);
want("журнал: выложено 5 отметок", /Выложено отметок: 5/.test(await status()) && (await page.getByRole("button", { name: "Всё выложено" }).count()) === 1, await status());
await page.getByRole("button", { name: "Ученик", exact: true }).click();
await page.waitForTimeout(700);
await nav("Право");
want("ученик видит отметки из журнала (90, 75 и «н»)", JSON.stringify(await officialScores("Право")) === JSON.stringify(["75", "90", "н"]), JSON.stringify(await officialScores("Право")));
await mode("Оценки");
want("ученик: «Оценки» — 90 → 5, 75 → 4", JSON.stringify(await officialScores("Право")) === JSON.stringify(["4", "5", "н"]), JSON.stringify(await officialScores("Право")));
want("ученик: средняя оценка на плитке", /^Средняя оценка/.test(await text('[data-tile="avg"]')) && /из 5/.test(await text('[data-tile="avg"]')), await text('[data-tile="avg"]'));
if (process.env.SHOT_DIR) await page.screenshot({ path: process.env.SHOT_DIR + "/results-grades.png", fullPage: true });
await mode("Баллы");
await page.getByRole("button", { name: "Учитель", exact: true }).click();
await page.waitForTimeout(300);
await setCell(`${ru}:1`, "7500");
want("опечатка в выложенной: у ученика не стирается", (await page.getByRole("button", { name: "Всё выложено" }).count()) === 1 && /С опечаткой: 1/.test(await text("[data-gradebook] [role=status]")), await text("[data-gradebook] [role=status]"));
await setCell(`${ru}:0`, "");
await setCell(`${ru}:1`, "80");
await setCell(`${ru}:2`, "");
await page.waitForTimeout(150);
await page.getByRole("button", { name: /Выложить изменения · 3/ }).click();
await page.waitForTimeout(500);
await page.getByRole("button", { name: "Ученик", exact: true }).click();
await page.waitForTimeout(700);
await nav("Право");
want("исправленная — заменилась, стёртые — пропали", JSON.stringify(await officialScores("Право")) === JSON.stringify(["80"]), JSON.stringify(await officialScores("Право")));
await page.waitForTimeout(1200);
const gbStored = JSON.parse(JSON.parse(await page.evaluate(() => localStorage.getItem("planner:planner-state-v5"))).value).gradebooks || [];
want("журнал сохранён: класс, убранные и добавленные", gbStored.length === 1 && gbStored[0].classId === "10b" && gbStored[0].excluded.includes("demo-3") && gbStored[0].addedStudents.length === 2);

// Удалить журнал — подтверждением на месте (системное окно в предпросмотре заблокировано).
await page.getByRole("button", { name: "Учитель", exact: true }).click();
await page.waitForTimeout(300);
if (!(await page.locator("[data-settings]").count())) await page.getByRole("button", { name: "Настройки журнала" }).click();
await page.getByRole("button", { name: "Удалить журнал", exact: true }).click();
want("удалить журнал: спрашивает здесь же", (await page.getByRole("alertdialog", { name: "Удалить журнал?" }).count()) === 1);
await page.getByRole("alertdialog", { name: "Удалить журнал?" }).getByRole("button", { name: "Нет", exact: true }).click();
want("«Нет» — журнал на месте", (await page.locator("[data-gradebook]").count()) === 1);
await page.getByRole("button", { name: "Удалить журнал", exact: true }).click();
await page.getByRole("alertdialog", { name: "Удалить журнал?" }).getByRole("button", { name: "Да, удалить" }).click();
await page.waitForTimeout(1300);
want("«Да, удалить» — журнала нет", (await page.locator("[data-gradebook]").count()) === 0 && (JSON.parse(JSON.parse(await page.evaluate(() => localStorage.getItem("planner:planner-state-v5"))).value).gradebooks || []).length === 0);
await page.getByRole("button", { name: "Ученик", exact: true }).click();
await page.waitForTimeout(300);

// Олимпиада: только баллы; этапы, у этапа туры — суммируются, этапы — отдельно.
await page.getByRole("button", { name: "+ Результат" }).click();
const od = page.getByRole("dialog", { name: "Новый результат" });
await od.getByRole("button", { name: "Олимпиада", exact: true }).click();
want("олимпиада: шкалы на выбор нет", (await od.getByLabel("Как считается").count()) === 0);
await od.getByLabel("Предмет").fill("Право");
await od.getByLabel("Название").fill("Высшая проба · право");
await od.getByRole("button", { name: "+ Тур" }).click();
await od.getByLabel("Этап 1, баллы тура 1").fill("38");
await od.getByLabel("Этап 1, максимум тура 1").fill("50");
await od.getByLabel("Этап 1, баллы тура 2").fill("21");
await od.getByLabel("Этап 1, максимум тура 2").fill("50");
await od.getByLabel("Проходной, этап 1").fill("55");
await od.getByLabel("Статус, этап 1").selectOption("next");
want("олимпиада: сумма туров считается сама", /Сумма этапа: 59 из 100/.test(await od.innerText()));
await od.getByRole("button", { name: "+ Этап" }).click();
await od.getByLabel("Баллы этапа 2").fill("70");
await od.getByLabel("Максимум этапа 2").fill("100");
await od.getByRole("button", { name: "Сохранить" }).click();
await page.waitForTimeout(400);
want("олимпиада слева — по последнему этапу", /^70/.test(await text('[data-nav-olympiad="Высшая проба · право"] [data-olympiad-badge]')), await text('[data-nav-olympiad="Высшая проба · право"] [data-olympiad-badge]'));
await page.locator('[data-nav-olympiad="Высшая проба · право"]').click();
await page.waitForTimeout(200);
const stagesText = await text('[data-olympiad-page="Высшая проба · право"] [data-olympiad-stages]');
want("олимпиада: этапы отдельно — 59 и 70, не сумма", /Отборочный[\s\S]*59 из 100/.test(stagesText) && /70 из 100/.test(stagesText) && !/129/.test(stagesText), stagesText.replace(/\n/g, " | "));
want("олимпиада: проходной первого этапа набран", /прошёл дальше ✓/.test(stagesText) && /Прошёл на следующий этап/.test(stagesText));
await nav("Право");
await mode("Оценки");
want("олимпиада: в режиме оценок — без оценки", !/оценка/.test(await page.locator('[data-result="Высшая проба · право"]').innerText()));
await mode("Баллы");

// Пока раздел в разработке, у всех, кроме владельца, — заглушка.
await page.getByRole("button", { name: "Другой пользователь", exact: true }).click();
await page.waitForTimeout(300);
want("другой пользователь видит «Раздел в разработке»", (await page.locator("[data-results-wip]").count()) === 1 && (await page.locator("[data-result]").count()) === 0 && (await page.getByRole("button", { name: "+ Результат" }).count()) === 0);
if (process.env.SHOT_DIR) await page.screenshot({ path: process.env.SHOT_DIR + "/results-wip.png" });
await page.getByRole("button", { name: "Ученик", exact: true }).click();
await page.waitForTimeout(300);

// Телефон: предметы чипами, сводка с графиком, записи.
await page.setViewportSize({ width: 375, height: 800 });
await page.waitForTimeout(500);
want("телефон: вид B — чипы предметов", (await page.locator('[data-layout="phone"] [data-chip="Право"]').count()) === 1 && (await page.locator('[data-chip="Олимпиады"]').count()) === 1);
await page.locator('[data-chip="Право"]').click();
await page.waitForTimeout(300);
want("телефон: сводка предмета", /из 100/.test(await text("[data-page-avg]")) && (await page.locator("[data-score-chart]").count()) === 1, await text("[data-page-avg]"));
const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
want("телефон: вбок не листается", over <= 0, over + " px");
await page.getByRole("button", { name: "Учитель", exact: true }).click();
await page.waitForTimeout(400);
await page.getByRole("button", { name: "Журнал", exact: true }).click();
await page.waitForTimeout(200);
// Телефон: по шагам — классы, класс, журнал.
await page.getByRole("button", { name: "‹ Классы" }).click();
await page.waitForTimeout(200);
want("телефон: сначала список классов", (await page.locator("[data-class-list] [data-class]").count()) === 2 && (await page.locator("[data-class-page]").count()) === 0);
await page.locator('[data-class="10Б"]').click();
await page.waitForTimeout(200);
await page.locator('[data-new-journal="История"]').click();
await page.waitForTimeout(400);
const overT = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const wrapScroll = await page.evaluate(() => { const t = document.querySelector("[data-gradebook-table]"); return t ? t.parentElement.scrollWidth > t.parentElement.clientWidth : false; });
want("телефон: журнал листается внутри, страница — нет", overT <= 0 && wrapScroll, overT + " px");
if (process.env.SHOT_DIR) await page.screenshot({ path: process.env.SHOT_DIR + "/gradebook-phone.png" });
await page.getByRole("button", { name: "Ученик", exact: true }).click();
await page.waitForTimeout(300);
if (process.env.SHOT_DIR) await page.screenshot({ path: process.env.SHOT_DIR + "/results-phone.png", fullPage: true });
await page.getByRole("button", { name: "+ Добавить" }).click();
await page.waitForTimeout(300);
const dlgBox = await page.getByRole("dialog").boundingBox();
want("телефон: окно записи помещается", dlgBox && dlgBox.x >= 0 && dlgBox.x + dlgBox.width <= 376, JSON.stringify(dlgBox));
if (process.env.SHOT_DIR) await page.screenshot({ path: process.env.SHOT_DIR + "/results-form-phone.png" });
want("ошибок нет", errors.length === 0, errors[0] || "");
await ctx.close();

await browser.close();
server.close();
if (bad) {
  console.log(`\n${bad} проверок не прошло`);
  process.exit(1);
}
console.log("\nрезультаты: всё в порядке");
