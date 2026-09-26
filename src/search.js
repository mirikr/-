// Поиск по всему, что накопилось: темы, дневник, домашка, события, расписание,
// тетради и задания банка ФИПИ.
//
// Ищется подстрокой без учёта регистра и буквы «ё»: набирать точное написание,
// чтобы найти свою же запись, — издевательство. Ничего умнее не нужно, записей
// тут тысячи, а не миллионы.
//
// Каждая находка знает, куда за ней идти: у неё есть экран и, если есть,
// предмет или тетрадь, которые надо там открыть. Поле focus — метка
// (data-focus-id) того, к чему прокрутить и что подсветить; по умолчанию это id.
// Задание и запись дневника несут дату — дневник открывается на ней.

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

// Разметка для подсветки: [{ text, hit }]. Совпадения ищутся так же, как в
// поиске, — без регистра и «ё», каждое слово запроса отдельно. Строчные буквы
// той же длины, что и исходные, поэтому позиции совпадают с исходным текстом.
export function markParts(text, query) {
  const src = String(text || "");
  const needle = normalize(query);
  if (!src || needle.length < 2) return [{ text: src, hit: false }];
  const low = src.toLowerCase().replace(/ё/g, "е");
  if (low.length !== src.length) return [{ text: src, hit: false }];
  const marks = new Array(src.length).fill(false);
  for (const w of needle.split(" ").filter(Boolean)) {
    let at = low.indexOf(w);
    while (at >= 0) {
      for (let i = at; i < at + w.length; i += 1) marks[i] = true;
      at = low.indexOf(w, at + w.length);
    }
  }
  const out = [];
  for (let i = 0; i < src.length; i += 1) {
    const last = out[out.length - 1];
    if (last && last.hit === marks[i]) last.text += src[i];
    else out.push({ text: src[i], hit: marks[i] });
  }
  return out;
}

// Кусок текста вокруг найденного, чтобы было видно, за что зацепилось.
export function excerpt(text, needle, around = 60) {
  const plain = String(text || "").replace(/\s+/g, " ").trim();
  const low = normalize(plain);
  // Кусок — вокруг первого найденного слова запроса.
  const at = [needle, ...String(needle).split(" ")].map((w) => (w ? low.indexOf(w) : -1)).find((i) => i >= 0) ?? -1;
  if (at < 0) return plain.slice(0, around * 2);
  const from = Math.max(0, at - around / 2);
  const cut = plain.slice(from, from + around * 2);
  return (from > 0 ? "…" : "") + cut.trim() + (from + around * 2 < plain.length ? "…" : "");
}

const MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
// «2026-10-01» → «1 октября»: так дату читают, а не расшифровывают.
export function humanDate(iso) {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? Number(m[3]) + " " + MONTHS[Number(m[2]) - 1] : String(iso || "");
}

function blocksWord(n) {
  const d = n % 10;
  const dd = n % 100;
  if (d === 1 && dd !== 11) return "блок";
  if (d >= 2 && d <= 4 && (dd < 12 || dd > 14)) return "блока";
  return "блоков";
}

// Запрос из нескольких слов находит запись, где есть каждое из них — в любом
// порядке и в любом месте: «сужде брак» найдёт «Выберите верные суждения о
// браке». Раньше запрос искался одной строкой подряд и не находил ничего.
function words(needle) {
  return needle.split(" ").filter(Boolean);
}

function hit(where, needle) {
  const text = normalize(where);
  return words(needle).every((w) => text.includes(w));
}

// Задевает ли текст хоть одно слово запроса — чтобы показать кусок, за
// который зацепилось, даже если остальные слова нашлись в названии.
function touches(where, needle) {
  const text = normalize(where);
  return words(needle).some((w) => text.includes(w));
}

// То же по нескольким полям сразу: «право конспект» — предмет и текст задания.
function hitAll(fields, needle) {
  return hit(fields.filter(Boolean).join(" "), needle);
}

export function search(query, sources) {
  const needle = normalize(query);
  if (needle.length < 2) return { query: needle, total: 0, groups: [] };
  const s = sources || {};
  const groups = [];

  // icon — значок раздела в заголовке группы (имена из src/shell.jsx).
  const add = (id, title, screen, items, icon) => {
    if (items.length) groups.push({ id, title, screen, icon: icon || screen, shown: items.slice(0, PER_GROUP), total: items.length });
  };
  const fileHit = (files) => (files || []).find((f) => hit(f.name, needle));

  const homework = (s.homework || [])
    .filter((h) => hitAll([h.text, h.subjectName], needle) || fileHit(h.attachments))
    .map((h) => {
      const file = !hitAll([h.text, h.subjectName], needle) ? fileHit(h.attachments) : null;
      return {
        id: "hw:" + h.id,
        title: h.text || "без описания",
        note: [h.subjectName, h.date ? "к " + humanDate(h.date) : "", h.done ? "сделано" : ""].filter(Boolean).join(" · "),
        body: file ? "📎 " + file.name : "",
        screen: "journal",
        date: h.date,
      };
    });
  add("homework", "Домашние задания", "journal", homework, "trainer");

  const lessons = [];
  const seen = new Set();
  for (const entry of s.schedule || []) {
    if (!hitAll([entry.subjectName, entry.teacher, entry.room, entry.place], needle)) continue;
    // Один и тот же урок стоит в сетке несколько раз в неделю — в находках он
    // должен быть один, иначе поиск по предмету выдаёт простыню одинаковых строк.
    const key = entry.subjectName + "|" + entry.teacher + "|" + entry.room;
    if (seen.has(key)) continue;
    seen.add(key);
    lessons.push({
      id: "lesson:" + entry.id,
      title: entry.subjectName,
      note: [entry.kind === "exam" && entry.date ? humanDate(entry.date) : "", entry.teacher, entry.room, entry.place]
        .filter(Boolean)
        .join(" · "),
      screen: "school",
      // Урок подсвечен своей важностью — как на «Сегодня» и в расписании.
      priority: Number(entry.priority) || 1,
    });
  }
  add("schedule", "Расписание", "school", lessons);

  const events = (s.events || [])
    .filter((e) => hitAll([e.name, e.place, e.note], needle))
    .map((e) => ({
      id: "event:" + e.id,
      title: e.name,
      note: [humanDate(e.date), e.start || "", e.place || ""].filter(Boolean).join(" · "),
      body: touches(e.note, needle) ? excerpt(e.note, needle) : "",
      screen: "events",
      priority: Number(e.priority) || 2,
    }));
  add("events", "События", "events", events);



  const notes = [];
  for (const owner of s.notebookOwners || []) {
    const blocks = (s.notebooks || {})[owner.key] || [];
    // Нашли предмет — нашли и его тетрадь: «Анг» открывает тетрадь английского.
    if (blocks.length && hit(owner.name, needle)) {
      notes.push({
        id: "notebook:" + owner.key,
        title: "Тетрадь: " + owner.name,
        note: blocks.length + " " + blocksWord(blocks.length) + " · " + blocks.map((b) => b.title).filter(Boolean).slice(0, 3).join(", "),
        color: owner.color,
        screen: "notes",
        notebook: owner.key,
        focus: "",
      });
    }
    for (const block of blocks) {
      if (hit(block.title, needle)) {
        notes.push({
          id: "block:" + block.id,
          title: block.title,
          note: owner.name,
          color: owner.color,
          screen: "notes",
          notebook: owner.key,
          notebookFocus: { blockId: block.id },
        });
      }
      for (const branch of block.branches || []) {
        const text = stripHtml(branch.html);
        const file = fileHit(branch.files);
        if (!hitAll([block.title, branch.title, text], needle) && !file) continue;
        notes.push({
          id: "branch:" + branch.id,
          title: branch.title || "без названия",
          note: owner.name + " · " + block.title,
          body: touches(text, needle) ? excerpt(text, needle) : file ? "📎 " + file.name : "",
          color: owner.color,
          screen: "notes",
          notebook: owner.key,
          notebookFocus: { blockId: block.id, branchId: branch.id },
        });
      }
    }
  }
  add("notes", "Тетради", "notes", notes);

  const topics = [];
  for (const subject of s.subjects || []) {
    for (const topic of subject.topics || []) {
      if (hit(topic.name, needle)) {
        topics.push({
          id: "topic:" + topic.id,
          title: topic.name,
          note: subject.name + (topic.done ? " · пройдено" : ""),
          color: subject.color,
          screen: "study",
          subjectId: subject.id,
        });
      }
      // Заметки и конспекты к уроку — тоже записи, их ищут наравне с тетрадью.
      for (const n of topic.notes || []) {
        const text = stripHtml(n.html);
        const file = fileHit(n.files);
        if (!hitAll([topic.name, n.text, text], needle) && !file) continue;
        topics.push({
          id: "topicnote:" + n.id,
          title: n.text || topic.name,
          note: subject.name + " · " + topic.name,
          body: touches(text, needle) ? excerpt(text, needle) : file ? "📎 " + file.name : "",
          color: subject.color,
          screen: "study",
          subjectId: subject.id,
          focus: "topic:" + topic.id,
        });
      }
    }
  }
  add("topics", "Подготовка: темы и заметки", "study", topics);

  const journal = (s.journal || [])
    .filter((e) => hitAll([e.note, s.subjectName ? s.subjectName(e.subjectId) : ""], needle))
    .map((e) => ({
      id: "journal:" + e.id,
      title: e.note,
      note: (s.subjectName ? s.subjectName(e.subjectId) : e.subjectId) + " · " + humanDate(e.date) + " · " + e.hours + " ч",
      screen: "journal",
      date: e.date,
    }));
  add("journal", "Дневник: занятия", "journal", journal);

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
    const byText = !exact && !starts && hitAll([t.text, t.subject, t.section], needle);
    if (!exact && !starts && !byText) continue;
    tasks.push({
      rank: exact ? 0 : starts ? 1 : 2,
      id: "task:" + t.id,
      title: "№ " + t.id,
      note: t.subject + " · " + t.section,
      body: touches(t.text, needle) ? excerpt(t.text, needle) : t.text.slice(0, 120),
      screen: "trainer",
      task: { id: t.id, subject: t.subject },
    });
  }
  tasks.sort((a, b) => a.rank - b.rank || a.id.localeCompare(b.id));
  add("bank", "Задания банка ФИПИ", "trainer", tasks, "trainer");



  return { query: needle, total: groups.reduce((sum, g) => sum + g.total, 0), groups };
}
