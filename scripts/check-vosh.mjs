// Тесты ВсОШ в тренажёре: каждое из заданий всех олимпиад проходится через
// интерфейс ответом по ключу — и должно дать «Верно» и полный балл, а итог
// олимпиады — сумму баллов тестовой части. Отдельно: неверный ответ даёт
// частичный балл и показывает ключ, место в разделе переживает перезагрузку,
// решённое идёт в серию тренажёра, «вперемешку» берёт нерешённое, на телефоне
// ничего не едет вбок.
//
// Запуск: npm run check:vosh (нужны playwright и Chromium: PLAYWRIGHT_MODULE и CHROMIUM_PATH)
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { OLYMPIADS } from "../src/vosh/vosh-society.js";
const playwright = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const { chromium } = playwright.chromium ? playwright : playwright.default;
const DIST = resolve(process.cwd(), process.env.DIST || "dist");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".png": "image/png", ".webp": "image/webp", ".webmanifest": "application/manifest+json" };
const server = createServer(async (req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]).replace(/^\/[^/]+\//, "/"); if (p.endsWith("/")) p += "index.html";
  try { const b = await readFile(resolve(DIST, "." + p)); res.writeHead(200, { "content-type": TYPES[p.slice(p.lastIndexOf("."))] || "application/octet-stream" }); res.end(b); } catch (e) { res.writeHead(404).end(); }
});
await new Promise((d) => server.listen(0, "127.0.0.1", d));
const URL0 = `http://127.0.0.1:${server.address().port}/-/`;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const SHOT_DIR = process.env.SHOT_DIR || "";
let bad = 0;
const want = (name, ok, note = "") => { if (!ok) bad += 1; console.log((ok ? "✓ " : "✗ ") + name + (note ? " — " + note : "")); };

async function fresh(viewport) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  page.setDefaultTimeout(6000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const missing = [];
  page.on("response", (r) => { if (r.status() === 404 && /vosh\//.test(r.url())) missing.push(r.url()); });
  await page.addInitScript(() => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem("planner-intro-version", "0.6.0-schedule");
    localStorage.setItem("planner-design-intro", "1.0.0");
    localStorage.setItem("planner-screen", "trainer");
    localStorage.setItem("planner:planner-state-v5", JSON.stringify({ value: JSON.stringify({ trainerState: { open: "", section: "", taskId: "", again: false } }), updatedAt: Date.now() - 1000 }));
  });
  await page.goto(URL0);
  await page.waitForTimeout(2000);
  return { ctx, page, errors, missing };
}
const stored = (page) => page.evaluate(() => JSON.parse(JSON.parse(localStorage.getItem("planner:planner-state-v5")).value));

async function answerByKey(page, t) {
  const box = page.locator(`[data-vosh-task="${t.id}"]`);
  await box.waitFor();
  switch (t.kind) {
    case "yesno":
      for (let i = 0; i < t.answer.length; i += 1) await box.locator(`[data-yn="${i}-${t.answer[i] ? "y" : "n"}"]`).click();
      break;
    case "multi":
      for (const k of t.answer) await box.locator(`[data-opt="${k}"]`).click();
      break;
    case "one":
      await box.locator(`[data-opt="${t.answer}"]`).click();
      break;
    case "match":
      for (let i = 0; i < t.items.length; i += 1) await box.locator(`[data-item="${t.items[i].k}"]`).selectOption([].concat(t.answer[i])[0]);
      break;
    case "matchmany":
      for (let i = 0; i < t.items.length; i += 1) for (const k of t.answer[i]) await box.locator(`[data-mm="${t.items[i].k}-${k}"]`).click();
      break;
    case "groups":
      for (let i = 0; i < t.items.length; i += 1) await box.locator(`[data-group="${t.items[i].k}-${t.answer[i]}"]`).click();
      break;
    case "gaps":
      for (let i = 0; i < t.gaps.length; i += 1) await box.locator(`[data-gap="${t.gaps[i]}"]`).selectOption(t.answer[i]);
      break;
    case "short":
      await box.locator("[data-short]").fill(t.answer);
      break;
    default:
  }
  await box.getByRole("button", { name: "Ответить" }).click();
  const verdict = await box.getByRole("status").innerText();
  return verdict;
}

// 1. Компьютер: все олимпиады по ключу.
{
  const { ctx, page, errors, missing } = await fresh({ width: 1280, height: 900 });
  const card = page.locator("[data-vosh-card]");
  want("в тренажёре есть карточка ВсОШ", (await card.count()) === 1);
  await card.getByRole("button", { name: "Открыть олимпиады" }).click();
  await page.waitForTimeout(800);
  want("раздел открылся: все олимпиады в списке", (await page.locator("[data-vosh]").count()) === OLYMPIADS.length, String(await page.locator("[data-vosh]").count()));
  await page.getByRole("group", { name: "Этап" }).getByRole("button", { name: "Школьный" }).click();
  const school = OLYMPIADS.filter((o) => o.stage === "school").length;
  want("фильтр «Школьный»", (await page.locator("[data-vosh]").count()) === school);
  await page.getByRole("group", { name: "Этап" }).getByRole("button", { name: "Все этапы" }).click();
  await page.getByRole("group", { name: "Класс" }).getByRole("button", { name: "9 класс" }).click();
  want("фильтр «9 класс»", (await page.locator("[data-vosh]").count()) === OLYMPIADS.filter((o) => o.grade === 9).length);
  await page.getByRole("group", { name: "Класс" }).getByRole("button", { name: "Все классы" }).click();
  if (SHOT_DIR) await page.screenshot({ path: SHOT_DIR + "/vosh-list.png", fullPage: true });

  let tasksOk = 0;
  let tasksAll = 0;
  const wrongTasks = [];
  for (const o of OLYMPIADS) {
    await page.locator(`[data-vosh="${o.id}"]`).getByRole("button", { name: "Начать" }).click();
    for (const t of o.tasks) {
      tasksAll += 1;
      const verdict = await answerByKey(page, t);
      if (/^Верно/.test(verdict) && new RegExp("\\b" + t.max + " из " + t.max + "\\b").test(verdict)) tasksOk += 1;
      else wrongTasks.push(t.id + ": " + verdict.split("\n")[0]);
      if (SHOT_DIR && (t.kind === "gaps" || t.kind === "groups" || t.kind === "matchmany") && o.id.startsWith("2")) {
        await page.locator(`[data-vosh-task="${t.id}"]`).screenshot({ path: `${SHOT_DIR}/vosh-${t.id}.png` });
      }
      await page.locator(`[data-vosh-task="${t.id}"]`).getByRole("button", { name: /^(Следующее|К итогам)$/ }).click();
    }
    const points = o.tasks.reduce((n, t) => n + t.max, 0);
    const total = await page.locator("[data-vosh-total]").innerText();
    want(`${o.id}: итог ${points} из ${points}`, total.replace(/\s+/g, " ").includes("Набрано " + points + " из " + points), total);
    await page.getByRole("button", { name: "К списку олимпиад" }).click();
  }
  want("ответ по ключу через интерфейс — «Верно» и полный балл", tasksOk === tasksAll, tasksOk + " из " + tasksAll + (wrongTasks.length ? ": " + wrongTasks.slice(0, 3).join("; ") : ""));

  // Неверный ответ: частичный балл и ключ.
  await page.locator('[data-vosh="2324-sch-9"]').getByRole("button", { name: "Итоги" }).click();
  // Пройденная олимпиада открывается на итогах; к заданию — строкой итогов.
  want("пройденная олимпиада открывается на итогах", (await page.locator("[data-vosh-total]").count()) === 1);
  await page.getByRole("button", { name: /^№ 1 / }).first().click();
  const box = page.locator('[data-vosh-task="2324-sch-9-1"]');
  want("решённое задание открывается с прошлым ответом", /Это ваш прошлый ответ/.test(await box.innerText()));
  await box.getByRole("button", { name: "Решить заново" }).click();
  for (let i = 0; i < 5; i += 1) await box.locator(`[data-yn="${i}-y"]`).click();
  await box.getByRole("button", { name: "Ответить" }).click();
  const v = (await box.getByRole("status").innerText()).replace(/\s+/g, " ");
  want("неверный ответ — «Частично верно», 1 из 5, ключ", /^Частично верно/.test(v) && /1 из 5/.test(v) && /Ключ: 1 – нет, 2 – нет, 3 – да/.test(v), v.slice(0, 90));
  await page.waitForTimeout(1300);
  const st = await stored(page);
  const log = (st.trainerLog || []).filter((a) => /^\d{4}-(sch|mun)-/.test(a.taskId));
  want("попытки в журнале тренажёра, с баллами", log.length === tasksAll + 1 && log.every((a) => typeof a.score === "number" && a.max > 0 && a.resp !== undefined), String(log.length));
  want("место в разделе сохранено", st.trainerState && st.trainerState.open === "vosh" && st.trainerState.vosh && st.trainerState.vosh.olymp === "2324-sch-9");

  // Перезагрузка: остаёмся в разделе на том же задании.
  await page.reload();
  await page.waitForTimeout(2200);
  want("после перезагрузки — та же олимпиада и задание", (await page.locator('[data-vosh-task="2324-sch-9-1"]').count()) === 1);

  // Серия: 150 заданий по обществознанию за сегодня — цель дня выполнена.
  want("задания ВсОШ идут в серию тренажёра", /✓ сегодня/.test(await page.locator("body").innerText()));

  // Вперемешку: остаётся одно задание, решённое неверно.
  await page.getByRole("button", { name: "К списку олимпиад" }).click();
  await page.getByRole("button", { name: "Решать вперемешку" }).click();
  want("«вперемешку» даёт нерешённое задание", (await page.locator('[data-vosh-task="2324-sch-9-1"]').count()) === 1);
  await page.getByRole("button", { name: "К списку олимпиад" }).click();

  // По типам: «да / нет» — одно нерешённое, соответствия — все решены; без
  // галочки «Только нерешённые» идут все соответствия подряд, и только они.
  const types = page.getByRole("group", { name: "Тип задания" });
  const mixBox = page.locator("[data-vosh-mix]");
  await types.getByRole("button", { name: /^Да \/ нет/ }).click();
  await mixBox.getByRole("button", { name: /^Решать/ }).click();
  want("тип «да / нет»: нерешённое задание этого типа", (await page.locator('[data-vosh-task="2324-sch-9-1"][data-kind="yesno"]').count()) === 1);
  await page.getByRole("button", { name: "К списку олимпиад" }).click();
  await types.getByRole("button", { name: /^Соответствия/ }).click();
  want("тип «соответствия»: всё решено — решать нечего", await mixBox.getByRole("button", { name: /^Решать/ }).isDisabled());
  await mixBox.getByRole("checkbox", { name: "Только нерешённые" }).uncheck();
  const matches = OLYMPIADS.flatMap((o) => o.tasks).filter((t) => t.kind === "match" || t.kind === "matchmany");
  const chipText = await types.getByRole("button", { name: /^Соответствия/ }).innerText();
  want("на кнопке типа — число заданий", chipText.includes(String(matches.length)), chipText.replace(/\s+/g, " "));
  await mixBox.getByRole("button", { name: "Решать: соответствия" }).click();
  let seen = 0;
  let foreign = 0;
  for (let i = 0; i < matches.length; i += 1) {
    const boxNow = page.locator("[data-vosh-task]");
    const k = await boxNow.getAttribute("data-kind");
    if (k !== "match" && k !== "matchmany") foreign += 1;
    seen += 1;
    await boxNow.getByRole("button", { name: /^(Следующее|Закончить)$/ }).click().catch(async () => {
      await boxNow.getByRole("button", { name: "Пропустить" }).click();
    });
  }
  want("все подряд: только соответствия, все " + matches.length, seen === matches.length && foreign === 0, seen + " показано, чужих " + foreign);
  want("после последнего — конец набора", /Задания закончились/.test(await page.locator("body").innerText()));
  await page.getByRole("button", { name: "К списку олимпиад" }).click();
  await mixBox.getByRole("checkbox", { name: "Только нерешённые" }).check();
  await types.getByRole("button", { name: /^Все типы/ }).click();
  await page.getByRole("button", { name: "К выбору предмета" }).click();
  want("обратно к предметам ФИПИ", (await page.locator("[data-vosh-card]").count()) === 1);
  want("картинки заданий на месте", missing.length === 0, missing[0] || "");
  want("компьютер: ошибок нет", errors.length === 0, errors[0] || "");
  await ctx.close();
}

// 2. Телефон: самые широкие виды — пропуски, группы, соответствие.
{
  const { ctx, page, errors } = await fresh({ width: 390, height: 844 });
  await page.locator("[data-vosh-card]").getByRole("button", { name: "Открыть олимпиады" }).click();
  const wide = async () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  await page.locator("[data-vosh-mix]").waitFor();
  let worst = await wide();
  if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/vosh-phone-list.png`, fullPage: true });
  await page.locator('[data-vosh="2425-sch-11"]').getByRole("button", { name: "Начать" }).click();
  worst = Math.max(worst, await wide());
  for (const no of ["2", "4", "6.1"]) {
    await page.locator('nav[aria-label="Задания олимпиады"]').getByRole("button", { name: no, exact: true }).click();
    await page.waitForTimeout(300);
    worst = Math.max(worst, await wide());
    if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/vosh-phone-${no}.png`, fullPage: true });
  }
  want("телефон: ничего не едет вбок", worst <= 1, worst + " px");
  want("телефон: ошибок нет", errors.length === 0, errors[0] || "");
  await ctx.close();
}

await browser.close();
server.close();
if (bad) {
  console.log(`\n${bad} проверок не прошло`);
  process.exit(1);
}
console.log("\nВсОШ: все олимпиады проходятся по ключу, баллы и итоги сходятся");
