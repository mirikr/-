import React, { useEffect, useRef } from "react";

// Фон приложения: кривые производственных возможностей, которые еле заметно
// дышат. Та же дуга, что в «Распределении» и на иконке, только очень тихая —
// смотреть на неё не надо, она просто убирает из-под текста плоскую заливку.
//
// Три оговорки, без которых такое украшение превращается в помеху:
// — системное «уменьшить движение» выключает анимацию целиком;
// — пока вкладка не на экране, кадры не рисуются: это фон, а не повод сажать
//   батарею в кармане;
// — шестнадцать кадров в секунду вместо шестидесяти. Движение и так на грани
//   различимого, а работы процессору вчетверо меньше.
//
// На компьютере кривые ведёт за курсором: дальние слои слушаются слабее
// ближних, отчего фон кажется объёмным. На телефоне курсора нет, и обработчик
// не вешается вовсе.
const FPS = 16;
const CURVES = [
  { base: 0.26, sway: 0.05, period: 96000, phase: 0, width: 2.4, alpha: 1 },
  { base: 0.46, sway: 0.07, period: 137000, phase: 2.1, width: 3.4, alpha: 0.78 },
  { base: 0.66, sway: 0.06, period: 113000, phase: 4.3, width: 2.2, alpha: 0.6 },
  { base: 0.86, sway: 0.08, period: 158000, phase: 5.6, width: 4, alpha: 0.45 },
  { base: 1.06, sway: 0.06, period: 121000, phase: 1.2, width: 2.8, alpha: 0.34 },
];

function readColor(name, fallback) {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

export default function Background({ theme, enabled = true }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !enabled) return;
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const ctx = canvas.getContext("2d");
    let raf = 0;
    let last = 0;
    let alive = true;
    let size = { w: 0, h: 0 };
    // Курсор ведёт кривые за собой — но только там, где курсор вообще есть:
    // на телефоне это просто мёртвый обработчик касаний.
    const fine = window.matchMedia && window.matchMedia("(pointer: fine)").matches;
    const target = { x: 0, y: 0 };
    const eased = { x: 0, y: 0 };

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      size = { w: window.innerWidth, h: window.innerHeight };
      canvas.width = Math.round(size.w * dpr);
      canvas.height = Math.round(size.h * dpr);
      canvas.style.width = size.w + "px";
      canvas.style.height = size.h + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function onMove(e) {
      // От середины экрана к краю: -1 … 1, чтобы смещение не зависело от размера окна.
      target.x = (e.clientX / window.innerWidth) * 2 - 1;
      target.y = (e.clientY / window.innerHeight) * 2 - 1;
    }

    function draw(now) {
      const { w, h } = size;
      // Догоняем курсор с запаздыванием: мгновенная реакция на фоне читается
      // как дёрганье, а так кривые именно «ведёт».
      eased.x += (target.x - eased.x) * 0.06;
      eased.y += (target.y - eased.y) * 0.06;
      ctx.clearRect(0, 0, w, h);
      // На кремовом фоне золото почти не видно, поэтому в светлой теме линии
      // берут приглушённый акцент, а в ночной — золото, которое на тёмном как
      // раз и светится.
      const color = readColor(theme === "night" ? "--gold" : "--accent", "#C9A227");
      const strength = theme === "night" ? 0.2 : 0.16;
      // Дуга идёт от левого верха к правому низу, как в «Распределении»: предел
      // возможного. Кривизну качает синус — очень медленно и на считанные
      // проценты, поэтому со стороны кажется, что линия просто живая.
      CURVES.forEach((c) => {
        const t = reduce ? 0 : Math.sin((now / c.period) * Math.PI * 2 + c.phase);
        // Чем дальше кривая (меньше alpha), тем слабее она слушается курсора —
        // получается глубина, как у слоёв за окном поезда.
        const pull = (c.alpha / 0.5) * 0.06;
        const k = c.base + c.sway * t + eased.y * pull * 0.5;
        const shift = eased.x * w * pull;
        const x0 = -w * 0.08 + shift;
        const y0 = h * (1 - k * 0.92);
        const x1 = w * 1.08 + shift;
        const y1 = h * 1.06;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.bezierCurveTo(
          w * 0.42 + shift * 1.6,
          y0 + h * 0.04 * (1 + t * 0.3),
          w * 0.66 + shift * 1.2,
          h * (1 - k * 0.34),
          x1,
          y1
        );
        ctx.strokeStyle = color;
        ctx.globalAlpha = c.alpha * strength;
        ctx.lineWidth = c.width;
        ctx.stroke();
      });
      ctx.globalAlpha = 1;
    }

    function frame(now) {
      if (!alive) return;
      if (now - last >= 1000 / FPS) {
        last = now;
        draw(now);
      }
      raf = requestAnimationFrame(frame);
    }

    function start() {
      cancelAnimationFrame(raf);
      // Неподвижную картинку хватит нарисовать один раз: и при «уменьшить
      // движение», и когда приложение свёрнуто.
      if (reduce) return draw(0);
      raf = requestAnimationFrame(frame);
    }

    function onVisibility() {
      if (document.visibilityState === "visible") start();
      else cancelAnimationFrame(raf);
    }

    resize();
    start();
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", onVisibility);
    if (fine && !reduce) window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pointermove", onMove);
    };
  }, [enabled, theme]);

  if (!enabled) return null;
  return <canvas ref={canvasRef} style={styles.canvas} aria-hidden="true" />;
}

const styles = {
  canvas: {
    position: "fixed",
    inset: 0,
    zIndex: 0,
    pointerEvents: "none",
    // Фон рисуется под интерфейсом, но над заливкой страницы.
    opacity: 1,
  },
};
