import React, { useLayoutEffect, useRef } from "react";

// Поле ввода, которое растёт под текст.
//
// Обычный input прячет длинное название за краем: видно начало, остальное
// приходится прокручивать вслепую — особенно заметно на «региональном этапе
// всероссийской олимпиады школьников по обществознанию». Здесь textarea в одну
// строку: выглядит так же, но переносит текст и подстраивает высоту.
// scrollHeight считает содержимое с внутренними отступами, но без рамки. При
// box-sizing: border-box высота включает рамку, и без этой поправки последняя
// строка срезается ровно на её толщину.
function fit(el) {
  if (!el) return;
  const borders = el.offsetHeight - el.clientHeight;
  el.style.height = "auto";
  el.style.height = el.scrollHeight + borders + "px";
}

export default function AutoGrow({ value, onChange, onEnter, style, ...rest }) {
  const ref = useRef(null);

  useLayoutEffect(() => {
    fit(ref.current);
  }, [value]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    // Поменялась ширина — повернули телефон, раскрылся соседний блок — и текст
    // переносится иначе. На изменение своей же высоты не реагируем, иначе
    // наблюдатель будет будить сам себя без конца.
    let lastWidth = el.getBoundingClientRect().width;
    const ro = new ResizeObserver(() => {
      const width = el.getBoundingClientRect().width;
      if (width === lastWidth) return;
      lastWidth = width;
      fit(el);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      onChange={onChange}
      onKeyDown={(e) => {
        // Перевод строки здесь не нужен: это одно значение, а не текст.
        if (e.key === "Enter") {
          e.preventDefault();
          if (onEnter) onEnter();
          else e.currentTarget.blur();
        }
      }}
      style={{
        display: "block",
        resize: "none",
        overflow: "hidden",
        fontFamily: "inherit",
        lineHeight: 1.35,
        ...style,
      }}
      {...rest}
    />
  );
}
