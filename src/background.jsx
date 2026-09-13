import React, { useEffect, useRef } from "react";
import { randomEgg, eggById, EASTER_CHANCE, EASTER_EVERY_MS } from "./constellations.js";

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
// Одна точка на такую площадь. На телефоне сетку сгущаем вдвое: там карточки
// занимают почти весь экран, и фон видно только сквозь стекло — редкая россыпь
// за ним пропадает совсем. На ноутбуке выходит около полусотни точек, на
// телефоне — около двадцати пяти.
const AREA_PER_DOT = 26000;
const AREA_PER_DOT_NARROW = 12000;
const MIN_DOTS = 12;
const MIN_DOTS_NARROW = 22;
const NARROW = 900;
const MAX_DOTS = 64;
// Палец убрали — нить не гаснет рывком, а расходится за секунду.
const TOUCH_FADE = 1.1;
// Сколько живёт созвездие: две секунды на сбор, пять на просмотр, две на
// расход. Дольше — и оно превращается из случайной находки в обои.
const EGG_IN = 2000;
const EGG_HOLD = 5000;
const EGG_OUT = 2000;
const EGG_LIFE = EGG_IN + EGG_HOLD + EGG_OUT;

const CURVES = [
  { base: 0.34, sway: 0.05, period: 124000, phase: 0, width: 2.2, alpha: 1 },
  { base: 0.72, sway: 0.06, period: 167000, phase: 2.4, width: 3, alpha: 0.6 },
];

function readColor(name, fallback) {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

export default function Background({ theme, enabled = true, showcase = null }) {
  const canvasRef = useRef(null);
  // Ссылка, а не состояние: вызов пасхалки не должен перезапускать анимацию.
  const showcaseRef = useRef(null);
  showcaseRef.current = showcase;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !enabled) return;
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const ctx = canvas.getContext("2d");
    let raf = 0;
    let last = 0;
    let alive = true;
    let size = { w: 0, h: 0 };
    let dots = [];
    let palette = [];
    // power — насколько фон сейчас тянется к пальцу или курсору: у мыши он
    // держится, пока она на странице, у касания гаснет после того, как палец
    // подняли. Без этого на телефоне нить осталась бы висеть там, где
    // коснулись в последний раз.
    const pointer = { x: -9999, y: -9999, power: 0, fading: false };
    // Созвездие: набор точек, едущих к своим местам, и рёбра между ними.
    let egg = null;
    let lastRoll = 0;
    let lastShowcase = null;

    function layout(shape) {
      const { w, h } = size;
      const ratio = shape.ratio || 1;
      // Вписываем в середину экрана с полями. Высоту держим в трети экрана:
      // во весь рост буквы налезают на текст и читаются хуже, чем кажется.
      // Слово тянется в ширину, и высокие буквы налезали бы на текст; фигуре,
      // наоборот, нужен рост, иначе птица выходит с ноготок.
      const maxH = ratio > 1.6 ? h * 0.34 : h * 0.58;
      const boxW = Math.min(w * 0.58, maxH * ratio);
      const boxH = boxW / ratio;
      const x0 = (w - boxW) / 2;
      const y0 = (h - boxH) / 2;
      return shape.p.map(([px, py]) => [x0 + px * boxW, y0 + py * boxH]);
    }

    function startEgg(item) {
      if (!item || reduce) return;
      const targets = layout(item.shape);
      egg = {
        id: item.id,
        born: performance.now(),
        edges: item.shape.e,
        nodes: targets.map(([tx, ty], i) => {
          // Точка приезжает из ближайшей фоновой — так видно, что созвездие
          // собралось из того же, что и весь фон.
          const from = dots[i % Math.max(dots.length, 1)] || { x: tx, y: ty + size.h };
          return { x: from.x, y: from.y, tx, ty, color: i % 6 };
        }),
      };
    }

    function eggPhase(now) {
      if (!egg) return 0;
      const age = now - egg.born;
      if (age >= EGG_LIFE) {
        egg = null;
        return 0;
      }
      if (age < EGG_IN) return age / EGG_IN;
      if (age < EGG_IN + EGG_HOLD) return 1;
      return 1 - (age - EGG_IN - EGG_HOLD) / EGG_OUT;
    }

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

    function dotCount() {
      const { w, h } = size;
      const narrow = w < NARROW;
      const per = narrow ? AREA_PER_DOT_NARROW : AREA_PER_DOT;
      const least = narrow ? MIN_DOTS_NARROW : MIN_DOTS;
      return Math.min(MAX_DOTS, Math.max(least, Math.round((w * h) / per)));
    }

    function newDot() {
      const { w, h } = size;
      return {
        x: Math.random() * w,
        y: Math.random() * h,
        // Скорость в пикселях в секунду: медленнее пешехода в сто раз.
        vx: (Math.random() - 0.5) * 7,
        vy: (Math.random() - 0.5) * 7,
        // На узком экране точки крупнее: сквозь размытие стекла мелкие
        // превращаются в дымку, и движения за карточкой не разобрать.
        r: (w < NARROW ? 2.1 : 1.6) + Math.random() * 3.4,
        color: Math.floor(Math.random() * 6),
      };
    }

    // На телефоне адресная строка прячется при прокрутке, и это приходит как
    // изменение размера окна. Пересобирать россыпь заново нельзя: фон дёргался
    // бы при каждом движении пальца — поэтому точки остаются, меняется только
    // их число.
    function seed() {
      const { w, h } = size;
      const count = dotCount();
      dots = dots.slice(0, count);
      while (dots.length < count) dots.push(newDot());
      dots.forEach((d) => {
        d.x = Math.min(Math.max(d.x, -20), w + 20);
        d.y = Math.min(Math.max(d.y, -20), h + 20);
      });
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

    function aim(e) {
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      pointer.power = 1;
      pointer.fading = false;
    }

    // Мышь со страницы не уходит сама по себе, поэтому её нить держится; палец
    // подняли — отпускаем, и притяжение расходится за TOUCH_FADE.
    function onUp(e) {
      if (e.pointerType !== "mouse") pointer.fading = true;
    }

    function onLeave() {
      pointer.power = 0;
      pointer.fading = false;
      pointer.x = -9999;
      pointer.y = -9999;
    }

    function step(dt, now) {
      const { w, h } = size;
      if (pointer.fading && pointer.power > 0) pointer.power = Math.max(0, pointer.power - dt / TOUCH_FADE);
      // Вызов из раздела «Тест» показывает конкретную фигуру сразу.
      const asked = showcaseRef.current;
      if (asked && asked.nonce !== lastShowcase) {
        lastShowcase = asked.nonce;
        startEgg(eggById(asked.id) || randomEgg());
      } else if (!egg && !asked && now - lastRoll > EASTER_EVERY_MS) {
        lastRoll = now;
        if (Math.random() < EASTER_CHANCE) startEgg(randomEgg());
      }
      if (egg) {
        // Приближение с запаздыванием: точки слетаются, а не прыгают.
        egg.nodes.forEach((n) => {
          n.x += (n.tx - n.x) * Math.min(1, dt * 2.2);
          n.y += (n.ty - n.y) * Math.min(1, dt * 2.2);
        });
      }
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
      const eggOn = eggPhase(now);
      // Пока собирается созвездие, обычная россыпь отступает на задний план.
      const fade = 1 - eggOn * 0.72;

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
          ctx.globalAlpha = (1 - dist / LINK_DIST) * (night ? 0.24 : 0.26) * fade;
          ctx.beginPath();
          ctx.moveTo(dots[i].x, dots[i].y);
          ctx.lineTo(dots[j].x, dots[j].y);
          ctx.stroke();
        }
      }

      // Курсор или палец дотягивается до ближних точек своей нитью — фон
      // отзывается, но ничего не перестраивает.
      const reach = reduce ? 0 : pointer.power;
      if (reach > 0.02 && pointer.x > -9000) {
        dots.forEach((d) => {
          const dist = Math.hypot(d.x - pointer.x, d.y - pointer.y);
          if (dist > LINK_DIST * 1.3) return;
          ctx.globalAlpha = (1 - dist / (LINK_DIST * 1.3)) * (night ? 0.38 : 0.4) * fade * reach;
          ctx.beginPath();
          ctx.moveTo(d.x, d.y);
          ctx.lineTo(pointer.x, pointer.y);
          ctx.stroke();
        });
      }

      dots.forEach((d) => {
        const near = reach > 0.02 ? Math.hypot(d.x - pointer.x, d.y - pointer.y) : 9999;
        const lift = (near < LINK_DIST ? 1 - near / LINK_DIST : 0) * reach;
        ctx.globalAlpha = ((night ? 0.6 : 0.62) + lift * 0.3) * fade;
        ctx.fillStyle = palette[d.color] || lineColor;
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r + lift * 1.6, 0, Math.PI * 2);
        ctx.fill();
      });

      // Само созвездие — поверх всего и заметно ярче россыпи: его должно быть
      // видно сквозь стекло карточек.
      if (egg && eggOn > 0.02) {
        const accent = readColor(night ? "--gold" : "--accent", "#C9A227");
        ctx.strokeStyle = accent;
        ctx.lineWidth = 1.6;
        ctx.globalAlpha = eggOn * (night ? 0.85 : 0.8);
        egg.edges.forEach(([a, bIdx]) => {
          const n1 = egg.nodes[a];
          const n2 = egg.nodes[bIdx];
          if (!n1 || !n2) return;
          ctx.beginPath();
          ctx.moveTo(n1.x, n1.y);
          ctx.lineTo(n2.x, n2.y);
          ctx.stroke();
        });
        egg.nodes.forEach((n) => {
          ctx.globalAlpha = eggOn * 0.95;
          ctx.fillStyle = palette[n.color] || accent;
          ctx.beginPath();
          ctx.arc(n.x, n.y, 3.2, 0, Math.PI * 2);
          ctx.fill();
        });
      }

      ctx.globalAlpha = 1;
    }

    function frame(now) {
      if (!alive) return;
      const gap = now - last;
      if (gap >= 1000 / FPS) {
        step(Math.min(gap, 400) / 1000, now);
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
    // Слушаем и мышь, и касание: на телефоне pointermove приходит, только пока
    // палец на экране, поэтому отдельного «ведения» для него не нужно.
    if (!reduce) {
      window.addEventListener("pointermove", aim, { passive: true });
      window.addEventListener("pointerdown", aim, { passive: true });
      window.addEventListener("pointerup", onUp, { passive: true });
      window.addEventListener("pointercancel", onUp, { passive: true });
      document.addEventListener("pointerleave", onLeave);
    }
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pointermove", aim);
      window.removeEventListener("pointerdown", aim);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      document.removeEventListener("pointerleave", onLeave);
    };
  }, [enabled, theme]);

  if (!enabled) return null;
  return <canvas ref={canvasRef} style={styles.canvas} aria-hidden="true" />;
}

const styles = {
  canvas: { position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none" },
};
