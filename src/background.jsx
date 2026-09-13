import React, { useEffect, useRef } from "react";

// Фон приложения: россыпь точек, соединённых тонкими нитями, и пара кривых
// возможностей, которые медленно дышат за ними.
//
// Это не просто «созвездия»: точка здесь — предмет на графике баланса, нить —
// связь между ними, дуга — тот самый предел возможного, до которого считается
// план. Цвета взяты из палитры предметов, поэтому фон выглядит частью
// приложения, а не заимствованным эффектом.
//
// Три оговорки, без которых такое украшение превращается в помеху:
// — системное «уменьшить движение» оставляет неподвижную картинку;
// — пока вкладка не на экране, кадры не рисуются: это фон, а не повод сажать
//   батарею в кармане;
// — двадцать кадров в секунду вместо шестидесяти. Движение медленное, разницы
//   не видно, а работы процессору втрое меньше.
const FPS = 20;
const LINK_DIST = 168;
// Одна точка на такую площадь. На ноутбуке выходит около полусотни, на
// телефоне — полтора десятка: густая сетка на маленьком экране выглядит грязью.
const AREA_PER_DOT = 26000;
const MAX_DOTS = 64;

const CURVES = [
  { base: 0.34, sway: 0.05, period: 124000, phase: 0, width: 2.2, alpha: 1 },
  { base: 0.72, sway: 0.06, period: 167000, phase: 2.4, width: 3, alpha: 0.6 },
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
    const fine = window.matchMedia && window.matchMedia("(pointer: fine)").matches;

    const ctx = canvas.getContext("2d");
    let raf = 0;
    let last = 0;
    let alive = true;
    let size = { w: 0, h: 0 };
    let dots = [];
    let palette = [];
    const pointer = { x: -9999, y: -9999 };

    function refreshPalette() {
      palette = [
        readColor("--accent", "#8C7326"),
        readColor("--blue", "#2F4E70"),
        readColor("--green", "#3F6E52"),
        readColor("--red", "#8B4A4A"),
        readColor("--purple", "#5C4A80"),
        readColor("--gold", "#C9A227"),
      ];
    }

    function seed() {
      const { w, h } = size;
      const count = Math.min(MAX_DOTS, Math.max(12, Math.round((w * h) / AREA_PER_DOT)));
      dots = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        // Скорость в пикселях в секунду: медленнее пешехода в сто раз.
        vx: (Math.random() - 0.5) * 7,
        vy: (Math.random() - 0.5) * 7,
        r: 1.6 + Math.random() * 3.4,
        color: Math.floor(Math.random() * 6),
      }));
    }

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      size = { w: window.innerWidth, h: window.innerHeight };
      canvas.width = Math.round(size.w * dpr);
      canvas.height = Math.round(size.h * dpr);
      canvas.style.width = size.w + "px";
      canvas.style.height = size.h + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
    }

    function onMove(e) {
      pointer.x = e.clientX;
      pointer.y = e.clientY;
    }

    function onLeave() {
      pointer.x = -9999;
      pointer.y = -9999;
    }

    function step(dt) {
      const { w, h } = size;
      dots.forEach((d) => {
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        // Точка, дошедшая до края, появляется с другой стороны: так россыпь
        // не сбивается в кучу и не редеет по углам.
        if (d.x < -20) d.x = w + 20;
        if (d.x > w + 20) d.x = -20;
        if (d.y < -20) d.y = h + 20;
        if (d.y > h + 20) d.y = -20;
      });
    }

    function draw(now) {
      const { w, h } = size;
      const night = theme === "night";
      const lineColor = readColor(night ? "--railInk2" : "--mute", "#8A8370");
      ctx.clearRect(0, 0, w, h);

      // Кривые возможностей — позади россыпи и совсем тихо: они держат тему,
      // а внимание на себя не тянут.
      const curveColor = readColor(night ? "--gold" : "--accent", "#C9A227");
      CURVES.forEach((c) => {
        const t = reduce ? 0 : Math.sin((now / c.period) * Math.PI * 2 + c.phase);
        const k = c.base + c.sway * t;
        const y0 = h * (1 - k * 0.94);
        ctx.beginPath();
        ctx.moveTo(-w * 0.08, y0);
        ctx.bezierCurveTo(w * 0.44, y0 + h * 0.05, w * 0.68, h * (1 - k * 0.3), w * 1.08, h * 1.06);
        ctx.strokeStyle = curveColor;
        ctx.globalAlpha = c.alpha * (night ? 0.12 : 0.13);
        ctx.lineWidth = c.width;
        ctx.stroke();
      });

      // Нити между соседями: чем ближе точки, тем нить заметнее.
      ctx.lineWidth = 1;
      ctx.strokeStyle = lineColor;
      for (let i = 0; i < dots.length; i++) {
        for (let j = i + 1; j < dots.length; j++) {
          const dx = dots[i].x - dots[j].x;
          const dy = dots[i].y - dots[j].y;
          const dist = Math.hypot(dx, dy);
          if (dist > LINK_DIST) continue;
          ctx.globalAlpha = (1 - dist / LINK_DIST) * (night ? 0.24 : 0.26);
          ctx.beginPath();
          ctx.moveTo(dots[i].x, dots[i].y);
          ctx.lineTo(dots[j].x, dots[j].y);
          ctx.stroke();
        }
      }

      // Курсор дотягивается до ближних точек своей нитью — фон отзывается, но
      // ничего не перестраивает.
      if (fine && !reduce && pointer.x > -9000) {
        dots.forEach((d) => {
          const dist = Math.hypot(d.x - pointer.x, d.y - pointer.y);
          if (dist > LINK_DIST * 1.3) return;
          ctx.globalAlpha = (1 - dist / (LINK_DIST * 1.3)) * (night ? 0.38 : 0.4);
          ctx.beginPath();
          ctx.moveTo(d.x, d.y);
          ctx.lineTo(pointer.x, pointer.y);
          ctx.stroke();
        });
      }

      dots.forEach((d) => {
        const near = fine && pointer.x > -9000 ? Math.hypot(d.x - pointer.x, d.y - pointer.y) : 9999;
        const lift = near < LINK_DIST ? 1 - near / LINK_DIST : 0;
        ctx.globalAlpha = (night ? 0.6 : 0.62) + lift * 0.3;
        ctx.fillStyle = palette[d.color] || lineColor;
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r + lift * 1.6, 0, Math.PI * 2);
        ctx.fill();
      });

      ctx.globalAlpha = 1;
    }

    function frame(now) {
      if (!alive) return;
      const gap = now - last;
      if (gap >= 1000 / FPS) {
        step(Math.min(gap, 400) / 1000);
        last = now;
        draw(now);
      }
      raf = requestAnimationFrame(frame);
    }

    function start() {
      cancelAnimationFrame(raf);
      refreshPalette();
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
    if (fine && !reduce) {
      window.addEventListener("pointermove", onMove, { passive: true });
      document.addEventListener("pointerleave", onLeave);
    }
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
    };
  }, [enabled, theme]);

  if (!enabled) return null;
  return <canvas ref={canvasRef} style={styles.canvas} aria-hidden="true" />;
}

const styles = {
  canvas: { position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none" },
};
