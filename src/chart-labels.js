// Подписи у точек графика без наслоений.
//
// Раньше подпись ставилась справа от точки, а если там занято — слева, и
// только с оглядкой на соседей на той же высоте. У кого по предмету ещё нет ни
// плана, ни записей, точки ложатся одна на другую в ноль графика, и их
// названия сливались в одну кашу, а левые уезжали за край. Теперь каждая
// подпись ищет место по очереди: справа, слева, сверху, снизу, а если рядом
// всё занято — отходит вверх или вниз строкой и тянет к точке тонкую линию.
// Место годится, если подпись целиком внутри графика, не задевает уже
// поставленные подписи, чужие точки и подписи осей.

const PAD = 1;
// Между подписями в строку — заметный зазор: «Право» и «Практика в группе»
// впритык читались как одно название.
const GAP_X = 10;

export function estimateWidth(text, size) {
  return String(text).length * size * 0.56;
}

function overlaps(a, b) {
  return a.x < b.x + b.w + GAP_X && b.x < a.x + a.w + GAP_X && a.y < b.y + b.h + PAD && b.y < a.y + a.h + PAD;
}

function hitsCircle(box, c) {
  const nx = Math.max(box.x, Math.min(c.x, box.x + box.w));
  const ny = Math.max(box.y, Math.min(c.y, box.y + box.h));
  return (nx - c.x) ** 2 + (ny - c.y) ** 2 < (c.r + PAD) ** 2;
}

// Длинное название укорачивается с «…», чтобы подпись вообще могла встать.
export function shorten(text, maxWidth, size, measure = estimateWidth) {
  const full = String(text);
  if (measure(full, size) <= maxWidth) return full;
  let cut = full.length;
  while (cut > 1 && measure(full.slice(0, cut).trimEnd() + "…", size) > maxWidth) cut -= 1;
  return full.slice(0, cut).trimEnd() + "…";
}

// points: [{ id, x, y, r, text }]; circles — ещё препятствия-кружки (кольца
// рекомендаций); obstacles — прямоугольники {x, y, w, h} (подписи осей).
// Возвращает { [id]: { text, x, y, anchor, lead } }: x, y — точка привязки
// текста (y — базовая линия), lead — линия от точки к отодвинутой подписи.
export function placeLabels(points, { width, height, size, obstacles = [], circles = [], measure = estimateWidth, maxWidth = width * 0.45 }) {
  const lh = size + 3;
  const placed = obstacles.map((b) => ({ ...b }));
  const dots = points.map((p) => ({ x: p.x, y: p.y, r: p.r, id: p.id })).concat(circles.map((c) => ({ ...c, id: null })));
  const out = {};
  for (const p of points) {
    const text = shorten(p.text, maxWidth, size, measure);
    const w = measure(text, size);
    const gap = p.r + 6;
    const cands = [
      { x: p.x + gap, y: p.y - lh / 2, anchor: "start" },
      { x: p.x - gap - w, y: p.y - lh / 2, anchor: "end" },
      { x: p.x - w / 2, y: p.y - p.r - 4 - lh, anchor: "middle" },
      { x: p.x - w / 2, y: p.y + p.r + 4, anchor: "middle" },
    ];
    for (let k = 1; k <= 12; k += 1) {
      for (const dir of [-1, 1]) {
        const y = p.y - lh / 2 + dir * k * lh;
        cands.push({ x: p.x + gap, y, anchor: "start", lead: true });
        cands.push({ x: p.x - gap - w, y, anchor: "end", lead: true });
      }
    }
    let best = null;
    let bestHits = Infinity;
    for (const c of cands) {
      const box = { x: c.x, y: c.y, w, h: lh };
      if (box.x < 0 || box.y < 0 || box.x + box.w > width || box.y + box.h > height) continue;
      const hits =
        placed.filter((b) => overlaps(box, b)).length +
        dots.filter((d) => d.id !== p.id && hitsCircle(box, d)).length;
      if (hits < bestHits) {
        best = { ...c, box };
        bestHits = hits;
        if (hits === 0) break;
      }
    }
    if (!best) best = { x: p.x + gap, y: p.y - lh / 2, anchor: "start", box: { x: p.x + gap, y: p.y - lh / 2, w, h: lh } };
    placed.push(best.box);
    const tx = best.anchor === "start" ? best.box.x : best.anchor === "end" ? best.box.x + w : best.box.x + w / 2;
    const cy = best.box.y + lh / 2;
    out[p.id] = {
      text,
      x: tx,
      y: cy + size * 0.33,
      anchor: best.anchor,
      lead: best.lead ? { x1: p.x, y1: p.y, x2: best.anchor === "start" ? best.box.x - 2 : best.box.x + w + 2, y2: cy } : null,
    };
  }
  return out;
}
