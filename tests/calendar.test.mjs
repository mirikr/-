import assert from "node:assert";
import { buildIcs } from "../src/calendar.js";
import { sequenceItems } from "../src/calendar-seq.js";

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log("✓ " + name);
}

check("событие на весь день остаётся всесуточным", () => {
  const ics = buildIcs([{ uid: "e1", title: "Олимпиада", date: "2026-10-01", alarmDaysBefore: 3 }]);
  assert.match(ics, /DTSTART;VALUE=DATE:20261001/);
  assert.match(ics, /DTEND;VALUE=DATE:20261002/);
  assert.match(ics, /TRIGGER:-P3D/);
});

check("напоминание со временем встаёт на свой час", () => {
  const ics = buildIcs([
    { uid: "study-2026-09-12", title: "Позаниматься", date: "2026-09-12", time: "19:00", minutes: 60 },
  ]);
  assert.match(ics, /DTSTART:20260912T190000/);
  assert.match(ics, /DTEND:20260912T200000/);
  // Будильник звонит в час напоминания, а не за сутки.
  assert.match(ics, /TRIGGER:-PT0M/);
  assert.doesNotMatch(ics, /VALUE=DATE/);
});

check("запятая экранируется, разметка из конспекта вычищается", () => {
  const ics = buildIcs([
    { uid: "e2", title: "Этап, региональный", date: "2026-10-01", description: "<b>первый</b>\nвторой" },
  ]);
  assert.match(ics, /SUMMARY:Этап\\, региональный/);
  // Описание приходит из конспекта, поэтому теги убираются, а строки склеиваются.
  assert.match(ics, /DESCRIPTION:первый второй/);
});

check("у события есть номер версии и время правки", () => {
  const ics = buildIcs([{ uid: "e3", title: "Олимпиада", date: "2026-10-01", seq: 412345, modified: Date.UTC(2026, 8, 25, 6, 30) }]);
  assert.match(ics, /SEQUENCE:412345/);
  assert.match(ics, /LAST-MODIFIED:20260925T063000Z/);
});

check("событие со временем — на свой час, напоминание за сутки", () => {
  const ics = buildIcs([{ uid: "e4", title: "Олимпиада", date: "2026-10-01", time: "10:00", minutes: 180, alarmDaysBefore: 1 }]);
  assert.match(ics, /DTSTART:20261001T100000/);
  assert.match(ics, /DTEND:20261001T130000/);
  assert.match(ics, /TRIGGER:-P1D/);
});

check("номер версии растёт только при правке", () => {
  const t0 = Date.UTC(2026, 8, 25, 6, 0);
  const a = sequenceItems([{ uid: "x", title: "Олимпиада", date: "2026-10-01" }], {}, t0);
  const b = sequenceItems([{ uid: "x", title: "Олимпиада", date: "2026-10-01" }], a.memory, t0 + 3600e3);
  assert.equal(b.items[0].seq, a.items[0].seq, "без правки номер тот же");
  assert.equal(b.items[0].modified, a.items[0].modified, "и время правки то же");
  const c = sequenceItems([{ uid: "x", title: "Олимпиада", date: "2026-10-02" }], b.memory, t0 + 7200e3);
  assert.ok(c.items[0].seq > b.items[0].seq, "дату поменяли — номер вырос");
  // Две правки в одну минуту — номер всё равно растёт.
  const d = sequenceItems([{ uid: "x", title: "Олимпиада", date: "2026-10-03" }], c.memory, t0 + 7200e3);
  assert.ok(d.items[0].seq > c.items[0].seq);
});

check("другое устройство без памяти не уменьшает номер", () => {
  const t0 = Date.UTC(2026, 8, 25, 6, 0);
  const a = sequenceItems([{ uid: "x", title: "Экзамен", date: "2026-10-01" }], {}, t0);
  const other = sequenceItems([{ uid: "x", title: "Экзамен", date: "2026-10-05" }], {}, t0 + 60e3);
  assert.ok(other.items[0].seq >= a.items[0].seq);
});

check("память не копит удалённые события", () => {
  const a = sequenceItems([{ uid: "x", title: "А", date: "2026-10-01" }, { uid: "y", title: "Б", date: "2026-10-01" }], {});
  const b = sequenceItems([{ uid: "x", title: "А", date: "2026-10-01" }], a.memory);
  assert.deepEqual(Object.keys(b.memory), ["x"]);
});

console.log(`\nвсе проверки календаря прошли (${passed})`);
