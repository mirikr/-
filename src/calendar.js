// Сборка календаря .ics для подписки (публикует её src/calendar-feed.js).
//
// Это замена push-уведомлениям: напоминает сам Календарь, штатно и даже когда
// приложение закрыто. Никакого сервера для этого не нужно.

function escapeText(value) {
  // В .ics запятая, точка с запятой и обратный слэш экранируются, перевод строки — \n.
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

function stripHtml(value) {
  return String(value || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function dateOnly(dateStr) {
  return String(dateStr || "").replace(/-/g, "");
}

function nextDay(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + 1);
  return dateOnly(d.toISOString().slice(0, 10));
}

function stamp() {
  return new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

// Строки .ics длиннее 75 октетов положено сворачивать: продолжение начинается с пробела.
function fold(line) {
  const bytes = [...line];
  if (bytes.length <= 74) return line;
  const chunks = [];
  let current = "";
  for (const ch of bytes) {
    if ([...current].length >= (chunks.length ? 73 : 74)) {
      chunks.push(current);
      current = "";
    }
    current += ch;
  }
  if (current) chunks.push(current);
  return chunks.map((c, i) => (i === 0 ? c : " " + c)).join("\r\n");
}

// items: [{ uid, title, date: "YYYY-MM-DD", description, alarmDaysBefore }]
// options.name — имя календаря в телефоне; options.refreshHours — как часто
// подписка просит перечитать файл.
export function buildIcs(items, options = {}) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Ежедневник лицеиста//RU",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];

  if (options.name) {
    lines.push(fold(`X-WR-CALNAME:${escapeText(options.name)}`));
  }
  if (options.refreshHours) {
    // Две записи об одном и том же: первую понимает Apple, вторую — остальные.
    lines.push(`REFRESH-INTERVAL;VALUE=DURATION:PT${options.refreshHours}H`);
    lines.push(`X-PUBLISHED-TTL:PT${options.refreshHours}H`);
  }

  items.forEach((item) => {
    if (!item.date) return;
    const days = Number.isFinite(Number(item.alarmDaysBefore)) ? Math.max(0, Number(item.alarmDaysBefore)) : 1;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${escapeText(item.uid)}@planner`,
      `DTSTAMP:${stamp()}`,
      // Событие на весь день: DTEND по стандарту указывает на следующий день.
      `DTSTART;VALUE=DATE:${dateOnly(item.date)}`,
      `DTEND;VALUE=DATE:${nextDay(item.date)}`,
      fold(`SUMMARY:${escapeText(item.title)}`),
      ...(item.description ? [fold(`DESCRIPTION:${escapeText(stripHtml(item.description))}`)] : []),
      "BEGIN:VALARM",
      `TRIGGER:-P${days}D`,
      "ACTION:DISPLAY",
      fold(`DESCRIPTION:${escapeText(item.title)}`),
      "END:VALARM",
      "END:VEVENT"
    );
  });

  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}
