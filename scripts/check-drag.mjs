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

// 5. Блоки и ветки тетради перетаскиваются: ветка — внутри блока и в другой
// блок, блок — на новое место. Простое нажатие по-прежнему открывает ветку.
{
  const st = {
    journal: [],
    customSubjects: [{ id: "c0", name: "Право", color: "#C0563B", topics: [] }],
    data: { c0: { topics: [], custom: [
      { id: "t1", name: "Власть", done: false, duration: 40, notes: [] },
      { id: "t2", name: "Государство", done: false, duration: 40, notes: [] },
      { id: "t3", name: "Режим", done: false, duration: 40, notes: [] },
    ] } },
    notebooks: {
      "subj:c0": [
        { id: "b1", title: "Теория", branches: [{ id: "r1", title: "Признаки", html: "<p>текст</p>", files: [PDF] }, { id: "r2", title: "Функции", html: "", files: [] }] },
        { id: "b2", title: "Конституция", branches: [{ id: "r3", title: "Основы строя", html: "", files: [] }] },
        { id: "b3", title: "Права человека", branches: [] },
      ],
    },
  };
  const c2 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const p2 = await c2.newPage();
  p2.setDefaultTimeout(6000);
  const errs = [];
  p2.on("pageerror", (e) => errs.push(e.message));
  await p2.addInitScript(([st]) => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem("planner-intro-version", "0.6.0-schedule");
    localStorage.setItem("planner-design-intro", "1.0.0");
    localStorage.setItem("planner-screen", "notes");
    localStorage.setItem("planner:planner-state-v5", JSON.stringify({ value: JSON.stringify(st), updatedAt: Date.now() - 1000 }));
  }, [st]);
  await p2.goto(URL0);
  await p2.waitForTimeout(2000);
  const nb = async () => (JSON.parse(JSON.parse(await p2.evaluate(() => localStorage.getItem("planner:planner-state-v5"))).value).notebooks["subj:c0"] || [])
    .map((b) => b.id + ":" + (b.branches || []).map((r) => r.id).join(",")).join(" | ");
  const mid = async (sel) => { const b = await p2.locator(sel).first().boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2, b }; };
  async function pull(fromSel, toY, check) {
    const a = await mid(fromSel);
    await p2.mouse.move(a.x, a.y);
    await p2.mouse.down();
    await p2.mouse.move(a.x, a.y + 8, { steps: 2 });
    await p2.mouse.move(a.x, toY, { steps: 12 });
    await p2.waitForTimeout(150);
    if (check) await check();
    await p2.mouse.up();
    await p2.waitForTimeout(1600);
  }

  // Ветку «Функции» — над «Признаками».
  const r1 = await mid('[data-ol-branch="r1"]');
  await pull('[data-ol-branch="r2"]', r1.b.y + 4, async () => {
    const info = await p2.evaluate(() => ({ lifted: document.querySelector("[data-ol-lifted]") && document.querySelector("[data-ol-lifted]").getAttribute("data-ol-branch"), line: !!document.querySelector("[data-outline-dragging] > [aria-hidden]") }));
    want("ветка поднята и едет за мышью, линия показывает место", info.lifted === "r2" && info.line, JSON.stringify(info));
    if (process.env.SHOT_DIR) await p2.screenshot({ path: process.env.SHOT_DIR + "/drag-branch.png" });
  });
  want("ветка — на новое место в блоке", (await nb()).startsWith("b1:r2,r1 |"), await nb());

  // «Признаки» (с файлом) — в блок «Конституция», под «Основы строя».
  const r3 = await mid('[data-ol-branch="r3"]');
  await pull('[data-ol-branch="r1"]', r3.b.y + r3.b.height - 3);
  want("ветка — в другой блок", (await nb()) === "b1:r2 | b2:r3,r1 | b3:", await nb());
  const moved = JSON.parse(JSON.parse(await p2.evaluate(() => localStorage.getItem("planner:planner-state-v5"))).value).notebooks["subj:c0"][1].branches[1];
  want("ветка переехала с конспектом и файлом", moved.html === "<p>текст</p>" && moved.files.length === 1);

  // Блок «Права человека» — первым.
  const b1 = await mid('[data-ol-head="b1"]');
  await pull('[data-ol-head="b3"]', b1.b.y + 2);
  want("блок — на новое место", (await nb()).startsWith("b3:"), await nb());

  // Простое нажатие — открывает ветку, а не тащит её.
  await p2.locator('[data-ol-branch="r3"]').click();
  await p2.waitForTimeout(400);
  want("нажатие на ветку открывает её", (await p2.locator('[data-ol-branch="r3"][aria-current="true"]').count()) === 1 && (await nb()).includes("b2:r3,r1"));
  want("после перетаскивания ничего не висит", (await p2.locator("[data-ol-lifted]").count()) === 0);

  // 6. Уроки в «Самостоятельной подготовке» переставляются.
  await p2.evaluate(() => localStorage.setItem("planner-screen", "study"));
  await p2.reload();
  await p2.waitForTimeout(2000);
  const topics = async () => (await p2.locator('[data-sortable-item]').evaluateAll((els) => els.map((e) => e.getAttribute("data-sortable-item")))).filter((n) => ["Власть", "Государство", "Режим"].includes(n)).join(",");
  want("уроки — в прежнем порядке", (await topics()) === "Власть,Государство,Режим", await topics());
  const t1 = await mid('[data-sortable-item="Власть"]');
  const t3 = await mid('[data-sortable-item="Режим"]');
  await p2.mouse.move(t3.x, t3.y);
  await p2.mouse.down();
  await p2.mouse.move(t3.x, t3.y - 6, { steps: 2 });
  await p2.mouse.move(t3.x, t1.b.y + 4, { steps: 12 });
  await p2.waitForTimeout(150);
  want("урок поднят при перетаскивании", (await p2.locator('[data-lifted]').getAttribute("data-sortable-item")) === "Режим");
  await p2.mouse.up();
  await p2.waitForTimeout(1600);
  want("урок встал первым", (await topics()) === "Режим,Власть,Государство", await topics());
  const order = JSON.parse(JSON.parse(await p2.evaluate(() => localStorage.getItem("planner:planner-state-v5"))).value).data.c0.order;
  want("порядок уроков в записях", JSON.stringify(order) === JSON.stringify(["t3", "t1", "t2"]), JSON.stringify(order));
  // Галочка по-прежнему ставится обычным нажатием.
  await p2.getByRole("checkbox", { name: /Отметить пройденным: Власть/ }).click();
  await p2.waitForTimeout(400);
  want("галочка урока ставится, порядок не сбился", (await p2.getByRole("checkbox", { name: /Пройден: Власть/ }).count()) === 1 && (await topics()) === "Режим,Власть,Государство");
  await p2.reload();
  await p2.waitForTimeout(2000);
  want("порядок уроков пережил перезагрузку", (await topics()) === "Режим,Власть,Государство", await topics());
  want("блоки, ветки, уроки: ошибок нет", errs.length === 0, errs[0] || "");
  await c2.close();
}

await browser.close();
server.close();
if (bad) {
  console.log(`\n${bad} проверок не прошло`);
  process.exit(1);
}
console.log("\nперетаскивание файлов: всё в порядке");
