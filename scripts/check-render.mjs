// Проверяет, что собранное приложение действительно открывается.
//
// Нужно потому, что предпросмотр собирается без облака, а на сайте оно
// подключено — и код, который выполняется только с облаком, в предпросмотре не
// проверяется вовсе. Именно так на сайт уехал белый экран: обращение к
// переменной до её объявления, которое без облака обрывалось на первом условии.
//
// Запуск: node scripts/check-render.mjs [каталог сборки]
// (нужны playwright и Chromium: PLAYWRIGHT_MODULE и CHROMIUM_PATH)
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const playwright = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const { chromium } = playwright.chromium ? playwright : playwright.default;

const DIST = resolve(process.cwd(), process.argv[2] || "dist");
const BROWSER = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".webmanifest": "application/manifest+json", ".map": "application/json" };

async function readAny(path) {
  const direct = resolve(DIST, "." + path);
  try {
    return { file: direct, body: await readFile(direct) };
  } catch (e) {
    // Сборка для Pages ссылается на /-/assets/…: подпуть отбрасываем, чтобы
    // проверять ту же сборку, которая поедет на сайт.
    const stripped = "/" + path.split("/").slice(2).join("/");
    const file = resolve(DIST, "." + stripped);
    return { file, body: await readFile(file) };
  }
}

const server = createServer(async (req, res) => {
  const raw = req.url.split("?")[0];
  // Адрес вида /-/ — это каталог: отдаём из него index.html.
  const path = raw.endsWith("/") ? raw + "index.html" : raw;
  try {
    const { file, body } = await readAny(path);
    res.writeHead(200, { "content-type": TYPES[file.slice(file.lastIndexOf("."))] || "application/octet-stream" });
    res.end(body);
  } catch (e) {
    res.writeHead(404).end("not found");
  }
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const port = server.address().port;

const browser = await chromium.launch({ executablePath: BROWSER });
const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });

const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
// Сеть до облака и шрифтов из проверки исключена: её здесь может не быть,
// а речь о том, рисуется ли приложение вообще.
page.on("console", (m) => {
  const text = m.text();
  if (m.type() === "error" && !/Failed to load resource|net::/.test(text)) errors.push(text);
});

// Заходим по тому же адресу, что и на сайте: иначе подпуть остаётся непроверенным.
const html = await readFile(resolve(DIST, "index.html"), "utf8");
const found = html.match(/src="(\/[^"]*\/)assets\//);
const base = found ? found[1] : "/";
await page.goto(`http://127.0.0.1:${port}${base}`);
await page.waitForTimeout(2500);
const text = await page.locator("#root").innerText().catch(() => "");

await browser.close();
server.close();

if (errors.length || text.trim().length < 200) {
  console.error("✗ приложение не открылось");
  if (errors.length) console.error("  ошибки:", errors.slice(0, 5).join(" | "));
  console.error("  текста на странице:", text.trim().length);
  process.exit(1);
}
console.log("✓ приложение открывается, на странице", text.trim().length, "символов");
