import assert from "node:assert";
import {
  cheapestGoal, dayCounts, goalFor, offerFor, subjectsByTask, taskWord, trainerDays, trainerEntries,
} from "../src/trainer-time.js";

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log("✓ " + name);
}

const bank = [
  { name: "Обществознание", ids: ["S1", "S2", "S3"] },
  { name: "Физика", ids: ["P1", "P2"] },
  { name: "Информатика", ids: ["I1"] },
];
const byTask = subjectsByTask(bank);

const at = (date, taskId, seconds) => ({ at: date + "T10:00:00.000Z", taskId, seconds, ok: true });

check("порог у предметов свой", () => {
  assert.strictEqual(goalFor("Обществознание"), 15);
  assert.strictEqual(goalFor("Физика"), 5);
  assert.strictEqual(goalFor("Информатика"), 5);
  // Чужой предмет — общий порог, а не ноль: иначе серия продлевалась бы сама.
  assert.strictEqual(goalFor("Астрономия"), 15);
});

check("время и задания собираются по дням и предметам", () => {
  const days = trainerDays([at("2026-09-16", "S1", 60), at("2026-09-16", "P1", 120), at("2026-09-15", "S2", 30)], byTask);
  assert.strictEqual(days.length, 3);
  const phys = days.find((d) => d.subject === "Физика");
  assert.strictEqual(phys.seconds, 120);
  assert.strictEqual(phys.need, 5);
});

// Одно и то же задание, отвеченное трижды, — это одно задание.
check("повторные попытки не надувают счёт", () => {
  const days = trainerDays([at("2026-09-16", "P1", 60), at("2026-09-16", "P1", 40), at("2026-09-16", "P2", 20)], byTask);
  assert.strictEqual(days[0].solved, 2);
  assert.strictEqual(days[0].seconds, 120);
});

check("чужие и порченые записи не в счёт", () => {
  const days = trainerDays(
    [at("2026-09-16", "НЕТ ТАКОГО", 60), { taskId: "P1", seconds: 10 }, at("2026-09-16", "P1", -5)],
    byTask
  );
  assert.strictEqual(days.length, 1);
  assert.strictEqual(days[0].seconds, 0);
});

check("запись для дневника — в часах и со своим предметом", () => {
  const days = trainerDays([at("2026-09-16", "P1", 1800), at("2026-09-16", "P2", 1800)], byTask);
  const [entry] = trainerEntries(days, () => "");
  assert.strictEqual(entry.hours, 1);
  assert.strictEqual(entry.date, "2026-09-16");
  assert.strictEqual(entry.subjectId, "Физика");
  assert.strictEqual(entry.note, "Тренажёр: 2 задания");
  assert.strictEqual(entry.fromTrainer, true);
});

check("предмет дневника берётся свой, если он заведён", () => {
  const days = trainerDays([at("2026-09-16", "P1", 60)], byTask);
  const [entry] = trainerEntries(days, (name) => (name === "Физика" ? "my-phys" : ""));
  assert.strictEqual(entry.subjectId, "my-phys");
});

// Ради этого всё и затевалось: пять заданий по физике — это занятие,
// а три — ещё нет.
check("серия продлевается только взятым порогом", () => {
  const few = trainerDays(["P1", "P2", "P2"].map((id, i) => at("2026-09-16", id, 60 + i)), byTask);
  assert.strictEqual(dayCounts(few, "2026-09-16"), false);
  const enough = trainerDays(["P1", "P2", "S1", "S2", "S3"].map((id) => at("2026-09-16", id, 60)), byTask);
  assert.strictEqual(dayCounts(enough, "2026-09-16"), false, "порог считается по одному предмету, а не вповалку");
  const five = trainerDays(["I1", "P1", "P2", "S1", "S2"].map((id) => at("2026-09-16", id, 60)), byTask);
  assert.strictEqual(dayCounts(five, "2026-09-16"), false);
});

check("пять заданий по физике день засчитывают", () => {
  const bigger = subjectsByTask([{ name: "Физика", ids: ["P1", "P2", "P3", "P4", "P5"] }]);
  const days = trainerDays(["P1", "P2", "P3", "P4", "P5"].map((id) => at("2026-09-16", id, 60)), bigger);
  assert.strictEqual(days[0].solved, 5);
  assert.strictEqual(dayCounts(days, "2026-09-16"), true);
  assert.strictEqual(dayCounts(days, "2026-09-15"), false);
});

check("предложение считает остаток по начатому предмету", () => {
  const days = trainerDays([at("2026-09-16", "P1", 60), at("2026-09-16", "P2", 60)], byTask);
  const offer = offerFor(days, "2026-09-16", "Обществознание", bank);
  assert.strictEqual(offer.subject, "Физика");
  assert.strictEqual(offer.left, 3);
  assert.strictEqual(offer.need, 5);
});

check("если сегодня не решали, предмет подсказывает тренажёр", () => {
  const offer = offerFor([], "2026-09-16", "Информатика", bank);
  assert.deepStrictEqual(offer, { subject: "Информатика", solved: 0, need: 5, left: 5 });
});

// Тому, кто ещё не открывал тренажёр, предложение нужнее всего — оно обязано
// быть и без всякой истории.
check("без истории предложение всё равно есть", () => {
  const offer = offerFor([], "2026-09-16", "", bank);
  assert.deepStrictEqual(offer, { subject: "Обществознание", solved: 0, need: 15, left: 15 });
  assert.strictEqual(offerFor([], "2026-09-16", "", []), null);
});

check("рядом называется предмет с порогом пониже", () => {
  const cheap = cheapestGoal(bank, "Обществознание");
  assert.strictEqual(cheap.need, 5);
  assert.deepStrictEqual(cheap.subjects, ["Физика", "Информатика"]);
  assert.strictEqual(cheapestGoal(bank, "Физика").need, 5);
  assert.strictEqual(cheapestGoal([{ name: "Физика", ids: [] }], "Физика"), null);
});

check("счёт заданий склоняется по-русски", () => {
  assert.strictEqual(taskWord(1), "задание");
  assert.strictEqual(taskWord(3), "задания");
  assert.strictEqual(taskWord(11), "заданий");
  assert.strictEqual(taskWord(21), "задание");
  assert.strictEqual(taskWord(0), "заданий");
});

console.log("\nвсе проверки учёта тренажёра прошли (" + passed + ")");
