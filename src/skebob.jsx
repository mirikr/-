import React from "react";

// Пасхалка. Живёт в самом низу колонки — над номером версии, где обычно ничего
// нет. Существо нарисовано теми же средствами, что и остальное приложение:
// силуэт берёт цвет текста вокруг, клюв — золотой из палитры, поэтому оно
// одинаково читается и в светлой теме, и в ночной.
//
// Узнаётся по контуру: взъерошенный хохол, круглая голова, глаза по краям и
// клюв во всё лицо.
// Хохол — главная примета: пряди торчат во все стороны, разной длины и под
// разными углами. Считать их руками в путях нечитаемо, поэтому они задаются
// углом, длиной и шириной у основания, а точки считаются здесь.
const TUFTS = [
  [196, 15, 3.4], [211, 21, 4], [226, 26, 4.4], [241, 30, 4.6], [256, 33, 4.6],
  [272, 34, 4.6], [288, 32, 4.6], [303, 28, 4.4], [318, 23, 4], [333, 17, 3.4],
];

const R = 15.5;
const CX = 30;
const CY = 31;
const rad = (deg) => (deg * Math.PI) / 180;
const at = (deg, r) => [CX + r * Math.cos(rad(deg)), CY + r * Math.sin(rad(deg))];

function tuftPath([angle, len, half]) {
  const [bx, by] = at(angle, R - 1);
  // Пряди загибаются в сторону от макушки — иначе выходит корона, а не парик.
  const skew = (angle - 272) * 0.16;
  const [tx, ty] = at(angle + skew, R + len);
  const [lx, ly] = at(angle - half, R - 1);
  const [rx, ry] = at(angle + half, R - 1);
  const [c1x, c1y] = at(angle - half * 0.5 + skew * 0.4, R + len * 0.6);
  const [c2x, c2y] = at(angle + half * 0.5 + skew * 0.4, R + len * 0.6);
  return `M${lx.toFixed(1)} ${ly.toFixed(1)}Q${c1x.toFixed(1)} ${c1y.toFixed(1)} ${tx.toFixed(1)} ${ty.toFixed(1)}Q${c2x.toFixed(1)} ${c2y.toFixed(1)} ${rx.toFixed(1)} ${ry.toFixed(1)}Z`;
}

export function Skebob({ size = 46 }) {
  return (
    <svg viewBox="0 0 60 82" width={size} height={(size * 82) / 60} aria-hidden="true" style={{ display: "block" }}>
      {/* Лапы: сидит на жёрдочке, пальцы врастопырку. */}
      <g stroke="var(--gold)" strokeWidth="1.7" strokeLinecap="round" fill="none">
        <path d="M25 66v6M35 66v6" />
        <path d="M25 72l-5 2.5M25 72l5 2.5M25 72v2.5M35 72l-5 2.5M35 72l5 2.5M35 72v2.5" />
      </g>
      <path d="M13 76h34" stroke="currentColor" strokeWidth="1.4" opacity="0.4" strokeLinecap="round" fill="none" />

      {/* Туловище уже головы: птица тощая, вся в голову и клюв. */}
      <ellipse cx="30" cy="55" rx="10.5" ry="12.5" fill="currentColor" />
      <g fill="currentColor">
        {TUFTS.map((t, i) => (
          <path key={i} d={tuftPath(t)} />
        ))}
      </g>
      <circle cx={CX} cy={CY} r={R} fill="currentColor" />

      {/* Клюв во всё лицо, с загнутым книзу кончиком. */}
      <path
        d="M22 22c0-3.5 16-3.5 16 0 1.8 11 1 23-3.5 35-1.4 3.8-2.6 5.4-3.6 5.4-1.1 0-2.4-1.8-3.9-5.8C22.6 44.8 20.3 33 22 22z"
        fill="var(--gold)"
        stroke="var(--rail)"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path d="M30 24c2.2 7 2.2 21 0 34" stroke="var(--rail)" strokeWidth="1.3" opacity="0.45" fill="none" />

      {/* Глаза по краям головы, над основанием клюва — как у оригинала. */}
      <g>
        <circle cx="18.5" cy="24" r="4.4" fill="var(--rail)" />
        <circle cx="41.5" cy="24" r="4.4" fill="var(--rail)" />
        <circle cx="19.8" cy="22.8" r="1.5" fill="currentColor" />
        <circle cx="42.8" cy="22.8" r="1.5" fill="currentColor" />
      </g>
    </svg>
  );
}

// Подпись и существо рядом с ней. Одна и та же вставка в колонке на компьютере
// и в листе «Ещё» на телефоне.
export default function SkebobNote({ size = 46 }) {
  return (
    <div style={styles.wrap}>
      <div style={styles.text}>Сайт создан РМВ при помощи вайбкодинга через Claude</div>
      <figure style={styles.fig}>
        <Skebob size={size} />
        <figcaption style={styles.cap}>
          скебоб
          <span style={styles.cap2}>zonted</span>
        </figcaption>
      </figure>
    </div>
  );
}

const styles = {
  wrap: { display: "flex", alignItems: "flex-start", gap: 8, marginTop: 12 },
  text: { flex: 1, minWidth: 0, fontSize: 10.5, lineHeight: 1.45, color: "var(--railInk2)", opacity: 0.75 },
  fig: { margin: 0, flexShrink: 0, color: "var(--railInk2)", textAlign: "center" },
  cap: {
    fontFamily: "'PT Serif', Georgia, serif",
    fontSize: 10.5,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "var(--railInk2)",
    opacity: 0.75,
    marginTop: 2,
  },
  cap2: { display: "block", fontSize: 9.5, letterSpacing: "0.12em", textTransform: "lowercase", opacity: 0.7 },
};
