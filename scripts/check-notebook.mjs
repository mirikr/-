// Тетрадь не теряет свежие правки.
//
// Сохранение идёт с задержкой, а приложение перечитывает записи каждый раз,
// когда окно снова получает фокус, — например, после системного диалога выбора
// файла. Раньше прочитанное ставилось поверх экрана: только что созданная ветка
// пропадала, а прикреплённый файл не добавлялся. Здесь это воспроизводится
// нарочно: правка — и сразу «возвращение в окно».
//
// Заодно — список предметов: закрепление и порядок мышью, пальцем и стрелками.
//
// Запуск: npm run check:notebook
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

const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
page.setDefaultTimeout(5000);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.addInitScript(() => {
  if (sessionStorage.getItem("seeded")) return;
  sessionStorage.setItem("seeded", "1");
  localStorage.setItem("planner-intro-version", "0.6.0-schedule");
  localStorage.setItem("planner-design-intro", "1.0.0");
  localStorage.setItem("planner-screen", "notes");
  localStorage.setItem("planner:planner-state-v5", JSON.stringify({ value: JSON.stringify({ journal: [], lyceumSchedule: [{ id: "l1", day: "mon", start: "09:00", end: "09:45", subjectName: "Право" }] }), updatedAt: Date.now() - 1000 }));
});
await page.goto(URL0);
await page.waitForTimeout(2000);

const refocus = () => page.evaluate(() => { window.dispatchEvent(new Event("focus")); document.dispatchEvent(new Event("visibilitychange")); });
const stored = () => page.evaluate(() => JSON.parse(JSON.parse(localStorage.getItem("planner:planner-state-v5")).value).notebooks || {});
const branchesIn = (nb) => Object.values(nb).flat().flatMap((b) => b.branches || []);

// 1. Блок и ветка, и сразу — возвращение в окно, пока сохранение ещё не прошло.
await page.getByPlaceholder(/Название блока/).fill("Теория государства");
await page.getByRole("button", { name: "+ Блок" }).click();
await refocus();
await page.getByPlaceholder(/Название ветки/).fill("Признаки государства");
await page.getByRole("button", { name: "+ Ветка" }).click();
await refocus();
await page.waitForTimeout(300);
want("блок не пропал после возвращения в окно", (await page.locator('input[value="Теория государства"]').count()) === 1);
want("ветка не пропала после возвращения в окно", (await page.locator('input[value="Признаки государства"]').count()) === 1);

// 2. Пишем конспект и прикрепляем файл; диалог выбора файла возвращает фокус окну.
const editor = page.locator("[contenteditable]").first();
await editor.click();
await page.keyboard.type("Суверенитет, территория, население");
await page.locator('input[type="file"]').first().setInputFiles({ name: "схема.txt", mimeType: "text/plain", buffer: Buffer.from("публичная власть") });
await refocus();
await page.keyboard.type(". Налоги");
await refocus();
await page.waitForTimeout(600);
want("файл появился в ветке", (await page.getByRole("button", { name: "схема.txt" }).count()) === 1);
want("конспект не откатился", /население\. Налоги/.test(await editor.innerText()), await editor.innerText());

// 3. Второй файл сразу за первым — первый не вытесняется.
await page.locator('input[type="file"]').first().setInputFiles({ name: "таблица.txt", mimeType: "text/plain", buffer: Buffer.from("формы правления") });
await refocus();
await page.waitForTimeout(600);
want("оба файла на месте", (await page.getByRole("button", { name: /^(схема|таблица)\.txt$/ }).count()) === 2);

// 4. После сохранения и перезагрузки всё осталось.
await page.waitForTimeout(1500);
const nb = await stored();
const br = branchesIn(nb).find((b) => b.title === "Признаки государства");
want("ветка сохранена", !!br);
want("оба файла сохранены", br && (br.files || []).map((f) => f.name).sort().join(",") === "схема.txt,таблица.txt", br && JSON.stringify((br.files || []).map((f) => f.name)));
want("конспект сохранён", br && /население\. Налоги/.test(br.html || ""), br && br.html);
await page.reload();
await page.waitForTimeout(1800);
// Блоки и ветки после перезагрузки свёрнуты — раскрываем.
await page.locator('input[value="Теория государства"]').locator("xpath=..").getByRole("button").first().click();
await page.waitForTimeout(300);
want("после перезагрузки ветка на месте", (await page.locator('input[value="Признаки государства"]').count()) === 1);

// 5. Удаление файла — только того, что убрали.
await page.locator('input[value="Признаки государства"]').locator("xpath=..").getByRole("button").first().click();
await page.waitForTimeout(300);
await page.locator('[title="Убрать файл"]').first().click();
await refocus();
await page.waitForTimeout(1500);
const after = branchesIn(await stored()).find((b) => b.title === "Признаки государства");
want("убран ровно один файл", after && (after.files || []).length === 1, after && JSON.stringify((after.files || []).map((f) => f.name)));

want("ошибок нет", errors.length === 0, errors[0] || "");
await ctx.close();

// 6. Порядок предметов: карандаш, булавка, перетаскивание мышью, пальцем и стрелками.
const SUBJ = ["Право", "Алгебра", "История", "Физика", "Химия"].map((subjectName, n) => ({ id: "l" + n, day: "mon", start: "0" + (n + 1) + ":00", end: "0" + (n + 1) + ":45", subjectName }));
async function orderPage(viewport, touch) {
  const c = await browser.newContext({ viewport, hasTouch: !!touch, isMobile: !!touch });
  const p = await c.newPage();
  p.setDefaultTimeout(5000);
  const errs = [];
  p.on("pageerror", (e) => errs.push(e.message));
  await p.addInitScript((sched) => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem("planner-intro-version", "0.6.0-schedule");
    localStorage.setItem("planner-design-intro", "1.0.0");
    localStorage.setItem("planner-screen", "notes");
    localStorage.setItem("planner:planner-state-v5", JSON.stringify({ value: JSON.stringify({ journal: [], lyceumSchedule: sched }), updatedAt: Date.now() - 1000 }));
  }, SUBJ);
  await p.goto(URL0);
  await p.waitForTimeout(1800);
  return { c, p, errs };
}
const lyceumOrder = (p) => p.locator("[data-subject]").evaluateAll((els) => els.map((e) => e.dataset.subject).filter((n) => ["Право", "Алгебра", "История", "Физика", "Химия"].includes(n)).join(","));
{
  const { c, p, errs } = await orderPage({ width: 1280, height: 900 });
  await p.getByRole("button", { name: "Изменить порядок предметов" }).click();
  want("карандаш включает правку", (await p.locator("[data-subject]").count()) >= 5);
  await p.getByRole("button", { name: "Закрепить: История" }).click();
  await p.waitForTimeout(200);
  const first = await p.locator("[data-subject]").first().getAttribute("data-subject");
  want("закреплённый предмет — первым", first === "История", first);

  // Мышью: «Химию» — на место сразу под закреплённой «Историей».
  const from = await p.locator('[data-subject="Химия"]').boundingBox();
  const to = await p.locator("[data-subject]").nth(1).boundingBox();
  await p.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await p.mouse.down();
  for (let k = 1; k <= 8; k += 1) await p.mouse.move(from.x + from.width / 2, from.y + from.height / 2 + ((to.y + 3 - (from.y + from.height / 2)) * k) / 8);
  await p.mouse.up();
  await p.waitForTimeout(200);
  const all = await p.locator("[data-subject]").evaluateAll((els) => els.map((e) => e.dataset.subject));
  want("мышью: предмет встал под закреплённый", all[0] === "История" && all[1] === "Химия", all.slice(0, 3).join(","));

  // Стрелкой: «Право» на одну строку вверх.
  const before = await lyceumOrder(p);
  await p.getByRole("button", { name: "Перетащить: Право" }).focus();
  await p.keyboard.press("ArrowUp");
  await p.waitForTimeout(200);
  const afterKey = await lyceumOrder(p);
  const bi = before.split(","), ai = afterKey.split(",");
  want("стрелкой: на строку выше", ai.indexOf("Право") === bi.indexOf("Право") - 1 || bi.indexOf("Право") <= 1, before + " → " + afterKey);

  // Незакреплённый не забирается выше закреплённых.
  const h = await p.locator('[data-subject="Химия"]').boundingBox();
  await p.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await p.mouse.down();
  await p.mouse.move(h.x + h.width / 2, 0, { steps: 6 });
  await p.mouse.up();
  await p.waitForTimeout(200);
  want("закреплённый остаётся первым", (await p.locator("[data-subject]").first().getAttribute("data-subject")) === "История");

  const kept = await p.locator("[data-subject]").evaluateAll((els) => els.map((e) => e.dataset.subject).join(","));
  await p.getByRole("button", { name: "Готово" }).click();
  want("в обычном виде видна булавка", (await p.getByLabel("закреплён").count()) === 1);
  await p.getByRole("button", { name: /^Химия/ }).click();
  want("предмет по-прежнему выбирается", (await p.getByLabel("Предмет тетради").inputValue()) === "lyceum:Химия");
  await p.waitForTimeout(1500);
  const stored = await p.evaluate(() => JSON.parse(JSON.parse(localStorage.getItem("planner:planner-state-v5")).value).notebookOrder);
  want("порядок сохранён", stored && stored.pinned && stored.pinned.includes("lyceum:История"), JSON.stringify(stored));
  await p.reload();
  await p.waitForTimeout(1800);
  await p.getByRole("button", { name: "Изменить порядок предметов" }).click();
  const reloaded = await p.locator("[data-subject]").evaluateAll((els) => els.map((e) => e.dataset.subject).join(","));
  want("после перезагрузки порядок тот же", reloaded === kept, reloaded);
  await p.screenshot({ path: process.env.SHOT_DIR ? process.env.SHOT_DIR + "/order-desktop.png" : "/dev/null" }).catch(() => {});
  want("ошибок нет", errs.length === 0, errs[0] || "");
  await c.close();
}
{
  // Пальцем, на телефоне: тянем за ручку.
  const { c, p, errs } = await orderPage({ width: 390, height: 844 }, true);
  await p.getByRole("button", { name: "Изменить порядок предметов" }).click();
  await p.waitForTimeout(200);
  const before = await lyceumOrder(p);
  const handle = await p.getByRole("button", { name: "Перетащить: Химия" }).boundingBox();
  const target = await p.locator('[data-subject="Алгебра"]').boundingBox();
  const cdp = await c.newCDPSession(p);
  const x = handle.x + handle.width / 2;
  let y = handle.y + handle.height / 2;
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  const goal = target.y + 3;
  for (let k = 1; k <= 10; k += 1) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y + ((goal - y) * k) / 10 }] });
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await p.waitForTimeout(300);
  const after = await lyceumOrder(p);
  want("пальцем: предмет переехал", after.split(",").indexOf("Химия") < before.split(",").indexOf("Химия"), before + " → " + after);
  await p.screenshot({ path: process.env.SHOT_DIR ? process.env.SHOT_DIR + "/order-phone.png" : "/dev/null" }).catch(() => {});
  want("на телефоне без ошибок", errs.length === 0, errs[0] || "");
  await c.close();
}

await browser.close();
server.close();
console.log(bad ? `\nпровалено: ${bad}` : "\nтетрадь не теряет правки, предметы расставляются");
process.exit(bad ? 1 : 0);
