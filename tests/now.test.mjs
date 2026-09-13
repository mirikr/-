import assert from "node:assert";
import { bellState, lessonsAt, periodsOfDay, minutesOfTime, periodLabel, minutesWord, nextSchoolDay } from "../src/lyceum-now.js";

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log("✓ " + name);
}

const at = (h, m) => h * 60 + m;

check("в воскресенье звонков нет", () => {
  assert.strictEqual(bellState("sun", at(10, 0)).phase, "off");
});

check("посреди урока видно, сколько осталось", () => {
  const s = bellState("mon", at(10, 30));
  assert.strictEqual(s.phase, "lesson");
  assert.strictEqual(s.current.n, "3");
  assert.strictEqual(s.leftMin, 30);
  assert.strictEqual(s.next.n, "4");
});

check("на перемене видно, до какого урока ждать", () => {
  const s = bellState("mon", at(11, 10));
  assert.strictEqual(s.phase, "break");
  assert.strictEqual(s.next.n, "4");
  assert.strictEqual(s.leftMin, 10);
  assert.strictEqual(s.long, false);
});

check("полтора часа до вечерней пары — не перемена", () => {
  const s = bellState("mon", at(17, 0));
  assert.strictEqual(s.phase, "break");
  assert.strictEqual(s.next.n, "e1");
  assert.strictEqual(s.long, true);
});

check("до первого звонка и после последнего", () => {
  assert.strictEqual(bellState("mon", at(7, 30)).phase, "before");
  assert.strictEqual(bellState("mon", at(7, 30)).leftMin, 60);
  assert.strictEqual(bellState("mon", at(21, 0)).phase, "after");
});

check("в субботу день короче, чем в понедельник", () => {
  assert.ok(periodsOfDay("sat").length < periodsOfDay("mon").length);
  assert.ok(periodsOfDay("sat").length > 0);
});

// Ради этого всё и затевалось: в одну и ту же клетку у разных школ разные
// уроки, и видно должно быть оба — чтобы ответить другу, у которого своё.
check("в одной клетке видно уроки всех школ, а не только свои", () => {
  const rows = lessonsAt("mon", 5);
  const names = rows.map((r) => r.subject);
  assert.ok(names.includes("Геометрия"), names.join(", "));
  assert.ok(names.includes("История"), names.join(", "));
  const geom = rows.find((r) => r.subject === "Геометрия");
  assert.strictEqual(geom.items.length, 3);
  assert.ok(geom.items.every((i) => i.teacher && i.room));
});

check("у урока всей параллели не пишется, кому он", () => {
  const rows = lessonsAt("mon", 2);
  const talk = rows.find((r) => r.subject === "Разговоры о важном");
  assert.ok(talk);
  assert.strictEqual(talk.who, "");
});

check("время и подписи", () => {
  assert.strictEqual(minutesOfTime("08:30"), 510);
  assert.strictEqual(minutesOfTime("нет"), null);
  assert.strictEqual(periodLabel("3"), "3-й урок");
  assert.strictEqual(periodLabel("e1"), "вечерняя пара");
  assert.strictEqual(minutesWord(1), "минута");
  assert.strictEqual(minutesWord(3), "минуты");
  assert.strictEqual(minutesWord(11), "минут");
  assert.strictEqual(minutesWord(25), "минут");
});

check("в выходной видно, когда следующие уроки", () => {
  const sun = nextSchoolDay("sun");
  assert.strictEqual(sun.day, "mon");
  assert.strictEqual(sun.when, "завтра");
  assert.strictEqual(sun.first.start, "08:30");
  // После субботы следующий учебный день — понедельник, а не воскресенье.
  assert.strictEqual(nextSchoolDay("sat").day, "mon");
  assert.strictEqual(nextSchoolDay("sat").when, "в понедельник");
});

console.log("\nвсе проверки «сейчас» прошли (" + passed + ")");
