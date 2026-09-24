// Порядок предметов в тетрадях: закрепление и перетаскивание.
import { orderOwners, togglePin, moveOwner, dropIndex } from "../src/notebook-order.js";

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

console.log(bad ? `\nпровалено: ${bad}` : "\nпорядок предметов в тетрадях работает");
process.exit(bad ? 1 : 0);
