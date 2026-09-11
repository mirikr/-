import { supabase, cloudConfigured, currentUser, authReady } from "./supabase.js";

// Публикация календаря-подписки.
//
// Одноразовый файл .ics на iPhone оказался тупиком: в «Поделиться» Календаря нет,
// файл уезжает в «Файлы», откуда его надо открывать руками. Подписка работает иначе:
// в облаке лежит один небольшой файл, телефон сам его перечитывает, и события в
// календаре остаются в согласии с ежедневником — исправили дату здесь, она поменялась там.
const BUCKET = "calendar";

export function newFeedToken() {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function userId() {
  if (!cloudConfigured) return null;
  await authReady();
  const user = currentUser();
  return user ? user.id : null;
}

function objectPath(uid, token) {
  return `${uid}/${token}.ics`;
}

// Ссылка на файл: https — чтобы открыть и посмотреть, webcal — чтобы телефон
// предложил подписаться, а не скачать.
export async function feedUrls(token) {
  const uid = await userId();
  if (!uid || !token) return null;
  const base = import.meta.env.VITE_SUPABASE_URL.replace(/\/+$/, "");
  const https = `${base}/storage/v1/object/public/${BUCKET}/${objectPath(uid, token)}`;
  return { https, webcal: https.replace(/^https?:/, "webcal:") };
}

// Возвращает { ok, error }.
export async function publishFeed(token, ics) {
  const uid = await userId();
  if (!uid) return { ok: false, error: "войдите в аккаунт — подписка живёт в облаке" };
  const file = new Blob([ics], { type: "text/calendar; charset=utf-8" });
  const { error } = await supabase()
    .storage.from(BUCKET)
    .upload(objectPath(uid, token), file, {
      upsert: true,
      contentType: "text/calendar; charset=utf-8",
      // Пять минут: чаще телефон всё равно не спрашивает, реже — правки дойдут не скоро.
      cacheControl: "300",
    });
  if (error) {
    const msg = error.message || String(error);
    if (/Bucket not found/i.test(msg)) {
      return { ok: false, error: "бакет календаря не создан — выполните supabase/calendar.sql" };
    }
    return { ok: false, error: msg };
  }
  return { ok: true };
}

export async function removeFeed(token) {
  const uid = await userId();
  if (!uid || !token) return;
  await supabase()
    .storage.from(BUCKET)
    .remove([objectPath(uid, token)])
    .catch(() => {});
}
