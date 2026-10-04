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
want("своя — с пометкой «моя запись» и «Изменить»", /моя запись/.test(await page.locator('[data-result="Урок 1"]').innerText()) && (await page.locator('[data-result="Урок 1"]').getByRole("button", { name: "Изменить" }).count()) === 1);

// Статистика: только свои — средний (90+70)/2 = 80.
await page.getByRole("button", { name: /^Мои записи/ }).click();
await page.waitForTimeout(200);
want("фильтр «Мои записи» — только свои", JSON.stringify((await cards()).sort()) === JSON.stringify(["Урок 1", "Урок 2"]), (await cards()).join(" | "));
want("средний балл своих — 80", (await page.locator("[data-results-avg]").innerText()).trim() === "80", await page.locator("[data-results-avg]").innerText());
await page.getByRole("button", { name: /Официальные/ }).click();
await page.waitForTimeout(200);
want("фильтр «Официальные» — только выложенные", (await cards()).length === 2 && !(await cards()).includes("Урок 1"));
await page.getByRole("button", { name: /^Все/ }).first().click();
await page.waitForTimeout(200);
// Все четыре: 90, 70, 78 (пробник), 59 (олимпиада) → 74,3.
want("средний по всем — среднее арифметическое", (await page.locator("[data-results-avg]").innerText()).trim() === "74,3", await page.locator("[data-results-avg]").innerText());

// Правка и удаление своей, скрытие официальной.
await page.locator('[data-result="Урок 2"]').getByRole("button", { name: "Изменить" }).click();
await page.getByRole("dialog").getByLabel("Баллы", { exact: true }).fill("80");
await page.getByRole("dialog").getByRole("button", { name: "Сохранить" }).click();
await page.waitForTimeout(1500);
want("правка своей записи сохраняется", (await stored()).find((r) => r.title === "Урок 2").score === 80);
await page.locator('[data-result="Урок 2"]').getByRole("button", { name: "Удалить" }).click();
await page.waitForTimeout(1500);
want("удаление своей", !(await cards()).includes("Урок 2") && (await stored()).length === 1);
await official.getByRole("button", { name: "Скрыть у себя" }).click();
await page.waitForTimeout(300);
want("официальную можно скрыть у себя", !(await cards()).includes("Высшая проба") && (await page.getByRole("button", { name: /Показать скрытые · 1/ }).count()) === 1);

// Роль учителя: выложить ученику, ученик видит; убрать — пропадает.
await page.getByRole("button", { name: "Учитель", exact: true }).click();
await page.waitForTimeout(300);
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
await page.getByRole("button", { name: "Убрать" }).first().click();
await page.waitForTimeout(300);
await page.getByRole("button", { name: "Ученик", exact: true }).click();
await page.waitForTimeout(600);
want("учитель убрал — у ученика пропало", (await page.locator('[data-result="КТ №1 по ТГП"]').count()) === 0);

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
