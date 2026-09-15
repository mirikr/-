// Сверка ответов в тренажёре и целость набора заданий.
import { AGREE_NEEDED, consensus, isRight, keyState, myVote, normalizeAnswer, streakOf, timeWord, trainerStats } from "../src/bank-answer.js";
import { BANK_TASKS, BANK_SECTIONS, BANK_SUBJECTS } from "../src/fipi-bank.js";

let bad = 0;
const ok = (cond, msg) => {
  if (!cond) bad += 1;
  console.log((cond ? "  ok  " : "ПРОВАЛ") + "  " + msg);
};

// --- набор заданий ---------------------------------------------------------
ok(BANK_TASKS.length >= 50, "в наборе есть задания: " + BANK_TASKS.length);
ok(new Set(BANK_TASKS.map((t) => t.id)).size === BANK_TASKS.length, "номера заданий не повторяются");
ok(BANK_TASKS.every((t) => t.text && t.text.length > 40), "у каждого задания есть условие");
ok(BANK_TASKS.every((t) => t.answer && String(t.answer).trim()), "у каждого задания есть ответ");
ok(BANK_TASKS.every((t) => t.why && t.why.length > 5), "у каждого задания есть разбор");
ok(BANK_TASKS.every((t) => BANK_SUBJECTS.includes(t.subject)), "предмет каждого задания из общего списка");
ok(BANK_TASKS.every((t) => (BANK_SECTIONS[t.subject] || []).includes(t.section)), "раздел каждого задания принадлежит его предмету");
ok(BANK_SUBJECTS.every((s) => BANK_TASKS.some((t) => t.subject === s)), "в каждом предмете есть задания");
ok(BANK_TASKS.every((t) => (t.pictures || []).every((p) => String(p.data || "").startsWith("data:image/"))),
  "картинки лежат внутри набора, а не ссылками на чужой сайт");
ok(BANK_TASKS.every((t) => /^[0-9A-Za-zА-Яа-я]{5,8}$/.test(t.id)), "номер задания выглядит как номер банка");
// Служебные строки банка в условие попасть не должны.
const dirty = BANK_TASKS.filter((t) => /НЕ РЕШЕНО|СВОЙСТВА ЗАДАНИЯ|Номер:|ОТВЕТИТЬ/i.test(t.text));
ok(dirty.length === 0, "в условиях нет служебных строк банка" + (dirty.length ? ": " + dirty[0].id : ""));
// Свой же ответ обязан проходить проверку — иначе задание нельзя решить в принципе.
const unsolvable = BANK_TASKS.filter((t) => !isRight(t, t.answer));
ok(unsolvable.length === 0, "каждое задание принимает свой ответ" + (unsolvable.length ? ": " + unsolvable.map((t) => t.id).join(", ") : ""));

// --- сверка ответа ---------------------------------------------------------
const t = { answer: "0,25", accept: [] };
ok(isRight(t, "0,25") && isRight(t, "0.25") && isRight(t, " 0,25 "), "запятая, точка и пробелы — один ответ");
ok(!isRight(t, "0,3") && !isRight(t, ""), "чужой и пустой ответ не проходят");
ok(isRight({ answer: "7", accept: [] }, "7,0"), "7 и 7,0 — один ответ");
ok(isRight({ answer: "109 и 78", accept: ["10978"] }, "10978"), "пара чисел слитно");
ok(!isRight({ answer: "134", accept: [] }, "143"), "порядок цифр важен");
ok(normalizeAnswer("Ёлка") === "елка", "ё и е — одна буква");

// --- состояние ключа -------------------------------------------------------
const marks = [{ taskId: "A", kind: "ok" }, { taskId: "B", kind: "ok" }, { taskId: "B", kind: "wrong" }];
ok(keyState(marks, "A").state === "confirmed", "подтверждённый ключ");
ok(keyState(marks, "B").state === "disputed", "жалоба перевешивает подтверждение");
ok(keyState(marks, "Z").state === "unverified", "без отметок ключ несверенный");

// --- итоги -----------------------------------------------------------------
const log = [
  { taskId: "A", ok: false, seconds: 10 },
  { taskId: "A", ok: true, seconds: 20 },
  { taskId: "B", ok: true, seconds: 40 },
];
const stats = trainerStats(log, null);
ok(stats.done === 2 && stats.right === 2 && stats.percent === 100, "итоги считаются по последней попытке");
ok(stats.averageSeconds === 30, "среднее время 30 с, вышло " + stats.averageSeconds);
ok(streakOf(log) === 2 && streakOf([{ ok: true }, { ok: false }]) === 0, "серия считается с конца журнала");
ok(timeWord(75) === "1:15" && timeWord(42) === "42 с", "время читается по-человечески");

// --- согласие класса ------------------------------------------------------
const vote = (userId, taskId, answer, matches, fipi) => ({ userId, taskId, answer, matches, fipi: fipi || "" });

ok(consensus([], "A").state === "unverified", "без голосов ключ несверенный");
ok(consensus([vote("u1", "A", "60", true), vote("u2", "A", "60", true)], "A").state === "unverified",
  "двух совпадений мало");
const three = consensus([vote("u1", "A", "60", true), vote("u2", "A", "60", true), vote("u3", "A", "60", true)], "A");
ok(three.state === "agreed" && three.agree === 3, "трое порознь ответили так же — ключу верим");
ok(three.need === 0, "когда набралось, просить больше не надо");
ok(consensus([vote("u1", "A", "60", true)], "A").need === AGREE_NEEDED - 1, "видно, скольких не хватает");

// Слово банка весомее любого числа совпадений.
const many = [vote("u1", "A", "60", true), vote("u2", "A", "60", true), vote("u3", "A", "60", true), vote("u4", "A", "55", false, "wrong")];
ok(consensus(many, "A").state === "disputed", "банк против — ключ спорный, сколько бы ни сошлось");
ok(consensus([vote("u1", "A", "60", true, "ok")], "A").state === "confirmed", "подтверждение банка важнее числа голосов");

// Сговорившееся большинство с другим ответом — тоже повод усомниться.
const rivals = [vote("u1", "A", "60", true), vote("u2", "A", "45", false), vote("u3", "A", "45", false)];
const r = consensus(rivals, "A");
ok(r.state === "disputed" && r.rival.answer === "45" && r.rival.count === 2, "двое с одинаковым другим ответом делают ключ спорным");
ok(consensus([vote("u1", "A", "60", true), vote("u2", "A", "45", false)], "A").state === "unverified",
  "один несовпавший ответ ещё не спор");
ok(consensus([vote("u1", "B", "60", true), vote("u2", "B", "60", true), vote("u3", "B", "60", true)], "A").state === "unverified",
  "голоса по чужому заданию не считаются");

// Свой голос собирается из своих же записей.
const mine = myVote(
  [{ taskId: "A", answer: "58", ok: false }, { taskId: "A", answer: "60", ok: true }],
  [{ taskId: "A", kind: "ok" }],
  "A"
);
ok(mine.answer === "60" && mine.matches === true, "свой голос берётся из последней попытки");
ok(mine.fipi === "ok", "своя отметка о сверке попадает в голос");

console.log(bad ? "\nпровалов: " + bad : "\nвсе проверки банка прошли");
process.exit(bad ? 1 : 0);
