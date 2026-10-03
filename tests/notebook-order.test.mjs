// Порядок предметов в тетрадях: закрепление и перетаскивание.
import { orderOwners, togglePin, moveOwner, dropIndex, ownerMeta, setSort } from "../src/notebook-order.js";

let bad = 0;
function check(name, ok, note = "") {
  if (!ok) bad += 1;
  console.log((ok ? "  ok    " : "  FAIL  ") + name + (note ? " — " + note : ""));
}
const O = ["a", "b", "c", "d", "e"].map((key) => ({ key, name: key.toUpperCase() }));
const keys = (list) => list.map((o) => o.key).join("");

check("без настройки — обычный порядок", keys(orderOwners(O, undefined)) === "abcde");
check("испорченная настройка не роняет список", keys(orderOwners(O, { order: "x", pinned: null })) === "abcde");

let pref = togglePin(undefined, O, "d");
check("закреплённый поднимается наверх", keys(orderOwners(O, pref)) === "dabce", keys(orderOwners(O, pref)));
check("и помечен", orderOwners(O, pref)[0].pinned === true && orderOwners(O, pref)[1].pinned === false);
pref = togglePin(pref, O, "b");
check("второй закреплённый — под первым", keys(orderOwners(O, pref)) === "dbace", keys(orderOwners(O, pref)));
pref = togglePin(pref, O, "d");
check("открепленный — первым среди остальных", keys(orderOwners(O, pref)) === "bdace", keys(orderOwners(O, pref)));

pref = moveOwner(pref, O, 4, 1);
check("перетаскивание внутри группы", keys(orderOwners(O, pref)) === "bedac", keys(orderOwners(O, pref)));
pref = moveOwner(pref, O, 3, 0);
check("незакреплённый не заезжает к закреплённым", keys(orderOwners(O, pref)) === "baedc", keys(orderOwners(O, pref)));
pref = moveOwner(pref, O, 0, 4);
check("закреплённый не уезжает вниз", keys(orderOwners(O, pref)) === "baedc", keys(orderOwners(O, pref)));
check("чужой индекс ничего не ломает", keys(orderOwners(O, moveOwner(pref, O, 9, 0))) === "baedc");

const fewer = O.filter((o) => o.key !== "e");
const p2 = moveOwner(pref, fewer, 3, 1);
check("пропавший предмет не мешает", keys(orderOwners(fewer, p2)) === "bcad", keys(orderOwners(fewer, p2)));
check("вернувшийся — на своём месте", keys(orderOwners(O, p2)) === "bcade", keys(orderOwners(O, p2)));
const more = O.concat({ key: "f", name: "F" });
check("новый предмет — в конце", keys(orderOwners(more, pref)) === "baedcf");

const mids = [10, 30, 50, 70, 90];
check("место по пальцу: вниз", dropIndex(mids, 1, 75, 1) === 3);
check("место по пальцу: к началу группы", dropIndex(mids, 3, 0, 1) === 1);
check("место по пальцу: в самый низ", dropIndex(mids, 1, 500, 1) === 4);
check("закреплённый — только среди закреплённых", dropIndex(mids, 0, 500, 2) === 1);

// Сортировка по расписанию.
const sched = [
  { subjectName: "Право", day: "mon", start: "10:20", priority: 3, level: "prof", kind: "lesson" },
  { subjectName: "Право", day: "thu", start: "08:30", priority: 2, level: "base", kind: "lesson" },
  { subjectName: "История", day: "tue", start: "09:25", priority: 1, level: "base", kind: "lesson" },
  { subjectName: "Экономика", day: "sat", start: "11:20", priority: 2, level: "olymp", kind: "lesson" },
  { subjectName: "Экономика", day: "fri", start: "18:00", priority: 2, kind: "exam" },
  { subjectName: "Физра", day: "mon", start: "14:05", priority: 1, level: "base", kind: "lesson", skip: true },
];
const mon9 = new Date(2026, 8, 28, 9, 0); // понедельник, 9:00
const m = (n) => ownerMeta(n, sched, mon9);
check("важность — наибольшая у уроков предмета", m("Право").priority === 3);
check("уровень — самый высокий: проф", m("Право").level === "prof");
check("олимпиадный трек — спецкурс", m("Экономика").level === "special");
check("экзамен и пропускаемый урок не в счёт", m("Физра").priority === 0 && m("Экономика").nextIn === (5 * 1440 + 11 * 60 + 20 - 9 * 60));
check("ближайший урок: сегодня позже — через 80 мин", m("Право").nextIn === 80);
check("без уроков — без меток", m("Химия").priority === 0 && m("Химия").level === "" && m("Химия").nextIn === Infinity);

const S2 = ["Право", "История", "Экономика", "Химия"].map((name) => ({ key: "lyceum:" + name, name, ...m(name) }));
const names = (list) => list.map((o) => o.name).join(",");
check("по важности", names(orderOwners(S2, setSort(undefined, "priority"))) === "Право,Экономика,История,Химия", names(orderOwners(S2, setSort(undefined, "priority"))));
check("по уровню", names(orderOwners(S2, setSort(undefined, "level"))) === "Экономика,Право,История,Химия", names(orderOwners(S2, setSort(undefined, "level"))));
check("по ближайшему уроку", names(orderOwners(S2, setSort(undefined, "next"))) === "Право,История,Экономика,Химия", names(orderOwners(S2, setSort(undefined, "next"))));
check("по алфавиту", names(orderOwners(S2, setSort(undefined, "name"))) === "История,Право,Химия,Экономика");
let sp = setSort(togglePin(undefined, S2, "lyceum:Химия"), "priority");
check("закреплённый — наверху при любой сортировке", names(orderOwners(S2, sp)) === "Химия,Право,Экономика,История");
check("закрепление не сбрасывает сортировку", togglePin(sp, S2, "lyceum:История").sort === "priority");
sp = moveOwner(sp, S2, 3, 1);
check("перетащили руками — порядок стал ручным и таким, как на экране", sp.sort === "manual" && names(orderOwners(S2, sp)) === "Химия,История,Право,Экономика", names(orderOwners(S2, sp)));
check("неизвестная сортировка — вручную", orderOwners(S2, { sort: "zzz" }).length === 4 && setSort(undefined, "zzz").sort === "manual");

console.log(bad ? `\nпровалено: ${bad}` : "\nпорядок предметов в тетрадях работает");
process.exit(bad ? 1 : 0);
