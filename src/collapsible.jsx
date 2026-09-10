import React, { useEffect, useLayoutEffect, useRef, useState } from "react";

const REDUCED =
  typeof window !== "undefined" &&
  window.matchMedia &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Стиль-объект намеренно постоянный: если бы высота зависела от open, React
// переписывал бы её при каждом рендере и гасил переход — раскрытие получалось
// плавным через раз. Высотой, прозрачностью и обрезкой управляет только код ниже.
const BOX_STYLE = {
  height: 0,
  overflow: "hidden",
  opacity: 0,
  transition: REDUCED ? "none" : "height 260ms cubic-bezier(0.4, 0, 0.2, 1), opacity 200ms ease",
};

export default function Collapsible({ open, children }) {
  const wrap = useRef(null);
  const inner = useRef(null);
  // Содержимое монтируется при первом раскрытии и дальше живёт: закрытые разделы
  // не нагружают страницу, а анимация закрытия остаётся.
  const [mounted, setMounted] = useState(open);
  const wasOpen = useRef(open);

  useEffect(() => {
    if (open && !mounted) setMounted(true);
  }, [open, mounted]);

  // Первый кадр — без анимации: раздел, открытый из сохранённых настроек, не должен
  // разъезжаться на глазах при загрузке страницы.
  useLayoutEffect(() => {
    const box = wrap.current;
    if (!box) return;
    box.style.height = open ? "auto" : "0px";
    box.style.overflow = open ? "visible" : "hidden";
    box.style.opacity = open ? "1" : "0";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const box = wrap.current;
    const content = inner.current;
    if (!box || !content) return;
    // Первое раскрытие приходит раньше, чем смонтируется содержимое: анимировать
    // пустой ящик бессмысленно, ждём следующего прохода — уже с наполнением.
    if (open && !mounted) return;
    if (wasOpen.current === open) return; // перерисовка содержимого — не повод анимировать
    wasOpen.current = open;

    if (REDUCED) {
      box.style.height = open ? "auto" : "0px";
      box.style.overflow = open ? "visible" : "hidden";
      box.style.opacity = open ? "1" : "0";
      return;
    }

    box.style.overflow = "hidden";

    if (open) {
      box.style.height = content.scrollHeight + "px";
      box.style.opacity = "1";
      const finish = (e) => {
        if (e.target !== box || e.propertyName !== "height") return;
        box.style.height = "auto";
        box.style.overflow = "visible";
      };
      box.addEventListener("transitionend", finish);
      return () => box.removeEventListener("transitionend", finish);
    }

    box.style.height = content.scrollHeight + "px";
    void box.offsetHeight; // пересчёт вёрстки: без него браузеру не от чего анимировать
    box.style.height = "0px";
    box.style.opacity = "0";
  }, [open, mounted]);

  return (
    <div ref={wrap} inert={!open || undefined} style={BOX_STYLE}>
      <div ref={inner}>{mounted ? children : null}</div>
    </div>
  );
}
