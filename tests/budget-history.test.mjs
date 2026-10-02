// История нормы часов: правка в «Распределении» не переписывает прошлые дни.
import { dailyFor, goalMinutesFor, withDaily } from "../src/budget-history.js";

let bad = 0;
function check(name, ok, note = "") {
  if (!ok) bad += 1;
  console.log((ok ? "  ok    " : "  FAIL  ") + name + (note ? " — " + note : ""));
}

const start = { daily: { mon: 150, tue: 150, wed: 150, thu: 150, fri: 150, sat: 240, sun: 240 }, alloc: { law: 4 } };
// 2026-10-01 — четверг, 2026-09-24 — прошлый четверг, 2026-10-08 — следующий.
check("без истории — текущая норма для любой даты", goalMinutesFor(start, "2026-09-24") === 150);

const b1 = withDaily(start, "thu", 60, "2026-10-01");
check("с сегодняшнего дня — новая норма", goalMinutesFor(b1, "2026-10-01") === 60);
check("и дальше — новая", goalMinutesFor(b1, "2026-10-08") === 60);
check("прошлый четверг — по старой норме", goalMinutesFor(b1, "2026-09-24") === 150);
check("распределение по предметам не тронуто", b1.alloc.law === 4);

const b2 = withDaily(withDaily(b1, "thu", 90, "2026-10-01"), "fri", 30, "2026-10-01");
check("несколько правок за день — одна запись", b2.past.length === 1, String(b2.past.length));
check("до сегодня — норма до первой правки", goalMinutesFor(b2, "2026-09-25") === 150 && goalMinutesFor(b2, "2026-09-24") === 150);
check("сегодня — последняя правка", goalMinutesFor(b2, "2026-10-01") === 90 && goalMinutesFor(b2, "2026-10-02") === 30);

const b3 = withDaily(b2, "thu", 120, "2026-10-08");
check("правка через неделю — вторая запись", b3.past.length === 2);
check("неделя между правками — по средней норме", goalMinutesFor(b3, "2026-10-01") === 90);
check("до первой правки — по самой старой", goalMinutesFor(b3, "2026-09-24") === 150);
check("после второй — новая", goalMinutesFor(b3, "2026-10-08") === 120);

check("то же значение — ничего не меняется", withDaily(b3, "thu", 120, "2026-10-09") === b3);
check("испорченная история не роняет", goalMinutesFor({ daily: { thu: 30 }, past: [null, { until: 5 }, "x"] }, "2026-10-01") === 30);
check("дата объектом Date", goalMinutesFor(b1, new Date(2026, 8, 24)) === 150);
check("dailyFor отдаёт норму целиком", dailyFor(b3, "2026-09-24").sat === 240);

if (bad) {
  console.log(bad + " проверок не прошло");
  process.exit(1);
}
console.log("История нормы часов: всё в порядке");
