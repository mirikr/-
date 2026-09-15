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

let cache = { at: 0, rows: [] };
const FRESH_MS = 60 * 1000;

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
  if (!conn) return cache.rows;
  try {
    const { data, error } = await conn.db.from(TABLE).select("task_id,user_id,answer,matches,fipi");
    if (error) return cache.rows;
    cache = {
      at: Date.now(),
      rows: (data || []).map((r) => ({
        taskId: r.task_id,
        userId: r.user_id,
        answer: r.answer || "",
        matches: !!r.matches,
        fipi: r.fipi || "",
      })),
    };
    return cache.rows;
  } catch (e) {
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
      updated_at: new Date().toISOString(),
    };
    const { error } = await conn.db.from(TABLE).upsert(row, { onConflict: "task_id,user_id" });
    if (error) return false;
    // Свой голос сразу кладём в кеш, чтобы счёт обновился без повторного чтения.
    const rows = cache.rows.filter((r) => !(r.taskId === row.task_id && r.userId === row.user_id));
    cache = { at: cache.at, rows: rows.concat({ taskId: row.task_id, userId: row.user_id, answer: row.answer, matches: row.matches, fipi: row.fipi }) };
    return true;
  } catch (e) {
    return false;
  }
}

export async function myUserId() {
  const conn = await client();
  return conn ? conn.user.id : "";
}
