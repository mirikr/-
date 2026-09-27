// Лента дня в «Лицее»: пары, выбор между одновременными уроками, «сейчас».
import assert from "node:assert";
import { buildDay, dayStatus, mergePairs, openingDay, spanLabel, weekDates } from "../src/school-timeline.js";
import { buildSchedule } from "../src/lyceum-schedule-10.js";

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log("✓ " + name);
}

// Среда юридической школы: история парой, в 14:05 и 14:50 — физкультура,
// социология и конституционное право / ТГП одновременно, вечером онлайн-пара.
const choices = {
  school: "law",
  tiers: { eng: "prof", math: "base" },
  groups: { eng: "yazykova", math: "andropova", rus: "pobortseva", pe: "g2m" },
  specs: ["soc", "law", "econ"],
};
const week = buildSchedule(choices);
const wed = week.filter((e) => e.day === "wed");
const at = (h, m) => h * 60 + m;
const units = (day) => day.blocks.filter((b) => b.type === "unit");

check("два урока истории подряд — одна карточка «пара»", () => {
  const pairs = mergePairs(wed.filter((e) => e.subjectName === "История"));
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0].entries.length, 2);
  assert.equal(pairs[0].start, "09:25");
  assert.equal(pairs[0].end, "11:00");
});

check("физкультура в 14:50 клеится к своей физкультуре, а не к соседней социологии", () => {
  const list = mergePairs(wed.filter((e) => e.start >= "14:05" && e.start < "17:00"));
  const pe = list.find((u) => u.subject === "Физическая культура");
  assert.equal(pe.entries.length, 2);
  assert.ok(pe.entries.every((e) => e.subjectName === "Физическая культура"));
});

check("одновременные уроки — один блок выбора с тремя вариантами", () => {
  const day = buildDay(wed);
  const choice = day.blocks.filter((b) => b.type === "choice");
  assert.equal(choice.length, 1);
  assert.equal(choice[0].options.length, 3);
  // Конституционное право и ТГП у одного преподавателя — один вариант.
  const law = choice[0].options.find((o) => o.names.includes("Конституционное право"));
  assert.deepEqual(law.names, ["Конституционное право", "Теория государства и права"]);
  assert.equal(choice[0].allIds.length, 6);
});

check("выбрали вариант — остальные прячутся, но остаются в блоке «выбрано»", () => {
  const keep = wed.filter((e) => e.subjectName === "Социология").map((e) => e.id);
  const others = wed.filter((e) => e.start >= "14:05" && e.start < "17:00" && !keep.includes(e.id)).map((e) => e.id);
  const marked = wed.map((e) => (others.includes(e.id) ? { ...e, skip: true } : e));
  const day = buildDay(marked);
  assert.equal(day.blocks.filter((b) => b.type === "choice").length, 0);
  const picked = day.blocks.find((b) => b.type === "picked");
  assert.deepEqual(picked.option.names, ["Социология"]);
  assert.equal(picked.others.length, 2);
});

check("в счёте дня выбор — это уроки одного варианта", () => {
  const day = buildDay(wed);
  // 6 уроков до 14:00, 2 урока выбора, 2 вечерних.
  assert.equal(day.count, 10);
});

check("одиночный урок с пометкой skip не пропадает", () => {
  const lone = wed.filter((e) => e.subjectName === "Литература").map((e) => ({ ...e, skip: true }));
  assert.equal(units(buildDay(lone)).length, 1);
});

check("окно перед вечерней парой показано перерывом", () => {
  const day = buildDay(wed);
  const gap = day.blocks.find((b) => b.type === "gap");
  assert.ok(gap);
  assert.equal(spanLabel(gap.minutes), "2 ч 20 мин");
});

check("«сейчас» в 10:30: история идёт, линия — после неё", () => {
  const day = buildDay(wed, at(10, 30));
  const i = day.blocks.findIndex((b) => b.type === "now");
  const before = day.blocks[i - 1];
  assert.equal(before.unit.subject, "История");
  assert.equal(before.state, "current");
  assert.equal(day.blocks[0].state, "past");
  const status = dayStatus(day, at(10, 30));
  assert.equal(status.phase, "lesson");
  assert.equal(status.leftMin, 30);
});

check("до уроков и после — без линии", () => {
  assert.ok(!buildDay(wed, at(6, 0)).blocks.some((b) => b.type === "now"));
  assert.ok(!buildDay(wed, at(21, 0)).blocks.some((b) => b.type === "now"));
  assert.equal(dayStatus(buildDay(wed, at(21, 0)), at(21, 0)).phase, "after");
});

check("в окне линия стоит над перерывом", () => {
  const day = buildDay(wed, at(16, 0));
  const i = day.blocks.findIndex((b) => b.type === "now");
  assert.equal(day.blocks[i + 1].type, "gap");
  assert.equal(dayStatus(day, at(16, 0)).phase, "break");
});

check("расписание открывается на сегодняшнем дне, в скрытое воскресенье — на понедельнике", () => {
  const days = ["mon", "tue", "wed", "thu", "fri", "sat"];
  assert.equal(openingDay("thu", days), "thu");
  assert.equal(openingDay("sun", days), "mon");
  assert.equal(openingDay("sun", [...days, "sun"]), "sun");
});

check("даты недели — с понедельника", () => {
  const dates = weekDates(new Date(2026, 8, 30)); // среда
  assert.equal(dates.mon.getDate(), 28);
  assert.equal(dates.sat.getDate(), 3);
  assert.equal(dates.sun.getDate(), 4);
});

console.log(`\n${passed} проверок пройдено`);
