import assert from "node:assert";
import { ORDERS, hashOf, newSeed, orderName, orderTasks } from "../src/trainer-order.js";

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log("✓ " + name);
}

const tasks = [
  { id: "A1", section: "Механика" },
  { id: "B2", section: "Оптика" },
  { id: "C3", section: "Механика" },
  { id: "D4", section: "Электродинамика" },
  { id: "E5", section: "Оптика" },
];
const ids = (list) => list.map((t) => t.id).join(" ");

check("по умолчанию порядок банка не трогаем", () => {
  assert.strictEqual(ids(orderTasks(tasks, "")), "A1 B2 C3 D4 E5");
  assert.strictEqual(ids(orderTasks(tasks, "неизвестный")), "A1 B2 C3 D4 E5");
});

check("исходный набор не портится", () => {
  orderTasks(tasks, "shuffle", { seed: 5 });
  orderTasks(tasks, "section");
  assert.strictEqual(ids(tasks), "A1 B2 C3 D4 E5");
});

check("по темам задания собираются в разделы", () => {
  const out = orderTasks(tasks, "section");
  assert.strictEqual(ids(out), "A1 C3 B2 E5 D4");
});

check("внутри раздела порядок банка сохраняется", () => {
  const out = orderTasks(tasks, "section").filter((t) => t.section === "Оптика");
  assert.strictEqual(ids(out), "B2 E5");
});

check("вперемешку — это другой порядок, но тот же набор", () => {
  const out = orderTasks(tasks, "shuffle", { seed: 7 });
  assert.strictEqual(out.length, tasks.length);
  assert.deepStrictEqual([...out].map((t) => t.id).sort(), ["A1", "B2", "C3", "D4", "E5"]);
  assert.notStrictEqual(ids(out), ids(tasks));
});

check("при одном зерне порядок повторяется", () => {
  assert.strictEqual(ids(orderTasks(tasks, "shuffle", { seed: 7 })), ids(orderTasks(tasks, "shuffle", { seed: 7 })));
});

check("другое зерно — другой порядок", () => {
  // Нужное свойство: «перемешать заново» действительно перемешивает. На пяти
  // заданиях совпадение возможно случайно, поэтому ищем среди нескольких зёрен.
  const first = ids(orderTasks(tasks, "shuffle", { seed: 1 }));
  const other = [2, 3, 4, 5, 6].some((s) => ids(orderTasks(tasks, "shuffle", { seed: s })) !== first);
  assert.ok(other, "ни одно другое зерно не изменило порядок");
});

check("сначала нерешённые", () => {
  const solved = new Set(["A1", "B2"]);
  assert.strictEqual(ids(orderTasks(tasks, "fresh", { solved })), "C3 D4 E5 A1 B2");
});

check("без списка решённых порядок не меняется", () => {
  assert.strictEqual(ids(orderTasks(tasks, "fresh")), "A1 B2 C3 D4 E5");
});

check("пустой набор не роняет сортировку", () => {
  assert.strictEqual(orderTasks([], "shuffle", { seed: 3 }).length, 0);
  assert.strictEqual(orderTasks(null, "section").length, 0);
});

check("хэш одинаков для одной строки и разный для разных", () => {
  assert.strictEqual(hashOf("A1", 5), hashOf("A1", 5));
  assert.notStrictEqual(hashOf("A1", 5), hashOf("A2", 5));
  assert.notStrictEqual(hashOf("A1", 5), hashOf("A1", 6));
  assert.ok(Number.isInteger(hashOf("A1", 5)) && hashOf("A1", 5) >= 0);
});

check("зерно всегда положительное", () => {
  for (let i = 0; i < 50; i += 1) assert.ok(newSeed() > 0);
});

check("у каждого порядка есть название", () => {
  assert.strictEqual(ORDERS.length, 4);
  assert.strictEqual(orderName("shuffle"), "Вперемешку");
  assert.strictEqual(orderName(""), "По порядку");
  assert.strictEqual(orderName("чего-то нет"), "По порядку");
});

console.log("\nвсе проверки порядка заданий прошли (" + passed + ")");
