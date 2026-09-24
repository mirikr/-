// Тетрадь не теряет свежие правки.
//
// Сохранение идёт с задержкой, а приложение перечитывает записи каждый раз,
// когда окно снова получает фокус, — например, после системного диалога выбора
// файла. Раньше прочитанное ставилось поверх экрана: только что созданная ветка
// пропадала, а прикреплённый файл не добавлялся. Здесь это воспроизводится
// нарочно: правка — и сразу «возвращение в окно».
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
await browser.close();
server.close();
console.log(bad ? `\nпровалено: ${bad}` : "\nтетрадь не теряет правки");
process.exit(bad ? 1 : 0);
