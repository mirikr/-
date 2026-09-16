import assert from "node:assert";
import { search, normalize, excerpt } from "../src/search.js";

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log("✓ " + name);
}

const sources = {
  subjects: [{ id: "law", name: "Право", color: "#8C7326", topics: [{ id: "law-0", name: "Источники права", done: true }] }],
  journal: [{ id: 1, date: "2026-09-01", subjectId: "law", hours: 2, note: "Разбирал правоотношения" }],
  subjectName: () => "Право",
  homework: [{ id: "h1", text: "Конспект по правам человека", subjectName: "Право", date: "2026-09-14" }],
  events: [{ id: "e1", name: "Право · ВсОШ", date: "2026-10-08" }],
  schedule: [
    { id: "s1", subjectName: "Право", teacher: "Иванов И.И.", room: "каб. 401" },
    { id: "s2", subjectName: "Право", teacher: "Иванов И.И.", room: "каб. 401" },
    { id: "s3", subjectName: "История", teacher: "Маслак Е.Н.", room: "каб. 504" },
  ],
  bankTasks: [
    { id: "0810F0", subject: "Обществознание", section: "Право", text: "Выберите верные суждения о правовом государстве и запишите цифры…" },
    { id: "0810AB", subject: "Физика", section: "Механика", text: "Тело движется равноускоренно. Определите ускорение…" },
    { id: "F13F4D", subject: "Физика", section: "Электродинамика", text: "Определите показания амперметра, если цена деления…" },
  ],
  notebookOwners: [{ key: "lyceum:Право", name: "Право", color: "#8C7326" }],
  notebooks: {
    "lyceum:Право": [
      { id: "b1", title: "Блок 1", branches: [{ id: "br1", title: "Ветка", html: "<p>Тут про <b>правопорядок</b> и ещё немного текста</p>" }] },
    ],
  },
};

const groupOf = (res, id) => res.groups.find((g) => g.id === id);

check("ищет во всех разделах сразу", () => {
  const res = search("прав", sources);
  assert.deepStrictEqual(
    res.groups.map((g) => g.id),
    ["topics", "journal", "homework", "events", "schedule", "bank", "notes"]
  );
});

check("короткий запрос ничего не ищет", () => {
  assert.strictEqual(search("п", sources).total, 0);
  assert.strictEqual(search("", sources).total, 0);
});

check("регистр и «ё» не мешают", () => {
  assert.strictEqual(normalize("Ёлка  Ель"), "елка ель");
  assert.strictEqual(search("ПРАВО", sources).total > 0, true);
});

check("один и тот же урок не задваивается", () => {
  const rows = groupOf(search("Иванов", sources), "schedule");
  assert.strictEqual(rows.total, 1, "два одинаковых урока недели — одна находка");
});

check("по преподавателю и кабинету тоже находит", () => {
  assert.strictEqual(groupOf(search("Маслак", sources), "schedule").shown[0].title, "История");
  assert.strictEqual(groupOf(search("504", sources), "schedule").total, 1);
});

// Текст веток лежит разметкой — искать надо по словам, а не по тегам.
check("в тетради ищет по тексту, а теги не считаются", () => {
  const notes = groupOf(search("правопорядок", sources), "notes");
  assert.strictEqual(notes.total, 1);
  assert.match(notes.shown[0].body, /правопорядок/);
  assert.strictEqual(search("<b>", sources).total, 0);
});

check("находка знает, куда за ней идти", () => {
  const notes = groupOf(search("правопорядок", sources), "notes").shown[0];
  assert.strictEqual(notes.screen, "notes");
  assert.strictEqual(notes.notebook, "lyceum:Право");
  assert.strictEqual(groupOf(search("Источники", sources), "topics").shown[0].subjectId, "law");
});

// Ради этого поиск заданий и затевался: номер задания подписан в тренажёре,
// по нему задание и ищут.
check("задание находится по номеру целиком", () => {
  const g = groupOf(search("0810F0", sources), "bank");
  assert.strictEqual(g.total, 1);
  assert.strictEqual(g.shown[0].title, "№ 0810F0");
});

check("регистр в номере не мешает", () => {
  assert.strictEqual(groupOf(search("0810f0", sources), "bank").total, 1);
});

check("задание находится по началу номера", () => {
  const g = groupOf(search("0810", sources), "bank");
  assert.strictEqual(g.total, 2);
});

check("точное совпадение номера идёт первым", () => {
  const g = groupOf(search("0810F0", { ...sources, bankTasks: sources.bankTasks.slice().reverse() }), "bank");
  assert.strictEqual(g.shown[0].title, "№ 0810F0");
});

check("задание находится по тексту условия", () => {
  const g = groupOf(search("равноускоренно", sources), "bank");
  assert.strictEqual(g.total, 1);
  assert.strictEqual(g.shown[0].title, "№ 0810AB");
});

check("находка ведёт в тренажёр и знает предмет с номером", () => {
  const item = groupOf(search("0810F0", sources), "bank").shown[0];
  assert.strictEqual(item.screen, "trainer");
  assert.deepStrictEqual(item.task, { id: "0810F0", subject: "Обществознание" });
  assert.strictEqual(item.note, "Обществознание · Право");
});

check("без описи заданий поиск не ломается", () => {
  const res = search("0810F0", { ...sources, bankTasks: [] });
  assert.strictEqual(groupOf(res, "bank"), undefined);
});

check("кусок текста вокруг найденного", () => {
  const long = "начало " + "слово ".repeat(40) + "иголка " + "хвост ".repeat(40);
  const cut = excerpt(long, "иголка");
  assert.match(cut, /иголка/);
  assert.ok(cut.length < long.length);
  assert.ok(cut.startsWith("…"));
});

check("пустые источники не роняют поиск", () => {
  assert.strictEqual(search("что-нибудь", {}).total, 0);
  assert.strictEqual(search("что-нибудь", undefined).total, 0);
});

console.log("\nвсе проверки поиска прошли (" + passed + ")");
