// Выложить результаты конкретному аккаунту через обновление приложения.
//
//   node tools/publish-results.mjs КОД results.json [лента.json]
//
// КОД — «код для результатов» из раздела «Результаты» этого человека.
// results.json — массив результатов в формате приложения (src/results-model.js),
// например: [{ "kind": "kt", "subject": "Право", "title": "КТ №2", "date": "2026-10-12",
//              "scale": "grade", "grade": 5, "score": 18, "max": 20 }]
// Лента по умолчанию — src/results-feed.json. В неё дописывается только
// шифровка и метка: сам код и результаты открытым текстом в репозиторий не
// попадают.
import { readFile, writeFile } from "node:fs/promises";
import { encryptFor, normalizeCode } from "../src/results-feed.js";
import { cleanResult } from "../src/results-model.js";

const [code, file, feedPath = "src/results-feed.json"] = process.argv.slice(2);
if (!code || !file || normalizeCode(code).length !== 20) {
  console.error("Нужно: node tools/publish-results.mjs КОД(20 знаков) results.json [лента.json]");
  process.exit(1);
}
const list = JSON.parse(await readFile(file, "utf8"));
const results = (Array.isArray(list) ? list : [list]).map((r, i) => cleanResult({ ...r, id: r.id || "upd-" + Date.now().toString(36) + "-" + i }));
const feed = JSON.parse(await readFile(feedPath, "utf8").catch(() => "[]"));
feed.push(await encryptFor(code, results));
await writeFile(feedPath, JSON.stringify(feed, null, 2) + "\n");
console.log(`Выложено записей: ${results.length}. В ленте теперь ${feed.length} шифровок.`);
