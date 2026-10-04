// Журнал учителя: даты из расписания, отметки, что выложить ученикам.
import assert from "node:assert";
import { classStats, isAbsent, markGrade, sortStudents, studentName, studentStats, dateAverage, daysFromSchedule, lessonDates, markPublished, markValue, newGradebook, parseStudents, payloadFor, pendingChanges, studentAverage } from "../src/gradebook.js";

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log("✓ " + name);
}

const schedule = [
  { day: "mon", subjectName: "Право", kind: "lesson" },
  { day: "thu", subjectName: "Право", kind: "lesson" },
  { day: "thu", subjectName: "Право", kind: "lesson" },
  { day: "wed", subjectName: "Право", kind: "exam" },
  { day: "fri", subjectName: "История", kind: "lesson" },
  { day: "tue", subjectName: "Право", kind: "lesson", skip: true },
];

check("дни предмета — из расписания, без экзаменов и пропущенных", () => {
  assert.deepEqual(daysFromSchedule(schedule, "право"), ["mon", "thu"]);
  assert.deepEqual(daysFromSchedule(schedule, ""), []);
});

check("даты уроков: дни недели в периоде, плюс добавленные, минус скрытые", () => {
  const gb = { days: ["mon", "thu"], from: "2026-10-01", to: "2026-10-15", extra: ["2026-10-07"], skip: ["2026-10-12"] };
  assert.deepEqual(lessonDates(gb), ["2026-10-01", "2026-10-05", "2026-10-07", "2026-10-08", "2026-10-15"]);
});

check("новый журнал: дни из расписания, период — месяц, шкала 100", () => {
  const gb = newGradebook("Право", schedule, new Date(2026, 9, 4));
  assert.deepEqual(gb.days, ["mon", "thu"]);
  assert.equal(gb.from, "2026-10-01");
  assert.equal(gb.to, "2026-10-31");
  assert.equal(gb.scale, 100);
});

check("отметка: в пределах шкалы, запятая — тоже", () => {
  assert.equal(markValue("87", 100), 87);
  assert.equal(markValue("87,5", 100), 87.5);
  assert.equal(markValue("101", 100), null);
  assert.equal(markValue("5", 5), 5);
  assert.equal(markValue("6", 5), null);
  assert.equal(markValue("", 100), null);
  assert.equal(markValue("н", 100), null);
});

const gb = {
  id: "g1", name: "10Б · Право", subject: "Право", days: ["mon"], from: "2026-10-01", to: "2026-10-31", scale: 100,
  students: [
    { id: "s1", name: "Иванов", email: "IVANOV@mail.ru" },
    { id: "s2", name: "Петрова", email: "petrova@mail.ru" },
    { id: "s3", name: "Без почты", email: "" },
  ],
  marks: { s1: { "2026-10-05": "90", "2026-10-12": "70" }, s2: { "2026-10-05": "100" }, s3: { "2026-10-05": "60" } },
  published: {},
  extra: [], skip: [],
};

check("средние: по ученику и по уроку — среднее арифметическое", () => {
  assert.equal(studentAverage(gb, "s1"), 80);
  assert.equal(dateAverage(gb, "2026-10-05"), (90 + 100 + 60) / 3);
});

check("выложить: только с почтой; потом — только изменения и стёртое", () => {
  const first = pendingChanges(gb);
  assert.deepEqual(first.map((c) => c.action + ":" + c.email + ":" + c.date + ":" + (c.value ?? "")).sort(), [
    "put:ivanov@mail.ru:2026-10-05:90",
    "put:ivanov@mail.ru:2026-10-12:70",
    "put:petrova@mail.ru:2026-10-05:100",
  ]);
  let next = markPublished(gb, first);
  assert.equal(pendingChanges(next).length, 0);
  // Исправили одну, стёрли другую.
  next = { ...next, marks: { ...next.marks, s1: { "2026-10-05": "95", "2026-10-12": "" } } };
  const second = pendingChanges(next);
  assert.deepEqual(second.map((c) => c.action + ":" + c.date + ":" + (c.value ?? "")).sort(), ["del:2026-10-12:", "put:2026-10-05:95"]);
  next = markPublished(next, second);
  assert.deepEqual(next.published, { "s1|2026-10-05": 95, "s2|2026-10-05": 100 });
  // Скрыли дату — выложенная отметка за неё убирается.
  const hidden = { ...next, skip: ["2026-10-05"] };
  assert.deepEqual(pendingChanges(hidden).map((c) => c.action + ":" + c.key).sort(), ["del:s1|2026-10-05", "del:s2|2026-10-05"]);
});

check("что увидит ученик: урок по 100-балльной или оценкой", () => {
  assert.deepEqual(payloadFor(gb, "2026-10-05", 90), { kind: "lesson", subject: "Право", title: "Урок 05.10", date: "2026-10-05", journal: "10Б · Право", key: "gb:g1:2026-10-05", scale: "points", score: 90, max: 100 });
  assert.equal(payloadFor({ ...gb, scale: 5 }, "2026-10-05", 5).grade, 5);
});

check("список учеников из вставленного текста", () => {
  const list = parseStudents("Иванов Иван, Ivanov@Mail.ru\npetrova@mail.ru\tПетрова Анна\nСидоров\n\n");
  assert.deepEqual(list, [
    { last: "Иванов", first: "Иван", email: "ivanov@mail.ru" },
    { last: "Петрова", first: "Анна", email: "petrova@mail.ru" },
    { last: "Сидоров", first: "", email: "" },
  ]);
  assert.equal(studentName({ last: "Иванов", first: "Иван" }), "Иванов Иван");
  assert.equal(studentName({ name: "Старая запись" }), "Старая запись");
  assert.equal(studentName({ email: "a@b.ru" }), "a@b.ru");
  assert.deepEqual(sortStudents([{ last: "Петрова" }, { last: "Иванов" }, { last: "Сидоров" }]).map((x) => x.last), ["Иванов", "Петрова", "Сидоров"]);
});

check("статистика: средний балл, средняя оценка, пропуски, распределение", () => {
  const g = { ...gb, marks: { s1: { "2026-10-05": "95", "2026-10-12": "72", "2026-10-19": "40" }, s2: { "2026-10-05": "55" }, s3: {} } };
  assert.equal(markGrade(g, 95), 5);
  assert.equal(markGrade(g, 69), 3);
  assert.equal(markGrade(g, 49), 2);
  const st = studentStats(g, "s1", undefined, "2026-10-20");
  assert.equal(st.count, 3);
  assert.equal(st.avg, (95 + 72 + 40) / 3);
  assert.equal(st.avgGrade, (5 + 4 + 2) / 3);
  assert.equal(st.missing, 0);
  assert.deepEqual(st.dist, { 5: 1, 4: 1, 3: 0, 2: 1 });
  const s2 = studentStats(g, "s2", undefined, "2026-10-20");
  assert.equal(s2.missing, 2);
  const cls = classStats(g, undefined, "2026-10-20");
  assert.equal(cls.count, 4);
  assert.equal(cls.avgGrade, (5 + 4 + 2 + 3) / 4);
  assert.deepEqual(cls.dist, { 5: 1, 4: 1, 3: 1, 2: 1 });
  assert.equal(cls.best.id, "s1");
  assert.deepEqual(cls.risk.map((x) => x.id), []);
  const five = classStats({ ...g, scale: 5, marks: { s1: { "2026-10-05": "2" }, s2: { "2026-10-05": "5" } } });
  assert.equal(five.avg, null);
  assert.deepEqual(five.risk.map((x) => x.id), ["s1"]);
});

check("«н» — не был: уходит ученику, в средние не входит, считается отдельно", () => {
  assert.ok(isAbsent("н") && isAbsent(" Н ") && isAbsent("нб") && isAbsent("н/б") && !isAbsent("5"));
  const g = { ...gb, marks: { s1: { "2026-10-05": "н", "2026-10-12": "80" }, s2: {}, s3: {} } };
  const st = studentStats(g, "s1", undefined, "2026-10-20");
  assert.equal(st.absent, 1);
  assert.equal(st.avg, 80);
  assert.equal(st.missing, 1);
  const ch = pendingChanges(g);
  assert.deepEqual(ch.map((c) => c.date + ":" + c.value).sort(), ["2026-10-05:н", "2026-10-12:80"]);
  assert.equal(payloadFor(g, "2026-10-05", "н").scale, "absent");
  const done = markPublished(g, ch);
  assert.equal(pendingChanges(done).length, 0);
});

console.log(`\n${passed} проверок пройдено`);
