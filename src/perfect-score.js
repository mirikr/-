// 100 баллов — идеальная работа: число переливается золотом и рядом мерцает
// звёздочка. Небольшой эффект, без вспышек; кто попросил систему уменьшить
// движение, видит просто золотое число.

export const PERFECT_CLASS = "ap-perfect";

const CSS = `
.ap-perfect {
  position: relative;
  display: inline-block;
  background: linear-gradient(110deg, var(--gold) 0%, #fff4c4 18%, var(--gold) 36%, var(--accent) 55%, #fff4c4 74%, var(--gold) 100%);
  background-size: 260% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  color: transparent !important;
  animation: ap-perfect-shine 3.4s linear infinite;
}
.ap-perfect::after {
  content: "✦";
  position: absolute;
  top: -0.32em;
  right: -0.62em;
  font-size: 0.48em;
  line-height: 1;
  -webkit-text-fill-color: var(--gold);
  color: var(--gold);
  animation: ap-perfect-twinkle 1.7s ease-in-out infinite;
  pointer-events: none;
}
@keyframes ap-perfect-shine { to { background-position: -260% 0; } }
@keyframes ap-perfect-twinkle {
  0%, 100% { opacity: 0.25; transform: scale(0.7) rotate(0deg); }
  50% { opacity: 1; transform: scale(1.1) rotate(25deg); }
}
@media (prefers-reduced-motion: reduce) {
  .ap-perfect, .ap-perfect::after { animation: none; }
}
`;

export function ensurePerfectCss() {
  if (typeof document === "undefined" || document.getElementById("ap-perfect-css")) return;
  const el = document.createElement("style");
  el.id = "ap-perfect-css";
  el.textContent = CSS;
  document.head.appendChild(el);
}

// Ровно 100 из 100 (с поправкой на дробную арифметику).
export const isPerfect = (percent) => percent !== null && percent !== undefined && Math.abs(Number(percent) - 100) < 1e-6;
