// Поиск по всему, что накопилось: темы, дневник, домашка, события, расписание,
// тетради и задания банка ФИПИ.
//
// Ищется подстрокой без учёта регистра и буквы «ё»: набирать точное написание,
// чтобы найти свою же запись, — издевательство. Ничего умнее не нужно, записей
// тут тысячи, а не миллионы.
//
// Каждая находка знает, куда за ней идти: у неё есть экран и, если есть,
// предмет или тетрадь, которые надо там открыть.

const PER_GROUP = 8;

export function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ")
    .trim();
}

function stripHtml(html) {
  return String(html || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&[a-z]+;/g, " ");
}

// Кусок текста вокруг найденного, чтобы было видно, за что зацепилось.
export function excerpt(text, needle, around = 60) {
  const plain = String(text || "").replace(/\s+/g, " ").trim();
  const at = normalize(plain).indexOf(needle);
  if (at < 0) return plain.slice(0, around * 2);
  const from = Math.max(0, at - around / 2);
  const cut = plain.slice(from, from + around * 2);
  return (from > 0 ? "…" : "") + cut.trim() + (from + around * 2 < plain.length ? "…" : "");
}

function hit(where, needle) {
  return normalize(where).includes(needle);
}

export function search(query, sources) {
  const needle = normalize(query);
  if (needle.length < 2) return { query: needle, total: 0, groups: [] };
  const s = sources || {};
  const groups = [];

  const add = (id, title, screen, items) => {
    if (items.length) groups.push({ id, title, screen, shown: items.slice(0, PER_GROUP), total: items.length });
  };

  const topics = [];
  for (const subject of s.subjects || []) {
    for (const topic of subject.topics || []) {
      if (!hit(topic.name, needle)) continue;
      topics.push({
        id: "topic:" + topic.id,
        title: topic.name,
        note: subject.name + (topic.done ? " · пройдено" : ""),
        color: subject.color,
        screen: "study",
        subjectId: subject.id,
      });
    }
  }
  add("topics", "Темы подготовки", "study", topics);

  const journal = (s.journal || [])
    .filter((e) => hit(e.note, needle))
    .map((e) => ({
      id: "journal:" + e.id,
      title: e.note,
      note: (s.subjectName ? s.subjectName(e.subjectId) : e.subjectId) + " · " + e.date + " · " + e.hours + " ч",
      screen: "journal",
    }));
  add("journal", "Дневник", "journal", journal);

  const homework = (s.homework || [])
    .filter((h) => hit(h.text, needle) || hit(h.subjectName, needle))
    .map((h) => ({
      id: "hw:" + h.id,
      title: h.text || "без описания",
      note: [h.subjectName, h.date, h.done ? "сделано" : ""].filter(Boolean).join(" · "),
      screen: "journal",
    }));
  add("homework", "Домашние задания", "journal", homework);

  const events = (s.events || [])
    .filter((e) => hit(e.name, needle))
    .map((e) => ({ id: "event:" + e.id, title: e.name, note: e.date, screen: "events" }));
  add("events", "События", "events", events);

  const lessons = [];
  const seen = new Set();
  for (const entry of s.schedule || []) {
    if (!hit(entry.subjectName, needle) && !hit(entry.teacher, needle) && !hit(entry.room, needle) && !hit(entry.place, needle)) continue;
    // Один и тот же урок стоит в сетке несколько раз в неделю — в находках он
    // должен быть один, иначе поиск по предмету выдаёт простыню одинаковых строк.
    const key = entry.subjectName + "|" + entry.teacher + "|" + entry.room;
    if (seen.has(key)) continue;
    seen.add(key);
    lessons.push({
      id: "lesson:" + entry.id,
      title: entry.subjectName,
      note: [entry.teacher, entry.room, entry.place].filter(Boolean).join(" · "),
      screen: "school",
    });
  }
  add("schedule", "Расписание", "school", lessons);

  // Задания банка ФИПИ. Номер задания подписан у каждого задания в тренажёре —
  // по нему задание и ищут, поэтому номер весомее текста: точное совпадение
  // идёт первым, потом начало номера, и только потом совпадения по условию.
  //
  // Опись приходит отдельным куском и только на этом экране: пока она едет,
  // sources.bankTasks пустой, и группа просто не показывается.
  const tasks = [];
  // За номер принимаем только запрос, который сам похож на номер: буквы и цифры
  // без ничего лишнего. Иначе «<b>» превращается в «b» и находит половину банка.
  const bare = /^[0-9a-zа-я]+$/.test(needle) ? needle : "";
  for (const t of s.bankTasks || []) {
    const id = normalize(t.id);
    const exact = bare && id === bare;
    const starts = bare && !exact && id.startsWith(bare);
    const byText = !exact && !starts && hit(t.text, needle);
    if (!exact && !starts && !byText) continue;
    tasks.push({
      rank: exact ? 0 : starts ? 1 : 2,
      id: "task:" + t.id,
      title: "№ " + t.id,
      note: t.subject + " · " + t.section,
      body: hit(t.text, needle) ? excerpt(t.text, needle) : t.text.slice(0, 120),
      screen: "trainer",
      task: { id: t.id, subject: t.subject },
    });
  }
  tasks.sort((a, b) => a.rank - b.rank || a.id.localeCompare(b.id));
  add("bank", "Задания банка ФИПИ", "trainer", tasks);

  const notes = [];
  for (const owner of s.notebookOwners || []) {
    for (const block of (s.notebooks || {})[owner.key] || []) {
      if (hit(block.title, needle)) {
        notes.push({
          id: "block:" + block.id,
          title: block.title,
          note: owner.name,
          color: owner.color,
          screen: "notes",
          notebook: owner.key,
        });
      }
      for (const branch of block.branches || []) {
        const text = stripHtml(branch.html);
        if (!hit(branch.title, needle) && !hit(text, needle)) continue;
        notes.push({
          id: "branch:" + branch.id,
          title: branch.title || "без названия",
          note: owner.name + " · " + block.title,
          body: hit(text, needle) ? excerpt(text, needle) : "",
          color: owner.color,
          screen: "notes",
          notebook: owner.key,
        });
      }
    }
  }
  add("notes", "Тетради", "notes", notes);

  return { query: needle, total: groups.reduce((sum, g) => sum + g.total, 0), groups };
}
