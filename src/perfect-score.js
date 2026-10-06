// 100 баллов — идеальная работа: число переливается золотом и рядом мерцает
// звёздочка. Небольшой эффект, без вспышек; кто попросил систему уменьшить
// движение, видит просто золотое число.

export const PERFECT_CLASS = "ap-perfect";

const CSS = `
.ap-perfect {
  position: relative;
  display: inline-block;
  /* Узор повторяется ровно через половину картинки, а сдвигаем её как раз на
     эту половину — круг замыкается без скачка. */
  background: linear-gradient(110deg, var(--gold) 0%, #fff4c4 12%, var(--gold) 25%, var(--accent) 37.5%, var(--gold) 50%, #fff4c4 62%, var(--gold) 75%, var(--accent) 87.5%, var(--gold) 100%);
  background-size: 200% 100%;
  background-position: 0% 0;
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  color: transparent !important;
  animation: ap-perfect-shine 3.4s linear infinite;
  animation-delay: var(--ap-phase, 0s);
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
  animation-delay: var(--ap-phase, 0s);
  pointer-events: none;
}
@keyframes ap-perfect-shine { from { background-position: 0% 0; } to { background-position: 100% 0; } }
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

// Класс и фаза анимации по часам: если число перерисуется заново (обновились
// данные, переключили вид), блеск продолжится с того же места, а не начнётся
// сначала. Фаза ставится один раз, когда элемент появился, — React её потом
// не трогает (иначе каждая перерисовка сдвигала бы анимацию).
function setPhase(el) {
  if (!el || el.dataset.phase) return;
  el.dataset.phase = "1";
  el.style.setProperty("--ap-phase", -(Date.now() % 6800) + "ms");
}

export function perfectProps() {
  return { className: PERFECT_CLASS, ref: setPhase };
}
