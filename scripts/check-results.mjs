// Раздел «Результаты» (предпросмотр): свои записи по разным шкалам, общая
// статистика (средний балл — среднее арифметическое по 100-балльной), разделение
// на официальные и свои, демо-результаты из обновления, роль учителя (выложить
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
const marks = () => page.locator("[data-mark]").evaluateAll((els) => els.map((e) => e.getAttribute("data-mark").split(":")[1]));

want("в меню есть «Результаты»", (await page.locator(".ap-nav", { hasText: "Результаты" }).count()) >= 1);
want("демо-результаты из обновления видны", (await cards()).includes("Высшая проба") && (await cards()).includes("Пробник ЕГЭ (лицейский)"), (await cards()).join(" | "));
const official = page.locator('[data-result="Высшая проба"]');
want("официальный — с замком и без «Изменить»", /🔒/.test(await official.innerText()) && (await official.getByRole("button", { name: "Изменить" }).count()) === 0);
want("олимпиада: сумма по турам и проходной", /59 из 100/.test(await official.innerText()) && /набран ✓/.test(await official.innerText()) && /Прошёл на следующий этап/.test(await official.innerText()));
want("пробник: вторичные и первичные", /78 из 100/.test(await page.locator('[data-result="Пробник ЕГЭ (лицейский)"]').innerText()) && /первичных 46 из 58/.test(await page.locator('[data-result="Пробник ЕГЭ (лицейский)"]').innerText()));
want("код для результатов показан", /^[A-Z2-9]{4}(-[A-Z2-9]{4}){4}$/.test((await page.locator("[data-results-code]").innerText()).trim()));

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
want("оценки за уроки — строкой отметок по предмету", JSON.stringify((await marks()).sort()) === JSON.stringify(["70", "90"]) && /Право/.test(await page.locator("[data-lesson-marks]").innerText()) && /средний балл 80/.test(await page.locator("[data-lesson-marks]").innerText()), JSON.stringify(await marks()));

// Статистика: только свои — средний (90+70)/2 = 80.
await page.getByRole("button", { name: /^Мои записи/ }).click();
await page.waitForTimeout(200);
want("фильтр «Мои записи» — только свои", (await cards()).length === 0 && (await marks()).length === 2, (await cards()).join(" | "));
want("средний балл своих — 80", (await page.locator("[data-results-avg]").innerText()).trim() === "80", await page.locator("[data-results-avg]").innerText());
await page.getByRole("button", { name: /Официальные/ }).click();
await page.waitForTimeout(200);
want("фильтр «Официальные» — только выложенные", (await cards()).length === 2 && (await marks()).length === 0);
await page.getByRole("button", { name: /^Все/ }).first().click();
await page.waitForTimeout(200);
// Все четыре: 90, 70, 78 (пробник), 59 (олимпиада) → 74,3.
want("средний по всем — среднее арифметическое", (await page.locator("[data-results-avg]").innerText()).trim() === "74,3", await page.locator("[data-results-avg]").innerText());

// Правка и удаление своей, скрытие официальной.
await page.locator('[data-mark$=":70"]').click();
await page.getByRole("dialog").getByLabel("Баллы", { exact: true }).fill("80");
await page.getByRole("dialog").getByRole("button", { name: "Сохранить" }).click();
await page.waitForTimeout(1500);
want("правка своей записи сохраняется", (await stored()).find((r) => r.title === "Урок 2").score === 80);
// Удалить свою можно и с карточки — заведём КТ.
await page.getByRole("button", { name: "+ Результат" }).click();
await page.getByRole("dialog").getByRole("button", { name: "КТ", exact: true }).click();
await page.getByRole("dialog").getByLabel("Название").fill("Своя КТ");
await page.getByRole("dialog").getByRole("group", { name: "Оценка" }).getByRole("button", { name: "4" }).click();
await page.getByRole("dialog").getByRole("button", { name: "Сохранить" }).click();
await page.waitForTimeout(300);
want("своя карточка — «моя запись» и «Изменить»", /моя запись/.test(await page.locator('[data-result="Своя КТ"]').innerText()) && (await page.locator('[data-result="Своя КТ"]').getByRole("button", { name: "Изменить" }).count()) === 1);
await page.locator('[data-result="Своя КТ"]').getByRole("button", { name: "Удалить" }).click();
await page.waitForTimeout(1500);
want("удаление своей", !(await cards()).includes("Своя КТ") && (await stored()).length === 2);
await official.getByRole("button", { name: "Скрыть у себя" }).click();
await page.waitForTimeout(300);
want("официальную можно скрыть у себя", !(await cards()).includes("Высшая проба") && (await page.getByRole("button", { name: /Показать скрытые · 1/ }).count()) === 1);

// Роль учителя: выложить ученику, ученик видит; убрать — пропадает.
await page.getByRole("button", { name: "Учитель", exact: true }).click();
await page.waitForTimeout(300);
await page.getByRole("button", { name: "Отдельный результат" }).click();
await page.waitForTimeout(200);
want("учитель: почта учебного ученика подставлена", (await page.getByLabel("Почты учеников").inputValue()) === "student@demo");
await page.getByPlaceholder("Например: Иванова А. Б.").fill("Петрова И. В.");
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
want("ученик видит результат от учителя", (await kt.count()) === 1 && /от учителя · Петрова И. В./.test(await kt.innerText()) && /оценка 5/.test(await kt.innerText()));
want("и изменить его не может", (await kt.getByRole("button", { name: "Изменить" }).count()) === 0);
if (process.env.SHOT_DIR) await page.screenshot({ path: process.env.SHOT_DIR + "/results-desktop.png", fullPage: true });
await page.getByRole("button", { name: "Учитель", exact: true }).click();
await page.waitForTimeout(300);
await page.getByRole("button", { name: "Отдельный результат" }).click();
await page.waitForTimeout(200);
await page.getByRole("button", { name: "Убрать" }).first().click();
await page.waitForTimeout(300);
await page.getByRole("button", { name: "Ученик", exact: true }).click();
await page.waitForTimeout(600);
want("учитель убрал — у ученика пропало", (await page.locator('[data-result="КТ №1 по ТГП"]').count()) === 0);

// Журнал учителя: ученики строками, даты уроков столбцами, отметки уходят ученикам.
await page.getByRole("button", { name: "Учитель", exact: true }).click();
await page.waitForTimeout(300);
await page.getByRole("button", { name: "Журнал", exact: true }).click();
await page.getByRole("button", { name: "+ Новый журнал" }).click();
await page.waitForTimeout(300);
await page.getByLabel("Название журнала").fill("10Б · Право");
await page.getByLabel("Предмет журнала").fill("Право");
await page.getByRole("group", { name: "Дни уроков" }).getByRole("button", { name: "Пн" }).click();
await page.getByRole("group", { name: "Дни уроков" }).getByRole("button", { name: "Чт" }).click();
await page.getByRole("button", { name: "+ Ученики" }).click();
await page.getByLabel("Список учеников").fill("Иванов Иван, ivanov@mail.ru\nСидоров Пётр");
await page.getByRole("button", { name: "Добавить", exact: true }).click();
await page.waitForTimeout(300);
const studentsRows = await page.locator("[data-student]").evaluateAll((els) => els.map((e) => e.getAttribute("data-student")));
want("журнал: ученики строками (учебный + вставленные)", JSON.stringify(studentsRows) === JSON.stringify(["Учебный ученик", "Иванов Иван", "Сидоров Пётр"]), studentsRows.join(" | "));
const dateCols = await page.locator("[data-gradebook-table] th[data-date]").evaluateAll((els) => els.map((e) => e.getAttribute("data-date")));
const dowOk = dateCols.length >= 8 && dateCols.every((d) => [1, 4].includes(new Date(d + "T12:00").getDay()));
want("журнал: столбцы — даты по понедельникам и четвергам месяца", dowOk, dateCols.join(","));
await page.locator('[data-cell="0:0"]').fill("90");
await page.locator('[data-cell="0:0"]').press("Enter");
await page.keyboard.type("60");
await page.locator('[data-cell="0:1"]').fill("75");
await page.locator('[data-cell="2:0"]').fill("50");
await page.waitForTimeout(200);
want("журнал: Enter — на ученика ниже", (await page.locator('[data-cell="1:0"]').inputValue()) === "60");
want("журнал: средний по ученику", (await page.locator('[data-avg="Учебный ученик"]').innerText()).trim() === "82,5", await page.locator('[data-avg="Учебный ученик"]').innerText());
// 90 → 5, 75 → 4: средняя оценка 4,5; распределение 5·4·3·2 = 1·1·0·0.
want("журнал: средняя оценка и распределение у ученика", (await page.locator('[data-avg-grade="Учебный ученик"]').innerText()).trim() === "4,5" && (await page.locator('[data-dist="Учебный ученик"]').innerText()).trim() === "1 · 1 · 0 · 0");
want("журнал: 50 баллов → оценка 3, 60 → 3", (await page.locator('[data-avg-grade="Сидоров Пётр"]').innerText()).trim() === "3" && (await page.locator('[data-avg-grade="Иванов Иван"]').innerText()).trim() === "3");
want("журнал: сводка по классу", /средняя оценка\s*3,8/.test(await page.locator("[data-class-stats]").innerText()) && /Лучший средний: Учебный ученик/.test(await page.locator("[data-class-stats]").innerText()), await page.locator("[data-class-stats]").innerText());
await page.getByRole("group", { name: "Показывать" }).getByRole("button", { name: "Оценки" }).click();
await page.waitForTimeout(200);
want("журнал: «Оценки» — в клетках оценки по шкале уроков", (await page.locator('[data-grade-cell="0:0"]').innerText()).trim() === "5" && (await page.locator('[data-grade-cell="0:1"]').innerText()).trim() === "4" && (await page.locator('[data-grade-cell="2:0"]').innerText()).trim() === "3");
await page.getByRole("group", { name: "Показывать" }).getByRole("button", { name: "Баллы" }).click();
await page.waitForTimeout(200);
await page.locator('[data-cell="1:1"]').fill("120");
await page.waitForTimeout(150);
want("журнал: отметка вне шкалы подсвечена и не уходит", /Выложить изменения · 3/.test(await page.getByRole("button", { name: /Выложить изменения|Всё выложено/ }).innerText()), await page.getByRole("button", { name: /Выложить изменения|Всё выложено/ }).innerText());
await page.locator('[data-cell="1:1"]').fill("");
want("журнал: без почты — предупреждение", /Без почты: 1/.test(await page.locator("[data-gradebook] [role=status]").innerText()));
if (process.env.SHOT_DIR) await page.screenshot({ path: process.env.SHOT_DIR + "/gradebook.png", fullPage: true });
await page.getByRole("button", { name: /Выложить изменения · 3/ }).click();
await page.waitForTimeout(500);
want("журнал: выложено 3 отметки", /Выложено отметок: 3/.test(await page.locator("[data-gradebook] [role=status]").innerText()) && (await page.getByRole("button", { name: "Всё выложено" }).count()) === 1);
await page.getByRole("button", { name: "Ученик", exact: true }).click();
await page.waitForTimeout(700);
const lessonRow = page.locator('[data-lesson-subject="Право"]');
const fromTeacher = await lessonRow.locator("[data-mark]").evaluateAll((els) => els.filter((e) => e.disabled).map((e) => e.getAttribute("data-mark").split(":")[1]));
want("ученик видит отметки из журнала (свои 90 и 75)", JSON.stringify(fromTeacher.sort()) === JSON.stringify(["75", "90"]), JSON.stringify(fromTeacher));
await page.getByRole("group", { name: "Показывать" }).getByRole("button", { name: "Оценки" }).click();
await page.waitForTimeout(200);
const asGrades = await lessonRow.locator("[data-mark]").evaluateAll((els) => els.filter((e) => e.disabled).map((e) => e.getAttribute("data-mark").split(":")[1]));
want("ученик: «Оценки» — 90 → 5, 75 → 4", JSON.stringify(asGrades.sort()) === JSON.stringify(["4", "5"]), JSON.stringify(asGrades));
want("ученик: средняя оценка по предмету — среднее арифметическое", /средняя оценка/.test(await page.locator('[data-lesson-avg="Право"]').innerText()), await page.locator('[data-lesson-avg="Право"]').innerText());
want("ученик: общая статистика в оценках", /Средняя оценка/.test(await page.locator("[data-results-stats]").innerText()) && /из 5/.test(await page.locator("[data-results-stats]").innerText()));
if (process.env.SHOT_DIR) await page.screenshot({ path: process.env.SHOT_DIR + "/results-grades.png", fullPage: true });
await page.getByRole("group", { name: "Показывать" }).getByRole("button", { name: "Баллы" }).click();
await page.waitForTimeout(200);
// Исправили и стёрли — у ученика обновилось.
await page.getByRole("button", { name: "Учитель", exact: true }).click();
await page.waitForTimeout(300);
await page.locator('[data-cell="0:0"]').fill("");
await page.locator('[data-cell="0:1"]').fill("80");
await page.waitForTimeout(150);
await page.getByRole("button", { name: /Выложить изменения · 2/ }).click();
await page.waitForTimeout(500);
await page.getByRole("button", { name: "Ученик", exact: true }).click();
await page.waitForTimeout(700);
const after = await page.locator('[data-lesson-subject="Право"] [data-mark]').evaluateAll((els) => els.filter((e) => e.disabled).map((e) => e.getAttribute("data-mark").split(":")[1]));
want("исправленная — заменилась, стёртая — пропала", JSON.stringify(after) === JSON.stringify(["80"]), JSON.stringify(after));
await page.waitForTimeout(1200);
const gbStored = JSON.parse(JSON.parse(await page.evaluate(() => localStorage.getItem("planner:planner-state-v5"))).value).gradebooks || [];
want("журнал сохранён в записях учителя", gbStored.length === 1 && gbStored[0].name === "10Б · Право" && gbStored[0].students.length === 3);

// Пока раздел в разработке, у всех, кроме владельца, — заглушка.
await page.getByRole("button", { name: "Другой пользователь", exact: true }).click();
await page.waitForTimeout(300);
want("другой пользователь видит «Раздел в разработке»", (await page.locator("[data-results-wip]").count()) === 1 && (await page.locator("[data-result]").count()) === 0 && (await page.getByRole("button", { name: "+ Результат" }).count()) === 0);
if (process.env.SHOT_DIR) await page.screenshot({ path: process.env.SHOT_DIR + "/results-wip.png" });
await page.getByRole("button", { name: "Ученик", exact: true }).click();
await page.waitForTimeout(300);

// Телефон.
await page.setViewportSize({ width: 375, height: 800 });
await page.waitForTimeout(500);
const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
want("телефон: вбок не листается", over <= 0, over + " px");
await page.getByRole("button", { name: "Учитель", exact: true }).click();
await page.waitForTimeout(400);
const overT = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const wrapScroll = await page.evaluate(() => { const t = document.querySelector("[data-gradebook-table]"); return t ? t.parentElement.scrollWidth > t.parentElement.clientWidth : false; });
want("телефон: журнал листается внутри, страница — нет", overT <= 0 && wrapScroll, overT + " px");
if (process.env.SHOT_DIR) await page.screenshot({ path: process.env.SHOT_DIR + "/gradebook-phone.png" });
await page.getByRole("button", { name: "Ученик", exact: true }).click();
await page.waitForTimeout(300);
if (process.env.SHOT_DIR) await page.screenshot({ path: process.env.SHOT_DIR + "/results-phone.png", fullPage: true });
await page.getByRole("button", { name: "+ Результат" }).click();
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
