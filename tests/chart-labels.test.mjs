// Подписи у точек графика баланса: не наезжают друг на друга и не уходят за край.
import { placeLabels, shorten, estimateWidth } from "../src/chart-labels.js";

let bad = 0;
function check(name, ok, note = "") {
  if (!ok) bad += 1;
  console.log((ok ? "  ok    " : "  FAIL  ") + name + (note ? " — " + note : ""));
}
const W = 460;
const H = 360;
const SIZE = 15;
const LH = SIZE + 3;
const boxOf = (l, text) => {
  const w = estimateWidth(text, SIZE);
  const x = l.anchor === "start" ? l.x : l.anchor === "end" ? l.x - w : l.x - w / 2;
  const cy = l.y - SIZE * 0.33;
  return { x, y: cy - LH / 2, w, h: LH };
};
const cross = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const inside = (b) => b.x >= 0 && b.y >= 0 && b.x + b.w <= W && b.y + b.h <= H;

function verify(tag, points) {
  const out = placeLabels(points, { width: W, height: H, size: SIZE, maxWidth: 200 });
  const boxes = points.map((p) => boxOf(out[p.id], out[p.id].text));
  let crossing = 0;
  for (let i = 0; i < boxes.length; i += 1) for (let j = i + 1; j < boxes.length; j += 1) if (cross(boxes[i], boxes[j])) crossing += 1;
  check(tag + ": подписи не наезжают друг на друга", crossing === 0, crossing + " пересечений");
  check(tag + ": все подписи внутри графика", boxes.every(inside));
  return out;
}

// Как на скриншоте: у пяти предметов ни плана, ни факта — все точки в нуле.
const names = ["Решение вариантов", "История", "Право", "Всероссийская олимпиада ВсОШ", "Экономика", "Социология", "Философия"];
const zero = names.map((n, i) => ({ id: "s" + i, x: 48, y: 310, r: 6 + (i % 3), text: n }));
const z = verify("семь точек в нуле", zero);
check("отодвинутые подписи тянут линию к точке", Object.values(z).some((l) => l.lead));
check("у первой подписи место рядом, без линии", !z.s0.lead);

// Две точки на одной высоте рядом — вторая подпись не ложится на первую.
verify("две рядом", [
  { id: "a", x: 200, y: 150, r: 8, text: "История" },
  { id: "b", x: 240, y: 150, r: 8, text: "Социология" },
]);
// У правого края подпись уходит влево, а не за край.
const edge = placeLabels([{ id: "r", x: 440, y: 100, r: 8, text: "Обществознание" }], { width: W, height: H, size: SIZE });
check("у правого края — слева от точки", edge.r.anchor === "end");

const long = shorten("Основы искусственного интеллекта (группа 2, углублённый)", 200, SIZE);
check("длинное название укорачивается", long.endsWith("…") && estimateWidth(long, SIZE) <= 200, long);
check("короткое — как есть", shorten("Право", 200, SIZE) === "Право");

// Подпись оси — препятствие.
const ax = placeLabels([{ id: "o", x: 48, y: 310, r: 6, text: "Право" }], {
  width: W, height: H, size: SIZE, obstacles: [{ x: 60, y: 300, w: 80, h: 20 }],
});
check("подпись не ложится на подпись оси", !cross(boxOf(ax.o, "Право"), { x: 60, y: 300, w: 80, h: 20 }));

if (bad) {
  console.log(bad + " проверок не прошло");
  process.exit(1);
}
console.log("Подписи графика: всё в порядке");
