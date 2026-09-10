import React, { useEffect, useRef, useState } from "react";

const REDUCED =
  typeof window !== "undefined" &&
  window.matchMedia &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Плавное раскрытие раздела. Высоту auto анимировать нельзя, поэтому на время
// перехода она подменяется измеренной, а после — возвращается к auto, чтобы
// содержимое могло свободно расти (добавили урок — раздел не обрезало).
export default function Collapsible({ open, children }) {
  const inner = useRef(null);
  const [height, setHeight] = useState(open ? "auto" : 0);
  const firstRender = useRef(true);

  useEffect(() => {
    const el = inner.current;
    if (!el) return;
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (REDUCED) {
      setHeight(open ? "auto" : 0);
      return;
    }
    if (open) {
      setHeight(el.scrollHeight);
      const timer = setTimeout(() => setHeight("auto"), 300);
      return () => clearTimeout(timer);
    }
    // Закрытие: сначала фиксируем текущую высоту — от auto анимировать нечего.
    setHeight(el.scrollHeight);
    const frame = requestAnimationFrame(() => requestAnimationFrame(() => setHeight(0)));
    return () => cancelAnimationFrame(frame);
  }, [open]);

  const animating = height !== "auto";

  return (
    <div
      inert={!open || undefined}
      style={{
        height: animating ? height : "auto",
        // Пока едет анимация — прячем вылезающее; в покое даём содержимому дышать.
        overflow: animating ? "hidden" : "visible",
        opacity: open ? 1 : 0,
        transition: REDUCED ? "none" : "height 280ms cubic-bezier(0.4, 0, 0.2, 1), opacity 220ms ease",
      }}
    >
      <div ref={inner}>{children}</div>
    </div>
  );
}
