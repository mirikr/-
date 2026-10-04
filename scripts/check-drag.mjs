// Перетаскивание файлов мышью (1.7.2): из ветки в ветку другого блока, на
// предмет (файл ложится в «Файлы › Разное»), подержали над предметом — он
// открылся и файл бросается в его ветку; из «Дневника» — подержали над
// «Тетрадями» в меню, раздел открылся, файл встал в ветку, а у задания остался.
// «Вернуть» в уведомлении отменяет перенос.
//
// Запуск: npm run check:drag (нужны playwright и Chromium)
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

const iso = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
const PDF = { name: "Конспект ТГП.pdf", size: 1200, key: "hwfile-nb-1" };
const HW = { name: "Задание по праву.docx", size: 900, key: "hwfile-hw-2" };
const state = {
  journal: [],
  customSubjects: [
    { id: "c0", name: "Право", color: "#C0563B", topics: [] },
    { id: "c1", name: "Экономика", color: "#3F8F6A", topics: [] },
  ],
  homework: [{ id: "hw-1", date: iso(new Date()), subjectName: "", text: "Прочитать главу", minutes: 30, done: false, attachments: [HW] }],
  notebooks: {
    "subj:c0": [
      { id: "b1", title: "Теория государства", branches: [{ id: "r1", title: "Признаки государства", html: "<p>…</p>", files: [PDF] }] },
      { id: "b2", title: "Конституция", branches: [{ id: "r2", title: "Основы строя", html: "", files: [] }] },
    ],
  },
};

const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
page.setDefaultTimeout(6000);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.addInitScript(([st, files]) => {
  if (sessionStorage.getItem("seeded")) return;
  sessionStorage.setItem("seeded", "1");
  localStorage.setItem("planner-intro-version", "0.6.0-schedule");
  localStorage.setItem("planner-design-intro", "1.0.0");
  localStorage.setItem("planner-screen", "notes");
  localStorage.setItem("planner:planner-state-v5", JSON.stringify({ value: JSON.stringify(st), updatedAt: Date.now() - 1000 }));
  files.forEach((f) => localStorage.setItem("planner:" + f.key, JSON.stringify({ value: "data:text/plain;base64,MQ==", updatedAt: Date.now() })));
}, [state, [PDF, HW]]);
await page.goto(URL0);
await page.waitForTimeout(2200);
const stored = () => page.evaluate(() => JSON.parse(JSON.parse(localStorage.getItem("planner:planner-state-v5")).value));
const filesOf = async (owner, block, branch) => {
  const nb = (await stored()).notebooks[owner] || [];
  const b = nb.find((x) => x.id === block || x.title === block);
  const r = b && (b.branches || []).find((x) => x.id === branch || x.title === branch);
  return r ? (r.files || []).map((f) => f.name) : null;
};
const center = async (loc) => {
  const b = await loc.boundingBox();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};
// Тащим мышью: зажали на плитке, повели к цели, подержали (hold мс), отпустили.
async function drag(fromLoc, toLoc, { hold = 150, release = true } = {}) {
  const a = await center(fromLoc);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(a.x + 12, a.y + 6, { steps: 3 });
  const b = await center(toLoc);
  await page.mouse.move(b.x, b.y, { steps: 12 });
  await page.waitForTimeout(hold);
  if (release) await page.mouse.up();
  // Записи сохраняются с небольшой задержкой — ждём, прежде чем читать.
  await page.waitForTimeout(release ? 1600 : 300);
}
const toast = () => page.locator(".undo-toast").allInnerTexts().then((t) => t.join(" | "));
const subj = (name) => page.locator(".ap-notes-subject", { hasText: name });

await subj("Право").click();
await page.waitForTimeout(300);
const tile = page.locator('[data-file-tile="Конспект ТГП.pdf"]');
want("плитка файла в тетради перетаскивается", (await tile.getAttribute("draggable")) === "true");

// 1. В ветку другого блока.
await drag(tile, page.locator('[data-focus-id="branch:r2"]').first());
want("в ветку другого блока: файл переехал", JSON.stringify(await filesOf("subj:c0", "b2", "r2")) === JSON.stringify(["Конспект ТГП.pdf"]) && (await filesOf("subj:c0", "b1", "r1")).length === 0,
  JSON.stringify([await filesOf("subj:c0", "b1", "r1"), await filesOf("subj:c0", "b2", "r2")]));
want("уведомление говорит, куда", /перенесён в «Право › Конституция › Основы строя»/.test(await toast()), await toast());
await page.getByRole("button", { name: "Вернуть", exact: true }).first().click();
await page.waitForTimeout(1600);
want("«Вернуть» — файл снова на старом месте", JSON.stringify(await filesOf("subj:c0", "b1", "r1")) === JSON.stringify(["Конспект ТГП.pdf"]) && (await filesOf("subj:c0", "b2", "r2")).length === 0);

// 2. Прямо на другой предмет — в «Файлы › Разное».
await page.locator('[data-focus-id="branch:r1"]').first().click();
await page.waitForTimeout(300);
await drag(page.locator('[data-file-tile="Конспект ТГП.pdf"]'), subj("Экономика"), { hold: 100 });
want("на предмет: файл лёг в «Файлы › Разное»", JSON.stringify(await filesOf("subj:c1", "Файлы", "Разное")) === JSON.stringify(["Конспект ТГП.pdf"]) && (await filesOf("subj:c0", "b1", "r1")).length === 0,
  JSON.stringify(await filesOf("subj:c1", "Файлы", "Разное")));
await page.getByRole("button", { name: "Вернуть", exact: true }).first().click();
await page.waitForTimeout(1600);
want("«Вернуть» убирает созданный блок", ((await stored()).notebooks["subj:c1"] || []).length === 0 && (await filesOf("subj:c0", "b1", "r1")).length === 1);

// 3. Подержали над предметом — открылся, бросили в его ветку.
const st2 = await stored();
st2.notebooks["subj:c1"] = [{ id: "e1", title: "Микроэкономика", branches: [{ id: "q1", title: "Спрос", html: "", files: [] }] }];
await page.evaluate((v) => {
  localStorage.setItem("planner:planner-state-v5", JSON.stringify({ value: JSON.stringify(v), updatedAt: Date.now() }));
}, st2);
await page.reload();
await page.waitForTimeout(2000);
await subj("Право").click();
await page.waitForTimeout(300);
await page.locator('[data-focus-id="branch:r1"]').first().click();
await page.waitForTimeout(300);
await drag(page.locator('[data-file-tile="Конспект ТГП.pdf"]'), subj("Экономика"), { hold: 1100, release: false });
const opened = /Экономика/.test(await page.locator(".ap-nbw-outline").innerText());
want("подержали над предметом — его тетрадь открылась", opened);
const q1 = await center(page.locator('[data-focus-id="branch:q1"]').first());
await page.mouse.move(q1.x, q1.y, { steps: 10 });
await page.waitForTimeout(200);
await page.mouse.up();
await page.waitForTimeout(1600);
want("и файл встал в ветку другого предмета", JSON.stringify(await filesOf("subj:c1", "e1", "q1")) === JSON.stringify(["Конспект ТГП.pdf"]) && (await filesOf("subj:c0", "b1", "r1")).length === 0,
  JSON.stringify([await filesOf("subj:c0", "b1", "r1"), await filesOf("subj:c1", "e1", "q1")]));

// 4. Из «Дневника»: подержали над «Тетрадями» в меню — раздел открылся.
await page.evaluate(() => localStorage.setItem("planner-screen", "journal"));
await page.reload();
await page.waitForTimeout(2000);
const hwTile = page.locator('[data-file-tile="Задание по праву.docx"]').first();
want("плитка файла у задания перетаскивается", (await hwTile.getAttribute("draggable")) === "true");
const navNotes = page.locator(".ap-nav", { hasText: "Тетради" }).first();
await drag(hwTile, navNotes, { hold: 1100, release: false });
want("подержали над «Тетрадями» — раздел открылся", (await page.locator(".ap-nbw-outline").count()) > 0);
const r2 = await center(page.locator('[data-focus-id="branch:q1"], [data-focus-id="branch:r2"]').first());
const targetId = await page.locator('[data-focus-id="branch:q1"], [data-focus-id="branch:r2"]').first().getAttribute("data-focus-id");
await page.mouse.move(r2.x, r2.y, { steps: 10 });
await page.waitForTimeout(200);
await page.mouse.up();
await page.waitForTimeout(1600);
const after = await stored();
const where = targetId === "branch:q1" ? await filesOf("subj:c1", "e1", "q1") : await filesOf("subj:c0", "b2", "r2");
want("файл задания встал в ветку тетради", (where || []).includes("Задание по праву.docx"), targetId + " " + JSON.stringify(where));
want("а у задания он остался", after.homework[0].attachments.map((f) => f.name).includes("Задание по праву.docx"));
want("уведомление: «у задания он тоже остался»", /у задания он тоже остался/.test(await toast()), await toast());
want("ошибок нет", errors.length === 0, errors[0] || "");

await browser.close();
server.close();
if (bad) {
  console.log(`\n${bad} проверок не прошло`);
  process.exit(1);
}
console.log("\nперетаскивание файлов: всё в порядке");
