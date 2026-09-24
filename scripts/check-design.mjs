// Проверяет два дизайна сразу: новый (1.0.0) и прежний, который включается
// в «Настройки» → «Дизайн».
//
// Смена дизайна — настройка устройства, и она не должна трогать записи. Анонс
// нового вида показывается один раз. И все разделы должны открываться в обоих
// видах, в светлой и ночной теме, на компьютере и телефоне: прежний дизайн
// живёт рядом с новым, и сломать его незаметно проще всего.
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

// 1. Анонс: показан один раз, «Отлично» закрывает навсегда.
{
  const { ctx, page, errors } = await fresh({ width: 1280, height: 900 });
  want("анонс 1.0.0 показан после обновления", (await announce(page)) > 0);
  want("по умолчанию новый дизайн", (await design(page)) === "new", await design(page));
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

// 2. «Вернуть прежний»: прежний вид, держится после перезагрузки, записи те же.
{
  const { ctx, page, errors } = await fresh({ width: 1280, height: 900 });
  await page.getByRole("button", { name: "Вернуть прежний" }).click();
  await page.waitForTimeout(600);
  want("«Вернуть прежний» включает прежний дизайн", (await design(page)) === "classic", await design(page));
  want("анонс закрылся", (await announce(page)) === 0);
  await page.reload(); await page.waitForTimeout(2000);
  want("прежний дизайн держится после перезагрузки", (await design(page)) === "classic");
  want("анонс не вернулся", (await announce(page)) === 0);
  const stored = await page.evaluate(() => JSON.parse(JSON.parse(localStorage.getItem("planner:planner-state-v5")).value));
  want("записи не тронуты сменой дизайна", stored.journal?.length === 1 && stored.events?.length === 1);
  // Обратно — через «Настройки» → «Дизайн».
  const toSettings = page.locator("button:visible", { hasText: /Настройки/ }).first();
  if (await toSettings.count()) await toSettings.click();
  else await page.locator('button[title*="астройк"]:visible, button[aria-label*="астройк"]:visible').first().click();
  await page.waitForTimeout(800);
  const s = await page.locator("#root").innerText();
  want("в настройках есть выбор дизайна", /Дизайн/.test(s), (s.match(/Дизайн[^\n]*/) || [])[0] || "");
  const back = page.locator("button:visible", { hasText: /^Новый$/ }).first();
  if (await back.count()) { await back.click(); await page.waitForTimeout(600); }
  want("можно вернуть новый дизайн", (await design(page)) === "new", await design(page));
  want("ошибок нет", errors.length === 0, errors[0] || "");
  await ctx.close();
}

// 3. Все экраны в обоих видах, светлой и ночной теме, на компьютере и телефоне — без ошибок.
for (const d of ["new", "classic"]) for (const theme of ["light", "night"]) for (const vp of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  const { ctx, page, errors } = await fresh(vp, { "planner-design-intro": "1.0.0", "planner-design": d, "planner-theme-mode": theme });
  const keys = ["today", "events", "budget", "study", "trainer", "school", "journal", "notes", "search", "settings"];
  let opened = 0;
  for (const k of keys) {
    await page.evaluate((k) => { localStorage.setItem("planner-screen", k); }, k);
    await page.reload(); await page.waitForTimeout(900);
    const t = (await page.locator("#root").innerText()).length;
    if (t > 150) opened += 1;
  }
  const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  want(`${d}/${theme}/${vp.width}px: экраны открываются`, opened === keys.length, opened + " из " + keys.length);
  if (vp.width < 500) want(`${d}/${theme}/${vp.width}px: ничего не едет вбок`, wide <= 1, wide + " px");
  want(`${d}/${theme}/${vp.width}px: ошибок нет`, errors.length === 0, errors[0] || "");
  await ctx.close();
}
await browser.close(); server.close();
console.log(bad ? `\nпровалов: ${bad}` : "\nоба дизайна работают, записи от смены вида не зависят");
process.exit(bad ? 1 : 0);
