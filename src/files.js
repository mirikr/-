import { supabase, cloudConfigured, currentUser, authReady } from "./supabase.js";
import { get as kvGet, set as kvSet, remove as kvRemove } from "./storage.js";

// Вложения живут в двух видах:
//   { name, size, path }  — файл в Supabase Storage (основной путь);
//   { name, key }         — база64 в таблице planner_kv (старые вложения и работа без входа).
// Второй формат остаётся навсегда: он читает всё, что было прикреплено до появления бакета.
const BUCKET = "attachments";
const LOCAL_LIMIT = 2 * 1024 * 1024;
const CLOUD_LIMIT = 25 * 1024 * 1024;

async function cloudUserId() {
  if (!cloudConfigured) return null;
  await authReady();
  const user = currentUser();
  return user ? user.id : null;
}

function safeName(name) {
  // Кириллица и пробелы в ключе объекта ломают подписанные ссылки, поэтому имя
  // для хранения обезличивается, а настоящее остаётся в подписи вложения.
  const ext = name.includes(".") ? "." + name.split(".").pop().toLowerCase().replace(/[^a-z0-9]/g, "") : "";
  return Date.now() + "-" + Math.random().toString(36).slice(2, 8) + ext;
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("не удалось прочитать файл"));
    reader.readAsDataURL(file);
  });
}

// Возвращает { ok, attachment, error }.
export async function attachFile(file, prefix) {
  if (!file) return { ok: false, error: "файл не выбран" };
  const uid = await cloudUserId();

  if (uid) {
    if (file.size > CLOUD_LIMIT) {
      return { ok: false, error: "файл больше 25 МБ" };
    }
    const path = `${uid}/${prefix || "misc"}/${safeName(file.name)}`;
    const { error } = await supabase().storage.from(BUCKET).upload(path, file, { upsert: false });
    if (error) {
      const msg = error.message || String(error);
      if (/Bucket not found/i.test(msg)) {
        return { ok: false, error: "хранилище файлов не настроено — выполните supabase/storage.sql" };
      }
      return { ok: false, error: msg };
    }
    return { ok: true, attachment: { name: file.name, size: file.size, path } };
  }

  // Без входа файл некуда положить, кроме памяти браузера, а она общая на всё приложение.
  if (file.size > LOCAL_LIMIT) {
    return { ok: false, error: "без входа в аккаунт файл должен быть меньше 2 МБ" };
  }
  const dataUrl = await readAsDataUrl(file);
  const key = "hwfile-" + (prefix || "misc") + "-" + Date.now();
  const res = await kvSet(key, dataUrl);
  if (!res.ok) return { ok: false, error: res.error || "не хватило места в памяти браузера" };
  return { ok: true, attachment: { name: file.name, size: file.size, key } };
}

// Возвращает { ok, url, error }. Ссылка временная — годится, чтобы открыть или скачать сразу.
export async function attachmentUrl(att) {
  if (att.path) {
    const uid = await cloudUserId();
    if (!uid) return { ok: false, error: "войдите в аккаунт — файл лежит в облаке" };
    const { data, error } = await supabase().storage.from(BUCKET).createSignedUrl(att.path, 60, {
      download: att.name,
    });
    if (error) return { ok: false, error: error.message || String(error) };
    return { ok: true, url: data.signedUrl };
  }
  const res = await kvGet(att.key);
  if (!res || !res.value) return { ok: false, error: "файл не найден" };
  return { ok: true, url: res.value };
}

export async function removeAttachment(att) {
  if (att.path) {
    const uid = await cloudUserId();
    if (!uid) return;
    await supabase().storage.from(BUCKET).remove([att.path]).catch(() => {});
    return;
  }
  await kvRemove(att.key);
}

export function formatSize(bytes) {
  if (!bytes && bytes !== 0) return "";
  if (bytes < 1024) return bytes + " Б";
  if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + " КБ";
  return Math.round((bytes / 1024 / 1024) * 10) / 10 + " МБ";
}
