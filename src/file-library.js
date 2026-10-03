// Все загруженные файлы приложения в одном списке — для окна «Выбрать из
// загруженных».
//
// Файл хранится один раз (в облаке или в памяти браузера), а у задания, ветки
// тетради или заметки к уроку лежит только ссылка на него: { name, size, path }
// или { name, key }. Поэтому один и тот же файл можно показать в нескольких
// местах, ничего не копируя. А раз ссылок может быть несколько, стирать файл
// из хранилища можно, только когда на него не осталось ни одной (fileInUse).

export function isAttachment(x) {
  return !!(x && typeof x === "object" && typeof x.name === "string" && (typeof x.path === "string" || (typeof x.key === "string" && x.key.startsWith("hwfile-"))));
}

export function fileId(att) {
  return att.path ? "p:" + att.path : "k:" + att.key;
}

// Обходит записи и отдаёт каждую ссылку на файл вместе с местом, где она лежит.
export function eachFile(state, visit, ownerName) {
  const st = state || {};
  (st.homework || []).forEach((h) => {
    (h.attachments || []).forEach((f) => {
      if (!isAttachment(f)) return;
      visit(f, { kind: "homework", id: h.id, subject: h.subjectName || "", date: h.date || "", label: "Задание" + (h.subjectName ? " · " + h.subjectName : "") + (h.date ? " · " + shortDate(h.date) : ""), text: h.text || "" });
    });
  });
  Object.entries(st.notebooks || {}).forEach(([key, blocks]) => {
    const subject = ownerName ? ownerName(key) : key.replace(/^(lyceum|subj):/, "");
    (Array.isArray(blocks) ? blocks : []).forEach((b) => {
      (b.files || []).forEach((f) => isAttachment(f) && visit(f, { kind: "notebook", key, subject, label: "Тетрадь · " + subject + " · " + (b.title || "блок") }));
      (b.branches || []).forEach((r) => {
        (r.files || []).forEach((f) => {
          if (!isAttachment(f)) return;
          visit(f, { kind: "notebook", key, subject, label: "Тетрадь · " + subject + " · " + (b.title || "блок") + " › " + (r.title || "ветка") });
        });
      });
    });
  });
  Object.entries(st.data || {}).forEach(([subjectId, subj]) => {
    const subject = ownerName ? ownerName("subj:" + subjectId) : subjectId;
    ["topics", "custom"].forEach((part) => {
      ((subj && subj[part]) || []).forEach((t) => {
        (t.notes || []).forEach((n) => {
          (n.files || []).forEach((f) => isAttachment(f) && visit(f, { kind: "topic", subject, label: "Подготовка · " + subject + " · " + (t.title || t.name || "тема") }));
        });
      });
    });
  });
}

function shortDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? m[3] + "." + m[2] : iso;
}

// Список для окна выбора: каждый файл один раз, со всеми местами, где он есть.
export function collectFiles(state, ownerName) {
  const map = new Map();
  eachFile(
    state,
    (f, place) => {
      const id = fileId(f);
      if (!map.has(id)) map.set(id, { id, file: f, places: [] });
      map.get(id).places.push(place);
    },
    ownerName
  );
  return [...map.values()];
}

// Есть ли ещё ссылка на этот файл где-нибудь в записях.
export function fileInUse(state, att) {
  if (!isAttachment(att)) return false;
  const id = fileId(att);
  let found = false;
  eachFile(state, (f) => {
    if (!found && fileId(f) === id) found = true;
  });
  return found;
}

const norm = (s) => String(s || "").toLowerCase().replace(/ё/g, "е");

// Поиск по имени файла и по месту: «право», «конституц pdf». Каждое слово
// должно найтись хоть где-то. Файлы нужного предмета — первыми.
export function searchFiles(entries, query, subject) {
  const words = norm(query).split(/\s+/).filter(Boolean);
  const hay = (e) => norm([e.file.name, ...e.places.map((p) => p.label + " " + (p.text || ""))].join(" "));
  const hits = entries.filter((e) => words.every((w) => hay(e).includes(w)));
  const mine = (e) => (subject && e.places.some((p) => norm(p.subject) === norm(subject)) ? 0 : 1);
  return hits
    .map((e, i) => ({ e, i }))
    .sort((a, b) => mine(a.e) - mine(b.e) || a.i - b.i)
    .map((x) => x.e);
}
