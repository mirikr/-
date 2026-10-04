import React, { useEffect, useRef, useState } from "react";

// Список, который расставляют перетаскиванием. Предмет берётся целиком: строка
// поднимается (тень, чуть крупнее) и едет за мышью или пальцем, а соседи
// плавно расступаются, освобождая место, куда она встанет. Раньше строки
// просто менялись местами в списке, и было не видно, что именно тянешь.
//
// Мышью тянут за всю строку (кроме кнопок с data-nodrag), пальцем — за ручку
// (handleProps), чтобы по остальной строке список по-прежнему прокручивался.
// Стрелки ↑/↓ на ручке переставляют с клавиатуры. groupOf делит список на
// группы (закреплённые и остальные): между группами перетащить нельзя.
export default function SortableList({ items, keyOf, groupOf = () => 0, onMove, renderItem, gap = 4, style, labelOf }) {
  const rows = useRef([]);
  const [drag, setDrag] = useState(null);
  const live = useRef(null);
  live.current = drag;

  // Пока тянут, список может прокрутиться (сам у края или колесом) — строка
  // должна остаться под пальцем.
  useEffect(() => {
    if (!drag) return undefined;
    const onScroll = () => {
      const d = live.current;
      if (d) update(d.lastY);
    };
    window.addEventListener("scroll", onScroll, true);
    return () => window.removeEventListener("scroll", onScroll, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!drag]);

  function offsetOf(scroller) {
    return window.scrollY + (scroller ? scroller.scrollTop : 0);
  }

  function start(e, index) {
    if (e.button !== undefined && e.button !== 0) return;
    if (e.target.closest && e.target.closest("[data-nodrag]")) return;
    e.preventDefault();
    if (e.currentTarget.setPointerCapture) e.currentTarget.setPointerCapture(e.pointerId);
    const scroller = scrollParent(rows.current[index]);
    const off = offsetOf(scroller);
    const rects = items.map((_, i) => {
      const el = rows.current[i];
      if (!el) return { top: 0, height: 0 };
      const r = el.getBoundingClientRect();
      return { top: r.top + off, height: r.height };
    });
    const g = groupOf(items[index]);
    let lo = index;
    let hi = index;
    while (lo > 0 && groupOf(items[lo - 1]) === g) lo -= 1;
    while (hi < items.length - 1 && groupOf(items[hi + 1]) === g) hi += 1;
    setDrag({ from: index, over: index, dy: 0, rects, lo, hi, startY: e.clientY + off, lastY: e.clientY, scroller });
  }

  function update(clientY) {
    const d = live.current;
    if (!d) return;
    const dy = clientY + offsetOf(d.scroller) - d.startY;
    const r = d.rects[d.from];
    const center = r.top + r.height / 2 + dy;
    let over = d.lo;
    for (let i = d.lo; i <= d.hi; i += 1) {
      if (i !== d.from && d.rects[i].top + d.rects[i].height / 2 < center) over += 1;
    }
    setDrag({ ...d, dy, over, lastY: clientY });
  }

  function move(e) {
    const d = live.current;
    if (!d) return;
    // У края списка (или экрана) он подъезжает сам — иначе длинный список не
    // перетащить с конца в начало.
    if (d.scroller) {
      const box = d.scroller.getBoundingClientRect();
      if (e.clientY < box.top + 36) d.scroller.scrollTop -= 12;
      else if (e.clientY > box.bottom - 36) d.scroller.scrollTop += 12;
    }
    if (e.clientY < 60) window.scrollBy(0, -14);
    else if (e.clientY > window.innerHeight - 60) window.scrollBy(0, 14);
    update(e.clientY);
  }

  function end() {
    const d = live.current;
    if (!d) return;
    setDrag(null);
    if (d.over !== d.from) onMove(d.from, d.over);
  }

  function onKey(e, index) {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    e.preventDefault();
    onMove(index, index + (e.key === "ArrowUp" ? -1 : 1));
  }

  const size = drag ? drag.rects[drag.from].height + gap : 0;
  return (
    <div
      style={{ display: "flex", flexDirection: "column", gap, ...style }}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      data-dragging={drag ? "true" : undefined}
    >
      {items.map((item, i) => {
        const dragging = drag && drag.from === i;
        let shift = 0;
        if (drag && !dragging) {
          if (drag.from < drag.over && i > drag.from && i <= drag.over) shift = -size;
          else if (drag.from > drag.over && i >= drag.over && i < drag.from) shift = size;
        }
        const label = labelOf ? labelOf(item) : String(keyOf(item));
        const handleProps = {
          role: "button",
          tabIndex: 0,
          "aria-label": "Перетащить: " + label,
          title: "Перетащить",
          onPointerDown: (e) => e.pointerType !== "mouse" && start(e, i),
          onKeyDown: (e) => onKey(e, i),
          style: HANDLE,
        };
        return (
          <div
            key={keyOf(item)}
            ref={(el) => (rows.current[i] = el)}
            data-sortable-item={label}
            data-lifted={dragging ? "true" : undefined}
            onPointerDown={(e) => e.pointerType === "mouse" && start(e, i)}
            style={{
              position: "relative",
              borderRadius: 10,
              userSelect: "none",
              WebkitUserSelect: "none",
              cursor: dragging ? "grabbing" : "grab",
              zIndex: dragging ? 5 : undefined,
              transform: dragging ? `translateY(${drag.dy}px) scale(1.025)` : shift ? `translateY(${shift}px)` : undefined,
              boxShadow: dragging ? "0 12px 28px rgba(0,0,0,.22)" : undefined,
              background: dragging ? "var(--menuBg, var(--panel))" : undefined,
              // Соседи расступаются плавно; поднятая строка идёт ровно за пальцем.
              // После того как отпустили, — без анимации: строки уже на своих местах.
              transition: drag && !dragging ? "transform .18s ease" : "none",
            }}
          >
            {renderItem(item, { handleProps, dragging: !!dragging, index: i })}
          </div>
        );
      })}
    </div>
  );
}

function scrollParent(el) {
  let node = el && el.parentElement;
  while (node && node !== document.body) {
    const oy = getComputedStyle(node).overflowY;
    if ((oy === "auto" || oy === "scroll") && node.scrollHeight > node.clientHeight) return node;
    node = node.parentElement;
  }
  return null;
}

const HANDLE = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 30,
  height: 30,
  flexShrink: 0,
  color: "var(--mute)",
  fontSize: 14,
  letterSpacing: -3,
  cursor: "grab",
  touchAction: "none",
  borderRadius: 8,
};
