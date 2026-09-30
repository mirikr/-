// Тесты ВсОШ: целость набора и подсчёт баллов по критериям олимпиады.
import { OLYMPIADS } from "../src/vosh/vosh-society.js";
import { VOSH_INDEX } from "../src/vosh-index.js";
import { scoreTask, hasResponse, keyText, normalizeShort, shortRight, lastAttempts } from "../src/vosh-check.js";

let bad = 0;
function check(name, ok, note = "") {
  if (!ok) bad += 1;
  console.log((ok ? "  ok    " : "  FAIL  ") + name + (note ? " — " + note : ""));
}

// Ответ ровно по ключу — таким его ввёл бы человек, решивший всё верно.
function keyResponse(t) {
  switch (t.kind) {
    case "yesno":
      return [...t.answer];
    case "multi":
      return [...t.answer];
    case "one":
    case "short":
      return t.answer;
    case "match":
      return Object.fromEntries(t.items.map((it, i) => [it.k, [].concat(t.answer[i])[0]]));
    case "matchmany":
      return Object.fromEntries(t.items.map((it, i) => [it.k, [...t.answer[i]]]));
    case "groups":
      return Object.fromEntries(t.items.map((it, i) => [it.k, t.answer[i]]));
    case "gaps":
      return Object.fromEntries(t.gaps.map((g, i) => [g, t.answer[i]]));
    default:
      return null;
  }
}

const all = OLYMPIADS.flatMap((o) => o.tasks);
check("в наборе 13 олимпиад", OLYMPIADS.length === 13, String(OLYMPIADS.length));
check("номера заданий не повторяются", new Set(all.map((t) => t.id)).size === all.length);
check("опись совпадает с набором", JSON.stringify(VOSH_INDEX.map((o) => o.ids)) === JSON.stringify(OLYMPIADS.map((o) => o.tasks.map((t) => t.id))));

const wrongKey = all.filter((t) => {
  const r = scoreTask(t, keyResponse(t));
  return !(r.ok && r.score === t.max);
});
check("ответ по ключу — полный балл и «верно» у каждого задания", wrongKey.length === 0, wrongKey.map((t) => t.id).join(", "));
const empty = all.filter((t) => {
  const r = scoreTask(t, t.kind === "yesno" ? t.answer.map(() => null) : t.kind === "multi" ? [] : t.kind === "one" || t.kind === "short" ? "" : {});
  return r.ok || r.score !== 0;
});
check("пустой ответ — ноль баллов", empty.length === 0, empty.map((t) => t.id).join(", "));
check("у каждого задания есть ключ строкой", all.every((t) => keyText(t).length > 0));
check("школьные этапы — только тестовые, сумма = максимуму работы",
  OLYMPIADS.filter((o) => o.stage === "school").every((o) => o.tasks.reduce((n, t) => n + t.max, 0) === o.max));
check("муниципальные — тестовая часть меньше максимума", OLYMPIADS.filter((o) => o.stage === "municipal").every((o) => o.tasks.reduce((n, t) => n + t.max, 0) < o.max));

const byId = (id) => all.find((t) => t.id === id);

// Выбор нескольких: балл за верный, штраф за неверный, ноль при переборе.
const m = byId("2324-sch-9-2"); // 1, 3; по 2 балла, штраф 2, не больше 4
check("верный и неверный выбор взаимно гасятся", scoreTask(m, ["1", "2"]).score === 0);
check("один верный — 2 балла", scoreTask(m, ["1"]).score === 2);
check("больше разрешённого — ноль", scoreTask(m, ["1", "3", "2", "4", "5"]).score === 0);
check("не меньше нуля", scoreTask(m, ["2", "4", "5"]).score === 0);

// Штраф только за выбор сверх числа верных (2526-mun-9-3: ключ 3, 4).
const over = byId("2526-mun-9-3");
check("«лишние пункты»: верный + неверный — без штрафа", scoreTask(over, ["3", "1"]).score === 2);
check("«лишние пункты»: три отметки — штраф за одну", scoreTask(over, ["3", "4", "1"]).score === 2);

// Точное совпадение.
const exact = byId("2324-mun-10-1");
check("точное совпадение — весь балл", scoreTask(exact, ["5"]).score === 1);
check("с лишним — ноль", scoreTask(exact, ["5", "3"]).score === 0);

// Запасной ключ (опечатка в опубликованном).
const alt = byId("2324-sch-9-7.4");
check("засчитывается исправленный ключ", scoreTask(alt, ["А", "В", "Е"]).ok);
check("засчитывается и опубликованный", scoreTask(alt, ["Б", "В", "Е"]).ok && scoreTask(alt, ["Б", "В", "Е"]).score === alt.max);

// Группы: без названий номера групп можно поменять местами.
const free = byId("2526-mun-9-2");
const swapped = Object.fromEntries(free.items.map((it, i) => [it.k, 3 - free.answer[i]]));
check("группы без названий: наоборот — тоже верно", scoreTask(free, swapped).ok && scoreTask(free, swapped).score === free.max);
const fixed = byId("2425-sch-9-2");
const swappedFixed = Object.fromEntries(fixed.items.map((it, i) => [it.k, 3 - fixed.answer[i]]));
check("«к группе 1 относится А»: наоборот — неверно", !scoreTask(fixed, swappedFixed).ok && scoreTask(fixed, swappedFixed).score === 0);

// Лишние изображения.
const ext = byId("2324-mun-9-2");
const noExtra = Object.fromEntries(ext.items.map((it, i) => [it.k, ext.answer[i] || 1]));
check("лишнее в группе: баллы за остальные, но не «верно»", !scoreTask(ext, noExtra).ok && scoreTask(ext, noExtra).score === ext.max);

// Соответствие с несколькими верными вариантами.
const any = byId("2526-mun-9-7.2");
check("любой из допустимых вариантов засчитан", scoreTask(any, { а: "5", б: "1", в: "9" }).ok);
check("недопустимый — нет", !scoreTask(any, { а: "5", б: "2", в: "9" }).ok);

// Соответствие «несколько абзацев»: лишний выбор снимает балл.
const many = byId("2324-sch-10-7.4");
check("несколько вариантов у позиции — верно", scoreTask(many, { А: ["III", "IV", "V"], Б: ["VII"], В: ["I"], Г: ["VII", "VIII"] }).ok);
check("отметить все абзацы невыгодно", scoreTask(many, { А: ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX"] }).score === 0);

// Краткий ответ: запятая, пробелы, проценты и единицы не важны; знак важен.
check("«3,25 %» = 3,25", shortRight(byId("2526-mun-9-5"), "3,25 %"));
check("«3.25» = 3,25", shortRight(byId("2526-mun-9-5"), "3.25"));
check("«1 280 000» = 1280000", shortRight(byId("2324-sch-11-4.2"), "1 280 000"));
check("«−200» с длинным минусом верно", shortRight(byId("2526-mun-11-5"), "−200"));
check("«200» без минуса — неверно", !shortRight(byId("2526-mun-11-5"), "200"));
check("термин без учёта регистра", shortRight(byId("2324-mun-10-7.2"), "Ролевой конфликт"));
check("термин: принятый вариант", shortRight(byId("2324-mun-10-7.2"), "конфликт ролей"));
check("нормализация: ё и кавычки", normalizeShort("«Досуговые практики»") === normalizeShort("досуговые практики"));

// Отвечено ли что-нибудь.
check("пустой ответ не считается ответом", !hasResponse(m, []) && !hasResponse(byId("2526-mun-9-5"), "  "));
check("частичный ответ «да/нет» — уже ответ", hasResponse(byId("2324-sch-9-1"), [true, null, null, null, null]));

// Последняя попытка по заданию.
const ids = new Set(["x", "y"]);
const last = lastAttempts([
  { taskId: "x", at: "2026-09-30T10:00:00Z", score: 1 },
  { taskId: "x", at: "2026-09-30T11:00:00Z", score: 3 },
  { taskId: "z", at: "2026-09-30T12:00:00Z", score: 9 },
], ids);
check("берётся последняя попытка", last.get("x").score === 3 && !last.has("z"));

if (bad) {
  console.log(bad + " проверок не прошло");
  process.exit(1);
}
console.log("ВсОШ: " + OLYMPIADS.length + " олимпиад, " + all.length + " заданий — всё в порядке");
