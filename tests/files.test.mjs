import assert from "node:assert";
import { safeFolder, safeName, storagePath } from "../src/storage-key.js";

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log("✓ " + name);
}

// Ключ объекта в хранилище — часть адреса. Кириллица и двоеточие в нём
// недопустимы, а имя лицейского предмета попадало в путь как есть, и файл к
// такой тетради не прикреплялся вовсе: «Invalid key».
const KEY_OK = /^[a-zA-Z0-9/._-]+$/;

check("папка тетради по лицейскому предмету состоит из разрешённых символов", () => {
  const path = storagePath("11111111-2222-3333-4444-555555555555", "nb-lyceum:Русская словесность", "Конспект 1.docx");
  assert.match(path, KEY_OK);
  assert.match(path, /\.docx$/);
});

check("владелец остаётся первой частью пути — иначе правила доступа не пустят", () => {
  const uid = "11111111-2222-3333-4444-555555555555";
  assert.strictEqual(storagePath(uid, "nb-lyceum:Обществознание", "а.pdf").split("/")[0], uid);
});

check("разные предметы не сливаются в одну папку", () => {
  assert.notStrictEqual(safeFolder("nb-lyceum:Русская словесность"), safeFolder("nb-lyceum:Русский язык"));
});

check("одна и та же тетрадь всегда даёт одну папку", () => {
  assert.strictEqual(safeFolder("nb-subj:Право"), safeFolder("nb-subj:Право"));
});

check("имя без расширения и пустой префикс не ломают ключ", () => {
  assert.match(safeName("Конспект"), /^[a-z0-9-]+$/);
  assert.match(safeFolder(""), KEY_OK);
  assert.match(safeFolder("   "), KEY_OK);
  assert.match(safeName("файл."), /^[a-z0-9-]+$/);
});

check("расширение сохраняется в нижнем регистре", () => {
  assert.match(safeName("Скан.PDF"), /\.pdf$/);
  assert.match(safeName("архив.ДОКС.zip"), /\.zip$/);
});

console.log("\nвсе проверки вложений прошли (" + passed + ")");
