import { supabase, cloudConfigured, authReady, currentUser } from "./supabase.js";

// Общая копилка ответов тренажёра.
//
// Ключи к заданиям банка решены нами, и проверить их можно только сообща:
// если несколько человек независимо ответили так же, как записано у нас, ключу
// можно верить. Поэтому ответ каждого уходит в общую таблицу — номер задания,
// сам ответ и сошёлся ли он с ключом. Ничего личного там нет.
//
// Ни одна функция здесь не бросает исключений: без облака и без сети тренажёр
// обязан работать по-прежнему, просто счёт голосов будет только свой.

const TABLE = "bank_answers";
// Столбцы у таблицы прибавлялись со временем, и у тех, кто не обновил базу,
// свежих ещё нет. Поэтому читаем по убыванию: сначала со всеми, а на ошибку
// «нет такого столбца» пробуем набор попроще. Копилка обязана работать и на
// старой таблице, просто без новых полей.
const BASE = "task_id,user_id,answer,matches,fipi";
const SETS = [BASE + ",fipi_answer,name", BASE + ",fipi_answer", BASE];
// Какой набор столбцов подошёл: 0 — все, дальше по убыванию.
let level = 0;
const has = (what) => SETS[level].includes(what);

// Принимает ли база ответы с ФИПИ: пока столбца нет, их некуда складывать.
export function votesTakeBankAnswer() {
  return has("fipi_answer");
}

// Принимает ли база имя: без него таблица решающих обойдётся кодами.
export function votesTakeName() {
  return has("name");
}

let cache = { at: 0, rows: [] };
const FRESH_MS = 60 * 1000;

// Состояние общей копилки, чтобы приложение могло честно сказать, считается
// счёт по всему классу или только по своим ответам.
//   "off"     — облака нет или вход не выполнен
//   "ready"   — таблица отвечает
//   "missing" — таблицы в базе нет
//   "error"   — ответила ошибкой
let state = "off";
export function votesState() {
  return state;
}

async function client() {
  if (!cloudConfigured) return null;
  try {
    await authReady();
    const user = currentUser();
    const db = supabase();
    return user && db ? { db, user } : null;
  } catch (e) {
    return null;
  }
}

export async function loadVotes(force) {
  if (!force && Date.now() - cache.at < FRESH_MS) return cache.rows;
  const conn = await client();
  if (!conn) {
    state = "off";
    return cache.rows;
  }
  try {
    let data = null;
    let error = null;
    for (let i = level; i < SETS.length; i += 1) {
      ({ data, error } = await conn.db.from(TABLE).select(SETS[i]));
      if (!error || String((error && error.code) || "") !== "42703") { level = i; break; }
    }
    if (error) {
      // Postgres отвечает 42P01, PostgREST — PGRST205: таблицы просто нет.
      const code = String((error && error.code) || "");
      state = code === "42P01" || code === "PGRST205" ? "missing" : "error";
      return cache.rows;
    }
    state = "ready";
    cache = {
      at: Date.now(),
      rows: (data || []).map((r) => ({
        taskId: r.task_id,
        userId: r.user_id,
        answer: r.answer || "",
        matches: !!r.matches,
        fipi: r.fipi || "",
        // Ответ, который засчитал сам банк: по нему мы и правим ключи.
        fipiAnswer: r.fipi_answer || "",
        // Имя человек выбирает сам, и оно нужно только для таблицы решающих.
        name: r.name || "",
      })),
    };
    return cache.rows;
  } catch (e) {
    state = "error";
    return cache.rows;
  }
}

// Голос у человека один на задание: повторный ответ заменяет прежний.
export async function saveVote(vote) {
  const conn = await client();
  if (!conn) return false;
  try {
    const row = {
      task_id: vote.taskId,
      user_id: conn.user.id,
      answer: String(vote.answer || "").slice(0, 200),
      matches: !!vote.matches,
      fipi: vote.fipi || "",
      fipi_answer: String(vote.fipiAnswer || "").slice(0, 200),
      name: String(vote.name || "").slice(0, 40),
      updated_at: new Date().toISOString(),
    };
    if (!has("fipi_answer")) delete row.fipi_answer;
    if (!has("name")) delete row.name;
    let { error } = await conn.db.from(TABLE).upsert(row, { onConflict: "task_id,user_id" });
    // Столбца нет — пробуем набор попроще, пока не запишется.
    while (error && String((error && error.code) || "") === "42703" && level < SETS.length - 1) {
      level += 1;
      if (!has("fipi_answer")) delete row.fipi_answer;
      if (!has("name")) delete row.name;
      ({ error } = await conn.db.from(TABLE).upsert(row, { onConflict: "task_id,user_id" }));
    }
    if (error) return false;
    // Свой голос сразу кладём в кеш, чтобы счёт обновился без повторного чтения.
    const rows = cache.rows.filter((r) => !(r.taskId === row.task_id && r.userId === row.user_id));
    cache = { at: cache.at, rows: rows.concat({ taskId: row.task_id, userId: row.user_id, answer: row.answer,
      matches: row.matches, fipi: row.fipi, fipiAnswer: row.fipi_answer || "", name: row.name || "" }) };
    return true;
  } catch (e) {
    return false;
  }
}

export async function myUserId() {
  const conn = await client();
  return conn ? conn.user.id : "";
}
