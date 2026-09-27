// Смена сетки: задания и настройки уроков переезжают на новые уроки.
import assert from "node:assert";
import { carryLessonSettings, moveHomework, weekdayOf } from "../src/schedule-switch.js";

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log("✓ " + name);
}

// Неделя 28 сентября — 4 октября 2026: пн 28, вт 29, ср 30, чт 1, пт 2, сб 3.
const L = (id, day, start, subjectName, extra) => ({ id, day, start, end: start, subjectName, kind: "lesson", preset: "lyceum10", priority: 1, level: "base", ...extra });
const oldLessons = [
  L("o-eng-tue", "tue", "09:25", "Английский язык (гр. 1)", { priority: 3, level: "prof" }),
  L("o-alg-wed", "wed", "08:30", "Алгебра", { priority: 2, note: "решебник" }),
  L("o-hist-mon", "mon", "12:20", "История"),
  L("o-logic", "mon", "14:05", "Логика"),
];
const newLessons = [
  L("n-eng-mon", "mon", "13:20", "Английский язык (гр. 1)"),
  L("n-eng-fri", "fri", "13:20", "Английский язык (гр. 1)"),
  L("n-alg-wed", "wed", "10:20", "Алгебра"),
  L("n-alg-fri", "fri", "10:20", "Алгебра"),
  L("n-hist-mon", "mon", "12:20", "История"),
];
const today = "2026-09-26";

check("важность и роль переходят по предмету, даже на новый день", () => {
  const out = carryLessonSettings(newLessons, oldLessons);
  const eng = out.filter((e) => e.subjectName.startsWith("Английский"));
  assert.ok(eng.every((e) => e.priority === 3 && e.level === "prof"));
  const alg = out.filter((e) => e.subjectName === "Алгебра");
  assert.ok(alg.every((e) => e.priority === 2 && e.note === "решебник"));
  assert.equal(out.find((e) => e.id === "n-hist-mon").priority, 1);
});

check("задание переезжает на урок своего предмета в ту же неделю — не раньше срока", () => {
  const hw = [{ id: "h1", lessonId: "o-eng-tue", date: "2026-09-29", subjectName: "Английский язык (гр. 1)", text: "Упр. 5" }];
  const { homework, moves } = moveHomework(hw, oldLessons, newLessons, today);
  // Был вторник 29-го; в новой сетке английский в пн 28 и пт 2 — значит, пятница.
  assert.equal(homework[0].date, "2026-10-02");
  assert.equal(homework[0].lessonId, "n-eng-fri");
  assert.deepEqual(moves, [{ id: "h1", subject: "Английский язык (гр. 1)", text: "Упр. 5", from: "2026-09-29", to: "2026-10-02" }]);
});

check("урок на том же месте — меняется только привязка, дата та же", () => {
  const hw = [{ id: "h2", lessonId: "o-hist-mon", date: "2026-09-28", text: "параграф" }];
  const { homework, moves } = moveHomework(hw, oldLessons, newLessons, today);
  assert.equal(homework[0].lessonId, "n-hist-mon");
  assert.equal(homework[0].date, "2026-09-28");
  assert.equal(moves.length, 0);
});

check("в неделе позже урока нет — ближайший раньше, но не раньше сегодня", () => {
  // Алгебра в новой сетке — ср и пт. Срок — суббота 3-го: позже в неделе нет,
  // значит пятница 2-го.
  const hw = [{ id: "h3", lessonId: "o-alg-wed", date: "2026-10-03", text: "№ 12" }];
  assert.equal(moveHomework(hw, oldLessons, newLessons, today).homework[0].date, "2026-10-02");
  // Если и пятница уже прошла — следующая неделя.
  const late = moveHomework(hw, oldLessons, newLessons, "2026-10-03").homework[0];
  assert.equal(late.date, "2026-10-07");
});

check("сделанные, прошедшие и чужие задания не трогаются", () => {
  const hw = [
    { id: "d", lessonId: "o-eng-tue", date: "2026-09-29", done: true },
    { id: "p", lessonId: "o-eng-tue", date: "2026-09-22" },
    { id: "m", lessonId: "sch-manual-1", date: "2026-09-29" },
  ];
  const { homework, moves } = moveHomework(hw, oldLessons, newLessons, today);
  assert.deepEqual(homework, hw);
  assert.equal(moves.length, 0);
});

check("предмет пропал из сетки — задание остаётся как было", () => {
  const hw = [{ id: "h4", lessonId: "o-logic", date: "2026-09-28", text: "эссе" }];
  const { homework, moves } = moveHomework(hw, oldLessons, newLessons, today);
  assert.deepEqual(homework, hw);
  assert.equal(moves.length, 0);
});

check("задание из «Дневника» двигается, только если урока в тот день больше нет", () => {
  const hw = [
    { id: "j1", date: "2026-09-29", subjectName: "Английский язык (гр. 1)", text: "слова" },
    { id: "j2", date: "2026-09-28", subjectName: "История", text: "даты" },
  ];
  const { homework, moves } = moveHomework(hw, oldLessons, newLessons, today);
  assert.equal(homework[0].date, "2026-10-02");
  assert.ok(!homework[0].lessonId);
  assert.equal(homework[1].date, "2026-09-28");
  assert.equal(moves.length, 1);
});

check("повторный перенос ничего не меняет", () => {
  const hw = [{ id: "h1", lessonId: "o-eng-tue", date: "2026-09-29", text: "Упр. 5" }];
  const once = moveHomework(hw, oldLessons, newLessons, today).homework;
  const twice = moveHomework(once, newLessons, newLessons, today);
  assert.deepEqual(twice.homework, once);
  assert.equal(twice.moves.length, 0);
});

check("на урок, куда не ходят (skip), задание не переезжает", () => {
  const withSkip = newLessons.map((e) => (e.id === "n-eng-fri" ? { ...e, skip: true } : e));
  const hw = [{ id: "h1", lessonId: "o-eng-tue", date: "2026-09-29", text: "Упр. 5" }];
  const moved = moveHomework(hw, oldLessons, withSkip, today).homework[0];
  // Пятничный английский помечен «не хожу» — остаётся понедельник той же недели
  // (позже в неделе урока нет, раньше срока — но не раньше сегодня).
  assert.equal(moved.lessonId, "n-eng-mon");
  assert.equal(moved.date, "2026-09-28");
});

check("выбор среди одновременных переносится, только если урок на своём месте", () => {
  const old = [L("a", "tue", "14:05", "Социология", { skip: true }), L("b", "wed", "14:05", "Право", { skip: true })];
  const fresh = [L("a2", "tue", "14:05", "Социология"), L("b2", "thu", "14:05", "Право")];
  const out = carryLessonSettings(fresh, old);
  assert.equal(out[0].skip, true);
  assert.ok(!out[1].skip);
});

check("день недели по дате", () => {
  assert.equal(weekdayOf("2026-09-28"), "mon");
  assert.equal(weekdayOf("2026-10-04"), "sun");
});

console.log("\nвсе проверки смены сетки прошли (" + passed + ")");
