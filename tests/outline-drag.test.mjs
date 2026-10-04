// Перестановка блоков и веток тетради: ветка — внутри блока и в другой блок.
import assert from "node:assert";
import { moveBlockIn, moveBranchIn } from "../src/outline-drag.js";

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log("✓ " + name);
}

const base = () => [
  { id: "a", title: "А", branches: [{ id: "a1" }, { id: "a2" }, { id: "a3" }] },
  { id: "b", title: "Б", branches: [{ id: "b1" }] },
  { id: "c", title: "В", branches: [] },
];
const shape = (blocks) => blocks.map((b) => b.id + ":" + b.branches.map((r) => r.id).join(",")).join(" | ");

check("ветка внутри блока — на новое место", () => {
  assert.equal(shape(moveBranchIn(base(), "a", "a3", "a", 0)), "a:a3,a1,a2 | b:b1 | c:");
  assert.equal(shape(moveBranchIn(base(), "a", "a1", "a", 2)), "a:a2,a3,a1 | b:b1 | c:");
});

check("ветка в другой блок, в том числе пустой и в конец", () => {
  assert.equal(shape(moveBranchIn(base(), "a", "a2", "b", 0)), "a:a1,a3 | b:a2,b1 | c:");
  assert.equal(shape(moveBranchIn(base(), "a", "a2", "c", 0)), "a:a1,a3 | b:b1 | c:a2");
  assert.equal(shape(moveBranchIn(base(), "a", "a2", "b", Infinity)), "a:a1,a3 | b:b1,a2 | c:");
});

check("ветка переезжает целиком — с конспектом и файлами", () => {
  const blocks = base();
  blocks[0].branches[1] = { id: "a2", title: "Признаки", html: "<p>текст</p>", files: [{ name: "f.pdf", key: "k" }] };
  const out = moveBranchIn(blocks, "a", "a2", "c", 0);
  assert.deepEqual(out[2].branches[0], blocks[0].branches[1]);
});

check("блоки — на новое место", () => {
  assert.equal(shape(moveBlockIn(base(), "c", 0)), "c: | a:a1,a2,a3 | b:b1");
  assert.equal(shape(moveBlockIn(base(), "a", 2)), "b:b1 | c: | a:a1,a2,a3");
});

check("неизвестные ветка или блок — ничего не меняется", () => {
  const blocks = base();
  assert.equal(moveBranchIn(blocks, "a", "zz", "b", 0), blocks);
  assert.equal(moveBranchIn(blocks, "a", "a1", "zz", 0), blocks);
  assert.equal(moveBlockIn(blocks, "zz", 0), blocks);
});

console.log(`\n${passed} проверок пройдено`);
