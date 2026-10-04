// Результаты: шкалы подсчёта и лента «только для своего аккаунта».
import assert from "node:assert";
import { readFile } from "node:fs/promises";
import { blankResult, cleanResult, gradeFromPercent, gradeOf, overallStats, partsTotal, subjectSummary, summarize } from "../src/results-model.js";
import { decryptFeed, encryptFor, recipientCode } from "../src/results-feed.js";

let passed = 0;
async function check(name, fn) {
  await fn();
  passed += 1;
  console.log("✓ " + name);
}

await check("баллы из максимума", () => {
  const s = summarize({ scale: "points", score: 34, max: 50 });
  assert.equal(s.main, "34 из 50");
  assert.equal(s.sub, "68 %");
  assert.equal(s.percent, 68);
});

await check("первичные и вторичные: процент — по вторичным", () => {
  const s = summarize({ scale: "primsec", primary: 25, primaryMax: 29, secondary: 82, secondaryMax: 100 });
  assert.equal(s.main, "82 из 100");
  assert.equal(s.sub, "первичных 25 из 29 · 82 %");
  assert.equal(s.percent, 82);
  const onlyPrimary = summarize({ scale: "primsec", primary: 20, primaryMax: 40 });
  assert.equal(onlyPrimary.main, "20 из 40 перв.");
  assert.equal(onlyPrimary.percent, 50);
});

await check("оценка, с баллами и без", () => {
  assert.equal(summarize({ scale: "grade", grade: 5 }).main, "оценка 5");
  assert.equal(summarize({ scale: "grade", grade: 5 }).percent, 95);
  assert.equal(summarize({ scale: "grade", grade: 5 }).sub, "");
  const s = summarize({ scale: "grade", grade: 4, score: 15, max: 20 });
  assert.equal(s.sub, "15 из 20 б. · 75 %");
  assert.equal(s.percent, 75);
});

await check("процент и зачёт", () => {
  assert.equal(summarize({ scale: "percent", percent: "87,5" }).main, "87,5 %");
  assert.equal(summarize({ scale: "pass", passed: true }).main, "зачёт");
  assert.equal(summarize({ scale: "pass", passed: false }).percent, 0);
  assert.equal(summarize({ scale: "pass" }).main, "нет баллов");
});

await check("по частям — сумма сама; проходной балл", () => {
  assert.deepEqual(partsTotal([{ name: "Тест", score: 38, max: 50 }, { name: "Задачи", score: 21, max: 50 }]), { score: 59, max: 100 });
  const s = summarize({ scale: "points", parts: [{ score: 38, max: 50 }, { score: 21, max: 50 }], threshold: 55 });
  assert.equal(s.main, "59 из 100");
  assert.equal(s.passedThreshold, true);
  assert.equal(summarize({ scale: "points", score: 40, max: 100, threshold: 55 }).passedThreshold, false);
});

await check("сводка по предмету: средний, последний, рост", () => {
  const sum = subjectSummary([
    { date: "2026-09-01", scale: "points", score: 30, max: 50 },
    { date: "2026-10-01", scale: "points", score: 40, max: 50 },
    { date: "2026-09-15", scale: "pass" },
  ]);
  assert.equal(sum.count, 3);
  assert.equal(sum.avg, 70);
  assert.equal(sum.last, 80);
  assert.equal(sum.trend, 20);
});

await check("общая статистика: средний балл — среднее арифметическое по 100-балльной", () => {
  const st = overallStats([
    { kind: "lesson", date: "2026-09-01", scale: "points", score: 90, max: 100 },
    { kind: "lesson", date: "2026-09-02", scale: "points", score: 70, max: 100 },
    { kind: "kt", date: "2026-09-03", scale: "grade", grade: 5 },
    { kind: "exam", date: "2026-09-04", scale: "primsec", primary: 20, primaryMax: 29, secondary: 76 },
    { kind: "other", date: "2026-09-05", scale: "points" },
  ]);
  assert.equal(st.count, 5);
  assert.equal(st.scored, 4);
  assert.equal(st.avg, (90 + 70 + 95 + 76) / 4);
  assert.equal(st.best, 95);
  assert.equal(st.worst, 70);
  assert.equal(st.last, 76);
  assert.equal(st.trend, -19);
  assert.deepEqual(st.byKind.lesson, { count: 2, avg: 80 });
  assert.equal(blankResult("lesson").max, "100");
});

await check("шкала уроков: 0–49 → 2, 50–69 → 3, 70–89 → 4, 90–100 → 5", () => {
  const cases = [[0, 2], [49, 2], [49.9, 2], [50, 3], [69, 3], [70, 4], [89, 4], [90, 5], [100, 5]];
  cases.forEach(([p, g]) => assert.equal(gradeFromPercent(p), g, p + " → " + g));
  assert.equal(gradeOf({ scale: "points", score: 72, max: 100 }), 4);
  assert.equal(gradeOf({ scale: "grade", grade: 3 }), 3);
  assert.equal(gradeOf({ scale: "grade", grade: 4, score: 19, max: 20 }), 5);
  assert.equal(gradeOf({ scale: "pass", passed: true }), null);
  // Оценка → 100 → снова та же оценка.
  [2, 3, 4, 5].forEach((g) => assert.equal(gradeOf({ scale: "points", score: summarize({ scale: "grade", grade: g }).percent, max: 100 }), g));
});

await check("в оценках: средняя — среднее арифметическое оценок", () => {
  const list = [
    { kind: "lesson", date: "2026-09-01", scale: "points", score: 95, max: 100 },
    { kind: "lesson", date: "2026-09-02", scale: "points", score: 72, max: 100 },
    { kind: "lesson", date: "2026-09-03", scale: "points", score: 40, max: 100 },
    { kind: "kt", date: "2026-09-04", scale: "grade", grade: 5 },
  ];
  const st = overallStats(list, "grades");
  assert.equal(st.avg, (5 + 4 + 2 + 5) / 4);
  assert.equal(st.worst, 2);
  assert.equal(subjectSummary(list, "grades").avg, 4);
});

await check("перед сохранением: числа — числами, пустое убрано", () => {
  const r = cleanResult({ id: "r1", kind: "kt", title: " КТ 1 ", score: "18", max: "", parts: [{ name: "", score: "", max: "" }], status: "", note: "" });
  assert.deepEqual(r, { id: "r1", kind: "kt", title: "КТ 1", score: 18 });
});

await check("лента: открывается только своим кодом", async () => {
  const mine = await recipientCode("user-uuid-1");
  const other = await recipientCode("user-uuid-2");
  assert.match(mine, /^[A-Z2-9]{4}(-[A-Z2-9]{4}){4}$/);
  assert.notEqual(mine, other);
  const feed = [await encryptFor(mine, [{ id: "x", title: "КТ по праву", scale: "grade", grade: 5 }])];
  const got = await decryptFeed(feed, mine);
  assert.equal(got.length, 1);
  assert.equal(got[0].title, "КТ по праву");
  assert.equal(got[0].source, "update");
  assert.deepEqual(await decryptFeed(feed, other), []);
  // Код с пробелами и строчными — тот же код.
  assert.equal((await decryptFeed(feed, mine.toLowerCase().replace(/-/g, " "))).length, 1);
  // В самой ленте нет ни кода, ни открытого текста.
  const raw = JSON.stringify(feed);
  assert.ok(!raw.includes("КТ по праву") && !raw.includes(mine.replace(/-/g, "")));
});

await check("демо-лента предпросмотра открывается демо-аккаунтом", async () => {
  const demo = JSON.parse(await readFile(new URL("../src/results-demo-feed.json", import.meta.url), "utf8"));
  const got = await decryptFeed(demo, await recipientCode("sandbox-demo"));
  assert.equal(got.length, 2);
});

console.log(`\n${passed} проверок пройдено`);
