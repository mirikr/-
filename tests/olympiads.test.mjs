import assert from "node:assert";
import { VOSH, buildOlympiads, voshMonths, humanDate, VOSH_PRESET_ID } from "../src/lyceum-olympiads.js";

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log("✓ " + name);
}

const byId = (id) => VOSH.find((o) => o.id === id);

check("график перенесён целиком: 27 предметов, все с датой", () => {
  assert.strictEqual(VOSH.length, 27);
  assert.ok(VOSH.every((o) => /^\d{4}-\d{2}-\d{2}$/.test(o.date)), "у всех есть дата");
  assert.strictEqual(new Set(VOSH.map((o) => o.id)).size, VOSH.length, "id не повторяются");
});

// В графике дата стоит один раз на несколько предметов подряд — объединённой
// ячейкой. Если её не размножить, у соседей по строке даты не будет вовсе.
check("предметы одного дня получили общую дату", () => {
  assert.strictEqual(byId("es").date, "2026-09-18");
  assert.strictEqual(byId("zh").date, "2026-09-18");
  assert.strictEqual(byId("it").date, "2026-09-18");
  assert.strictEqual(byId("pe").date, "2026-09-21");
  assert.strictEqual(byId("econ").date, "2026-09-21");
  assert.strictEqual(byId("hist").date, "2026-09-25");
  assert.strictEqual(byId("soc").date, "2026-10-02");
  assert.strictEqual(byId("de").date, "2026-10-12");
});

check("итоги там, где лицей их публикует", () => {
  assert.strictEqual(byId("law").results, "2026-10-16");
  assert.strictEqual(byId("law").place, "Лицей КЭО");
  // Олимпиады на платформе лицей не проверяет — итогов в графике нет.
  assert.strictEqual(byId("astro").results, "");
  assert.strictEqual(byId("astro").place, "Сириус.Курсы");
  assert.strictEqual(byId("chem").place, "Сириус.Курсы");
  assert.strictEqual(byId("inf-ai").place, "Сириус.Курсы");
});

check("младшие классы в список не попали", () => {
  const names = VOSH.map((o) => o.name).join(" | ");
  assert.ok(!/4 класс|4-6|5-6/.test(names), names);
});

check("отмеченная олимпиада становится записью расписания", () => {
  const rows = buildOlympiads(["law"]);
  assert.strictEqual(rows.length, 1);
  const row = rows[0];
  assert.strictEqual(row.kind, "exam");
  assert.strictEqual(row.examKind, "olympiad");
  assert.strictEqual(row.date, "2026-10-08");
  assert.strictEqual(row.day, "thu");
  assert.strictEqual(row.start, "14:00");
  assert.strictEqual(row.priority, 3);
  assert.strictEqual(row.preset, VOSH_PRESET_ID);
  assert.match(row.subjectName, /Право/);
  assert.match(row.place, /итоги 16 октября/);
});

check("неотмеченные не добавляются", () => {
  assert.strictEqual(buildOlympiads([]).length, 0);
  assert.strictEqual(buildOlympiads(["нет-такой"]).length, 0);
  assert.strictEqual(buildOlympiads(["law", "astro", "soc"]).length, 3);
});

check("список разбит по месяцам, в порядке дат", () => {
  const months = voshMonths();
  assert.deepStrictEqual(months.map((m) => m.title), ["Сентябрь", "Октябрь"]);
  const all = months.flatMap((m) => m.items.map((i) => i.date));
  assert.deepStrictEqual([...all], [...all].sort(), "даты идут по возрастанию");
  assert.strictEqual(all.length, VOSH.length);
});

check("дата пишется по-человечески", () => {
  assert.strictEqual(humanDate("2026-10-08"), "8 октября");
  assert.strictEqual(humanDate("2026-09-18"), "18 сентября");
});

console.log("\nвсе проверки олимпиад прошли (" + passed + ")");
