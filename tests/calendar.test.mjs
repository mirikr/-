import assert from "node:assert";
import { buildIcs } from "../src/calendar.js";

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

console.log(`\nвсе проверки календаря прошли (${passed})`);
