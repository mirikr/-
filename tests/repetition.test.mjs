import assert from "node:assert";
import { dueTopics, overdueDays, intervalFor, topicHistory, reviewHours, agoWord, INTERVALS } from "../src/repetition.js";

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log("✓ " + name);
}

const subjects = (topics) => [{ id: "law", name: "Право", color: "#8C7326", topics }];
const T = (id, done = true) => ({ id, name: "Тема " + id, done, duration: 45 });
const J = (date, lessonId, review) => ({ id: date + lessonId, date, subjectId: "law", lessonId, auto: true, review });

check("непройденную тему повторять не предлагают", () => {
  assert.strictEqual(dueTopics(subjects([T("a", false)]), [J("2026-09-01", "a")], "2026-09-30").length, 0);
});

check("пройденная тема ждёт три дня и только потом просится", () => {
  const s = subjects([T("a")]);
  const j = [J("2026-09-10", "a")];
  assert.strictEqual(dueTopics(s, j, "2026-09-12").length, 0, "через два дня ещё рано");
  assert.strictEqual(dueTopics(s, j, "2026-09-13").length, 1, "на третий день пора");
  assert.strictEqual(dueTopics(s, j, "2026-09-13")[0].overdue, 0);
});

check("после повторения интервал растёт", () => {
  const s = subjects([T("a")]);
  const once = [J("2026-09-10", "a"), J("2026-09-13", "a", true)];
  assert.strictEqual(intervalFor(0), 3);
  assert.strictEqual(intervalFor(1), 7);
  // Через три дня после первого повторения ещё рано — теперь ждать неделю.
  assert.strictEqual(dueTopics(s, once, "2026-09-16").length, 0);
  assert.strictEqual(dueTopics(s, once, "2026-09-20").length, 1);
});

check("лестница не обрывается: после последней ступени интервал держится", () => {
  assert.strictEqual(intervalFor(99), INTERVALS[INTERVALS.length - 1]);
});

check("самая запущенная тема идёт первой", () => {
  const s = subjects([T("a"), T("b"), T("c")]);
  const j = [J("2026-09-01", "a"), J("2026-09-20", "b"), J("2026-09-10", "c")];
  const rows = dueTopics(s, j, "2026-09-30");
  assert.deepStrictEqual(rows.map((r) => r.topicId), ["a", "c", "b"]);
  assert.strictEqual(rows[0].overdue, 26);
});

check("список можно обрезать", () => {
  const s = subjects([T("a"), T("b"), T("c")]);
  const j = [J("2026-09-01", "a"), J("2026-09-02", "b"), J("2026-09-03", "c")];
  assert.strictEqual(dueTopics(s, j, "2026-09-30", 2).length, 2);
});

// Записи, сделанные до появления повторений, в дневнике уже лежат — и должны
// работать без всякого переноса данных.
check("темы, пройденные в прошлых версиях, считаются как есть", () => {
  const s = subjects([T("a")]);
  const j = [{ id: 1, date: "2026-05-01", subjectId: "law", lessonId: "a", auto: true }];
  assert.strictEqual(topicHistory(j, "a").reviews, 0);
  assert.strictEqual(dueTopics(s, j, "2026-09-01").length, 1);
});

check("тема без записи в дневнике не ломает расчёт", () => {
  assert.strictEqual(overdueDays([], "нет", "2026-09-01"), null);
  assert.strictEqual(dueTopics(subjects([T("a")]), [], "2026-09-01").length, 0);
});

check("часы повторения и подписи", () => {
  assert.strictEqual(reviewHours(45), 0.25);
  assert.strictEqual(reviewHours(180), 1);
  assert.strictEqual(agoWord(0), "сегодня");
  assert.strictEqual(agoWord(1), "вчера");
  assert.strictEqual(agoWord(2), "2 дня назад");
  assert.strictEqual(agoWord(11), "11 дней назад");
  assert.strictEqual(agoWord(21), "21 день назад");
});

console.log("\nвсе проверки повторений прошли (" + passed + ")");
