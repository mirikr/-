// Общий список файлов: один файл — в нескольких местах, поиск, ссылки.
import { collectFiles, fileInUse, searchFiles, isAttachment } from "../src/file-library.js";

let bad = 0;
function check(name, ok, note = "") {
  if (!ok) bad += 1;
  console.log((ok ? "  ok    " : "  FAIL  ") + name + (note ? " — " + note : ""));
}
const A = { name: "Конституция.pdf", size: 10, path: "u/hw-1/a.pdf" };
const B = { name: "Карта.png", size: 20, key: "hwfile-note-1" };
const C = { name: "Шпаргалка.txt", size: 5, key: "hwfile-misc-2" };
const state = {
  homework: [{ id: "h1", date: "2026-10-03", subjectName: "Право", text: "Глава 1", attachments: [A] }],
  notebooks: { "lyceum:Право": [{ title: "Конституция", branches: [{ title: "Основы", files: [A] }] }], "lyceum:География": [{ title: "Европа", branches: [{ title: "Страны", files: [B] }] }] },
  data: { soc: { topics: [{ name: "Тема 1", notes: [{ files: [C] }] }], custom: [] } },
};
const names = (k) => ({ "lyceum:Право": "Право", "lyceum:География": "География", "subj:soc": "Обществознание" })[k];
const list = collectFiles(state, names);
check("каждый файл — один раз", list.length === 3, String(list.length));
const a = list.find((e) => e.file.path === A.path);
check("у общего файла — оба места", a.places.length === 2 && a.places.some((p) => p.kind === "homework") && a.places.some((p) => p.kind === "notebook"));
check("место подписано: тетрадь, предмет, блок › ветка", a.places.find((p) => p.kind === "notebook").label === "Тетрадь · Право · Конституция › Основы");
check("задание подписано датой", a.places.find((p) => p.kind === "homework").label === "Задание · Право · 03.10");
check("заметки к урокам тоже в списке", list.some((e) => e.file.key === C.key && e.places[0].label === "Подготовка · Обществознание · Тема 1"));

check("поиск по названию", searchFiles(list, "карт").length === 1);
check("поиск по месту и нескольким словам", searchFiles(list, "тетрадь европа").length === 1);
check("поиск по тексту задания", searchFiles(list, "глава").length === 1);
check("ё = е, регистр не важен", searchFiles(list, "ШПАРГАЛКА").length === 1);
check("файлы предмета — первыми", searchFiles(list, "", "География")[0].file.key === B.key);

check("файл с двумя ссылками — в деле", fileInUse(state, A));
const noHw = { ...state, homework: [] };
check("убрали из задания — ещё в тетради", fileInUse(noHw, A));
const none = { ...noHw, notebooks: { "lyceum:География": state.notebooks["lyceum:География"] } };
check("убрали отовсюду — свободен", !fileInUse(none, A));
check("другой файл не путается", fileInUse(none, B) && !fileInUse({}, B));
check("не вложение — не файл", !isAttachment({ name: "x" }) && !isAttachment({ name: "x", key: "other" }) && isAttachment(B));
check("испорченные записи не роняют", collectFiles({ homework: [{ attachments: [null, 5] }], notebooks: { x: null } }).length === 0);

if (bad) {
  console.log(bad + " проверок не прошло");
  process.exit(1);
}
console.log("Список файлов: всё в порядке");
