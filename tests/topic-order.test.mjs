// Порядок уроков в подготовке: свой порядок поверх программы и своих уроков.
import assert from "node:assert";
import { moveTopicOrder, orderedTopics } from "../src/topic-order.js";

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log("✓ " + name);
}

const subj = {
  topics: [{ id: "p-0", name: "Власть" }, { id: "p-1", name: "Государство" }, { id: "p-2", name: "Режим" }],
  custom: [{ id: "p-c-1", name: "Свой урок" }],
};
const names = (list) => list.map((t) => t.name).join(",");

check("без порядка — как раньше: программа, потом свои", () => {
  assert.equal(names(orderedTopics(subj)), "Власть,Государство,Режим,Свой урок");
  assert.equal(orderedTopics(subj)[3].custom, true);
});

check("свой урок можно поставить между программными", () => {
  const order = moveTopicOrder(subj, "p-c-1", "p-1");
  assert.deepEqual(order, ["p-0", "p-c-1", "p-1", "p-2"]);
  assert.equal(names(orderedTopics({ ...subj, order })), "Власть,Свой урок,Государство,Режим");
});

check("вниз — на место цели", () => {
  const order = moveTopicOrder(subj, "p-0", "p-2");
  assert.equal(names(orderedTopics({ ...subj, order })), "Государство,Режим,Власть,Свой урок");
});

check("новый урок после перестановки — в конце", () => {
  const order = ["p-2", "p-0", "p-1", "p-c-1"];
  const more = { ...subj, order, custom: [...subj.custom, { id: "p-c-2", name: "Новый" }] };
  assert.equal(names(orderedTopics(more)), "Режим,Власть,Государство,Свой урок,Новый");
});

check("удалённый урок из порядка просто пропадает", () => {
  const order = ["p-2", "p-x", "p-0", "p-1", "p-c-1"];
  assert.equal(names(orderedTopics({ ...subj, order })), "Режим,Власть,Государство,Свой урок");
});

console.log(`\n${passed} проверок пройдено`);
