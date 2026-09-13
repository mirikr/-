// Созвездия для фона: точки, которые иногда складываются в надпись или фигуру.
//
// Буквы набраны отрезками, как в чертёжном шрифте: у каждой свой список точек в
// координатах от нуля до единицы (слева направо, сверху вниз) и список рёбер
// между ними. Из этого же материала сделан и сам скебоб — он просто крупнее.
//
// Появляется всё это редко и само: раз в несколько минут фон бросает кости, и
// если выпадает один процент — точки съезжаются в фигуру, держатся несколько
// секунд и расходятся обратно.

// Кружок из восьми точек — буквы О и С, а также глаза скебоба.
function ring(cx, cy, rx, ry, from = 0, to = 360, steps = 8) {
  const pts = [];
  const span = to - from;
  const count = span >= 360 ? steps : steps;
  for (let i = 0; i < count; i++) {
    const a = ((from + (span * i) / (span >= 360 ? count : count - 1)) * Math.PI) / 180;
    pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  const edges = [];
  for (let i = 0; i < count - 1; i++) edges.push([i, i + 1]);
  if (span >= 360) edges.push([count - 1, 0]);
  return { p: pts, e: edges };
}

// Буква: ширина в долях высоты строки, точки и рёбра.
const GLYPHS = {
  A: { w: 0.62, p: [[0, 1], [0.31, 0], [0.62, 1], [0.14, 0.56], [0.48, 0.56]], e: [[0, 1], [1, 2], [3, 4]] },
  I: { w: 0.34, p: [[0, 0], [0.34, 0], [0.17, 0], [0.17, 1], [0, 1], [0.34, 1]], e: [[0, 1], [2, 3], [4, 5]] },
  K: { w: 0.56, p: [[0, 0], [0, 1], [0, 0.52], [0.56, 0], [0.56, 1]], e: [[0, 1], [2, 3], [2, 4]] },
  L: { w: 0.5, p: [[0, 0], [0, 1], [0.5, 1]], e: [[0, 1], [1, 2]] },
  N: { w: 0.58, p: [[0, 1], [0, 0], [0.58, 1], [0.58, 0]], e: [[0, 1], [1, 2], [2, 3]] },
  O: ring(0.29, 0.5, 0.29, 0.5),
  R: { w: 0.56, p: [[0, 1], [0, 0], [0.44, 0.05], [0.5, 0.28], [0.42, 0.5], [0, 0.5], [0.56, 1]], e: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [4, 6]] },
  T: { w: 0.58, p: [[0, 0], [0.58, 0], [0.29, 0], [0.29, 1]], e: [[0, 1], [2, 3]] },
  V: { w: 0.6, p: [[0, 0], [0.3, 1], [0.6, 0]], e: [[0, 1], [1, 2]] },
  М: { w: 0.66, p: [[0, 1], [0, 0], [0.33, 0.56], [0.66, 0], [0.66, 1]], e: [[0, 1], [1, 2], [2, 3], [3, 4]] },
  И: { w: 0.56, p: [[0, 0], [0, 1], [0.56, 0], [0.56, 1]], e: [[0, 1], [1, 2], [2, 3]] },
  Р: { w: 0.52, p: [[0, 1], [0, 0], [0.44, 0.05], [0.5, 0.3], [0.42, 0.54], [0, 0.54]], e: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5]] },
  С: ring(0.3, 0.5, 0.3, 0.5, 55, 305, 7),
  Е: { w: 0.48, p: [[0, 0], [0, 1], [0.48, 0], [0, 0.5], [0.38, 0.5], [0.48, 1]], e: [[0, 1], [0, 2], [3, 4], [1, 5]] },
  Б: { w: 0.52, p: [[0.48, 0], [0, 0], [0, 0.48], [0.42, 0.52], [0.5, 0.76], [0.4, 1], [0, 1]], e: [[0, 1], [1, 2], [2, 6], [2, 3], [3, 4], [4, 5], [5, 6]] },
};

// Буква О без «w» — у кружка ширина считается по точкам.
Object.values(GLYPHS).forEach((g) => {
  if (g.w === undefined) g.w = Math.max(...g.p.map((pt) => pt[0]));
});

const GAP = 0.22;

// Собирает слово в единый набор точек и рёбер, вписанный в прямоугольник 0..1.
function word(text) {
  const letters = [...text].map((ch) => GLYPHS[ch]).filter(Boolean);
  const total = letters.reduce((sum, g) => sum + g.w, 0) + GAP * (letters.length - 1);
  const p = [];
  const e = [];
  let x = 0;
  letters.forEach((g) => {
    const base = p.length;
    g.p.forEach((pt) => p.push([(x + pt[0]) / total, pt[1]]));
    g.e.forEach(([a, b]) => e.push([base + a, base + b]));
    x += g.w + GAP;
  });
  return { p, e, ratio: total };
}

// Скебоб: хохол, голова, клюв, тело и лапы — тем же способом, что и буквы.
// Контур узнаётся по трём приметам: растрёпанные пряди, круглая голова и
// тяжёлый клюв во всё лицо.
const SKEBOB = (() => {
  const p = [];
  const e = [];
  const add = (x, y) => p.push([x, y]) - 1;

  const head = ring(0.5, 0.34, 0.2, 0.18, 0, 360, 10);
  const headBase = p.length;
  head.p.forEach((pt) => p.push(pt));
  head.e.forEach(([a, b]) => e.push([headBase + a, headBase + b]));

  // Пряди хохла: от макушки вверх и в стороны.
  const tufts = [
    [0.28, 0.2, 0.14, 0.0],
    [0.4, 0.16, 0.34, -0.06],
    [0.5, 0.15, 0.52, -0.08],
    [0.62, 0.17, 0.7, -0.04],
    [0.72, 0.22, 0.86, 0.04],
  ];
  tufts.forEach(([x1, y1, x2, y2]) => {
    const a = add(x1, y1);
    const b = add(x2, y2);
    e.push([a, b]);
  });

  // Клюв — треугольник от глаз вниз.
  const bl = add(0.38, 0.33);
  const br = add(0.62, 0.33);
  const tip = add(0.5, 0.68);
  e.push([bl, br], [bl, tip], [br, tip]);

  // Тело и лапы.
  const body = [
    [0.34, 0.52],
    [0.3, 0.74],
    [0.4, 0.9],
    [0.6, 0.9],
    [0.7, 0.74],
    [0.66, 0.52],
  ];
  const bodyBase = p.length;
  body.forEach((pt) => p.push(pt));
  for (let i = 0; i < body.length - 1; i++) e.push([bodyBase + i, bodyBase + i + 1]);

  const lf = add(0.44, 1);
  const rf = add(0.58, 1);
  e.push([bodyBase + 2, lf], [bodyBase + 3, rf]);

  return { p, e, ratio: 1 };
})();

export const EASTER_EGGS = [
  { id: "ronik", label: "RONIK", shape: word("RONIK") },
  { id: "vitalik", label: "VITALIK", shape: word("VITALIK") },
  { id: "mir", label: "МИР", shape: word("МИР") },
  { id: "skebob-word", label: "СКЕБОБ", shape: word("СКЕБОБ") },
  { id: "skebob", label: "Скебоб", shape: SKEBOB },
];

// Шанс на каждую проверку. Проверка идёт раз в несколько минут, так что
// встретить фигуру — редкая удача, а не фон из надписей.
export const EASTER_CHANCE = 0.01;
export const EASTER_EVERY_MS = 150000;

export function randomEgg() {
  return EASTER_EGGS[Math.floor(Math.random() * EASTER_EGGS.length)];
}

export function eggById(id) {
  return EASTER_EGGS.find((e) => e.id === id) || null;
}
