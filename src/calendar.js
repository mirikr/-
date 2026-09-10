// Выгрузка дедлайнов в календарь телефона файлом .ics.
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
export function buildIcs(items) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Ежедневник обществоведа//RU",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];

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

function safeFileName(name) {
  return (
    String(name || "события")
      .replace(/[^\wА-Яа-яЁё\- ]+/g, "")
      .trim()
      .slice(0, 40)
      .replace(/\s+/g, "-") || "события"
  );
}

// На iPhone файл уходит в «Поделиться» — оттуда его принимает Календарь.
// Там, где такого нет, просто скачивается.
export async function saveIcs(name, ics) {
  const fileName = safeFileName(name) + ".ics";
  const file = new File([ics], fileName, { type: "text/calendar" });

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      return { ok: true, shared: true };
    } catch (e) {
      if (e && e.name === "AbortError") return { ok: true, shared: false };
      // Поделиться не вышло — уходим на обычное скачивание.
    }
  }

  try {
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    return { ok: true, shared: false };
  } catch (e) {
    return { ok: false, error: (e && e.message) || "не удалось сохранить файл" };
  }
}
