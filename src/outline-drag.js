// Перетаскивание блоков и веток в оглавлении тетради.
//
// Блок или ветка берутся целиком: строка поднимается и едет за мышью или
// пальцем, а линия показывает, куда она встанет. Ветку можно перенести и в
// другой блок; над свёрнутым блоком она раскрывает его, если подержать.
//
// Мышью — сдвинули на несколько пикселей, и тащим (простое нажатие остаётся
// нажатием: открыть ветку, свернуть блок). Пальцем — долгое нажатие: короткое
// касание и прокрутка работают как раньше.
//
// Разметка: блок — data-ol-block (и data-ol-closed, если свёрнут), его
// заголовок — data-ol-head, ветка — data-ol-branch. Всё ищется внутри
// контейнера, на который повешен containerRef.

import { useEffect, useRef, useState } from "react";

const HOLD_MS = 380;
const MOVE_PX = 5;
const SPRING_MS = 600;

function scrollParent(el) {
  let node = el && el.parentElement;
  while (node && node !== document.body) {
    const oy = getComputedStyle(node).overflowY;
    if ((oy === "auto" || oy === "scroll") && node.scrollHeight > node.clientHeight) return node;
    node = node.parentElement;
  }
  return null;
}

export function useOutlineDrag({ enabled, onMoveBranch, onMoveBlock, onOpenBlock }) {
  const containerRef = useRef(null);
  const [drag, setDrag] = useState(null);
  const handlers = useRef({});
  handlers.current = { onMoveBranch, onMoveBlock, onOpenBlock, enabled };
  // Слушатели окна должны быть одними и теми же функциями от нажатия до
  // отпускания, иначе их не снять, — поэтому собираются один раз.
  const engine = useRef(null);
  if (!engine.current) engine.current = makeEngine(containerRef, handlers, setDrag);
  const { press } = engine.current;
  useEffect(() => () => engine.current.cleanup(), []);

  // Свойства для строки: блока целиком (контейнер) и ветки.
  function liftStyle(match) {
    if (!drag || !match) return null;
    return {
      position: "relative",
      zIndex: 5,
      transform: `translateY(${drag.dy}px) scale(1.02)`,
      boxShadow: "0 12px 28px rgba(0,0,0,.22)",
      background: "var(--menuBg, var(--panel))",
      borderRadius: 10,
      cursor: "grabbing",
      pointerEvents: "none",
    };
  }

  return {
    containerRef,
    drag,
    blockProps: (blockId) => ({
      "data-ol-lifted": drag && drag.kind === "block" && drag.blockId === blockId ? "true" : undefined,
      style: liftStyle(drag && drag.kind === "block" && drag.blockId === blockId),
    }),
    headProps: (blockId) => ({ onPointerDown: (e) => press(e, { kind: "block", blockId }) }),
    branchProps: (blockId, branchId) => ({
      onPointerDown: (e) => press(e, { kind: "branch", blockId, branchId }),
      "data-ol-lifted": drag && drag.kind === "branch" && drag.branchId === branchId ? "true" : undefined,
      liftStyle: liftStyle(drag && drag.kind === "branch" && drag.branchId === branchId),
    }),
  };
}


function makeEngine(containerRef, handlers, setDrag) {
  const live = { current: null };
  const pending = { current: null };
  const spring = { current: { id: null, timer: null } };
  function offsetOf(scroller) {
    return window.scrollY + (scroller ? scroller.scrollTop : 0);
  }

  function cleanup() {
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointercancel", onPointerCancel);
    window.removeEventListener("touchmove", onTouchMove, { passive: false });
    window.removeEventListener("touchend", onPointerUp);
    window.removeEventListener("touchcancel", onPointerCancel);
    window.removeEventListener("scroll", onScroll, true);
    window.removeEventListener("contextmenu", noMenu, true);
    if (pending.current && pending.current.timer) clearTimeout(pending.current.timer);
    pending.current = null;
    clearTimeout(spring.current.timer);
    spring.current = { id: null, timer: null };
  }

  // Долгое нажатие пальцем — это начало перетаскивания, а не меню браузера.
  function noMenu(e) {
    e.preventDefault();
  }

  function press(e, item) {
    if (!handlers.current.enabled) return;
    if (e.button !== undefined && e.button !== 0) return;
    cleanup();
    if (e.target.closest && e.target.closest("[data-nodrag], input, textarea, select, [contenteditable='true']")) return;
    const touch = e.pointerType !== "mouse";
    pending.current = { item, x: e.clientX, y: e.clientY, touch, timer: null };
    if (touch) {
      pending.current.timer = setTimeout(() => {
        const p = pending.current;
        if (!p) return;
        if (navigator.vibrate) navigator.vibrate(12);
        begin(p.item, p.y);
      }, HOLD_MS);
    }
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerCancel);
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onPointerUp);
    window.addEventListener("touchcancel", onPointerCancel);
    if (touch) window.addEventListener("contextmenu", noMenu, true);
  }

  function begin(item, clientY) {
    const p = pending.current;
    if (p && p.timer) clearTimeout(p.timer);
    pending.current = null;
    const scroller = scrollParent(containerRef.current);
    // Клик, который придёт, когда отпустят, — не нажатие на ветку или блок.
    const swallow = (ev) => {
      ev.stopPropagation();
      ev.preventDefault();
    };
    window.addEventListener("click", swallow, true);
    const d = { ...item, startY: clientY + offsetOf(scroller), scroller, dy: 0, target: null, line: null, lastY: clientY, swallow };
    live.current = d;
    setDrag(d);
    window.addEventListener("scroll", onScroll, true);
  }

  function onScroll() {
    if (live.current) update(live.current.lastY);
  }

  function onPointerMove(e) {
    const p = pending.current;
    if (p) {
      const moved = Math.abs(e.clientX - p.x) + Math.abs(e.clientY - p.y);
      if (p.touch) {
        // Палец поехал раньше, чем долгое нажатие сработало, — это прокрутка.
        if (moved > 8) {
          cleanup();
        }
        return;
      }
      if (moved < MOVE_PX) return;
      begin(p.item, p.y);
    }
    if (live.current) track(e.clientY);
  }

  function onTouchMove(e) {
    if (pending.current && pending.current.touch) {
      const t = e.touches[0];
      if (t && Math.abs(t.clientX - pending.current.x) + Math.abs(t.clientY - pending.current.y) > 8) cleanup();
      return;
    }
    if (!live.current) return;
    // Пока тащат, страница под пальцем не прокручивается.
    if (e.cancelable) e.preventDefault();
    const t = e.touches[0];
    if (t) track(t.clientY);
  }

  function track(clientY) {
    const d = live.current;
    if (!d) return;
    if (d.scroller) {
      const box = d.scroller.getBoundingClientRect();
      if (clientY < box.top + 36) d.scroller.scrollTop -= 12;
      else if (clientY > box.bottom - 36) d.scroller.scrollTop += 12;
    }
    if (clientY < 60) window.scrollBy(0, -14);
    else if (clientY > window.innerHeight - 60) window.scrollBy(0, 14);
    update(clientY);
  }

  function update(clientY) {
    const d = live.current;
    const box = containerRef.current;
    if (!d || !box) return;
    const dy = clientY + offsetOf(d.scroller) - d.startY;
    const top = box.getBoundingClientRect().top;
    const blocks = Array.from(box.querySelectorAll("[data-ol-block]"));
    let target = null;
    let lineY = null;
    if (d.kind === "block") {
      const others = blocks.filter((el) => el.getAttribute("data-ol-block") !== d.blockId);
      let index = 0;
      others.forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.top + r.height / 2 < clientY) index += 1;
      });
      target = { index };
      if (others.length) lineY = index < others.length ? others[index].getBoundingClientRect().top - 4 : others[others.length - 1].getBoundingClientRect().bottom + 4;
    } else if (blocks.length) {
      // Блок, над которым палец: от его верха до верха следующего.
      let at = 0;
      blocks.forEach((el, i) => {
        if (el.getBoundingClientRect().top <= clientY) at = i;
      });
      const el = blocks[at];
      const blockId = el.getAttribute("data-ol-block");
      const head = el.querySelector("[data-ol-head]") || el;
      const headBox = head.getBoundingClientRect();
      const closed = el.hasAttribute("data-ol-closed");
      const rows = Array.from(el.querySelectorAll("[data-ol-branch]")).filter((r) => r.getAttribute("data-ol-branch") !== d.branchId);
      if (closed) {
        target = { blockId, index: Infinity };
        lineY = headBox.bottom;
        // Подержали над свёрнутым блоком — раскрываем.
        if (spring.current.id !== blockId) {
          clearTimeout(spring.current.timer);
          spring.current = {
            id: blockId,
            timer: setTimeout(() => {
              if (live.current && handlers.current.onOpenBlock) handlers.current.onOpenBlock(blockId);
            }, SPRING_MS),
          };
        }
      } else {
        if (spring.current.id) {
          clearTimeout(spring.current.timer);
          spring.current = { id: null, timer: null };
        }
        let index = 0;
        if (clientY >= headBox.bottom) {
          rows.forEach((r) => {
            const rb = r.getBoundingClientRect();
            if (rb.top + rb.height / 2 < clientY) index += 1;
          });
        }
        target = { blockId, index };
        lineY = index ? rows[index - 1].getBoundingClientRect().bottom + 1 : headBox.bottom;
      }
    }
    const next = { ...d, dy, target, line: lineY === null ? null : lineY - top, lastY: clientY };
    live.current = next;
    setDrag(next);
  }

  function onPointerCancel() {
    finish(false);
  }

  function onPointerUp() {
    finish(true);
  }

  function finish(apply) {
    const d = live.current;
    cleanup();
    if (!d) return;
    live.current = null;
    setDrag(null);
    setTimeout(() => window.removeEventListener("click", d.swallow, true), 0);
    if (!apply || !d.target) return;
    if (d.kind === "block") handlers.current.onMoveBlock(d.blockId, d.target.index);
    else handlers.current.onMoveBranch(d.blockId, d.branchId, d.target.blockId, d.target.index);
  }

  return { press, cleanup };
}

// Перенос в списке блоков: ветка branchId из блока from — в блок to на место
// index (среди остальных веток; Infinity — в конец).
export function moveBranchIn(blocks, fromBlockId, branchId, toBlockId, index) {
  const src = blocks.find((b) => b.id === fromBlockId);
  const branch = src && (src.branches || []).find((r) => r.id === branchId);
  if (!branch || !blocks.some((b) => b.id === toBlockId)) return blocks;
  const without = blocks.map((b) => (b.id === fromBlockId ? { ...b, branches: (b.branches || []).filter((r) => r.id !== branchId) } : b));
  return without.map((b) => {
    if (b.id !== toBlockId) return b;
    const list = (b.branches || []).slice();
    list.splice(Math.max(0, Math.min(index, list.length)), 0, branch);
    return { ...b, branches: list };
  });
}

export function moveBlockIn(blocks, blockId, index) {
  const block = blocks.find((b) => b.id === blockId);
  if (!block) return blocks;
  const list = blocks.filter((b) => b.id !== blockId);
  list.splice(Math.max(0, Math.min(index, list.length)), 0, block);
  return list;
}
