// Подробности события: время, место, ссылки, описание.
//
// У экзамена и олимпиады из расписания время, место и ссылка были всегда, но
// в «Событиях» показывались только название и дата. Свои события этих полей
// не имели вовсе. Теперь у всех событий одни и те же поля — start, end, place,
// url, note, — а у событий из расписания они же лежат в записи расписания.

// Ссылкой становится только адрес сайта: http(s) или «www.…» / «домен.зона/…».
// Всё остальное (в том числе javascript:) остаётся текстом.
const URL_RE = /((?:https?:\/\/|www\.)[^\s<>"«»]+|(?:[a-zа-яё0-9-]+\.)+(?:ru|рф|com|org|net|edu|info|io|su)(?:\/[^\s<>"«»]*)?)/gi;
const TRAILING = /[.,;:!?)\]]+$/;

export function normalizeUrl(raw) {
  const text = String(raw || "").trim().replace(TRAILING, "");
  if (!text) return "";
  if (/^https?:\/\//i.test(text)) return text;
  if (/^[a-z][a-z0-9+.-]*:/i.test(text)) return ""; // чужая схема — не ссылка
  return "https://" + text;
}

// Текст по кусочкам: { text } или { url, label }.
export function splitLinks(text) {
  const src = String(text || "");
  const out = [];
  let last = 0;
  src.replace(URL_RE, (match, _g, offset) => {
    const clean = match.replace(TRAILING, "");
    if (offset > last) out.push({ text: src.slice(last, offset) });
    const url = normalizeUrl(clean);
    out.push(url ? { url, label: clean } : { text: clean });
    last = offset + clean.length;
    return match;
  });
  if (last < src.length) out.push({ text: src.slice(last) });
  return out;
}

// Ссылки из поля «ссылки»: можно несколько — через пробел, запятую или с новой строки.
export function eventLinks(event) {
  return String((event && event.url) || "")
    .split(/[\s,]+/)
    .map(normalizeUrl)
    .filter(Boolean);
}

// Короткая подпись ссылки: сайт без www и протокола.
export function linkLabel(url) {
  const m = String(url).match(/^https?:\/\/(?:www\.)?([^/?#]+)/i);
  return m ? m[1] : String(url);
}

export function eventTime(event) {
  const start = event && event.start;
  const end = event && event.end;
  if (start && end && end !== start) return start + "–" + end;
  if (start) return "в " + start;
  return "";
}

export function hasDetails(event) {
  return !!(eventTime(event) || (event && (event.place || event.note)) || eventLinks(event).length);
}

// Одной строкой — для календаря телефона и карточки «Сегодня».
export function eventDescription(event) {
  return [eventTime(event), event && event.place, ...eventLinks(event), event && event.note]
    .map((s) => String(s || "").trim())
    .filter(Boolean)
    .join(" · ");
}
