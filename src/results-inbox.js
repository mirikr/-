// Результаты от учителя: таблица results_inbox в облаке (supabase/results.sql).
// Ученик получает только выложенное на его почту — это проверяет база, а не
// приложение. Без облака (предпросмотр) — учебная копия в localStorage, чтобы
// можно было попробовать и роль учителя, и роль ученика на одном устройстве.

import { cloudConfigured, currentUser, supabase } from "./supabase.js";
import { isTeacher } from "./results-roles.js";

const DEMO_KEY = "planner-results-inbox-demo";

function demoRead() {
  try {
    return JSON.parse(localStorage.getItem(DEMO_KEY) || "[]");
  } catch (e) {
    return [];
  }
}

function demoWrite(list) {
  try {
    localStorage.setItem(DEMO_KEY, JSON.stringify(list));
  } catch (e) {
    /* приватное окно */
  }
}

export const inboxIsDemo = !cloudConfigured;

const norm = (email) => String(email || "").trim().toLowerCase();

// Выложенное мне. В учебном режиме «мне» — то, что выложено на demoEmail.
export async function fetchInbox(demoEmail) {
  if (!cloudConfigured) {
    const me = norm(demoEmail);
    return demoRead()
      .filter((row) => row.recipient === me)
      .map((row) => ({ ...row.payload, id: "inbox-" + row.id, source: "teacher", author: row.author_name, publishedAt: row.created_at }));
  }
  const user = currentUser();
  if (!user) return [];
  const { data, error } = await supabase()
    .from("results_inbox")
    .select("id, recipient, author_email, author_name, payload, created_at")
    .eq("recipient", norm(user.email))
    .order("created_at", { ascending: false });
  if (error) return [];
  // Только от учителей из списка (results-roles.js): выложить может любой
  // вошедший, но показываем лишь тех, кому роль выдана.
  return (data || []).filter((row) => isTeacher(row.author_email)).map((row) => ({ ...row.payload, id: "inbox-" + row.id, source: "teacher", author: row.author_name, publishedAt: row.created_at }));
}

// Может ли этот аккаунт выкладывать результаты: почта — в списке учителей.
export function canPublish() {
  const user = cloudConfigured ? currentUser() : null;
  return !!user && isTeacher(user.email);
}

// Выложить результат нескольким ученикам. recipients — почты.
export async function publish(recipients, result, authorName) {
  const list = Array.from(new Set((recipients || []).map(norm).filter((e) => /^[^@\s]+@[^@\s]+$/.test(e))));
  if (!list.length) return { ok: false, error: "Не указана ни одна почта" };
  const payload = { ...result };
  delete payload.id;
  delete payload.source;
  if (!cloudConfigured) {
    const rows = demoRead();
    list.forEach((recipient) =>
      rows.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), recipient, author_name: authorName || "Учитель", payload, created_at: new Date().toISOString() })
    );
    demoWrite(rows);
    return { ok: true, count: list.length };
  }
  const { error } = await supabase()
    .from("results_inbox")
    .insert(list.map((recipient) => ({ recipient, payload, author_name: authorName || "" })));
  if (error) return { ok: false, error: "Не удалось выложить: " + error.message };
  return { ok: true, count: list.length };
}

// Что выложил я сам (для учителя): список с возможностью убрать.
export async function fetchPublished() {
  if (!cloudConfigured) return demoRead().map((row) => ({ ...row, demo: true }));
  const user = currentUser();
  if (!user) return [];
  const { data, error } = await supabase()
    .from("results_inbox")
    .select("id, recipient, payload, created_at")
    .eq("author_id", user.id)
    .order("created_at", { ascending: false });
  return error ? [] : data || [];
}

export async function unpublish(id) {
  if (!cloudConfigured) {
    demoWrite(demoRead().filter((row) => row.id !== id));
    return { ok: true };
  }
  const { error } = await supabase().from("results_inbox").delete().eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

// Отметки журнала: put — выложить или заменить (по ключу), del — убрать у
// ученика. changes: [{ action, email, key, payload }]. Возвращает выполненные.
export async function publishItems(changes, authorName) {
  const done = [];
  if (!cloudConfigured) {
    let rows = demoRead();
    changes.forEach((c) => {
      const recipient = norm(c.email);
      rows = rows.filter((row) => !(row.recipient === recipient && row.item_key === c.itemKey));
      if (c.action === "put") {
        rows.push({
          id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
          recipient,
          item_key: c.itemKey,
          author_name: authorName || "Учитель",
          payload: c.payload,
          created_at: new Date().toISOString(),
        });
      }
      done.push(c);
    });
    demoWrite(rows);
    return { ok: true, done };
  }
  const user = currentUser();
  if (!user) return { ok: false, error: "Нужно войти в аккаунт", done };
  const puts = changes.filter((c) => c.action === "put");
  if (puts.length) {
    const { error } = await supabase()
      .from("results_inbox")
      .upsert(
        puts.map((c) => ({ recipient: norm(c.email), item_key: c.itemKey, payload: c.payload, author_name: authorName || "", author_id: user.id, author_email: norm(user.email) })),
        { onConflict: "author_id,recipient,item_key" }
      );
    if (error) return { ok: false, error: "Не удалось выложить: " + error.message, done };
    done.push(...puts);
  }
  for (const c of changes.filter((x) => x.action === "del")) {
    const { error } = await supabase().from("results_inbox").delete().eq("author_id", user.id).eq("recipient", norm(c.email)).eq("item_key", c.itemKey);
    if (!error) done.push(c);
  }
  return { ok: true, done };
}
