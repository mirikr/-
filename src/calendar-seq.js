// Номера версий событий в календаре-подписке.
//
// Календарь телефона, перечитав подписку, решает, изменилось ли событие, по
// его SEQUENCE и LAST-MODIFIED. Их не было — и часть календарей держала
// событие таким, каким увидела его впервые: дата или время менялись в
// ежедневнике, а в телефоне оставались прежними.
//
// Номер версии растёт, только когда меняется содержимое события. Помнит его
// устройство (localStorage): номер — минуты с 2026 года в момент, когда
// правку заметили, поэтому он не уменьшается и при публикации с другого
// устройства, которое этого события раньше не видело.

const EPOCH = Date.UTC(2026, 0, 1);

function fingerprint(item) {
  const text = JSON.stringify([item.title, item.date, item.time || "", item.minutes || 0, item.description || "", item.alarmDaysBefore]);
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) hash = (Math.imul(31, hash) + text.charCodeAt(i)) | 0;
  return (hash >>> 0).toString(36);
}

// Возвращает { items, memory }: события с seq и modified и новую память.
// Память хранит только события, которые есть сейчас, — она не растёт без конца.
export function sequenceItems(items, memory, now = Date.now()) {
  const minutes = Math.max(0, Math.floor((now - EPOCH) / 60000));
  const prev = memory && typeof memory === "object" ? memory : {};
  const next = {};
  const out = items.map((item) => {
    const h = fingerprint(item);
    const was = prev[item.uid];
    let s;
    let m;
    if (was && was.h === h && Number.isFinite(was.s)) {
      s = was.s;
      m = Number(was.m) || now;
    } else {
      s = was && Number.isFinite(was.s) ? Math.max(was.s + 1, minutes) : minutes;
      m = now;
    }
    next[item.uid] = { h, s, m };
    return { ...item, seq: s, modified: m };
  });
  return { items: out, memory: next };
}
