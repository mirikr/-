// Перенос файла мышью между ветками, предметами и от задания в тетрадь.
import assert from "node:assert";
import { INBOX_BLOCK, INBOX_BRANCH, moveFile, undoMove } from "../src/file-move.js";

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log("✓ " + name);
}

const pdf = { name: "конспект.pdf", size: 10, path: "u/nb/1.pdf" };
const img = { name: "схема.png", size: 5, key: "hwfile-2" };
const base = () => ({
  "lyceum:Право": [
    { id: "b1", title: "ТГП", branches: [{ id: "r1", title: "Государство", html: "", files: [img, pdf] }, { id: "r2", title: "Право", html: "", files: [] }] },
    { id: "b2", title: "Конституция", branches: [{ id: "r3", title: "Основы", html: "", files: [] }] },
  ],
  "subj:c1": [],
});
const fromR1 = { file: pdf, source: { kind: "notebook", ownerKey: "lyceum:Право", blockId: "b1", branchId: "r1" } };
const files = (nb, owner, block, branch) => nb[owner].find((b) => b.id === block).branches.find((r) => r.id === branch).files.map((f) => f.name);

check("из ветки в ветку другого блока — переезжает", () => {
  const res = moveFile(base(), fromR1, { ownerKey: "lyceum:Право", blockId: "b2", branchId: "r3" });
  assert.deepEqual(files(res.notebooks, "lyceum:Право", "b1", "r1"), ["схема.png"]);
  assert.deepEqual(files(res.notebooks, "lyceum:Право", "b2", "r3"), ["конспект.pdf"]);
  assert.ok(res.moved && res.added);
  assert.equal(res.placed.branch.title, "Основы");
});

check("«Вернуть» ставит файл на прежнее место", () => {
  const nb = base();
  const res = moveFile(nb, { ...fromR1, file: img }, { ownerKey: "lyceum:Право", blockId: "b1", branchId: "r2" });
  const back = undoMove(res.notebooks, res);
  assert.deepEqual(files(back, "lyceum:Право", "b1", "r1"), ["схема.png", "конспект.pdf"]);
  assert.deepEqual(files(back, "lyceum:Право", "b1", "r2"), []);
});

check("на ту же ветку — ничего не делает", () => {
  assert.equal(moveFile(base(), fromR1, { ownerKey: "lyceum:Право", blockId: "b1", branchId: "r1" }), null);
});

check("на предмет — в блок «Файлы», ветку «Разное»; «Вернуть» их убирает", () => {
  const res = moveFile(base(), fromR1, { ownerKey: "subj:c1", inbox: true });
  const blocks = res.notebooks["subj:c1"];
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].title, INBOX_BLOCK);
  assert.equal(blocks[0].branches[0].title, INBOX_BRANCH);
  assert.deepEqual(blocks[0].branches[0].files.map((f) => f.name), ["конспект.pdf"]);
  // Второй файл туда же — в тот же блок, без нового.
  const res2 = moveFile(res.notebooks, { file: img, source: { kind: "notebook", ownerKey: "lyceum:Право", blockId: "b1", branchId: "r1" } }, { ownerKey: "subj:c1", inbox: true });
  assert.equal(res2.notebooks["subj:c1"].length, 1);
  assert.equal(res2.notebooks["subj:c1"][0].branches[0].files.length, 2);
  const back = undoMove(res.notebooks, res);
  assert.deepEqual(back["subj:c1"], []);
  assert.deepEqual(files(back, "lyceum:Право", "b1", "r1"), ["схема.png", "конспект.pdf"]);
});

check("от задания — в тетради появляется тот же файл, у задания ничего не трогаем", () => {
  const hw = { file: { name: "дз.docx", size: 3, path: "u/hw/3.docx" }, source: { kind: "homework", id: "h1" } };
  const nb = base();
  const res = moveFile(nb, hw, { ownerKey: "lyceum:Право", blockId: "b1", branchId: "r2" });
  assert.deepEqual(files(res.notebooks, "lyceum:Право", "b1", "r2"), ["дз.docx"]);
  assert.equal(res.moved, false);
  assert.equal(res.notebooks["lyceum:Право"][0].branches[0].files.length, 2);
  assert.notEqual(res.notebooks, nb);
  assert.deepEqual(files(nb, "lyceum:Право", "b1", "r2"), []);
});

check("файл уже в той ветке — не дублируется", () => {
  const nb = base();
  nb["lyceum:Право"][1].branches[0].files = [pdf];
  const res = moveFile(nb, fromR1, { ownerKey: "lyceum:Право", blockId: "b2", branchId: "r3" });
  assert.deepEqual(files(res.notebooks, "lyceum:Право", "b2", "r3"), ["конспект.pdf"]);
  assert.equal(res.added, false);
  assert.deepEqual(files(res.notebooks, "lyceum:Право", "b1", "r1"), ["схема.png"]);
});

console.log(`\n${passed} проверок пройдено`);
