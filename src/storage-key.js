// Ключ объекта в Supabase Storage — это часть адреса, и кириллица, пробелы или
// двоеточие в нём недопустимы: загрузка падает с «Invalid key». А в путь попадал
// заголовок владельца тетради как есть — «nb-lyceum:Русская словесность», — и
// прикрепить файл к лицейскому предмету было нельзя вовсе.
//
// Поэтому имя папки приводится к латинице, а чтобы «Русская словесность» и
// «Русский язык» не слились в одну папку (обе превращаются в прочерки), к ней
// добавляется короткий отпечаток исходной строки.

function fingerprint(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) hash = (Math.imul(31, hash) + text.charCodeAt(i)) | 0;
  return (hash >>> 0).toString(36);
}

export function safeFolder(prefix) {
  const raw = String(prefix == null ? "" : prefix).trim() || "misc";
  const ascii = raw
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 40);
  return (ascii || "misc") + "-" + fingerprint(raw);
}

// Настоящее имя файла остаётся в подписи вложения, а в хранилище кладётся
// обезличенное: подписанные ссылки ломались на кириллице и пробелах.
export function safeName(name) {
  const text = String(name || "");
  const dot = text.lastIndexOf(".");
  const ext = dot > 0 ? "." + text.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "") : "";
  return Date.now() + "-" + Math.random().toString(36).slice(2, 8) + (ext === "." ? "" : ext);
}

export function storagePath(uid, prefix, name) {
  return `${uid}/${safeFolder(prefix)}/${safeName(name)}`;
}
