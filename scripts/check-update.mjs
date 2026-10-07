// Обновление, пока приложение открыто: куски старой версии на сайте и в кэше
// уже удалены, и старая страница не может их подгрузить. Раньше это был экран
// «Приложение сломалось» (чинился перезагрузкой). Теперь:
//   1. кусок не пришёл один раз — приложение тихо перезагружается и открывает
//      раздел уже нормально;
//   2. кусок не приходит совсем (нет сети) — без бесконечной перезагрузки:
//      показывается обычный экран аварии;
//   3. новая версия уже встала — переход в другой раздел сам перезапускает
//      приложение, не трогая куски старой.
//
// Запуск: PLAYWRIGHT_MODULE=… node scripts/check-update.mjs [каталог сборки]
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const playwright = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const { chromium } = playwright.chromium ? playwright : playwright.default;
const DIST = resolve(process.cwd(), process.argv[2] || process.env.DIST || "dist");
const BROWSER = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".webmanifest": "application/manifest+json" };

const server = createServer(async (req, res) => {
  const raw = req.url.split("?")[0];
  const path = raw.endsWith("/") ? raw + "index.html" : raw;
  const tries = ["." + path, "./" + path.split("/").slice(2).join("/")];
  for (const p of tries) {
    try {
      const file = resolve(DIST, p);
      const body = await readFile(file);
      res.writeHead(200, { "content-type": TYPES[file.slice(file.lastIndexOf("."))] || "application/octet-stream" });
      res.end(body);
      return;
    } catch (e) {
      /* следующий вариант пути */
    }
  }
  res.writeHead(404).end("not found");
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const html = await readFile(resolve(DIST, "index.html"), "utf8");
const found = html.match(/src="(\/[^"]*\/)assets\//);
const URL0 = `http://127.0.0.1:${server.address().port}${found ? found[1] : "/"}`;

const browser = await chromium.launch({ executablePath: BROWSER });
const problems = [];
const want = (name, ok, detail) => {
  console.log((ok ? "✓ " : "✗ ") + name + (ok || !detail ? "" : " — " + detail));
  if (!ok) problems.push(name);
};

// failTimes — сколько раз отказать в куске тренажёра (Infinity — всегда).
async function open(failTimes) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  const page = await ctx.newPage();
  let failed = 0;
  let loads = 0;
  page.on("load", () => (loads += 1));
  await page.route(/\/assets\/trainer-[^/]+\.js$/, (route) => {
    if (failed < failTimes) {
      failed += 1;
      return route.fulfill({ status: 404, body: "gone" });
    }
    return route.continue();
  });
  await page.addInitScript(() => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem("planner-intro-version", "0.6.0-schedule");
    localStorage.setItem("planner-design-intro", "1.0.0");
    localStorage.setItem("planner-screen", "today");
  });
  await page.goto(URL0);
  await page.waitForTimeout(1800);
  return { ctx, page, loads: () => loads, failed: () => failed };
}
const crashShown = (page) => page.evaluate(() => /Приложение сломалось/.test(document.body.innerText));
const goTrainer = (page) => page.locator("button:visible", { hasText: "В тренажёр" }).first().click();

// 1. Кусок пропал один раз — перезагрузка, тренажёр открылся.
{
  const { ctx, page, loads, failed } = await open(1);
  await goTrainer(page);
  await page.waitForTimeout(3500);
  want("кусок старой версии не пришёл — экрана аварии нет", !(await crashShown(page)));
  want("приложение само перезагрузилось", loads() >= 2 && failed() === 1, "загрузок " + loads());
  want("и открыло тренажёр", /Обществознание/.test(await page.locator("main").innerText().catch(() => "")));
  await ctx.close();
}

// 2. Кусок не приходит совсем — одна перезагрузка, потом экран аварии.
{
  const { ctx, page, loads } = await open(Infinity);
  await goTrainer(page);
  await page.waitForTimeout(5000);
  want("кусок не приходит совсем — без бесконечной перезагрузки", loads() <= 3, "загрузок " + loads());
  want("и тогда — обычный экран аварии с копией записей", await crashShown(page));
  await ctx.close();
}

// 3. Новая версия уже встала — переход в раздел перезапускает приложение.
{
  const { ctx, page, loads } = await open(0);
  await page.evaluate(() => {
    window.__plannerUpdateReady = true;
  });
  await page.locator("button:visible", { hasText: "Дневник" }).first().click();
  await page.waitForTimeout(2500);
  want("новая версия встала — переход в раздел перезапускает приложение", loads() >= 2, "загрузок " + loads());
  want("после перезапуска открыт выбранный раздел", /Дневник/.test(await page.locator("h1, h2").first().innerText().catch(() => "")));
  await ctx.close();
}

await browser.close();
server.close();
if (problems.length) {
  console.log(`\n${problems.length} проверок не прошло`);
  process.exit(1);
}
console.log("\nобновление на ходу: всё в порядке");
