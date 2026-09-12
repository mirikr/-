// Снимает, как приложение выглядело в каждой версии, чтобы их можно было
// сравнить ползунком в истории изменений.
//
// Каждая версия собирается из своего коммита в отдельном рабочем дереве, без
// облака, с одинаковыми демонстрационными данными — иначе сравнивалась бы не
// разница между версиями, а разница между наборами записей.
//
// Запуск: node scripts/make-version-shots.mjs
// (нужны playwright и Chromium: PLAYWRIGHT_MODULE и CHROMIUM_PATH)
import { execSync } from "node:child_process";
import { mkdirSync, rmSync, existsSync, symlinkSync } from "node:fs";
import { resolve } from "node:path";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";

const playwright = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const { chromium } = playwright.chromium ? playwright : playwright.default;

const ROOT = process.cwd();
const OUT = resolve(ROOT, "public/versions");
const TMP = resolve(ROOT, ".version-shots");
const BROWSER = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

// Версии появились задним числом, поэтому коммиты выписаны руками.
// expand — какой раздел раскрыть перед снимком: на свёрнутой странице разница
// между соседними версиями иногда не видна вовсе, хотя она есть внутри.
const VERSIONS = [
  { v: "0.1.0", commit: "b7f5b2b" },
  { v: "0.2.0", commit: "694ed0d", expand: "Самостоятельное изучение" },
  { v: "0.3.0", commit: "8ddb6f5", expand: "Самостоятельное изучение" },
  { v: "0.4.0", commit: "78b8b19", expand: "Лицей КЭО" },
  { v: "0.5.0", commit: "HEAD" },
];

// Одинаковые данные для всех версий: неделя занятий, событие и пара уроков.
const DEMO = {
  journalDays: 12,
  eventInDays: 24,
};

function sh(cmd, cwd = ROOT) {
  return execSync(cmd, { cwd, stdio: ["ignore", "pipe", "pipe"] }).toString().trim();
}

function serve(dir) {
  const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".webmanifest": "application/manifest+json" };
  const server = createServer(async (req, res) => {
    const path = req.url.split("?")[0];
    const file = resolve(dir, "." + (path === "/" ? "/index.html" : path));
    try {
      const body = await readFile(file);
      const ext = file.slice(file.lastIndexOf("."));
      res.writeHead(200, { "content-type": types[ext] || "application/octet-stream" });
      res.end(body);
    } catch (e) {
      res.writeHead(404).end("not found");
    }
  });
  return new Promise((done) => server.listen(0, "127.0.0.1", () => done({ server, port: server.address().port })));
}

mkdirSync(OUT, { recursive: true });
rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });

const browser = await chromium.launch({ executablePath: BROWSER });

for (const { v, commit, expand } of VERSIONS) {
  const dir = resolve(TMP, v);
  sh(`git worktree add --detach "${dir}" ${commit}`);
  // Зависимости одни и те же во всех версиях — ставить их заново не нужно.
  if (!existsSync(resolve(dir, "node_modules"))) symlinkSync(resolve(ROOT, "node_modules"), resolve(dir, "node_modules"), "dir");
  sh(`npx vite build --mode preview --outDir "${dir}/dist-shot" --emptyOutDir`, dir);

  const { server, port } = await serve(resolve(dir, "dist-shot"));
  const page = await browser.newPage({ viewport: { width: 1180, height: 820 } });
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForTimeout(700);
  await page.evaluate((demo) => {
    const KEY = "planner:planner-state-v5";
    const wrapper = JSON.parse(localStorage.getItem(KEY) || "null");
    const state = wrapper ? JSON.parse(wrapper.value) : {};
    const iso = (d) => d.toISOString().slice(0, 10);
    const today = new Date();
    const journal = [];
    const subjects = ["law", "econ", "polit", "soc", "phil"];
    for (let i = 0; i < demo.journalDays; i++) {
      const d = new Date(today); d.setDate(today.getDate() - i);
      if (i % 4 !== 3) journal.push({ id: Date.now() + i, date: iso(d), subjectId: subjects[i % 5], hours: [1, 2, 1.5, 2.5, 0.5][i % 5], note: "Занятие" });
    }
    state.journal = journal;
    const ev = new Date(today); ev.setDate(today.getDate() + demo.eventInDays);
    state.events = [{ id: "ev-demo", name: "Региональный этап ВсОШ", date: iso(ev), priority: 3 }];
    localStorage.setItem(KEY, JSON.stringify({ value: JSON.stringify(state), updatedAt: Date.now() }));
  }, DEMO);
  await page.reload();
  await page.waitForTimeout(1200);
  if (expand) {
    await page.locator(`button:has-text("${expand}")`).first().click().catch(() => {});
    await page.waitForTimeout(900);
  }
  await page.screenshot({ path: resolve(OUT, `${v}.png`) });
  await page.close();
  server.close();

  sh(`git worktree remove --force "${dir}"`);
  console.log("снято", v, "из", commit);
}

await browser.close();
rmSync(TMP, { recursive: true, force: true });
